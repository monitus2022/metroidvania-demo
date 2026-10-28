import { describe, expect, it } from 'vitest'
import { TRANSITION_LOCK_TICKS } from '../../src/sim/constants'
import { BTN, type InputMask } from '../../src/sim/input'
import { GAME_MAP } from '../../src/sim/levels'
import { createInitialState, runMasks, step } from '../../src/sim/step'
import type { WorldState } from '../../src/sim/state'

/*
 * The strongest evidence this project can produce: a playthrough of the shipped
 * level from spawn to goal using the *real* physics, headlessly.
 *
 * This is deliberately stronger than the solver's envelope check. The solver
 * asks "is the geometry consistent with a movement model"; this asks "can a
 * player actually finish". If they ever disagree, this is the one that is right.
 *
 * The route is written as a *reactive* policy rather than a fixed list of tick
 * counts, because the player has to jump at a position (the ledge's left face),
 * not at a time. A fixed schedule silently walks past the ledge — the room's
 * walkable row is *below* the ledge, so the player ends up under it, pressed
 * against the far wall, and every subsequent jump does nothing.
 */

const RIGHT = BTN.RIGHT
const LEFT = BTN.LEFT
const RIGHT_JUMP = BTN.RIGHT | BTN.JUMP

interface Step {
  readonly label: string
  readonly mask: InputMask
  /** Run for exactly this many ticks. */
  readonly ticks?: number
  /** Or run until this becomes true. */
  readonly until?: (s: WorldState) => boolean
  /** Safety valve for `until` steps. */
  readonly maxTicks?: number
}

const x = (s: WorldState): number => s.player.pos.x
const inRoom = (id: string) => (s: WorldState) => s.roomId === id

/**
 * Waypoint predicates.
 *
 * The route is hand-authored rather than driven by "walk toward the next door",
 * and the two climbs are why: a climber has to press *into* the wall, which is
 * often the opposite direction to the door it is heading for. A greedy bot walks
 * to the door's column, stands in open air and reports the level unbeatable. A
 * player knows to hug the rock first, so the route says so.
 */

/** At `x` or beyond. */
const xAtLeast = (v: number) => (s: WorldState) => x(s) >= v
/** Feet at or above `y` (smaller y is higher). */
const yAtMost = (v: number) => (s: WorldState) => s.player.pos.y <= v

/**
 * Gallery climb point. Must be *before* the ledge's overhang, not at its face:
 * the ledge is two tiles thick, so a player who drifts under it first hits its
 * underside with their head and can never rise past it. Any x from 120 to 220
 * works, so 190 sits in a wide window rather than being pixel-perfect.
 */
const GALLERY_JUMP_AT = 190

const ROUTE: readonly Step[] = [
  { label: 'atrium: walk east to the door', mask: RIGHT, until: inRoom('gallery'), maxTicks: 400 },
  {
    label: 'gallery: collect the double jump, reach the climb point',
    mask: RIGHT,
    until: xAtLeast(GALLERY_JUMP_AT),
    maxTicks: 400,
  },
  { label: 'gallery: jump 1', mask: RIGHT_JUMP, ticks: 10 },
  { label: 'gallery: release (fresh press edge)', mask: RIGHT, ticks: 5 },
  { label: 'gallery: jump 2 and drift onto the ledge', mask: RIGHT_JUMP, ticks: 32 },
  {
    label: 'gallery: walk the ledge to the east door',
    mask: RIGHT,
    until: inRoom('shaft'),
    maxTicks: 400,
  },

  // shaft: a descent. Hold east and let the shelves break the fall.
  { label: 'shaft: drop and walk east to the exit', mask: RIGHT, until: inRoom('overlook'), maxTicks: 900 },

  // overlook: pick up wallClimb on the floor and leave west.
  { label: 'overlook: walk west to the door', mask: LEFT, until: inRoom('cistern'), maxTicks: 600 },

  // cistern: walk to the climb column, then hug the wall and climb.
  { label: 'cistern: walk to the climb column', mask: RIGHT, until: xAtLeast(84), maxTicks: 400 },
  {
    label: 'cistern: climb the wall',
    mask: RIGHT_JUMP,
    until: yAtMost(44),
    maxTicks: 600,
  },
  { label: 'cistern: step left onto the ledge', mask: LEFT, until: inRoom('foundry'), maxTicks: 400 },

  // foundry: a three-tile gap.
  { label: 'foundry: walk to the gap edge', mask: RIGHT, until: xAtLeast(100), maxTicks: 300 },
  { label: 'foundry: clear the gap', mask: RIGHT_JUMP, ticks: 26 },
  { label: 'foundry: walk to the east door', mask: RIGHT, until: inRoom('ascent'), maxTicks: 400 },

  // ascent: the long chimney.
  { label: 'ascent: walk to the chimney wall', mask: RIGHT, until: xAtLeast(244), maxTicks: 600 },
  { label: 'ascent: climb the chimney', mask: RIGHT_JUMP, until: yAtMost(52), maxTicks: 900 },
  { label: 'ascent: step left and walk the ledge to the door', mask: LEFT, until: inRoom('summit'), maxTicks: 600 },

  { label: 'summit: walk to the goal', mask: RIGHT, until: (s) => s.reachedGoal, maxTicks: 600 },
]

