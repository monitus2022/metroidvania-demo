import { describe, expect, it } from 'vitest'
import {
  ATTACK_COOLDOWN_TICKS,
  ATTACK_TICKS,
  BOSS_AGGRO,
  BOSS_HP,
  BOSS_SCALE,
  BOSS_SPEED,
  BOSS_W,
  ENEMY_RESPAWN_TICKS,
  PLAYER_W,
} from '../../src/sim/constants'
import { BTN } from '../../src/sim/input'
import { GAME_MAP } from '../../src/sim/levels'
import { singleRoomMap } from '../../src/sim/content'
import { isSolid } from '../../src/sim/tiles'
import { createInitialState, run, step } from '../../src/sim/step'
import type { WorldState } from '../../src/sim/state'
import { bossRoom, enemyInFront, enemyRoom } from './fixtures'

/*
 * The boss is not a separate system: it is an archetype. These tests pin the
 * three things that actually differ from a husk — its box, its health and its
 * permanence — plus the chase, which is the behaviour that stops it being
 * something you walk around the edge of.
 */

const boss = (s: WorldState) => s.enemies[0]!

/**
 * One full swing, with the boss placed in front of the player first.
 *
 * The reposition is not decoration: the boss *chases*, so left alone it walks
 * into the player, ends up behind the swing box, and the miss reads as a damage
 * bug. Same trap as the husk fixture — keep the target where the hitbox is.
 */
function swing(s: WorldState, distance = 26): WorldState {
  let next = enemyInFront(s, distance)
  // Also hold its offence for the duration. Its hit knocks the player backwards,
  // and a knocked-back player is outside the swing's reach on the next swing —
  // the miss then reads as "damage is broken" when it is the fight working.
  // How many hits it takes is this suite's question; its attacks have their own.
  next = {
    ...next,
    enemies: next.enemies.map((e) => ({ ...e, attackTimer: 0, attackCooldown: 9999 })),
  }
  next = step(next, BTN.ATTACK)
  next = run(next, BTN.ATTACK, ATTACK_TICKS + 2)
  return run(next, 0, ATTACK_COOLDOWN_TICKS + 2)
}

describe('boss: it is a bigger body, not a reskinned husk', () => {
  it('is twice the player in both dimensions', () => {
    const s = createInitialState(bossRoom())
    expect(BOSS_SCALE).toBe(2)
    expect(boss(s).w).toBe(PLAYER_W * 2)
    expect(boss(s).h).toBe(24 * 2)
    expect(BOSS_W).toBe(24)
  })

  it('does not collide as a player-sized box', () => {
    // The whole reason the size moved onto Body: with a 12x24 collider the boss
    // would slip under its own art and hits would look like misses.
    const s = createInitialState(bossRoom())
    const husk = createInitialState(enemyRoom())
    expect(boss(s).h).toBeGreaterThan(husk.enemies[0]!.h)
    expect(boss(s).w).toBeGreaterThan(husk.enemies[0]!.w)
  })
})

describe('boss: it takes a fight, not a hit', () => {
  it('survives a single swing', () => {
    // The exact opposite of a husk, which dies to one. This is the assertion that
    // would have caught the boss silently inheriting ENEMY_HP = 1.
    let s = enemyInFront(createInitialState(bossRoom()), 26)
    s = swing(s)
    expect(boss(s).alive).toBe(true)
    expect(boss(s).hp).toBe(BOSS_HP - 1)
  })

  it('dies on the fourth swing', () => {
    let s = enemyInFront(createInitialState(bossRoom()), 26)
    for (let i = 0; i < BOSS_HP; i++) s = swing(s)
    expect(boss(s).alive).toBe(false)
    expect(boss(s).hp).toBe(0)
  })

  it('is not left at zero health but alive, or alive at zero', () => {
    let s = enemyInFront(createInitialState(bossRoom()), 26)
    for (let i = 0; i < BOSS_HP; i++) s = swing(s)
    expect(boss(s).alive).toBe(false)
    expect(boss(s).hp).toBe(0)
    expect(boss(s).respawnTimer).toBe(0)
  })

  it('stays dead', () => {
    // A husk refills the room; the boss is a one-time event. Without this the
    // player could clear the arena, walk back in, and find it waiting again.
    let s = enemyInFront(createInitialState(bossRoom()), 26)
    for (let i = 0; i < BOSS_HP; i++) s = swing(s)
    s = run(s, 0, ENEMY_RESPAWN_TICKS * 2)
    expect(boss(s).alive).toBe(false)
  })

  it('a husk still respawns, so the archetype did not change normal enemies', () => {
    let s = enemyInFront(createInitialState(enemyRoom()), 20)
    s = swing(s)
    expect(s.enemies[0]!.alive).toBe(false)
    s = run(s, 0, ENEMY_RESPAWN_TICKS + 5)
    expect(s.enemies[0]!.alive).toBe(true)
    expect(s.enemies[0]!.hp).toBe(1)
  })
})

