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
import { singleRoomMap } from '../../src/sim/content'
import { BTN } from '../../src/sim/input'
import { GAME_MAP } from '../../src/sim/levels'
import { createInitialState, gridOf, run, step } from '../../src/sim/step'
import type { WorldState } from '../../src/sim/state'
import { gridHeightPx, gridWidthPx } from '../../src/sim/tiles'
import { flatRoom, GAP4, WALL } from './fixtures'

const SPAWN_Y = GAME_MAP.rooms.atrium!.grid.spawn.y

/** Drop the player from `dropPx` above spawn, with no coyote grace. */
function falling(map = GAME_MAP, dropPx = 0): WorldState {
  const s = createInitialState(map)
  s.player.pos.y -= dropPx
  s.player.onGround = false
  s.player.coyoteTimer = 0
  return s
}

/** Ticks until a falling body lands. */
function ticksToLand(dropPx: number): number {
  let s = falling(GAME_MAP, dropPx)
  let n = 0
  while (!s.player.onGround && n < 600) {
    s = step(s, 0)
    n++
  }
  return n
}

describe('sim: purity', () => {
  it('step() never mutates the state it is given', () => {
    const before = createInitialState(GAME_MAP)
    const snapshot = JSON.stringify(before)
    step(before, BTN.RIGHT)
    expect(JSON.stringify(before)).toBe(snapshot)
  })

  it('a full run leaves the starting state untouched', () => {
    const before = createInitialState(GAME_MAP)
    const snapshot = JSON.stringify(before)
    run(before, BTN.RIGHT | BTN.JUMP, 300)
    expect(JSON.stringify(before)).toBe(snapshot)
  })
})

describe('sim: gravity and movement', () => {
  it('settles on the ground under gravity', () => {
    const s = run(falling(GAME_MAP, 40), 0, 120)
    expect(s.player.onGround).toBe(true)
    expect(s.player.vel.y).toBe(0)
    expect(overlapsSolid(s.player, gridOf(s))).toBeNull()
  })

  it('accelerates right and caps at RUN_MAX', () => {
    let s = createInitialState(GAME_MAP)
    const x0 = s.player.pos.x
    s = run(s, BTN.RIGHT, 60)
    expect(s.player.pos.x).toBeGreaterThan(x0)
    expect(s.player.vel.x).toBeLessThanOrEqual(RUN_MAX + 1e-9)
    expect(s.player.facing).toBe(1)
  })

  it('decelerates to a dead stop when input is released', () => {
    let s = run(createInitialState(GAME_MAP), BTN.RIGHT, 60)
    s = run(s, 0, 60)
    expect(s.player.vel.x).toBe(0)
  })

  it('mirrors exactly when running left, over a window where it hits nothing', () => {
    const TICKS = 10
    const right = run(createInitialState(GAME_MAP), BTN.RIGHT, TICKS)
    const left = run(createInitialState(GAME_MAP), BTN.LEFT, TICKS)
    const spawnX = createInitialState(GAME_MAP).player.pos.x
    expect(right.player.pos.x - spawnX).toBeCloseTo(spawnX - left.player.pos.x, 6)
    expect(left.player.facing).toBe(-1)
    expect(left.player.vel.x).toBeCloseTo(-right.player.vel.x, 6)
  })
})

describe('sim: tile collision', () => {
  it('stops against a wall without penetrating it', () => {
    const s = run(createInitialState(WALL), BTN.RIGHT, 400)
    expect(s.player.pos.x).toBeLessThan(12 * TILE)
    expect(overlapsSolid(s.player, gridOf(s))).toBeNull()
    expect(s.player.vel.x).toBe(0)
  })

  it('cannot tunnel through a wall even at runaway speed', () => {
    const s = createInitialState(WALL)
    s.player.vel.x = 20_000
    const after = step(s, 0)
    expect(after.player.pos.x).toBeLessThan(12 * TILE)
    expect(overlapsSolid(after.player, gridOf(after))).toBeNull()
  })

  it('falls into the pit when no jump is used', () => {
    const s = run(createInitialState(GAP4), BTN.RIGHT, 300)
    expect(s.player.pos.y).toBeGreaterThan(10 * TILE)
    expect(overlapsSolid(s.player, gridOf(s))).toBeNull()
  })

  it('never leaves the grid, however hard it is pushed', () => {
    for (const mask of [BTN.LEFT, BTN.RIGHT, BTN.LEFT | BTN.JUMP, BTN.RIGHT | BTN.JUMP]) {
      const s = run(createInitialState(flatRoom()), mask, 900)
      const grid = gridOf(s)
      expect(s.player.pos.x).toBeGreaterThanOrEqual(0)
      expect(s.player.pos.x).toBeLessThanOrEqual(gridWidthPx(grid))
      expect(s.player.pos.y).toBeGreaterThanOrEqual(0)
      expect(s.player.pos.y).toBeLessThanOrEqual(gridHeightPx(grid))
    }
  })

  it('the player body fits inside a tile', () => {
    expect(PLAYER_W).toBeLessThan(TILE)
    expect(PLAYER_H).toBe(TILE)
  })
})

