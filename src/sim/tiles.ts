import { TILE } from './constants'

/**
 * Level geometry as plain data.
 *
 * A tile grid — not an engine tilemap object — because the solver, the fuzzer
 * and the replay harness all need to read level geometry without a renderer.
 */
export interface TileGrid {
  readonly w: number
  readonly h: number
  /** Row-major, 1 = solid. Never mutated after construction. */
  readonly solid: Uint8Array
  /** Spawn point: x is horizontal centre, y is the feet. */
  readonly spawn: { readonly x: number; readonly y: number }
}

/**
 * Build a grid from ASCII rows, which keeps fixtures readable and diffable.
 *   '#' solid   '.' empty   'P' empty, marks the spawn (feet at tile bottom)
 */
export function gridFromRows(rows: readonly string[]): TileGrid {
  const h = rows.length
  if (h === 0) throw new Error('gridFromRows: no rows')
  const w = Math.max(...rows.map((r) => r.length))
  const solid = new Uint8Array(w * h)

  let spawn: { x: number; y: number } | undefined

  for (let row = 0; row < h; row++) {
    const line = rows[row]
    for (let col = 0; col < w; col++) {
      const ch = line[col] ?? '.'
      if (ch === '#') {
        solid[row * w + col] = 1
      } else if (ch === 'P') {
        if (spawn) throw new Error('gridFromRows: multiple spawn markers')
        spawn = { x: col * TILE + TILE / 2, y: (row + 1) * TILE }
      }
    }
  }

  if (!spawn) throw new Error('gridFromRows: no spawn marker (P)')
  return { w, h, solid, spawn }
}

/**
 * Out-of-bounds counts as solid. That walls the level in for free and makes
 * "the player never leaves the grid" a real, checkable invariant.
 */
export function isSolid(grid: TileGrid, col: number, row: number): boolean {
  if (col < 0 || row < 0 || col >= grid.w || row >= grid.h) return true
  return grid.solid[row * grid.w + col] === 1
}

export const gridWidthPx = (grid: TileGrid): number => grid.w * TILE
export const gridHeightPx = (grid: TileGrid): number => grid.h * TILE
