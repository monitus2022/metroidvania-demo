import { describe, expect, it } from 'vitest'
import { BTN } from '../../src/sim/input'
import { FIXED_DT } from '../../src/sim/constants'
import { createInitialState, FLOOR_Y, step, WORLD_W } from '../../src/sim/step'
import { mulberry32 } from '../../src/sim/rng'

/** M0 smoke test: the sim is a pure function and gravity/input do something real. */
describe('sim: smoke', () => {
  it('step() does not mutate the state it is given', () => {
    const before = createInitialState()
    const snapshot = JSON.stringify(before)
    step(before, BTN.RIGHT)
    expect(JSON.stringify(before)).toBe(snapshot)
  })

  it('gravity settles the player on the floor', () => {
    let s = createInitialState()
    s.player.pos.y = FLOOR_Y - 40
    s.player.onGround = false
    for (let i = 0; i < 120; i++) s = step(s, 0)
    expect(s.player.pos.y).toBe(FLOOR_Y)
    expect(s.player.onGround).toBe(true)
    expect(s.player.vel.y).toBe(0)
  })

  it('holding right moves the player right, capped at RUN_MAX', () => {
    let s = createInitialState()
    const x0 = s.player.pos.x
    for (let i = 0; i < 30; i++) s = step(s, BTN.RIGHT, FIXED_DT)
    expect(s.player.pos.x).toBeGreaterThan(x0)
    expect(s.player.vel.x).toBeLessThanOrEqual(150 + 1e-9)
  })

  it('jump leaves the ground, then lands again', () => {
    let s = createInitialState()
    s = step(s, BTN.JUMP)
    expect(s.player.onGround).toBe(false)
    expect(s.player.vel.y).toBeLessThan(0)
    for (let i = 0; i < 120; i++) s = step(s, 0)
    expect(s.player.onGround).toBe(true)
    expect(s.player.pos.y).toBe(FLOOR_Y)
  })

  it('the player cannot leave the world horizontally', () => {
    let s = createInitialState()
    for (let i = 0; i < 600; i++) s = step(s, BTN.RIGHT)
    expect(s.player.pos.x).toBeLessThanOrEqual(WORLD_W)
    expect(s.player.pos.x).toBeGreaterThanOrEqual(0)
  })

  it('mulberry32 is deterministic for a given seed', () => {
    const a = mulberry32(42)
    const b = mulberry32(42)
    const seqA = Array.from({ length: 8 }, () => a())
    const seqB = Array.from({ length: 8 }, () => b())
    expect(seqA).toEqual(seqB)
    expect(seqA.every((v) => v >= 0 && v < 1)).toBe(true)
  })
})
