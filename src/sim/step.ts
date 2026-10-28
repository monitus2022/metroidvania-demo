import {
  AIR_ACCEL_FACTOR,
  AIR_FRICTION,
  COYOTE_TIME,
  DOOR_ARRIVAL_INSET,
  DOUBLE_JUMP_VELOCITY,
  FIXED_DT,
  GRAVITY,
  GROUND_FRICTION,
  JUMP_BUFFER,
  JUMP_RELEASE_SPEED,
  JUMP_VELOCITY,
  MAX_AIR_JUMPS,
  MAX_FALL,
  PLAYER_H,
  PLAYER_W,
  RUN_ACCEL,
  RUN_MAX,
  TILE,
  TRANSITION_LOCK_TICKS,
} from './constants'
import { moveX, moveY } from './collision'
import type { DoorDef, GameMap } from './content'
import { BTN, axisX, held, type InputMask } from './input'
import type { PlayerState, WorldState } from './state'
import type { TileGrid } from './tiles'

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
  }
}

/** Put the player back at the current room's entry, keeping abilities and items. */
export function respawn(state: WorldState): WorldState {
  return {
    ...state,
    player: freshPlayer(state.map, state.roomId),
    transitionLock: TRANSITION_LOCK_TICKS,
  }
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

  // Variable jump height: releasing early clips the rise.
  if (!jumpHeld && pl.vel.y < -JUMP_RELEASE_SPEED) pl.vel.y = -JUMP_RELEASE_SPEED

  // --- gravity ---
  pl.vel.y = Math.min(MAX_FALL, pl.vel.y + GRAVITY * dt)

  // --- integrate with collision ---
  moveX(pl, gridOf(next), pl.vel.x * dt)
  pl.onGround = moveY(pl, gridOf(next), pl.vel.y * dt)

  // --- coyote grace and mid-air jump budget ---
  pl.coyoteTimer = pl.onGround ? COYOTE_TIME : Math.max(0, pl.coyoteTimer - dt)
  if (pl.onGround) pl.airJumpsUsed = 0

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
