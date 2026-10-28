import { describe, expect, it } from 'vitest'
import gatesFile from '../../content/gates.json'
import roomsFile from '../../content/rooms.json'
import { loadGameMap, type GatesFile, type RoomsFile } from '../../src/sim/content'
import { isSolid } from '../../src/sim/tiles'
import { UNVERIFIED_ABILITIES, solve } from '../../tools/solver/reachability'

/*
 * Mutating the real content is how negative cases are built: a copy of the
 * shipped files with exactly one thing broken, so the failing case stays
 * recognisably close to reality.
 */

interface MutRoom {
  id: string
  comment?: string
  entry: { col: number; row: number }
  rows: string[]
  doors?: {
    id: string
    col: number
    row: number
    to: string
    toCol: number
    toRow: number
    gate?: string
  }[]
  items?: { id: string; ability: string; col: number; row: number }[]
}
interface MutRooms {
  startRoom: string
  goal: { room: string; col: number; row: number }
  rooms: MutRoom[]
}
interface MutGates {
  gates: Record<string, string>
}

const mutRooms = (): MutRooms => JSON.parse(JSON.stringify(roomsFile)) as MutRooms
const mutGates = (): MutGates => JSON.parse(JSON.stringify(gatesFile)) as MutGates

function run(rooms: MutRooms = mutRooms(), gates: MutGates = mutGates()) {
  return solve(loadGameMap(rooms as unknown as RoomsFile, gates as unknown as GatesFile))
}

const roomIn = (rooms: MutRooms, id: string): MutRoom => {
  const r = rooms.rooms.find((x) => x.id === id)
  if (!r) throw new Error(`test setup: no room "${id}"`)
  return r
}

/** 10 rows of air with a floor under the goal cell. */
const FLAT_ROWS = [...Array(10).fill('....................'), '####################', '####################']

describe('content: the shipped map', () => {
  it('is beatable with no errors, no warnings and no softlocks', () => {
    const r = run()
    expect(r.errors).toEqual([])
    expect(r.warnings).toEqual([])
    expect(r.softlocks).toEqual([])
    expect(r.beatable).toBe(true)
  })

  it('requires exactly the double jump to finish', () => {
    const r = run()
    expect(r.abilities).toEqual(['doubleJump'])
    expect(r.reachableRooms).toEqual(['atrium', 'gallery', 'spire'])
    // Every door is two-way, so a full solve opens all four.
    expect(r.openedDoors).toEqual([
      'atrium-to-gallery',
      'gallery-to-atrium',
      'gallery-to-spire',
      'spire-to-gallery',
    ])
  })

  it('every room is rectangular and its entry cell is standable', () => {
    const map = loadGameMap(roomsFile as RoomsFile)
    for (const id of map.order) {
      const room = map.rooms[id]!
      const g = room.grid
      const source = mutRooms().rooms.find((r) => r.id === id)!
      for (const row of source.rows) expect(row.length).toBe(g.w)

      const { col, row } = room.entry
      expect(isSolid(g, col, row)).toBe(false)
      expect(isSolid(g, col, row + 1)).toBe(true)
    }
  })

  it('derives each room spawn from its declared entry cell', () => {
    const map = loadGameMap(roomsFile as RoomsFile)
    expect(map.rooms.atrium!.grid.spawn).toEqual({ x: 2 * 16 + 8, y: (9 + 1) * 16 })
    expect(map.rooms.gallery!.grid.spawn).toEqual({ x: 0 * 16 + 8, y: (9 + 1) * 16 })
    expect(map.rooms.spire!.grid.spawn).toEqual({ x: 0 * 16 + 8, y: (5 + 1) * 16 })
  })
})

describe('solver: gating actually gates', () => {
  it('removing the item makes the goal unreachable (unkeyed gate)', () => {
    const rooms = mutRooms()
    roomIn(rooms, 'gallery').items = []
    const r = run(rooms)

    expect(r.errors).toEqual([])
    expect(r.beatable).toBe(false)
    expect(r.abilities).toEqual([])
    expect(r.reachableRooms).toEqual(['atrium', 'gallery'])
    expect(r.blockedDoors).toEqual([{ door: 'gallery-to-spire', requires: 'doubleJump' }])
  })

  it('a goal behind a full-height wall is unreachable with any ability', () => {
    // Built explicitly rather than by mutating the shipped map: widening a pit
    // does *not* seal a goal, because the model (correctly) lets the player
    // drop into the pit and jump back up the shaft.
    const rooms: MutRooms = {
      startRoom: 'start',
      goal: { room: 'behind', col: 16, row: 5 },
      rooms: [
        {
          id: 'start',
          entry: { col: 2, row: 9 },
          rows: FLAT_ROWS,
          doors: [{ id: 'start-to-behind', col: 19, row: 9, to: 'behind', toCol: 0, toRow: 9 }],
        },
        {
          id: 'behind',
          entry: { col: 0, row: 9 },
          // A solid column at col 10 spanning every row above the floor.
          rows: [
            '..........#.........',
            '..........#.........',
            '..........#.........',
            '..........#.........',
            '..........#.........',
            '..........#.........',
            '..........#...######',
            '..........#...######',
            '..........#.........',
            '..........#.........',
            '####################',
            '####################',
          ],
        },
      ],
    }

    const r = run(rooms, { gates: {} })
    expect(r.errors).toEqual([])
    expect(r.reachableRooms).toEqual(['behind', 'start'])
    expect(r.beatable).toBe(false)
    // And because 'behind' has no exit, entering it is itself a trap.
    expect(r.softlocks).toEqual(['behind'])
  })

  it('can be beatable and still contain a softlock', () => {
    const rooms = mutRooms()
    rooms.rooms.push({ id: 'oubliette', entry: { col: 2, row: 9 }, rows: FLAT_ROWS })
    roomIn(rooms, 'atrium').doors!.push({
      id: 'atrium-to-oubliette',
      col: 18,
      row: 9,
      to: 'oubliette',
      toCol: 2,
      toRow: 9,
    })

    const r = run(rooms)
    expect(r.errors).toEqual([])
    expect(r.beatable).toBe(true)
    expect(r.softlocks).toEqual(['oubliette'])
  })

  it('an unkeyed gate no longer traps the player, because doors are two-way', () => {
    const rooms = mutRooms()
    roomIn(rooms, 'gallery').items = []
    const r = run(rooms)
    expect(r.beatable).toBe(false)
    // The player can walk back to the atrium and keep exploring; being short of
    // a key is a dead end, not a softlock. This was a genuine softlock before
    // the gallery gained a door back to the atrium.
    expect(r.softlocks).toEqual([])
  })

  it('still reports a room with no exit at all as a softlock', () => {
    const rooms = mutRooms()
    rooms.rooms.push({ id: 'sealed', entry: { col: 2, row: 9 }, rows: FLAT_ROWS })
    roomIn(rooms, 'atrium').doors!.push({
      id: 'atrium-to-sealed',
      col: 18,
      row: 9,
      to: 'sealed',
      toCol: 2,
      toRow: 9,
    })
    const r = run(rooms)
    expect(r.beatable).toBe(true)
    expect(r.softlocks).toEqual(['sealed'])
  })
})