function trace(s: WorldState): string {
  return (
    `t=${String(s.tick).padStart(4)} ${s.roomId.padEnd(8)} ` +
    `x=${x(s).toFixed(0).padStart(4)} y=${s.player.pos.y.toFixed(0).padStart(4)} ` +
    `${s.player.onGround ? 'ground' : '  air '} ` +
    `[${s.abilities.join(',') || '-'}]${s.reachedGoal ? ' GOAL' : ''}`
  )
}

interface Playthrough {
  final: WorldState
  lines: string[]
  milestones: Record<string, number>
  stuckAt: string | undefined
}

function play(map = GAME_MAP, onTick?: (s: WorldState) => void): Playthrough {
  let s = createInitialState(map)
  const lines = [trace(s)]
  const milestones: Record<string, number> = {}
  let stuckAt: string | undefined

  const note = (): void => {
    onTick?.(s)
    if (s.tick % 25 === 0) lines.push(trace(s))
    if (milestones[s.roomId] === undefined) milestones[s.roomId] = s.tick
    for (const ability of ['doubleJump', 'wallClimb']) {
      if (s.abilities.includes(ability) && milestones[ability] === undefined) {
        milestones[ability] = s.tick
      }
    }
    if (s.reachedGoal && milestones.goal === undefined) milestones.goal = s.tick
  }

  for (const stepDef of ROUTE) {
    if (stepDef.ticks !== undefined) {
      for (let i = 0; i < stepDef.ticks; i++) {
        s = step(s, stepDef.mask)
        note()
      }
      continue
    }

    const until = stepDef.until!
    const max = stepDef.maxTicks ?? 300
    let n = 0
    while (!until(s) && n < max) {
      s = step(s, stepDef.mask)
      note()
      n++
    }
    if (!until(s)) {
      stuckAt = `${stepDef.label} (gave up after ${max} ticks at ${trace(s)})`
      break
    }
  }

  return { final: s, lines, milestones, stuckAt }
}

const { final, lines, milestones, stuckAt } = play()

describe('route: the shipped level is completable with real inputs', () => {
  it('reaches the goal', () => {
    if (stuckAt || !final.reachedGoal) {
      throw new Error(
        `route did not finish${stuckAt ? `: stuck on "${stuckAt}"` : ''}.\n` +
          `milestones=${JSON.stringify(milestones)}\n` +
          lines.join('\n'),
      )
    }
    expect(final.reachedGoal).toBe(true)
  })

  it('passes through every room in order', () => {
    const order = ['atrium', 'gallery', 'shaft', 'overlook', 'cistern', 'foundry', 'ascent', 'summit']
    for (const id of order) expect(milestones[id], `never entered "${id}"`).toBeDefined()
    // Ticks must increase along the route: a room reached "before" an earlier one
    // would mean the route backtracked or the milestone bookkeeping is wrong.
    let last = -1
    for (const id of order) {
      expect(milestones[id]!, `"${id}" out of order`).toBeGreaterThan(last)
      last = milestones[id]!
    }
    expect(milestones.goal).toBeDefined()
  })

  it('collects both abilities, each before the gate that needs it', () => {
    expect(final.abilities).toEqual(['doubleJump', 'wallClimb'])
    expect(final.collected).toEqual(['gallery-double-jump', 'overlook-wall-climb'])
    // doubleJump before the shaft staircase; wallClimb before the cistern climb.
    expect(milestones.doubleJump!).toBeLessThan(milestones.shaft!)
    expect(milestones.wallClimb!).toBeLessThan(milestones.cistern!)
  })

  it('stays inside the level the whole way', () => {
    let checked = 0
    play(GAME_MAP, (s) => {
      const grid = s.map.rooms[s.roomId]!.grid
      expect(Math.floor(x(s) / 16)).toBeGreaterThanOrEqual(0)
      expect(Math.floor(x(s) / 16)).toBeLessThan(grid.w)
      expect(Math.floor(s.player.pos.y / 16)).toBeGreaterThanOrEqual(0)
      expect(Math.floor(s.player.pos.y / 16)).toBeLessThan(grid.h)
      checked++
    })
    expect(checked).toBeGreaterThan(200)
  })

  it('finishes in a sensible number of ticks', () => {
    // eslint-disable-next-line no-console
    console.log(`route completed in ${final.tick} ticks (${(final.tick / 60).toFixed(1)}s)`)
    expect(final.tick).toBeGreaterThan(100)
    expect(final.tick).toBeLessThan(1800)
  })
})

