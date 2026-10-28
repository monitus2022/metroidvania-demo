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
 * Where to start the climb.
 *
 * This has to happen *before* the ledge's overhang, not at its face: the ledge
 * is a solid block two tiles thick, so a player who drifts under it first hits
 * its underside with their head and can never rise past it. Measured by search
 * (see the M3 notes): any x from 120 to 220 works, so 190 is comfortably inside
 * a wide, forgiving window rather than a pixel-perfect ask.
 */
const AT_LEDGE_JUMP = (s: WorldState) => x(s) >= 190
/** Near the pit edge in the spire (the pit starts at col 5, x=80). */
const AT_PIT_EDGE = (s: WorldState) => x(s) >= 60

const ROUTE: readonly Step[] = [
  {
    label: 'atrium: walk east to the door',
    mask: RIGHT,
    until: inRoom('gallery'),
    maxTicks: 400,
  },
  {
    label: 'gallery: collect the double jump, reach the climb point',
    mask: RIGHT,
    until: AT_LEDGE_JUMP,
    maxTicks: 400,
  },
  { label: 'gallery: jump 1', mask: RIGHT_JUMP, ticks: 10 },
  { label: 'gallery: release (fresh press edge)', mask: RIGHT, ticks: 5 },
  { label: 'gallery: jump 2 and drift onto the ledge', mask: RIGHT_JUMP, ticks: 32 },
  {
    label: 'gallery: walk the ledge to the east door',
    mask: RIGHT,
    until: inRoom('spire'),
    maxTicks: 400,
  },
  { label: 'spire: walk to the pit edge', mask: RIGHT, until: AT_PIT_EDGE, maxTicks: 200 },
  { label: 'spire: jump 1', mask: RIGHT_JUMP, ticks: 10 },
  { label: 'spire: release', mask: RIGHT, ticks: 5 },
  { label: 'spire: jump 2 and cross the pit', mask: RIGHT_JUMP, ticks: 40 },
  { label: 'spire: walk to the goal', mask: RIGHT, until: (s) => s.reachedGoal, maxTicks: 400 },
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
    if (s.roomId === 'gallery' && milestones.gallery === undefined) milestones.gallery = s.tick
    if (s.abilities.includes('doubleJump') && milestones.doubleJump === undefined) {
      milestones.doubleJump = s.tick
    }
    if (s.roomId === 'spire' && milestones.spire === undefined) milestones.spire = s.tick
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
    expect(milestones.gallery).toBeDefined()
    expect(milestones.doubleJump).toBeDefined()
    expect(milestones.spire).toBeDefined()
    expect(milestones.goal).toBeDefined()
    expect(milestones.doubleJump!).toBeGreaterThan(milestones.gallery!)
    expect(milestones.spire!).toBeGreaterThan(milestones.doubleJump!)
    expect(milestones.goal!).toBeGreaterThan(milestones.spire!)
  })

  it('collects the double jump before it is needed', () => {
    expect(final.abilities).toEqual(['doubleJump'])
    expect(final.collected).toEqual(['gallery-double-jump'])
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

describe('route: the gate is real', () => {
  it('cannot reach the spire without the double jump', () => {
    // Same policy, but the item is removed from the map, so the gated door
    // never opens and the run must stall in the gallery.
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
    expect(result.milestones.spire).toBeUndefined()
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
