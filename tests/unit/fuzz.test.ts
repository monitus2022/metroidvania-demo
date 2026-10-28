import { describe, expect, it } from 'vitest'
import { overlapsSolid } from '../../src/sim/collision'
import { PLAYER_W, TILE } from '../../src/sim/constants'
import { BTN } from '../../src/sim/input'
import { DEMO_LEVEL } from '../../src/sim/levels'
import { mulberry32 } from '../../src/sim/rng'
import { createInitialState, step } from '../../src/sim/step'
import type { WorldState } from '../../src/sim/state'
import { gridHeightPx, gridWidthPx, isSolid, type TileGrid } from '../../src/sim/tiles'
import { GAP4, WALL } from './fixtures'

const MASKS = [
  0,
  BTN.LEFT,
  BTN.RIGHT,
  BTN.JUMP,
  BTN.LEFT | BTN.JUMP,
  BTN.RIGHT | BTN.JUMP,
  BTN.LEFT | BTN.RIGHT,
]

function describeFailure(level: string, stream: number, tick: number, s: WorldState): string {
  return [
    `level=${level} stream=${stream} tick=${tick} (reproduce with seed ${stream})`,
    `pos=(${s.player.pos.x}, ${s.player.pos.y}) vel=(${s.player.vel.x}, ${s.player.vel.y})`,
    `onGround=${s.player.onGround} prevInput=${s.prevInput}`,
  ].join('\n')
}

/** The invariants that must hold after *every* tick, for any input at all. */
function checkInvariants(s: WorldState, levelName: string, stream: number): void {
  const p = s.player
  const where = describeFailure(levelName, stream, s.tick, s)

  for (const [name, v] of [
    ['pos.x', p.pos.x],
    ['pos.y', p.pos.y],
    ['vel.x', p.vel.x],
    ['vel.y', p.vel.y],
    ['coyoteTimer', p.coyoteTimer],
    ['jumpBufferTimer', p.jumpBufferTimer],
  ] as const) {
    if (!Number.isFinite(v)) throw new Error(`${name} is not finite\n${where}`)
  }

  // 1. Never stuck inside geometry.
  const overlap = overlapsSolid(p, s.level)
  if (overlap) {
    throw new Error(`stuck inside solid tile (${overlap.col}, ${overlap.row})\n${where}`)
  }

  // 2. Never outside the level.
  if (p.pos.x < 0 || p.pos.x > gridWidthPx(s.level)) throw new Error(`out of bounds on x\n${where}`)
  if (p.pos.y < 0 || p.pos.y > gridHeightPx(s.level)) throw new Error(`out of bounds on y\n${where}`)

  // 3. onGround must mean it, and must not be a lie the other way for long.
  if (p.onGround) {
    const row = Math.floor((p.pos.y + 1e-3) / TILE)
    const colStart = Math.floor((p.pos.x - PLAYER_W / 2 + 1e-3) / TILE)
    const colEnd = Math.floor((p.pos.x + PLAYER_W / 2 - 1e-3) / TILE)
    let supported = false
    for (let col = colStart; col <= colEnd; col++) {
      if (isSolid(s.level, col, row)) supported = true
    }
    if (!supported) throw new Error(`onGround true but nothing underneath\n${where}`)
  }
}

function fuzzLevel(name: string, level: TileGrid, streams: number, ticks: number, seed0: number): number {
  let steps = 0
  for (let stream = 0; stream < streams; stream++) {
    const rand = mulberry32(seed0 + stream)
    let s = createInitialState(level, seed0 + stream)
    for (let t = 0; t < ticks; t++) {
      const mask = MASKS[Math.floor(rand() * MASKS.length)] ?? 0
      s = step(s, mask)
      steps++
      checkInvariants(s, name, stream)
    }
  }
  return steps
}

describe('fuzz: collision robustness over random input streams', () => {
  it('survives 10k random streams on the pit level', () => {
    const steps = fuzzLevel('GAP4', GAP4, 10_000, 300, 1)
    expect(steps).toBe(10_000 * 300)
  })

  it('survives 10k random streams against a full-height wall', () => {
    const steps = fuzzLevel('WALL', WALL, 10_000, 300, 100_000)
    expect(steps).toBe(10_000 * 300)
  })

  it('survives 5k random streams on the playable level', () => {
    const steps = fuzzLevel('DEMO', DEMO_LEVEL, 5_000, 600, 200_000)
    expect(steps).toBe(5_000 * 600)
  })
})