describe('sim: jump mechanics', () => {
  it('a jump leaves the ground and lands again', () => {
    let s = step(createInitialState(GAME_MAP), BTN.JUMP)
    expect(s.player.onGround).toBe(false)
    expect(s.player.vel.y).toBeLessThan(0)
    s = run(s, 0, 120)
    expect(s.player.onGround).toBe(true)
  })

  it('holding jump rises higher than tapping it', () => {
    let hold = step(createInitialState(GAME_MAP), BTN.JUMP)
    let holdMin = hold.player.pos.y
    for (let i = 0; i < 20; i++) {
      hold = step(hold, BTN.JUMP)
      holdMin = Math.min(holdMin, hold.player.pos.y)
    }

    let tap = step(createInitialState(GAME_MAP), BTN.JUMP)
    let tapMin = tap.player.pos.y
    for (let i = 0; i < 20; i++) {
      tap = step(tap, 0)
      tapMin = Math.min(tapMin, tap.player.pos.y)
    }

    expect(holdMin).toBeLessThan(tapMin)
    expect(holdMin).toBeLessThan(SPAWN_Y - 20)
  })

  it('coyote time allows a jump on the first tick after walking off a ledge', () => {
    let s = createInitialState(GAP4)
    for (let i = 0; i < 400; i++) {
      s = step(s, BTN.RIGHT)
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
  })

  it('an airborne jump does nothing once coyote grace has expired', () => {
    const s = falling(GAME_MAP, 60)
    expect(s.player.coyoteTimer).toBe(0)
    const after = step(s, BTN.JUMP)
    expect(after.player.vel.y).toBeGreaterThan(0)
  })

  it('an airborne jump does fire while coyote grace remains', () => {
    const s = falling(GAME_MAP, 60)
    s.player.coyoteTimer = COYOTE_TIME
    const after = step(s, BTN.JUMP)
    expect(after.player.vel.y).toBeCloseTo(JUMP_VELOCITY + GRAVITY * FIXED_DT, 6)
  })

  it('a jump pressed within the buffer window fires on landing', () => {
    const landAt = ticksToLand(40)
    const pressAt = landAt - 3
    expect(landAt).toBeGreaterThan(6)

    let s = falling(GAME_MAP, 40)
    for (let i = 1; i <= landAt; i++) s = step(s, i >= pressAt ? BTN.JUMP : 0)
    expect(s.player.onGround).toBe(true)

    s = step(s, BTN.JUMP)
    expect(s.player.onGround).toBe(false)
    expect(s.player.vel.y).toBeLessThan(0)
  })

  it('a jump pressed too early does not fire on landing', () => {
    const landAt = ticksToLand(40)
    const pressAt = Math.max(1, landAt - 40)
    expect(landAt * (1 / 60)).toBeGreaterThan(JUMP_BUFFER)

    let s = falling(GAME_MAP, 40)
    for (let i = 1; i <= landAt; i++) s = step(s, i === pressAt ? BTN.JUMP : 0)
    expect(s.player.onGround).toBe(true)

    s = step(s, 0)
    expect(s.player.onGround).toBe(true)
  })
})

describe('sim: double jump', () => {
  const withDoubleJump = (): WorldState => {
    const s = createInitialState(flatRoom())
    s.abilities = ['doubleJump']
    return s
  }

  it('grants no mid-air jump without the ability', () => {
    let s = createInitialState(flatRoom())
    s = step(s, BTN.JUMP)
    s = step(s, 0)
    const before = s.player.vel.y
    s = step(s, BTN.JUMP)
    expect(s.player.airJumpsUsed).toBe(0)
    expect(s.player.vel.y).toBeGreaterThan(before)
  })

  it('grants exactly one mid-air jump with the ability', () => {
    let s = withDoubleJump()
    s = step(s, BTN.JUMP)
    s = step(s, 0)
    const beforeSecond = s.player.vel.y
    s = step(s, BTN.JUMP)
    expect(s.player.airJumpsUsed).toBe(1)
    expect(s.player.vel.y).toBeLessThan(beforeSecond)

    // A third press must do nothing: the budget is one.
    s = step(s, 0)
    const beforeThird = s.player.vel.y
    s = step(s, BTN.JUMP)
    expect(s.player.airJumpsUsed).toBe(1)
    expect(s.player.vel.y).toBeGreaterThan(beforeThird)
  })

  it('refills the mid-air jump on landing', () => {
    let s = withDoubleJump()
    s = step(s, BTN.JUMP)
    s = step(s, 0)
    s = step(s, BTN.JUMP)
    expect(s.player.airJumpsUsed).toBe(1)
    s = run(s, 0, 200)
    expect(s.player.onGround).toBe(true)
    expect(s.player.airJumpsUsed).toBe(0)
  })

  it('does not let the ability pass through a ceiling', () => {
    const map = singleRoomMap([
      '####################',
      '####################',
      '....................',
      '....................',
      '..P.................',
      '####################',
      '####################',
    ])
    let s = createInitialState(map)
    s.abilities = ['doubleJump']
    s = run(s, BTN.JUMP, 40)
    expect(overlapsSolid(s.player, gridOf(s))).toBeNull()
  })
})
