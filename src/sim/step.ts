import {
  AIR_ACCEL_FACTOR,
  AIR_FRICTION,
  ATTACK_COOLDOWN_TICKS,
  ATTACK_REACH,
  ATTACK_TICKS,
  COYOTE_TIME,
  DOOR_ARRIVAL_INSET,
  DOUBLE_JUMP_VELOCITY,
  ENEMY_HIT_COOLDOWN,
  ENEMY_HP,
  ENEMY_RESPAWN_TICKS,
  ENEMY_SPEED,
  FIXED_DT,
  GRAVITY,
  GROUND_FRICTION,
  JUMP_BUFFER,
  JUMP_RELEASE_SPEED,
  JUMP_VELOCITY,
  MAX_AIR_JUMPS,
  MAX_FALL,
  PLAYER_H,
  PLAYER_INVULN_TICKS,
  PLAYER_MAX_HP,
  PLAYER_W,
  RUN_ACCEL,
  RUN_MAX,
  TILE,
  TRANSITION_LOCK_TICKS,
  WALL_CLIMB_SPEED,
  WALL_SLIDE_SPEED,
} from './constants'
import { bodiesOverlap, bodyBox, boxesOverlap, moveX, moveY, touchingWall } from './collision'
import type { DoorDef, GameMap } from './content'
import { BTN, axisX, held, type InputMask } from './input'
import type { EnemyState, PlayerState, WorldState } from './state'
import { isSolid, type TileGrid } from './tiles'

export const gridOf = (s: WorldState): TileGrid => s.map.rooms[s.roomId]!.grid

export const hasAbility = (s: WorldState, id: string): boolean => s.abilities.includes(id)

/** Is this door passable with the abilities currently held? */
export function isDoorOpen(map: GameMap, door: DoorDef, abilities: readonly string[]): boolean {
  if (door.gate === undefined) return true
  const required = map.gates[door.gate]
  return required !== undefined && abilities.includes(required)
}

const HALF_W = PLAYER_W / 2

function overlapsCell(p: PlayerState, col: number, row: number): boolean {
  const cl = col * TILE
  const ct = row * TILE
  return (
    p.pos.x - HALF_W < cl + TILE &&
    p.pos.x + HALF_W > cl &&
    p.pos.y - PLAYER_H < ct + TILE &&
    p.pos.y > ct
  )
}

function freshPlayer(map: GameMap, roomId: string): PlayerState {
  const grid = map.rooms[roomId]!.grid
  return {
    pos: { x: grid.spawn.x, y: grid.spawn.y },
    vel: { x: 0, y: 0 },
    onGround: true,
    facing: 1,
    // Grant coyote time immediately, so a jump on frame 1 works.
    coyoteTimer: COYOTE_TIME,
    jumpBufferTimer: 0,
    airJumpsUsed: 0,
  }
}

/**
 * Build every enemy in the level, in content order.
 *
 * All of them exist in the state from tick 0, including the ones in rooms the
 * player has not reached: the order is what makes the state hash stable, and a
 * frozen-but-present enemy is simpler to reason about than one conjured on entry.
 * `step` still only moves the ones in the current room.
 */
export function freshEnemies(map: GameMap): EnemyState[] {
  const out: EnemyState[] = []
  for (const roomId of map.order) {
    for (const enemy of map.rooms[roomId]!.enemies) {
      const spawn = { x: enemy.col * TILE + TILE / 2, y: (enemy.row + 1) * TILE }
      out.push({
        id: enemy.id,
        roomId,
        spawn,
        patrol: enemy.patrol,
        pos: { ...spawn },
        vel: { x: 0, y: 0 },
        dir: -1,
        hp: ENEMY_HP,
        alive: true,
        respawnTimer: 0,
        hitCooldown: 0,
      })
    }
  }
  return out
}

export function createInitialState(map: GameMap, seed = 1234): WorldState {
  return {
    map,
    roomId: map.startRoom,
    player: freshPlayer(map, map.startRoom),
    abilities: [],
    collected: [],
    tick: 0,
    rngSeed: seed,
    prevInput: 0,
    transitionLock: 0,
    reachedGoal: false,
    enemies: freshEnemies(map),
    hp: PLAYER_MAX_HP,
    invulnTimer: 0,
    attackTimer: 0,
    attackCooldown: 0,
  }
}

