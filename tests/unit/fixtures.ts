import { gridFromRows } from '../../src/sim/tiles'

/**
 * Test levels as ASCII rows. Deliberately tiny and readable so a failing
 * assertion points at a shape you can see.
 */

/** 24 x 12. Long runway, then a 4-tile pit at cols 12-15. */
export const GAP4 = gridFromRows([
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '..P.....................',
  '############....########',
  '############....########',
])

/** 24 x 12. Full-height 1-tile wall at col 12 — cannot be tunnelled or cleared. */
export const WALL = gridFromRows([
  '............#...........',
  '............#...........',
  '............#...........',
  '............#...........',
  '............#...........',
  '............#...........',
  '............#...........',
  '............#...........',
  '............#...........',
  '..P.........#...........',
  '########################',
  '########################',
])

/** Column at which the GAP4 pit begins, in pixels. */
export const GAP4_START_X = 12 * 16
/** Column at which solid ground resumes, in pixels. */
export const GAP4_END_X = 16 * 16
