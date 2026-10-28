import { describe, expect, it } from 'vitest'
import { TILE } from '../../src/sim/constants'
import { BTN } from '../../src/sim/input'
import { createInitialState, step } from '../../src/sim/step'
import { gridFromRows } from '../../src/sim/tiles'
import { BASE_MOVEMENT } from '../../tools/solver/reachability'

/*
 * Anchor the solver's movement model to the real simulation.
 *
 * The solver approximates movement with a jump envelope instead of simulating
 * the platformer. That approximation is only safe while it stays *inside* what
 * the sim can actually do: over-claiming ships an unbeatable level silently,
 * while under-claiming fails loudly and cheaply. These tests measure the real
 * numbers and pin the model beneath them.
 */

const W = 30

function flatLevel() {
  const air = '.'.repeat(W)
  return gridFromRows([...Array(9).fill(air), '.'.repeat(1) + 'P' + '.'.repeat(W - 2), '#'.repeat(W), '#'.repeat(W)])
}

/** Highest surface the player can land on, in tiles, jumping from a flat floor. */
function measureJumpRiseTiles(): number {
  let s = createInitialState(flatLevel())
  const y0 = s.player.pos.y
  let minY = y0
  for (let i = 0; i < 120; i++) {
    s = step(s, BTN.JUMP)
    minY = Math.min(minY, s.player.pos.y)
  }
  return Math.floor((y0 - minY) / TILE)
}

/** A level with a runway, a pit of `gap` tiles, then a landing strip. */
function gapLevel(gap: number) {
  const width = 12 + gap + 8
  const air = '.'.repeat(width)
  const floor = '#'.repeat(12) + '.'.repeat(gap) + '#'.repeat(8)
  const spawn = 'P' + '.'.repeat(width - 1)
  return gridFromRows([...Array(9).fill(air), spawn, floor, floor])
}

/** Can a full-speed run with a well-timed jump cross a pit of `gap` tiles? */
function canClear(gap: number): boolean {
  const level = gapLevel(gap)
  const floorY = 10 * TILE
  const landX = (12 + gap) * TILE

  for (let f = 0; f <= 90; f++) {
    let s = createInitialState(level)
    let fell = false
    for (let i = 0; i < 300; i++) {
      const mask = BTN.RIGHT | (i >= f && i < f + 15 ? BTN.JUMP : 0)
      s = step(s, mask)
      if (s.player.pos.y > floorY + 1e-6) fell = true
    }
    if (!fell && s.player.onGround && s.player.pos.x >= landX) return true
  }
  return false
}

function measureMaxGapTiles(): number {
  let max = 0
  for (let g = 1; g <= 14; g++) if (canClear(g)) max = g
  return max
}

describe('solver model is anchored to the simulation', () => {
  it('measures a sane jump rise from the real sim', () => {
    const rise = measureJumpRiseTiles()
    const gap = measureMaxGapTiles()
    // eslint-disable-next-line no-console
    console.log(`measured from the sim: jump rise ${rise} tiles, max gap ${gap} tiles`)
    expect(rise).toBeGreaterThanOrEqual(2)
    expect(rise).toBeLessThanOrEqual(8)
    expect(gap).toBeGreaterThanOrEqual(4)
    expect(gap).toBeLessThanOrEqual(14)
  })

  it('never claims a higher jump than the sim achieves', () => {
    expect(BASE_MOVEMENT.jumpHeight).toBeLessThanOrEqual(measureJumpRiseTiles())
  })

  it('never claims a wider gap than the sim clears', () => {
    expect(BASE_MOVEMENT.jumpDistance).toBeLessThanOrEqual(measureMaxGapTiles())
  })
})
