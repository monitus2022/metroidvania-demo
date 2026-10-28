import { describe, expect, it } from 'vitest'
import type { GameMap } from '../../src/sim/content'
import { BTN } from '../../src/sim/input'
import { GAME_MAP } from '../../src/sim/levels'
import { hashState, runReplay, type Replay } from '../../src/sim/replay'
import { createInitialState, step } from '../../src/sim/step'
import { GAP4, WALL } from './fixtures'

/** A replay is just a seed plus one input mask per tick. */
function session(map: GameMap, seed: number): Replay {
  const inputs: number[] = []
  let s = createInitialState(map, seed)
  // A deliberately varied script: run, jump, stall, reverse.
  for (let i = 0; i < 400; i++) {
    let mask = BTN.RIGHT
    if (i % 97 < 20) mask |= BTN.JUMP
    if (i > 200 && i < 260) mask = BTN.LEFT
    if (i % 53 === 0) mask = 0
    inputs.push(mask)
    s = step(s, mask)
  }
  return { seed, inputs }
}

/**
 * Compare whole trajectories, not just the final state. Two different paths
 * can settle into the same resting pose — comparing endpoints would miss the
 * divergence entirely.
 */
function trajectory(map: GameMap, replay: Replay): string[] {
  let s = createInitialState(map, replay.seed)
  const out = [hashState(s)]
  for (const mask of replay.inputs) {
    s = step(s, mask)
    out.push(hashState(s))
  }
  return out
}

describe('replay: determinism', () => {
  it('the same replay yields a byte-identical trajectory', () => {
    const r = session(GAP4, 7)
    expect(trajectory(GAP4, r)).toEqual(trajectory(GAP4, r))
  })

  it('replays identically from a fresh initial state (no hidden global state)', () => {
    const r = session(GAME_MAP, 11)
    const a = runReplay(GAME_MAP, r)
    const b = runReplay(GAME_MAP, r)
    expect(a.tick).toBe(b.tick)
    expect(a.roomId).toBe(b.roomId)
    expect(a.player.pos.x).toBe(b.player.pos.x)
    expect(a.player.pos.y).toBe(b.player.pos.y)
    expect(a.player.vel.x).toBe(b.player.vel.x)
    expect(a.player.vel.y).toBe(b.player.vel.y)
    expect(a.player.onGround).toBe(b.player.onGround)
    expect(a.player.airJumpsUsed).toBe(b.player.airJumpsUsed)
    expect(a.abilities).toEqual(b.abilities)
    expect(hashState(a)).toBe(hashState(b))
  })

  it('interleaved runs do not contaminate each other', () => {
    const r1 = session(GAP4, 7)
    const r2 = session(WALL, 8)
    const first = trajectory(GAP4, r1)
    trajectory(WALL, r2)
    expect(trajectory(GAP4, r1)).toEqual(first)
  })

  it('a single changed input mask diverges the trajectory', () => {
    const r = session(GAP4, 3)
    const mutated: Replay = {
      ...r,
      inputs: r.inputs.map((m, i) => (i === 120 ? m ^ BTN.JUMP : m)),
    }
    expect(mutated.inputs[120]).not.toBe(r.inputs[120])
    expect(trajectory(GAP4, mutated)).not.toEqual(trajectory(GAP4, r))
  })

  it('input order matters — the same masks reversed diverge', () => {
    const r = session(WALL, 5)
    const reversed: Replay = { ...r, inputs: [...r.inputs].reverse() }
    expect(trajectory(WALL, reversed)).not.toEqual(trajectory(WALL, r))
  })

  it('different maps with identical input diverge', () => {
    const r = session(GAP4, 2)
    expect(trajectory(WALL, r)).not.toEqual(trajectory(GAP4, r))
  })
})
