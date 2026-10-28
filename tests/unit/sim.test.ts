import { describe, expect, it } from 'vitest'
import { overlapsSolid } from '../../src/sim/collision'
import {
  COYOTE_TIME,
  FIXED_DT,
  GRAVITY,
  JUMP_BUFFER,
  JUMP_VELOCITY,
  PLAYER_H,
  PLAYER_W,
  RUN_MAX,
  TILE,
} from '../../src/sim/constants'
import { BTN } from '../../src/sim/input'
import { DEMO_LEVEL } from '../../src/sim/levels'
import { createInitialState, run, step } from '../../src/sim/step'
import type { WorldState } from '../../src/sim/state'
import { gridHeightPx, gridWidthPx, type TileGrid } from '../../src/sim/tiles'
import { GAP4, WALL } from './fixtures'

/** Drop the player from `dropPx` above spawn with no coyote grace and fall. */
function falling(level: TileGrid, dropPx: number): WorldState {
  const s = createInitialState(level)
  s.player.pos.y -= dropPx
  s.player.onGround = false
  s.player.coyoteTimer = 0
  return s
}

/** Ticks until a falling body lands. */
function ticksToLand(level: TileGrid, dropPx: number): number {
  let s = falling(level, dropPx)
  let n = 0
  while (!s.player.onGround && n < 600) {
    s = step(s, 0)
    n++
  }
  return n
}

describe('sim: purity', () => {
  it('step() never mutates the state it is given', () => {
    const before = createInitialState(DEMO_LEVEL)
    const snapshot = JSON.stringify(before)
    step(before, BTN.RIGHT)
    expect(JSON.stringify(before)).toBe(snapshot)
  })

  it('a full run leaves the starting state untouched', () => {
    const before = createInitialState(DEMO_LEVEL)
    const snapshot = JSON.stringify(before)
    run(before, BTN.RIGHT | BTN.JUMP, 300)
    expect(JSON.stringify(before)).toBe(snapshot)
  })
})

describe('sim: gravity and movement', () => {
  it('settles on the ground under gravity', () => {
    const s = run(falling(DEMO_LEVEL, 40), 0, 120)
    expect(s.player.onGround).toBe(true)
    expect(s.player.vel.y).toBe(0)
    expect(overlapsSolid(s.player, s.level)).toBeNull()
  })

  it('accelerates right and caps at RUN_MAX', () => {
    let s = createInitialState(DEMO_LEVEL)
    const x0 = s.player.pos.x
    s = run(s, BTN.RIGHT, 60)
    expect(s.player.pos.x).toBeGreaterThan(x0)
    expect(s.player.vel.x).toBeLessThanOrEqual(RUN_MAX + 1e-9)
    expect(s.player.facing).toBe(1)
  })

  it('decelerates to a dead stop when input is released', () => {
    let s = run(createInitialState(DEMO_LEVEL), BTN.RIGHT, 60)
    s = run(s, 0, 60)
    expect(s.player.vel.x).toBe(0)
  })

  it('mirrors exactly when running left, over a window where it hits nothing', () => {
    // Deliberately short: the spawn is near the left wall, so a long run left
    // would be a wall test, not a symmetry test.
    const TICKS = 10
    const right = run(createInitialState(DEMO_LEVEL), BTN.RIGHT, TICKS)
    const left = run(createInitialState(DEMO_LEVEL), BTN.LEFT, TICKS)
    const spawnX = createInitialState(DEMO_LEVEL).player.pos.x
    expect(right.player.pos.x - spawnX).toBeCloseTo(spawnX - left.player.pos.x, 6)
    expect(left.player.facing).toBe(-1)
    expect(left.player.vel.x).toBeCloseTo(-right.player.vel.x, 6)
  })
})

describe('sim: tile collision', () => {
  it('stops against a wall without penetrating it', () => {
    const s = run(createInitialState(WALL), BTN.RIGHT, 400)
    expect(s.player.pos.x).toBeLessThan(12 * TILE)
    expect(overlapsSolid(s.player, s.level)).toBeNull()
    expect(s.player.vel.x).toBe(0)
  })

  it('cannot tunnel through a wall even at runaway speed', () => {
    // Hand-set a velocity far beyond anything the tuner produces: this is the
    // sub-stepping guard, not a reachable game state.
    const s = createInitialState(WALL)
    s.player.vel.x = 20_000
    const after = step(s, 0)
    expect(after.player.pos.x).toBeLessThan(12 * TILE)
    expect(overlapsSolid(after.player, after.level)).toBeNull()
  })

  it('falls into the pit when no jump is used', () => {
    const s = run(createInitialState(GAP4), BTN.RIGHT, 300)
    expect(s.player.pos.y).toBeGreaterThan(10 * TILE)
    expect(overlapsSolid(s.player, s.level)).toBeNull()
  })

  it('never leaves the grid, however hard it is pushed', () => {
    for (const mask of [BTN.LEFT, BTN.RIGHT, BTN.LEFT | BTN.JUMP, BTN.RIGHT | BTN.JUMP]) {
      const s = run(createInitialState(DEMO_LEVEL), mask, 900)
      expect(s.player.pos.x).toBeGreaterThanOrEqual(0)
      expect(s.player.pos.x).toBeLessThanOrEqual(gridWidthPx(s.level))
      expect(s.player.pos.y).toBeGreaterThanOrEqual(0)
      expect(s.player.pos.y).toBeLessThanOrEqual(gridHeightPx(s.level))
    }
  })

  it('the player body fits inside a tile', () => {
    expect(PLAYER_W).toBeLessThan(TILE)
    expect(PLAYER_H).toBe(TILE)
  })
})

