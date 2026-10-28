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
  props?: { id: string; kind: string; col: number; row: number }[]
  enemies?: { id: string; kind: string; col: number; row: number; patrol: number }[]
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
    // Enemies are outside the movement model. They are reported, not warned
    // about: there is nothing to fix, and it must not fail a build.
    // In map order, not alphabetical.
    expect(r.unverified).toEqual([
      'room "shaft" places 2 enemies: movement is verified, combat is not',
      'room "foundry" places 1 enemy: movement is verified, combat is not',
    ])
  })

  it('requires exactly the double jump and the wall climb to finish', () => {
    const r = run()
    expect(r.abilities).toEqual(['doubleJump', 'wallClimb'])
    expect(r.reachableRooms).toEqual([
      'ascent',
      'atrium',
      'cistern',
      'foundry',
      'gallery',
      'overlook',
      'shaft',
      'summit',
    ])
  })

  it('every door in the level is actually usable, in both directions', () => {
    // A door can be reachable from one side and not the other — arriving at a
    // room's old entry point leaves the return door stranded, which the softlock
    // check cannot see because the room has another exit. Caught exactly that
    // when the shaft was rebuilt as a descent and its entry moved from (0,11)
    // to (0,1) while the gallery's door still pointed at the old cell.
    const r = run()
    const all = Object.values(loadGameMap(roomsFile as RoomsFile).rooms).flatMap((room) =>
      room.doors.map((d) => d.id),
    )
    expect(all.length).toBeGreaterThan(0)
    expect([...r.openedDoors].sort()).toEqual([...all].sort())
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
    expect(map.rooms.ascent!.grid.spawn).toEqual({ x: 0 * 16 + 8, y: (15 + 1) * 16 })
  })
})

describe('solver: gating actually gates', () => {
  it('without the double jump the run stops in the gallery', () => {
    // Gating is geometric now, not a locked door: the gallery's ledge is four
    // tiles up, so with the item removed the solver simply never reaches the
    // shaft. There is no blocked door to report, only an unreachable room.
    const rooms = mutRooms()
    roomIn(rooms, 'gallery').items = []
    const r = run(rooms)

    expect(r.errors).toEqual([])
    expect(r.beatable).toBe(false)
    expect(r.abilities).toEqual([])
    expect(r.reachableRooms).toEqual(['atrium', 'gallery'])
    expect(r.blockedDoors).toEqual([])
  })

  it('without the wall climb the run stops in the cistern', () => {
    // The cistern ledge is seven tiles up — past any jump — and the ascent
    // chimney is thirteen. Both need the ability the overlook grants.
    const rooms = mutRooms()
    roomIn(rooms, 'overlook').items = []
    const r = run(rooms)

    expect(r.beatable).toBe(false)
    expect(r.abilities).toEqual(['doubleJump'])
    expect(r.reachableRooms).not.toContain('foundry')
    expect(r.reachableRooms).not.toContain('ascent')
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
    const gated = roomIn(rooms, 'gallery').doors!.find((d) => d.id === 'gallery-to-shaft')!
    gated.gate = 'gate-not-defined'
    expect(run(rooms).errors).toContain(
      'door "gallery-to-shaft" references gate "gate-not-defined" missing from gates.json',
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
    rooms.goal = { room: 'summit', col: 0, row: 10 }
    expect(run(rooms).errors).toContain('goal cell (0, 10) is inside solid terrain')
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

  it('rejects a prop of a kind the renderer cannot draw', () => {
    const rooms = mutRooms()
    roomIn(rooms, 'atrium').props![0]!.kind = 'statue'
    expect(run(rooms).errors).toContain(
      'prop "atrium-chest" has unknown kind "statue" (known: flag, chest)',
    )
  })

  it('rejects a prop buried inside solid terrain', () => {
    const rooms = mutRooms()
    roomIn(rooms, 'atrium').props![0]!.row = 11
    expect(run(rooms).errors).toContain('prop "atrium-chest" is inside solid terrain in "atrium"')
  })

  it('rejects a prop placed outside the room', () => {
    const rooms = mutRooms()
    roomIn(rooms, 'atrium').props![0]!.col = 99
    expect(run(rooms).errors).toContain('prop "atrium-chest" is outside room "atrium"')
  })

  it('keeps the shipped props on standable ground and the goal flag on the goal cell', () => {
    // The flag is a navigation aid: if it drifts off the goal cell it starts
    // pointing at the wrong place, which no screenshot test would notice.
    const map = loadGameMap(roomsFile as RoomsFile, gatesFile as GatesFile)
    const goal = map.goal
    const flag = map.rooms[goal.room]!.props.find((p) => p.kind === 'flag')
    expect(flag).toBeDefined()
    expect({ col: flag!.col, row: flag!.row }).toEqual({ col: goal.col, row: goal.row })

    for (const roomId of map.order) {
      const room = map.rooms[roomId]!
      for (const prop of room.props) {
        expect(isSolid(room.grid, prop.col, prop.row), `${prop.id} sits in rock`).toBe(false)
        expect(isSolid(room.grid, prop.col, prop.row + 1), `${prop.id} floats with nothing under it`).toBe(
          true,
        )
      }
    }
  })

  it('rejects an enemy of a kind the game cannot simulate', () => {
    const rooms = mutRooms()
    roomIn(rooms, 'foundry').enemies![0]!.kind = 'dragon'
    expect(run(rooms).errors).toContain(
      'enemy "foundry-husk" has unknown kind "dragon" (known: enraged)',
    )
  })

  it('rejects an enemy with no ground under it', () => {
    // Over a pit it falls out of the room on the first tick, which is silent in
    // play and looks like the enemy was never placed.
    const rooms = mutRooms()
    roomIn(rooms, 'foundry').enemies![0]!.col = 9 // the three-tile gap
    expect(run(rooms).errors).toContain('enemy "foundry-husk" has no ground under it in "foundry"')
  })

  it('rejects an enemy buried in rock or off the map', () => {
    const buried = mutRooms()
    roomIn(buried, 'foundry').enemies![0]!.row = 11
    expect(run(buried).errors).toContain('enemy "foundry-husk" is inside solid terrain in "foundry"')

    const offMap = mutRooms()
    roomIn(offMap, 'foundry').enemies![0]!.col = 99
    expect(run(offMap).errors).toContain('enemy "foundry-husk" is outside room "foundry"')
  })

  it('rejects a negative patrol radius', () => {
    const rooms = mutRooms()
    roomIn(rooms, 'foundry').enemies![0]!.patrol = -1
    expect(run(rooms).errors).toContain('enemy "foundry-husk" has negative patrol -1')
  })

  it('keeps every shipped enemy on ground it can stand on', () => {
    const map = loadGameMap(roomsFile as RoomsFile, gatesFile as GatesFile)
    let total = 0
    for (const roomId of map.order) {
      const room = map.rooms[roomId]!
      for (const enemy of room.enemies) {
        total++
        expect(isSolid(room.grid, enemy.col, enemy.row), `${enemy.id} sits in rock`).toBe(false)
        expect(isSolid(room.grid, enemy.col, enemy.row + 1), `${enemy.id} floats`).toBe(true)
      }
    }
    expect(total).toBeGreaterThan(0)
  })

  it('reports every room with an enemy as outside the movement model', () => {
    const r = run()
    expect(r.unverified.length).toBe(2)
    expect(r.unverified.join(' ')).toContain('"shaft"')
    expect(r.unverified.join(' ')).toContain('"foundry"')
    // Not a warning: warnings fail the build, and this is permanent.
    expect(r.warnings).toEqual([])
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
