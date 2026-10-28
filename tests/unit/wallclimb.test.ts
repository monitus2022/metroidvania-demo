import { describe, expect, it } from 'vitest'
import { overlapsSolid } from '../../src/sim/collision'
import { MAX_FALL, TILE, WALL_SLIDE_SPEED } from '../../src/sim/constants'
import { BTN } from '../../src/sim/input'
import { createInitialState, step } from '../../src/sim/step'
import type { WorldState } from '../../src/sim/state'
import { movementFor, reachableCells } from '../../tools/solver/reachability'
import { SHAFT_COL, SHAFT_START_ROW, shaftRoom } from './fixtures'

/*
 * Wall climbing is the second progression ability: it turns any column adjacent
 * to solid rock into a route, which is exactly what gates a vertical shaft.
 *
 * The three properties worth pinning are that it climbs, that it does *not*
 * climb without the ability (or the gate is fake), and that climbing never
 * pushes the body into geometry — a wall is a collision surface being moved
 * along, which is the classic place to introduce a penetration bug.
 */

interface ClimbRun {
  readonly riseTiles: number
  readonly penetration: { col: number; row: number } | null
  readonly final: WorldState
}

function climb(withAbility: boolean, ticks = 240, mask = BTN.RIGHT | BTN.JUMP): ClimbRun {
  const start = createInitialState(shaftRoom())
  if (withAbility) start.abilities = ['wallClimb']
  let s = start
  let minY = s.player.pos.y
  let penetration: { col: number; row: number } | null = null
  for (let i = 0; i < ticks; i++) {
    s = step(s, mask)
    minY = Math.min(minY, s.player.pos.y)
    penetration ??= overlapsSolid(s.player, s.map.rooms[s.roomId]!.grid)
  }
  return { riseTiles: Math.floor((start.player.pos.y - minY) / TILE), penetration, final: s }
}

describe('wallClimb', () => {
  it('climbs a shaft that is otherwise a dead end', () => {
    const { riseTiles } = climb(true)
    // The shaft is 11 rows of wall above the player; a jump alone reaches 3.
    expect(riseTiles).toBeGreaterThanOrEqual(9)
  })

  it('does not climb without the ability, so the gate is real', () => {
    const { riseTiles } = climb(false)
    expect(riseTiles).toBeLessThan(5)
  })

  it('never penetrates the wall it is climbing', () => {
    expect(climb(true).penetration).toBeNull()
    expect(climb(false).penetration).toBeNull()
  })

  it('slides down slowly instead of dropping when jump is not held', () => {
    // Climb part of the way up, then release jump: the body should crawl down at
    // the slide speed rather than falling at terminal velocity.
    const start = createInitialState(shaftRoom())
    start.abilities = ['wallClimb']
    let s = start
    for (let i = 0; i < 120; i++) s = step(s, BTN.RIGHT | BTN.JUMP)

    s = step(s, BTN.RIGHT)
    expect(s.player.vel.y).toBeGreaterThan(0)
    expect(s.player.vel.y).toBeLessThan(MAX_FALL)
    expect(s.player.vel.y).toBeLessThanOrEqual(WALL_SLIDE_SPEED + 1)

    // And over a longer window it is much slower than actually falling. Ten
    // ticks is too short to compare: a fall from rest has barely accelerated,
    // while the slide is already at full speed on its first tick.
    const clingFrom = (): WorldState => {
      const st = createInitialState(shaftRoom())
      st.abilities = ['wallClimb']
      let w = st
      for (let i = 0; i < 120; i++) w = step(w, BTN.RIGHT | BTN.JUMP)
      return w
    }

    let sliding = clingFrom()
    const slideTop = sliding.player.pos.y
    for (let i = 0; i < 60; i++) sliding = step(sliding, BTN.RIGHT)

    let falling = clingFrom()
    const fallTop = falling.player.pos.y
    falling = step(falling, BTN.LEFT) // step off the wall
    for (let i = 0; i < 60; i++) falling = step(falling, 0)

    const slid = sliding.player.pos.y - slideTop
    const fell = falling.player.pos.y - fallTop
    expect(slid).toBeGreaterThan(0)
    expect(slid).toBeLessThan(fell / 2)
  })

  it('lets go of the wall when the stick is released from it', () => {
    const start = createInitialState(shaftRoom())
    start.abilities = ['wallClimb']
    let s = start
    for (let i = 0; i < 120; i++) s = step(s, BTN.RIGHT | BTN.JUMP)
    const before = s.player.pos.y
    for (let i = 0; i < 5; i++) s = step(s, BTN.LEFT)
    // Released from the wall: gravity is back, so the player drops.
    expect(s.player.pos.y).toBeGreaterThan(before)
  })

  it('the solver only opens a shaft when the ability is granted', () => {
    // The map checker and the simulation must agree about what wallClimb buys.
    // If the solver opened shafts for free, a room locked behind one would ship
    // as "beatable" and the player would be stuck; if it never opened them, the
    // level would report unbeatable while being perfectly fine.
    const map = shaftRoom()
    const grid = map.rooms.shaft!.grid
    const entry = { col: SHAFT_COL, row: SHAFT_START_ROW }
    const without = reachableCells(grid, entry, movementFor(new Set()))
    const withClimb = reachableCells(grid, entry, movementFor(new Set(['wallClimb'])))

    expect(without.has(`${SHAFT_COL},0`)).toBe(false)
    expect(withClimb.has(`${SHAFT_COL},0`)).toBe(true)
  })
})
