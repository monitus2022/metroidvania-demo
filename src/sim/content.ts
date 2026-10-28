import { gridFromRows, type TileGrid } from './tiles'

/**
 * The shared content format.
 *
 * Terrain lives in ASCII rows; everything logical (entry point, doors, items,
 * the goal) lives in data beside it. Both the game and the Node solver read the
 * exact same files — that is the point of this module.
 *
 * Rooms declare their `entry` explicitly rather than hiding a spawn marker in
 * the ASCII. An earlier version inferred the entry cell from whichever door
 * pointed at the room, which meant a typo in a door target turned into an
 * unrelated "no spawn" crash at load time.
 */

export interface CellDef {
  readonly col: number
  readonly row: number
}

export interface DoorDef {
  readonly id: string
  /** Source cell, in tiles. */
  readonly col: number
  readonly row: number
  readonly to: string
  /** Arrival cell in the target room, in tiles. */
  readonly toCol: number
  readonly toRow: number
  /** Gate id, looked up in gates.json. Absent means the door is always open. */
  readonly gate?: string
}

export interface ItemDef {
  readonly id: string
  readonly ability: string
  readonly col: number
  readonly row: number
}

/**
 * Non-colliding scenery. Drawn at a cell, anchored to the bottom of it, so a
 * prop sits on whatever ground is there. Purely visual: the sim never sees it.
 */
export interface PropDef {
  readonly id: string
  readonly kind: string
  readonly col: number
  readonly row: number
}

/** Prop kinds the renderer can draw. Content may not invent new ones. */
export const KNOWN_PROP_KINDS = ['flag', 'chest'] as const

export interface RoomDef {
  readonly id: string
  readonly grid: TileGrid
  /** The cell the player stands in when this room is loaded from scratch. */
  readonly entry: CellDef
  readonly doors: readonly DoorDef[]
  readonly items: readonly ItemDef[]
  readonly props: readonly PropDef[]
}

export interface GoalDef {
  readonly room: string
  readonly col: number
  readonly row: number
}

export interface GameMap {
  readonly startRoom: string
  readonly goal: GoalDef
  readonly rooms: Readonly<Record<string, RoomDef>>
  /** Gate id -> required ability. Carried here so the sim needs no side table. */
  readonly gates: Readonly<Record<string, string>>
  /** Room ids in file order. */
  readonly order: readonly string[]
}

/** Shape of content/rooms.json. */
export interface RoomsFile {
  readonly startRoom: string
  readonly goal: GoalDef
  readonly rooms: readonly {
    readonly id: string
    readonly comment?: string
    readonly entry: CellDef
    readonly rows: readonly string[]
    readonly doors?: readonly DoorDef[]
    readonly items?: readonly ItemDef[]
    readonly props?: readonly PropDef[]
  }[]
}

/** Shape of content/gates.json. */
export interface GatesFile {
  readonly comment?: string
  readonly gates: Readonly<Record<string, string>>
}

export function loadGameMap(file: RoomsFile, gates: GatesFile = { gates: {} }): GameMap {
  const order = file.rooms.map((r) => r.id)
  const rooms: Record<string, RoomDef> = {}

  for (const room of file.rooms) {
    if (rooms[room.id]) throw new Error(`loadGameMap: duplicate room id "${room.id}"`)
    if (!room.entry) throw new Error(`loadGameMap: room "${room.id}" has no entry cell`)

    rooms[room.id] = {
      id: room.id,
      grid: gridFromRows(room.rows, room.entry),
      entry: room.entry,
      doors: room.doors ?? [],
      items: room.items ?? [],
      props: room.props ?? [],
    }
  }

  return {
    startRoom: file.startRoom,
    goal: file.goal,
    rooms,
    gates: { ...gates.gates },
    order,
  }
}

/**
 * A one-room map from ASCII rows, for tests and fixtures.
 *
 * `gridFromRows` still understands the 'P' spawn marker, so single-room
 * fixtures stay as readable as they were before the map type existed.
 */
export function singleRoomMap(
  rows: readonly string[],
  options: {
    id?: string
    goal?: GoalDef
    doors?: readonly DoorDef[]
    items?: readonly ItemDef[]
    props?: readonly PropDef[]
  } = {},
): GameMap {
  const id = options.id ?? 'room'
  const grid = gridFromRows(rows)
  const entry = {
    col: Math.floor(grid.spawn.x / 16),
    row: Math.floor(grid.spawn.y / 16) - 1,
  }
  return {
    startRoom: id,
    goal: options.goal ?? { room: id, col: entry.col, row: entry.row },
    rooms: {
      [id]: {
        id,
        grid,
        entry,
        doors: options.doors ?? [],
        items: options.items ?? [],
        props: options.props ?? [],
      },
    },
    gates: {},
    order: [id],
  }
}

export function loadGates(file: GatesFile): Record<string, string> {
  return { ...file.gates }
}
