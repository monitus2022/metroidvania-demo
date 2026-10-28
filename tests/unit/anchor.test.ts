import { describe, expect, it } from 'vitest'
import { TILE } from '../../src/sim/constants'
import { BTN } from '../../src/sim/input'
import { createInitialState, run, step } from '../../src/sim/step'
import { ABILITY_MOVEMENT, BASE_MOVEMENT, UNVERIFIED_ABILITIES } from '../../tools/solver/reachability'
import { flatRoom, gapRoom } from './fixtures'

/*
 * Anchor the solver's movement model to the real simulation.
 *
 * The solver approximates movement with a jump envelope instead of simulating
 * the platformer. That approximation is only safe while it stays *inside* what
 * the sim can actually do: over-claiming ships an unbeatable level silently,
 * while under-claiming fails loudly and cheaply. These tests measure the real
 * numbers and pin the model beneath them.
 */

/** Hold jump to the apex, release for one tick, then jump again at the apex. */
function doubleJumpArc(): { minY: number; spawnY: number } {
  const s0 = createInitialState(flatRoom())
  s0.abilities = ['doubleJump']
  const spawnY = s0.player.pos.y
  let s = s0
  let minY = spawnY
  const track = (): void => {
    minY = Math.min(minY, s.player.pos.y)
  }

  s = step(s, BTN.JUMP)
  track()
  // Rise on the first jump until near the apex.
  for (let i = 0; i < 60 && s.player.vel.y < -30 && !s.player.onGround; i++) {
    s = step(s, BTN.JUMP)
    track()
  }
  s = step(s, 0)
  track()
  s = step(s, BTN.JUMP) // second jump, needs a fresh press edge
  track()
  for (let i = 0; i < 60; i++) {
    s = step(s, BTN.JUMP)
    track()
  }
  return { minY, spawnY }
}

/** Tiles of rise achievable in a single jump. */
function measureJumpRiseTiles(): number {
  let s = createInitialState(flatRoom())
  const y0 = s.player.pos.y
  let minY = y0
  for (let i = 0; i < 120; i++) {
    s = step(s, BTN.JUMP)
    minY = Math.min(minY, s.player.pos.y)
  }
  return Math.floor((y0 - minY) / TILE)
}

/** Tiles of rise achievable with a mid-air second jump. */
function measureDoubleJumpRiseTiles(): number {
  const { minY, spawnY } = doubleJumpArc()
  return Math.floor((spawnY - minY) / TILE)
}

/**
 * Can a full-speed run cross a pit of `gap` tiles?
 *
 * The jump program mirrors what a player does: hold jump, release briefly, hold
 * again for the mid-air jump when the ability is available.
 */
function canClear(gap: number, withDoubleJump: boolean): boolean {
  const map = gapRoom(gap)
  const floorY = 10 * TILE
  const landX = (12 + gap) * TILE
  const firstJump = 8
  const secondJump = 14

  for (let f = 0; f <= 90; f++) {
    let s = createInitialState(map)
    if (withDoubleJump) s.abilities = ['doubleJump']
    let fell = false

    for (let i = 0; i < 400; i++) {
      const phase = i - f
      let mask = BTN.RIGHT
      if (phase >= 0 && phase < firstJump) mask |= BTN.JUMP
      if (withDoubleJump && phase >= secondJump && phase < secondJump + 10) mask |= BTN.JUMP
      s = step(s, mask)
      if (s.player.pos.y > floorY + 1e-6) fell = true
    }
    if (!fell && s.player.onGround && s.player.pos.x >= landX) return true
  }
  return false
}

function measureMaxGapTiles(withDoubleJump: boolean): number {
  let max = 0
  for (let g = 1; g <= 16; g++) if (canClear(g, withDoubleJump)) max = g
  return max
}

/** The player never gains any mid-air jump without the ability. */
describe('solver model is anchored to the simulation', () => {
  it('measures the real movement numbers', () => {
    const rise = measureJumpRiseTiles()
    const djRise = measureDoubleJumpRiseTiles()
    const gap = measureMaxGapTiles(false)
    const djGap = measureMaxGapTiles(true)
    // eslint-disable-next-line no-console
    console.log(
      `measured from the sim:\n` +
        `  jump rise       ${rise} tiles  (solver claims ${BASE_MOVEMENT.jumpHeight})\n` +
        `  max gap         ${gap} tiles  (solver claims ${BASE_MOVEMENT.jumpDistance})\n` +
        `  double-jump rise ${djRise} tiles  (solver claims ${ABILITY_MOVEMENT.doubleJump?.jumpHeight})\n` +
        `  double-jump gap  ${djGap} tiles  (solver claims ${ABILITY_MOVEMENT.doubleJump?.jumpDistance})`,
    )

    expect(rise).toBeGreaterThanOrEqual(2)
    expect(rise).toBeLessThanOrEqual(8)
    expect(gap).toBeGreaterThanOrEqual(4)
    expect(gap).toBeLessThanOrEqual(16)
    // The second jump must actually add height, or the ability is decorative.
    expect(djRise).toBeGreaterThan(rise)
    expect(djGap).toBeGreaterThan(gap)
  })

  it('never claims a higher jump than the sim achieves', () => {
    expect(BASE_MOVEMENT.jumpHeight).toBeLessThanOrEqual(measureJumpRiseTiles())
  })

  it('never claims a wider gap than the sim clears', () => {
    expect(BASE_MOVEMENT.jumpDistance).toBeLessThanOrEqual(measureMaxGapTiles(false))
  })

  it('never claims more from doubleJump than the sim achieves', () => {
    expect(ABILITY_MOVEMENT.doubleJump?.jumpHeight).toBeLessThanOrEqual(
      measureDoubleJumpRiseTiles(),
    )
    expect(ABILITY_MOVEMENT.doubleJump?.jumpDistance).toBeLessThanOrEqual(
      measureMaxGapTiles(true),
    )
  })

  it('has no abilities left on the unverified list', () => {
    // M3 implemented the double jump, so nothing in the solver's envelope is
    // guesswork any more. A new ability must be measured and then removed here.
    expect(UNVERIFIED_ABILITIES).toEqual([])
  })

  it('the sim really grants the double jump the solver assumes', () => {
    const map = flatRoom()
    const without = run(createInitialState(map), BTN.RIGHT | BTN.JUMP, 60)
    const s = createInitialState(map)
    s.abilities = ['doubleJump']
    const withDj = run(s, BTN.RIGHT | BTN.JUMP, 60)
    // Holding jump alone is one press; height is the same. The difference shows
    // up only when the button is re-pressed mid-air, which the arc measures.
    expect(without.player.pos.y).toBeLessThanOrEqual(200)
    expect(withDj.player.airJumpsUsed).toBe(0)
    expect(doubleJumpArc().minY).toBeLessThan(without.player.pos.y)
  })
})