describe('boss: it comes to you', () => {
  it('closes the distance when the player is inside its notice range', () => {
    // Put the player just inside aggro, then let the boss walk.
    let s = createInitialState(bossRoom())
    s = { ...s, player: { ...s.player, pos: { x: 140, y: 160 } } }
    const start = Math.abs(boss(s).pos.x - s.player.pos.x)
    expect(start).toBeLessThanOrEqual(BOSS_AGGRO)

    s = run(s, 0, 60)
    const now = Math.abs(boss(s).pos.x - s.player.pos.x)
    expect(now).toBeLessThan(start)
  })

  it('patrols instead of beelining from across the room', () => {
    // A boss that charges from any distance is not a fight, it is a cutscene.
    let s = createInitialState(bossRoom())
    s = { ...s, player: { ...s.player, pos: { x: 8, y: 160 } } }
    const far = Math.abs(boss(s).pos.x - s.player.pos.x)
    expect(far).toBeGreaterThan(BOSS_AGGRO)

    s = run(s, 0, 60)
    // With patrol 0 it has nowhere to walk, so it must not have closed in.
    expect(Math.abs(boss(s).pos.x - s.player.pos.x)).toBe(far)
  })

  it('is slower than the player, so disengaging always works', () => {
    expect(BOSS_SPEED).toBeLessThan(130)
  })

  it('does not walk off a ledge while chasing', () => {
    // The player stands across a pit. Chasing would carry the boss straight into
    // it, so the chase stops at the edge instead. Turning is the wrong answer
    // here: the chase re-aims every tick, so turning would just flip its facing.
    const ledgeMap = singleRoomMap(
      [
        ...Array(9).fill('....................'),
        '................P...',
        '############..######',
        '############..######',
      ],
      { id: 'ledge', enemies: [{ id: 'b1', kind: 'nightborne', col: 10, row: 9, patrol: 0 }] },
    )
    const s = run(createInitialState(ledgeMap), 0, 300)
    const b = s.enemies[0]!
    const pitLeftPx = 12 * 16
    expect(b.pos.y).toBe(160) // still on the floor, not falling through the pit
    expect(b.pos.x).toBeLessThan(pitLeftPx)
  })
})

describe('boss: it is in the shipped map', () => {
  it('the summit holds exactly one nightborne, and it is not a respawner', () => {
    const s = createInitialState(GAME_MAP)
    const inSummit = s.enemies.filter((e) => e.roomId === 'summit')
    expect(inSummit.length).toBe(1)
    expect(inSummit[0]!.kind).toBe('nightborne')
    expect(inSummit[0]!.hp).toBe(BOSS_HP)
    expect(inSummit[0]!.w).toBe(BOSS_W)
  })

  it('the flag sits on the plinth, not on the arena floor', () => {
    // The plinth is what forces the player to deal with the arena rather than
    // strolling to the goal along the ground.
    const goal = GAME_MAP.goal
    const grid = GAME_MAP.rooms[goal.room]!.grid
    expect(isSolid(grid, goal.col, goal.row + 1)).toBe(true)
    expect(isSolid(grid, goal.col, goal.row)).toBe(false)
  })
})
