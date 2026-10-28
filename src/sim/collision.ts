import { MAX_SUBSTEP, PLAYER_H, PLAYER_W, TILE } from './constants'
import type { PlayerState } from './state'
import { isSolid, type TileGrid } from './tiles'

const HALF_W = PLAYER_W / 2

/** Snap distances are nudged by this so surfaces never exactly touch. */
const EPS = 1e-4

/**
 * Tolerance for the invariant checker. Larger than EPS on purpose: a body
 * resting exactly on a surface must not be reported as overlapping it.
 */
const OVERLAP_EPS = 1e-3

/**
 * Move horizontally and resolve against solid tiles.
 * Sub-steps so that a large per-tick delta can never tunnel through a wall.
 * Returns true if the movement was blocked.
 */
export function moveX(p: PlayerState, grid: TileGrid, dx: number): boolean {
  if (dx === 0) return false
  const steps = Math.max(1, Math.ceil(Math.abs(dx) / MAX_SUBSTEP))
  const stepDx = dx / steps
  for (let i = 0; i < steps; i++) {
    p.pos.x += stepDx
    if (resolveX(p, grid, stepDx)) return true
  }
  return false
}

function resolveX(p: PlayerState, grid: TileGrid, dirX: number): boolean {
  const col = dirX > 0 ? Math.floor((p.pos.x + HALF_W - EPS) / TILE) : Math.floor((p.pos.x - HALF_W) / TILE)
  const rowStart = Math.floor((p.pos.y - PLAYER_H) / TILE)
  const rowEnd = Math.floor((p.pos.y - EPS) / TILE)

  for (let row = rowStart; row <= rowEnd; row++) {
    if (isSolid(grid, col, row)) {
      p.pos.x = dirX > 0 ? col * TILE - HALF_W - EPS : (col + 1) * TILE + HALF_W + EPS
      p.vel.x = 0
      return true
    }
  }
  return false
}

/**
 * Move vertically and resolve against solid tiles.
 * Returns true if the body landed on a surface.
 */
export function moveY(p: PlayerState, grid: TileGrid, dy: number): boolean {
  if (dy === 0) return false
  const steps = Math.max(1, Math.ceil(Math.abs(dy) / MAX_SUBSTEP))
  const stepDy = dy / steps
  for (let i = 0; i < steps; i++) {
    p.pos.y += stepDy
    if (resolveY(p, grid, stepDy)) return true
  }
  return false
}

function resolveY(p: PlayerState, grid: TileGrid, dirY: number): boolean {
  const colStart = Math.floor((p.pos.x - HALF_W + EPS) / TILE)
  const colEnd = Math.floor((p.pos.x + HALF_W - EPS) / TILE)
  const row = dirY > 0 ? Math.floor((p.pos.y - EPS) / TILE) : Math.floor((p.pos.y - PLAYER_H) / TILE)

  for (let col = colStart; col <= colEnd; col++) {
    if (isSolid(grid, col, row)) {
      if (dirY > 0) {
        p.pos.y = row * TILE
        p.vel.y = 0
        return true
      }
      p.pos.y = (row + 1) * TILE + PLAYER_H + EPS
      p.vel.y = 0
      return false
    }
  }
  return false
}

/**
 * Invariant checker used by the fuzzer and by unit tests: returns the first
 * solid tile the body is genuinely penetrating, or null.
 *
 * This is the assertion that makes "no tunnelling / not stuck in geometry"
 * a checkable property rather than a hope.
 */
export function overlapsSolid(
  p: PlayerState,
  grid: TileGrid,
): { col: number; row: number } | null {
  const left = p.pos.x - HALF_W + OVERLAP_EPS
  const right = p.pos.x + HALF_W - OVERLAP_EPS
  const top = p.pos.y - PLAYER_H + OVERLAP_EPS
  const bottom = p.pos.y - OVERLAP_EPS

  for (let row = Math.floor(top / TILE); row <= Math.floor(bottom / TILE); row++) {
    for (let col = Math.floor(left / TILE); col <= Math.floor(right / TILE); col++) {
      if (isSolid(grid, col, row)) return { col, row }
    }
  }
  return null
}
