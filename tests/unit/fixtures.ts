import { singleRoomMap } from '../../src/sim/content'
import type { WorldState } from '../../src/sim/state'

/**
 * Test levels. Deliberately tiny and readable so a failing assertion points at
 * a shape you can see. Each is a one-room GameMap, so the tests drive the same
 * sim entry point as the real game.
 */

/** 24 x 12. Long runway, then a 4-tile pit at cols 12-15. */
export const GAP4 = singleRoomMap(
  [
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
  ],
  { id: 'gap4' },
)

/** 24 x 12. Full-height 1-tile wall at col 12 — cannot be tunnelled or cleared. */
export const WALL = singleRoomMap(
  [
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
  ],
  { id: 'wall' },
)

/** A flat room with wide-open space, for measuring raw jump arcs. */
export function flatRoom(width = 30) {
  const air = '.'.repeat(width)
  return singleRoomMap(
    [
      ...Array(9).fill(air),
      '.' + 'P' + '.'.repeat(width - 2),
      '#'.repeat(width),
      '#'.repeat(width),
    ],
    { id: 'flat' },
  )
}

/** A runway, a pit of `gap` tiles, then a landing strip. */
export function gapRoom(gap: number) {
  const width = 12 + gap + 8
  const air = '.'.repeat(width)
  const floor = '#'.repeat(12) + '.'.repeat(gap) + '#'.repeat(8)
  return singleRoomMap([...Array(9).fill(air), 'P' + '.'.repeat(width - 1), floor, floor], {
    id: `gap-${gap}`,
  })
}

/**
 * A one-tile-wide shaft flanked by rock, player standing at the bottom.
 *
 * The column above the player is empty and has no floor, so it is a dead end to
 * anyone who cannot grip a wall — which is exactly what the wallClimb gate is
 * supposed to make passable.
 */
export function shaftRoom(height = 14) {
  const wall = '###.####'
  return singleRoomMap(
    [...Array(height - 3).fill(wall), '###P####', '########', '########'],
    { id: 'shaft' },
  )
}

/** Column of the shaft floor in `shaftRoom`, and the row the player starts on. */
export const SHAFT_COL = 3
export const SHAFT_START_ROW = 11

/**
 * A flat room with one enemy standing on the floor near the middle.
 *
 * `patrol: 0` pins it in place (its patrol bounds collapse onto its spawn), which
 * combat tests want: an enemy that wanders out of the swing's reach mid-test
 * makes the failure look like a combat bug.
 */
export function enemyRoom(options: { patrol?: number } = {}) {
  const air = '....................'
  return singleRoomMap([...Array(9).fill(air), '..P.................', '#'.repeat(20), '#'.repeat(20)], {
    id: 'enemy-room',
    enemies: [
      { id: 'e1', kind: 'enraged', col: 10, row: 9, patrol: options.patrol ?? 0 },
    ],
  })
}

/** Put the fixture's single enemy `distance` px in front of the player. */
export function enemyInFront(s: WorldState, distance = 20): WorldState {
  return {
    ...s,
    player: { ...s.player, facing: 1 },
    enemies: s.enemies.map((e) => ({ ...e, pos: { x: s.player.pos.x + distance, y: s.player.pos.y } })),
  }
}

/**
 * Move the *player* onto the fixture's enemy rather than the other way round.
 *
 * Contact tests need both bodies to stay overlapped for many ticks. Moving the
 * enemy off its spawn makes it walk back (its patrol bounds are anchored to
 * spawn), so it leaves the player within a few ticks and the second hit never
 * arrives — which looks exactly like an invulnerability bug.
 */
export function playerOnEnemy(s: WorldState, offset = 0): WorldState {
  const enemy = s.enemies[0]!
  return {
    ...s,
    player: {
      ...s.player,
      pos: { x: enemy.pos.x + offset, y: enemy.pos.y },
      vel: { x: 0, y: 0 },
    },
  }
}

/** Column at which the GAP4 pit begins, in pixels. */
export const GAP4_START_X = 12 * 16
/** Column at which solid ground resumes, in pixels. */
export const GAP4_END_X = 16 * 16