describe('solver: content validation', () => {
  it('rejects a door leading to a room that does not exist', () => {
    const rooms = mutRooms()
    roomIn(rooms, 'atrium').doors![0]!.to = 'nowhere'
    expect(run(rooms).errors).toContain('door "atrium-to-gallery" leads to missing room "nowhere"')
  })

  it('rejects a door referencing a gate that is not defined', () => {
    const rooms = mutRooms()
    const gated = roomIn(rooms, 'gallery').doors!.find((d) => d.id === 'gallery-to-spire')!
    gated.gate = 'gate-not-defined'
    expect(run(rooms).errors).toContain(
      'door "gallery-to-spire" references gate "gate-not-defined" missing from gates.json',
    )
  })

  it('rejects a gate no door uses', () => {
    const gates = mutGates()
    gates.gates['gate-orphan'] = 'doubleJump'
    expect(run(mutRooms(), gates).errors).toContain(
      'gate "gate-orphan" is defined but no door uses it',
    )
  })

  it('rejects a gate requiring an ability the game does not have', () => {
    const gates = mutGates()
    gates.gates['gate-to-spire'] = 'grapple'
    expect(run(mutRooms(), gates).errors).toContain(
      'gate "gate-to-spire" requires unknown ability "grapple"',
    )
  })

  it('rejects a goal inside solid terrain', () => {
    const rooms = mutRooms()
    rooms.goal = { room: 'spire', col: 0, row: 6 }
    expect(run(rooms).errors).toContain('goal cell (0, 6) is inside solid terrain')
  })

  it('rejects a door placed inside solid terrain', () => {
    const rooms = mutRooms()
    roomIn(rooms, 'atrium').doors![0]!.row = 10
    expect(run(rooms).errors).toContain(
      'door "atrium-to-gallery" is placed inside solid terrain in "atrium"',
    )
  })

  it('rejects a room entry cell inside solid terrain', () => {
    const rooms = mutRooms()
    roomIn(rooms, 'atrium').entry = { col: 2, row: 10 }
    expect(run(rooms).errors).toContain(
      'room "atrium" entry cell (2, 10) is inside solid terrain',
    )
  })

  it('rejects a duplicate room id', () => {
    const rooms = mutRooms()
    rooms.rooms.push(JSON.parse(JSON.stringify(roomIn(rooms, 'atrium'))) as MutRoom)
    expect(() => run(rooms)).toThrow(/duplicate room id/)
  })

  it('rejects an item granting an ability the game does not have', () => {
    const rooms = mutRooms()
    roomIn(rooms, 'gallery').items![0]!.ability = 'wallSlide'
    expect(run(rooms).errors).toContain(
      'item "gallery-double-jump" grants unknown ability "wallSlide"',
    )
  })

  it('reports validation errors instead of guessing at reachability', () => {
    const rooms = mutRooms()
    roomIn(rooms, 'atrium').doors![0]!.to = 'nowhere'
    const r = run(rooms)
    expect(r.errors.length).toBeGreaterThan(0)
    expect(r.beatable).toBe(false)
    expect(r.reachableRooms).toEqual([])
  })

  it('flags a reachable door sitting in mid-air as a warning, not an error', () => {
    const rooms = mutRooms()
    // One tile above the floor: reachable by jumping, but not standable.
    roomIn(rooms, 'atrium').doors![0]!.row = 8
    const r = run(rooms)
    expect(r.errors).toEqual([])
    expect(r.warnings).toContain(
      'door "atrium-to-gallery" sits in mid-air; the player can only touch it mid-jump',
    )
  })
})

describe('solver: unverified ability debt', () => {
  it('has no unmeasured abilities once M3 implements the double jump', () => {
    // The anchor test now measures every ability the solver assumes. A new
    // ability must start on this list and be removed when it is measured.
    expect(UNVERIFIED_ABILITIES).toEqual([])
  })
})
