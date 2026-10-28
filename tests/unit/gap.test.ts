import { describe, expect, it } from 'vitest'
import { TILE } from '../../src/sim/constants'
import { BTN } from '../../src/sim/input'
import { createInitialState, step } from '../../src/sim/step'
import { GAP4, GAP4_END_X, GAP4_START_X } from './fixtures'

/** Top surface of the floor in GAP4. */
const FLOOR_Y = 10 * TILE
/** How long a player holds the jump button for a full-height jump. */
const JUMP_HOLD_TICKS = 15

interface Attempt {
  /** Landed beyond the pit without ever dropping below the floor. */
  cleared: boolean
  /** Dropped below the floor at some point — i.e. fell into the pit. */
  fell: boolean
  finalX: number
}

/**
 * Hold RIGHT from frame 0 and hold JUMP for JUMP_HOLD_TICKS starting at
 * `jumpFrame`.
 *
 * "Cleared" deliberately means *never dropped below the floor surface*.
 * Merely ending up past the pit is not enough: a body that falls in and then
 * jumps back out also ends up past it, which is a different (and easier)
 * manoeuvre.
 */
function attempt(jumpFrame: number): Attempt {
  let s = createInitialState(GAP4)
  let fell = false
  for (let i = 0; i < 300; i++) {
    const mask = BTN.RIGHT | (i >= jumpFrame && i < jumpFrame + JUMP_HOLD_TICKS ? BTN.JUMP : 0)
    s = step(s, mask)
    if (s.player.pos.y > FLOOR_Y + 1e-6) fell = true
  }
  return {
    cleared: !fell && s.player.onGround && s.player.pos.x >= GAP4_END_X,
    fell,
    finalX: s.player.pos.x,
  }
}

/** Every jump frame in 0..90 that clears the pit. */
function clearingWindow(): number[] {
  const frames: number[] = []
  for (let f = 0; f <= 90; f++) if (attempt(f).cleared) frames.push(f)
  return frames
}

describe('4-tile gap', () => {
  it('is clearable across a contiguous window of jump frames', () => {
    const window = clearingWindow()
    // eslint-disable-next-line no-console
    console.log(
      `GAP4 clearing window: ${window[0]}..${window[window.length - 1]} (${window.length} frames)`,
    )

    expect(window.length).toBeGreaterThan(0)

    // Contiguous: a gap you can only cross on one specific frame is unfair.
    const first = window[0]!
    const last = window[window.length - 1]!
    expect(last - first + 1).toBe(window.length)

    // And the window must be forgiving enough to be playable by a human.
    expect(window.length).toBeGreaterThanOrEqual(10)
  })

  it('holding RIGHT and jumping at frame 40 clears the pit', () => {
    const a = attempt(40)
    expect(a.fell).toBe(false)
    expect(a.cleared).toBe(true)
    expect(a.finalX).toBeGreaterThanOrEqual(GAP4_END_X)
  })

  it('is a real obstacle: without jumping the player falls in', () => {
    const a = attempt(-1) // never jump
    expect(a.fell).toBe(true)
    expect(a.cleared).toBe(false)
  })

  it('the run-up starts well before the pit', () => {
    const window = clearingWindow()
    expect(window[0]).toBeGreaterThan(0)
    expect(createInitialState(GAP4).player.pos.x).toBeLessThan(GAP4_START_X)
  })
})