/** Put the player back at the current room's entry, keeping abilities and items. */
export function respawn(state: WorldState): WorldState {
  return {
    ...state,
    player: freshPlayer(state.map, state.roomId),
    transitionLock: TRANSITION_LOCK_TICKS,
    hp: PLAYER_MAX_HP,
    invulnTimer: PLAYER_INVULN_TICKS,
    attackTimer: 0,
    attackCooldown: 0,
    // Death resets the world's enemies, not just the current room's. Cleared
    // rooms refilling on death is the classic behaviour and keeps it simple.
    enemies: freshEnemies(state.map),
  }
}

/** The area a swing covers this tick: a box in front of the player. */
function swingBox(p: PlayerState): { x: number; y: number; w: number; h: number } {
  const body = bodyBox(p.pos)
  return {
    x: p.facing === 1 ? body.x + body.w : body.x - ATTACK_REACH,
    y: body.y,
    w: ATTACK_REACH,
    h: body.h,
  }
}

/**
 * Move one enemy: walk, turn at walls / ledges / patrol bounds, fall.
 *
 * Deliberately turns at ledges rather than walking off them, so an enemy can
 * never leave the platform it was placed on and end up somewhere unreachable or
 * out of the room.
 */
function stepEnemy(e: EnemyState, grid: TileGrid, dt: number): void {
  if (e.hitCooldown > 0) e.hitCooldown -= 1

  if (!e.alive) {
    e.respawnTimer -= 1
    if (e.respawnTimer <= 0) {
      e.alive = true
      e.hp = ENEMY_HP
      e.pos = { ...e.spawn }
      e.vel = { x: 0, y: 0 }
      e.respawnTimer = 0
    }
    return
  }

  e.vel.y = Math.min(MAX_FALL, e.vel.y + GRAVITY * dt)
  e.vel.x = e.dir * ENEMY_SPEED

  const blocked = moveX(e, grid, e.vel.x * dt)
  moveY(e, grid, e.vel.y * dt)
  const turn = (): void => {
    e.dir = e.dir === 1 ? -1 : 1
  }
  if (blocked) turn()

  // No floor ahead: turn rather than walk off.
  const aheadCol = Math.floor((e.pos.x + e.dir * (PLAYER_W / 2 + 2)) / TILE)
  const belowRow = Math.floor((e.pos.y + 1) / TILE)
  if (!isSolid(grid, aheadCol, belowRow)) turn()

  // Stay within the declared patrol range. Checked after the flip so a turn at
  // a patrol bound cannot be undone by the ledge check on the same tick.
  const min = e.spawn.x - e.patrol * TILE
  const max = e.spawn.x + e.patrol * TILE
  if (e.pos.x <= min) e.dir = 1
  else if (e.pos.x >= max) e.dir = -1
}

/**
 * The pure step function — the load-bearing abstraction of this repo.
 *
 * No DOM, no engine imports, no globals, no wall-clock time. Given the same
 * state and input it must return the same state, every time, on every machine.
 *
 * Room transitions, item pickups and the goal live in here rather than in the
 * renderer, which is what makes a whole playthrough testable headlessly.
 */