describe('route: the gates are real', () => {
  it('cannot leave the gallery without the double jump', () => {
    // Same inputs, item removed: the ledge is four tiles up, beyond any single
    // jump, so the route stalls exactly where it should.
    const withoutItem = {
      ...GAME_MAP,
      rooms: {
        ...GAME_MAP.rooms,
        gallery: { ...GAME_MAP.rooms.gallery!, items: [] },
      },
    }
    const result = play(withoutItem)
    expect(result.final.roomId).toBe('gallery')
    expect(result.final.reachedGoal).toBe(false)
    expect(result.milestones.shaft).toBeUndefined()
  })

  it('cannot pass the cistern without the wall climb', () => {
    // With the double jump but no wallClimb, every room up to the cistern is
    // reachable and the cistern ledge is not: the route must stall there.
    const withoutClimb = {
      ...GAME_MAP,
      rooms: {
        ...GAME_MAP.rooms,
        overlook: { ...GAME_MAP.rooms.overlook!, items: [] },
      },
    }
    const result = play(withoutClimb)
    expect(result.final.roomId).toBe('cistern')
    expect(result.final.reachedGoal).toBe(false)
    expect(result.final.abilities).toEqual(['doubleJump'])
    expect(result.milestones.foundry).toBeUndefined()
  })

  it('the transition lock stops a door from firing twice in a row', () => {
    let s = createInitialState(GAME_MAP)
    let transitions = 0
    let lastRoom = s.roomId
    for (let i = 0; i < 400; i++) {
      s = step(s, RIGHT)
      if (s.roomId !== lastRoom) {
        transitions++
        lastRoom = s.roomId
      }
    }
    expect(transitions).toBe(1)
    expect(s.roomId).toBe('gallery')
    expect(TRANSITION_LOCK_TICKS).toBeGreaterThan(0)
  })
})

/*
 * Regression tests for the reported bug: "I cannot go back to previous rooms."
 *
 * Two separate causes, both worth pinning:
 *   1. the gallery had no door back to the atrium, so the graph was one-way;
 *   2. arriving on a door's own tile left the player inside the return trigger,
 *      which fires the moment the transition lock expires.
 */
describe('route: rooms are traversable both ways', () => {
  it('every door has a return door in its target room', () => {
    for (const roomId of GAME_MAP.order) {
      for (const door of GAME_MAP.rooms[roomId]!.doors) {
        const returnDoor = GAME_MAP.rooms[door.to]!.doors.some((d) => d.to === roomId)
        expect(returnDoor, `no way back from "${door.to}" to "${roomId}"`).toBe(true)
      }
    }
  })

  it('the player can walk back from the gallery into the atrium', () => {
    let s = createInitialState(GAME_MAP)
    let n = 0
    while (s.roomId !== 'gallery' && n < 800) {
      s = step(s, RIGHT)
      n++
    }
    expect(s.roomId).toBe('gallery')

    n = 0
    while (s.roomId !== 'atrium' && n < 800) {
      s = step(s, LEFT)
      n++
    }
    expect(s.roomId).toBe('atrium')
  })

  it('arriving in a room does not bounce the player straight back', () => {
    // Land in the gallery, then stand perfectly still for two seconds. Before
    // the arrival inset this put the player inside the return door's trigger,
    // so they were thrown back to the atrium the instant the lock expired.
    let s = createInitialState(GAME_MAP)
    let n = 0
    while (s.roomId !== 'gallery' && n < 800) {
      s = step(s, RIGHT)
      n++
    }
    expect(s.roomId).toBe('gallery')

    s = runMasks(
      s,
      Array.from({ length: 120 }, () => 0),
    )
    expect(s.roomId).toBe('gallery')
  })

  it('lands clear of the door it came through', () => {
    let s = createInitialState(GAME_MAP)
    while (s.roomId !== 'gallery') s = step(s, RIGHT)
    const westDoor = GAME_MAP.rooms.gallery!.doors.find((d) => d.id === 'gallery-to-atrium')!
    const doorRightPx = (westDoor.col + 1) * 16
    // The player's left edge must be past the far side of the door tile.
    expect(s.player.pos.x - 6).toBeGreaterThanOrEqual(doorRightPx)
  })
})

describe('route: deterministic', () => {
  it('the same policy produces the same run', () => {
    const a = runMasks(createInitialState(GAME_MAP), [RIGHT, RIGHT, RIGHT_JUMP])
    const b = runMasks(createInitialState(GAME_MAP), [RIGHT, RIGHT, RIGHT_JUMP])
    expect(a.player.pos.x).toBe(b.player.pos.x)
    expect(a.player.pos.y).toBe(b.player.pos.y)
    expect(a.tick).toBe(b.tick)
  })
})
