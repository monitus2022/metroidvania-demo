import { describe, expect, it } from 'vitest'
import { overlapsSolid } from '../../src/sim/collision'
import { PLAYER_W, TILE } from '../../src/sim/constants'
import type { GameMap } from '../../src/sim/content'
import { BTN } from '../../src/sim/input'
import { GAME_MAP } from '../../src/sim/levels'
import { mulberry32 } from '../../src/sim/rng'
import { createInitialState, gridOf, step } from '../../src/sim/step'
import type { WorldState } from '../../src/sim/state'
import { gridHeightPx, gridWidthPx, isSolid } from '../../src/sim/tiles'
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

function describeFailure(name: string, stream: number, s: WorldState): string {
  return [
    `map=${name} stream=${stream} tick=${s.tick} room=${s.roomId} (reproduce with seed ${stream})`,
    `pos=(${s.player.pos.x}, ${s.player.pos.y}) vel=(${s.player.vel.x}, ${s.player.vel.y})`,
    `onGround=${s.player.onGround} airJumps=${s.player.airJumpsUsed} prevInput=${s.prevInput}`,
  ].join('\n')
}

/** The invariants that must hold after *every* tick, for any input at all. */
function checkInvariants(s: WorldState, name: string, stream: number): void {
  const p = s.player
  const where = describeFailure(name, stream, s)

  for (const [field, v] of [
    ['pos.x', p.pos.x],
    ['pos.y', p.pos.y],
    ['vel.x', p.vel.x],
    ['vel.y', p.vel.y],
    ['coyoteTimer', p.coyoteTimer],
    ['jumpBufferTimer', p.jumpBufferTimer],
    ['airJumpsUsed', p.airJumpsUsed],
    ['tick', s.tick],
  ] as const) {
    if (!Number.isFinite(v)) throw new Error(`${field} is not finite\n${where}`)
  }

  const room = s.map.rooms[s.roomId]
  if (!room) throw new Error(`player is in unknown room "${s.roomId}"\n${where}`)
  if (s.transitionLock < 0) throw new Error(`negative transition lock\n${where}`)
  if (p.airJumpsUsed < 0) throw new Error(`negative air jump count\n${where}`)

  const grid = gridOf(s)

  // 1. Never stuck inside geometry.
  const overlap = overlapsSolid(p, grid)
  if (overlap) {
    throw new Error(`stuck inside solid tile (${overlap.col}, ${overlap.row})\n${where}`)
  }

  // 2. Never outside the current room.
  if (p.pos.x < 0 || p.pos.x > gridWidthPx(grid)) throw new Error(`out of bounds on x\n${where}`)
  if (p.pos.y < 0 || p.pos.y > gridHeightPx(grid)) throw new Error(`out of bounds on y\n${where}`)

  // 3. onGround must mean it.
  if (p.onGround) {
    const row = Math.floor((p.pos.y + 1e-3) / TILE)
    const colStart = Math.floor((p.pos.x - PLAYER_W / 2 + 1e-3) / TILE)
    const colEnd = Math.floor((p.pos.x + PLAYER_W / 2 - 1e-3) / TILE)
    let supported = false
    for (let col = colStart; col <= colEnd; col++) {
      if (isSolid(grid, col, row)) supported = true
    }
    if (!supported) throw new Error(`onGround true but nothing underneath\n${where}`)
  }
}

function fuzzMap(name: string, map: GameMap, streams: number, ticks: number, seed0: number): number {
  let steps = 0
  for (let stream = 0; stream < streams; stream++) {
    const rand = mulberry32(seed0 + stream)
    let s = createInitialState(map, seed0 + stream)
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
    expect(fuzzMap('GAP4', GAP4, 10_000, 300, 1)).toBe(10_000 * 300)
  })

  it('survives 10k random streams against a full-height wall', () => {
    expect(fuzzMap('WALL', WALL, 10_000, 300, 100_000)).toBe(10_000 * 300)
  })

  it('survives 5k random streams on the real map, room transitions included', () => {
    // Random input *does* trigger the atrium door, so this also fuzzes room
    // transitions, ability pickups and the goal check.
    expect(fuzzMap('GAME_MAP', GAME_MAP, 5_000, 600, 200_000)).toBe(5_000 * 600)
  })

  it('random play does reach the gallery, so transitions are actually exercised', () => {
    let reachedGallery = false
    for (let stream = 0; stream < 400 && !reachedGallery; stream++) {
      const rand = mulberry32(300_000 + stream)
      let s = createInitialState(GAME_MAP, 300_000 + stream)
      for (let t = 0; t < 900; t++) {
        s = step(s, MASKS[Math.floor(rand() * MASKS.length)] ?? 0)
        if (s.roomId !== GAME_MAP.startRoom) {
          reachedGallery = true
          break
        }
      }
    }
    expect(reachedGallery).toBe(true)
  })
})