describe('sim: jump mechanics', () => {
  it('a jump leaves the ground and lands again', () => {
    let s = step(createInitialState(DEMO_LEVEL), BTN.JUMP)
    expect(s.player.onGround).toBe(false)
    expect(s.player.vel.y).toBeLessThan(0)
    s = run(s, 0, 120)
    expect(s.player.onGround).toBe(true)
  })

  it('holding jump rises higher than tapping it', () => {
    const spawnY = createInitialState(DEMO_LEVEL).player.pos.y

    let hold = step(createInitialState(DEMO_LEVEL), BTN.JUMP)
    let holdMin = hold.player.pos.y
    for (let i = 0; i < 20; i++) {
      hold = step(hold, BTN.JUMP)
      holdMin = Math.min(holdMin, hold.player.pos.y)
    }

    let tap = step(createInitialState(DEMO_LEVEL), BTN.JUMP)
    let tapMin = tap.player.pos.y
    for (let i = 0; i < 20; i++) {
      tap = step(tap, 0)
      tapMin = Math.min(tapMin, tap.player.pos.y)
    }

    expect(holdMin).toBeLessThan(tapMin)
    expect(holdMin).toBeLessThan(spawnY - 20)
  })

  it('coyote time allows a jump on the first tick after walking off a ledge', () => {
    let s = createInitialState(GAP4)
    let ticksOnGround = 0
    for (let i = 0; i < 400; i++) {
      s = step(s, BTN.RIGHT)
      ticksOnGround++
      if (!s.player.onGround) break
    }
    expect(s.player.onGround).toBe(false)
    expect(s.player.coyoteTimer).toBeGreaterThan(0)

    const vyBefore = s.player.vel.y
    const after = step(s, BTN.RIGHT | BTN.JUMP)
    expect(after.player.vel.y).toBeLessThan(vyBefore)
    // Gravity is applied in the same tick as the jump, so the first frame
    // carries the configured impulse *plus* one tick of gravity.
    expect(after.player.vel.y).toBeCloseTo(JUMP_VELOCITY + GRAVITY * FIXED_DT, 6)
    expect(ticksOnGround).toBeGreaterThan(1)
  })

  it('an airborne jump does nothing once coyote grace has expired', () => {
    const s = falling(DEMO_LEVEL, 60)
    expect(s.player.coyoteTimer).toBe(0)
    const after = step(s, BTN.JUMP)
    // Gravity only — no upward impulse.
    expect(after.player.vel.y).toBeGreaterThan(0)
  })

  it('an airborne jump does fire while coyote grace remains', () => {
    const s = falling(DEMO_LEVEL, 60)
    s.player.coyoteTimer = COYOTE_TIME
    const after = step(s, BTN.JUMP)
    expect(after.player.vel.y).toBeCloseTo(JUMP_VELOCITY + GRAVITY * FIXED_DT, 6)
  })

  it('a jump pressed within the buffer window fires on landing', () => {
    const landAt = ticksToLand(DEMO_LEVEL, 40)
    const pressAt = landAt - 3 // well inside JUMP_BUFFER (7 ticks)
    expect(landAt).toBeGreaterThan(6)

    let s = falling(DEMO_LEVEL, 40)
    for (let i = 1; i <= landAt; i++) s = step(s, i >= pressAt ? BTN.JUMP : 0)

    // It landed normally on the tick the buffer had not yet been consumable...
    expect(s.player.onGround).toBe(true)

    // ...and the buffered press fires immediately afterwards.
    s = step(s, BTN.JUMP)
    expect(s.player.onGround).toBe(false)
    expect(s.player.vel.y).toBeLessThan(0)
  })

  it('a jump pressed too early does not fire on landing', () => {
    const landAt = ticksToLand(DEMO_LEVEL, 40)
    const pressAt = Math.max(1, landAt - 40) // far outside the buffer window
    expect(landAt * (1 / 60)).toBeGreaterThan(JUMP_BUFFER)

    let s = falling(DEMO_LEVEL, 40)
    for (let i = 1; i <= landAt; i++) s = step(s, i === pressAt ? BTN.JUMP : 0)
    expect(s.player.onGround).toBe(true)

    // Released, so no second press edge either.
    s = step(s, 0)
    expect(s.player.onGround).toBe(true)
  })
})
