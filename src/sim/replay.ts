import { FIXED_DT } from './constants'
import type { GameMap } from './content'
import { createInitialState, step } from './step'
import type { WorldState } from './state'

/**
 * Fixed-precision float, so hashes are stable and never differ on hair-thin
 * drift. `-0` normalises to "0.0000" here.
 */
const q = (n: number): string => (Object.is(n, -0) ? 0 : n).toFixed(4)

/**
 * FNV-1a over a canonical serialisation of the *dynamic* state only.
 * Level geometry is excluded: it is immutable input, not simulation output.
 */
export function hashState(s: WorldState): string {
  const canon = [
    s.tick,
    s.roomId,
    q(s.player.pos.x),
    q(s.player.pos.y),
    q(s.player.vel.x),
    q(s.player.vel.y),
    s.player.onGround ? 1 : 0,
    s.player.facing,
    q(s.player.coyoteTimer),
    q(s.player.jumpBufferTimer),
    s.player.airJumpsUsed,
    s.abilities.join(','),
    s.collected.join(','),
    s.transitionLock,
    s.reachedGoal ? 1 : 0,
    s.prevInput,
    s.rngSeed,
  ].join('|')

  let h = 0x811c9dc5
  for (let i = 0; i < canon.length; i++) {
    h ^= canon.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}

/** One input mask per tick — the whole of a session's input. */
export type InputLog = readonly number[]

export interface Replay {
  readonly seed: number
  readonly inputs: InputLog
}

export function runReplay(map: GameMap, replay: Replay, dt = FIXED_DT): WorldState {
  let s = createInitialState(map, replay.seed)
  for (const mask of replay.inputs) s = step(s, mask, dt)
  return s
}

/** Re-run a replay and return the final state hash. */
export function replayHash(map: GameMap, replay: Replay, dt = FIXED_DT): string {
  return hashState(runReplay(map, replay, dt))
}