export function step(state: WorldState, input: InputMask, dt: number = FIXED_DT): WorldState {
  const p = state.player
  const next: WorldState = {
    ...state,
    tick: state.tick + 1,
    prevInput: input,
    transitionLock: Math.max(0, state.transitionLock - 1),
    player: { ...p, pos: { ...p.pos }, vel: { ...p.vel } },
    // Deep-copied for the same reason as the player: `stepEnemy` mutates in
    // place, and a shared array would corrupt the state this one came from,
    // which is exactly what the replay determinism test would catch.
    enemies: state.enemies.map((e) => ({ ...e, pos: { ...e.pos }, vel: { ...e.vel } })),
  }
  const pl = next.player

  const jumpHeld = held(input, BTN.JUMP)
  const jumpPressed = jumpHeld && !held(state.prevInput, BTN.JUMP)

  // Jump buffering: remember a press that arrived slightly too early.
  pl.jumpBufferTimer = jumpPressed ? JUMP_BUFFER : Math.max(0, pl.jumpBufferTimer - dt)

  // --- horizontal ---
  const dir = axisX(input)
  if (dir !== 0) {
    const accel = pl.onGround ? RUN_ACCEL : RUN_ACCEL * AIR_ACCEL_FACTOR
    pl.vel.x += dir * accel * dt
    pl.facing = dir
  } else {
    const friction = (pl.onGround ? GROUND_FRICTION : AIR_FRICTION) * dt
    if (Math.abs(pl.vel.x) <= friction) pl.vel.x = 0
    else pl.vel.x -= Math.sign(pl.vel.x) * friction
  }
  pl.vel.x = Math.max(-RUN_MAX, Math.min(RUN_MAX, pl.vel.x))

  // --- jump: ground jump via coyote grace, then mid-air jumps if unlocked ---
  const maxAirJumps = hasAbility(next, 'doubleJump') ? MAX_AIR_JUMPS : 0
  if (pl.jumpBufferTimer > 0) {
    if (pl.coyoteTimer > 0) {
      pl.vel.y = JUMP_VELOCITY
      pl.onGround = false
      pl.coyoteTimer = 0
      pl.jumpBufferTimer = 0
      pl.airJumpsUsed = 0
    } else if (pl.airJumpsUsed < maxAirJumps) {
      pl.vel.y = DOUBLE_JUMP_VELOCITY
      pl.airJumpsUsed += 1
      pl.jumpBufferTimer = 0
    }
  }

  // --- wall climb ---
  // Airborne, pressing into a wall, and holding the ability: cling. Gravity is
  // replaced below rather than added to, so these speeds are the real rate.
  const wall = hasAbility(next, 'wallClimb') && !pl.onGround ? touchingWall(pl, gridOf(next)) : 0
  const clinging = wall !== 0 && dir === wall

  // Variable jump height: releasing early clips the rise.
  if (!clinging && !jumpHeld && pl.vel.y < -JUMP_RELEASE_SPEED) {
    pl.vel.y = -JUMP_RELEASE_SPEED
  }

  // --- gravity ---
  if (clinging) {
    pl.vel.y = jumpHeld ? -WALL_CLIMB_SPEED : WALL_SLIDE_SPEED
    // Touching a wall refreshes the mid-air jump budget, so a climb can be
    // abandoned part-way rather than trapping the player on the wall.
    pl.airJumpsUsed = 0
  } else {
    pl.vel.y = Math.min(MAX_FALL, pl.vel.y + GRAVITY * dt)
  }

  // --- integrate with collision ---
  moveX(pl, gridOf(next), pl.vel.x * dt)
  pl.onGround = moveY(pl, gridOf(next), pl.vel.y * dt)

  // --- coyote grace and mid-air jump budget ---
  pl.coyoteTimer = pl.onGround ? COYOTE_TIME : Math.max(0, pl.coyoteTimer - dt)
  if (pl.onGround) pl.airJumpsUsed = 0

  // --- attack: press edge only, so holding the button cannot spam it ---
  next.attackCooldown = Math.max(0, next.attackCooldown - 1)
  if (next.attackTimer > 0) next.attackTimer -= 1
  const attackPressed = held(input, BTN.ATTACK) && !held(state.prevInput, BTN.ATTACK)
  if (attackPressed && next.attackCooldown === 0) {
    next.attackTimer = ATTACK_TICKS
    next.attackCooldown = ATTACK_COOLDOWN_TICKS
  }

  // --- enemies ---
  const grid = gridOf(next)
  for (const enemy of next.enemies) {
    if (enemy.roomId === next.roomId) {
      stepEnemy(enemy, grid, dt)
    } else if (!enemy.alive) {
      // Out of the room: frozen in place, but the respawn clock keeps running, so
      // a room you cleared is repopulated whether or not you are standing in it.
      enemy.respawnTimer -= 1
      if (enemy.respawnTimer <= 0) {
        enemy.alive = true
        enemy.hp = ENEMY_HP
        enemy.pos = { ...enemy.spawn }
        enemy.respawnTimer = 0
      }
    }
  }

  // --- the swing lands ---
  // Applied after enemies move, so the hitbox tests where they actually are.
  if (next.attackTimer > 0) {
    const swing = swingBox(pl)
    for (const enemy of next.enemies) {
      if (!enemy.alive || enemy.roomId !== next.roomId || enemy.hitCooldown > 0) continue
      const box = bodyBox(enemy.pos)
      if (!boxesOverlap(swing.x, swing.y, swing.w, swing.h, box.x, box.y, box.w, box.h)) continue
      // Per-enemy immunity is what makes one swing one hit — without it the
      // 12-tick window would deal 12 damage and no enemy could survive.
      enemy.hitCooldown = ENEMY_HIT_COOLDOWN
      enemy.hp -= 1
      if (enemy.hp <= 0) {
        enemy.alive = false
        enemy.hp = 0
        enemy.vel = { x: 0, y: 0 }
        enemy.respawnTimer = ENEMY_RESPAWN_TICKS
      }
    }
  }

  // --- contact damage ---
  next.invulnTimer = Math.max(0, next.invulnTimer - 1)
  if (next.invulnTimer === 0) {
    for (const enemy of next.enemies) {
      if (!enemy.alive || enemy.roomId !== next.roomId) continue
      if (!bodiesOverlap(pl, enemy)) continue
      next.hp -= 1
      next.invulnTimer = PLAYER_INVULN_TICKS
      break
    }
  }

  // --- death ---
  // Bail out here: the rest of the tick (items, doors, goal) is moot for a player
  // who is being put back at the room entry.
  if (next.hp <= 0) return respawn(next)

  // --- items ---
  for (const item of next.map.rooms[next.roomId]!.items) {
    if (next.collected.includes(item.id)) continue
    if (!overlapsCell(pl, item.col, item.row)) continue
    next.collected = [...next.collected, item.id].sort()
    if (!next.abilities.includes(item.ability)) {
      next.abilities = [...next.abilities, item.ability].sort()
    }
  }

  // --- doors ---
  if (next.transitionLock === 0) {
    for (const door of next.map.rooms[next.roomId]!.doors) {
      if (!overlapsCell(pl, door.col, door.row)) continue
      if (!isDoorOpen(next.map, door, next.abilities)) continue

      next.roomId = door.to

      // Land the player *inside* the target room, not on the door tile. Doors
      // are two-way by default, so arriving on the door's own tile would put the
      // player inside the return trigger and bounce them straight back the
      // moment the transition lock expires.
      const target = next.map.rooms[door.to]!
      const inward = door.toCol < target.grid.w / 2 ? 1 : -1
      const arrivalCol = Math.max(
        0,
        Math.min(target.grid.w - 1, door.toCol + inward * DOOR_ARRIVAL_INSET),
      )

      next.player = {
        ...freshPlayer(next.map, door.to),
        pos: { x: arrivalCol * TILE + TILE / 2, y: (door.toRow + 1) * TILE },
      }
      next.transitionLock = TRANSITION_LOCK_TICKS
      break
    }
  }

  // --- goal ---
  const goal = next.map.goal
  if (next.roomId === goal.room && overlapsCell(next.player, goal.col, goal.row)) {
    next.reachedGoal = true
  }

  return next
}

/** Advance `ticks` steps with a constant input mask. */
export function run(state: WorldState, input: InputMask, ticks: number, dt = FIXED_DT): WorldState {
  let s = state
  for (let i = 0; i < ticks; i++) s = step(s, input, dt)
  return s
}

/** Run a list of per-tick input masks. This is the shape a route script takes. */
export function runMasks(
  state: WorldState,
  masks: readonly InputMask[],
  dt = FIXED_DT,
): WorldState {
  let s = state
  for (const mask of masks) s = step(s, mask, dt)
  return s
}
