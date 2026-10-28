import { archetypeFor, ENEMY_H, ENEMY_W, TILE } from '../../src/sim/constants'
import { isSolid, type TileGrid } from '../../src/sim/tiles'
import { KNOWN_ENEMY_KINDS, KNOWN_PROP_KINDS, type GameMap } from '../../src/sim/content'

/**
 * Reachability solver — Node only. No browser, no renderer, no engine.
 *
 * It answers a question most genres cannot ask at all: *is this map beatable,
 * and can the player get permanently stuck?* A metroidvania's progression is a
 * graph, so this is decidable.
 *
 * ## The movement model is an approximation, deliberately
 *
 * Movement is modelled as a BFS over tiles using an envelope (max jump height
 * and horizontal reach in tiles) rather than by simulating the platformer.
 * That means it can in principle claim a jump is possible when the real physics
 * would clip a corner.
 *
 * The guard against that drift is `tests/unit/anchor.test.ts`, which *measures*
 * jump height and maximum gap width from the real sim and asserts these
 * constants stay inside what the sim actually achieves. Keep the model
 * conservative: under-claiming reports "not beatable" on a map that is fine,
 * which is loud. Over-claiming ships an unbeatable level, which is silent.
 */

export interface Cell {
  readonly col: number
  readonly row: number
}

export interface Movement {
  /** Tiles of rise achievable in one jump. */
  readonly jumpHeight: number
  /** Tiles of horizontal reach available during a jump. */
  readonly jumpDistance: number
  /**
   * Can move up and down any column flanked by rock, without needing a floor.
   *
   * This is qualitatively different from a jump: it is unbounded vertically, so
   * it cannot be expressed as a height budget. It is modelled as an extra edge
   * between vertically adjacent cells that both have a solid side neighbour,
   * which is exactly what the sim's `touchingWall` reports.
   */
  readonly climbWalls?: boolean
}

/** Base movement, always available. Measured from the sim — see anchor.test.ts. */
export const BASE_MOVEMENT: Movement = { jumpHeight: 2, jumpDistance: 3 }

/**
 * Movement granted by each ability.
 *
 * Every number here is measured from the simulation by
 * `tests/unit/anchor.test.ts`, which builds rooms with growing pits and
 * growing ledges and runs the real physics. Do not hand-edit these: change the
 * tuning constants and let the measurement tell you the new envelope.
 */
export const ABILITY_MOVEMENT: Readonly<Record<string, Partial<Movement>>> = {
  doubleJump: { jumpHeight: 5, jumpDistance: 8 },
  wallClimb: { climbWalls: true },
}

/**
 * Abilities whose movement numbers no test can yet check against the sim.
 *
 * Empty since M3 implemented the double jump. A new ability must be added here
 * when it is declared and removed once the anchor test measures it — otherwise
 * a guess silently becomes load-bearing.
 */
export const UNVERIFIED_ABILITIES: readonly string[] = []

/** Every ability id the solver knows about. Content may not invent new ones. */
export const KNOWN_ABILITIES: readonly string[] = Object.keys(ABILITY_MOVEMENT)

export function movementFor(abilities: ReadonlySet<string>): Movement {
  let m = BASE_MOVEMENT
  for (const a of abilities) {
    const grant = ABILITY_MOVEMENT[a]
    if (grant) m = { ...m, ...grant }
  }
  return m
}

export interface SolveResult {
  readonly beatable: boolean
  readonly errors: readonly string[]
  readonly warnings: readonly string[]
  /**
   * Rooms the solver cannot reason about: places where movement is verified but
   * something outside the model — combat, for now — decides whether the player
   * gets through. Distinct from `warnings`, which are content smells to fix; this
   * is permanent until the model grows, so it must not fail a build.
   */
  readonly unverified: readonly string[]
  readonly abilities: readonly string[]
  readonly reachableRooms: readonly string[]
  readonly openedDoors: readonly string[]
  readonly blockedDoors: readonly { door: string; requires: string }[]
  /** Reachable rooms the player can no longer leave and cannot win from. */
  readonly softlocks: readonly string[]
}

const cellKey = (col: number, row: number): string => `${col},${row}`
export const at = (col: number, row: number): Cell => ({ col, row })
const isEmpty = (g: TileGrid, col: number, row: number): boolean => !isSolid(g, col, row)
const isStandable = (g: TileGrid, col: number, row: number): boolean =>
  isEmpty(g, col, row) && isSolid(g, col, row + 1)

/** Every cell strictly between `col` and `col + dx` on `row` is empty. */
function corridorClear(g: TileGrid, row: number, col: number, dx: number): boolean {
  const step = Math.sign(dx)
  for (let c = col + step; c !== col + dx + step; c += step) {
    if (isSolid(g, c, row)) return false
  }
  return true
}

/**
 * A cell a wall climber can grip: rock on either side.
 *
 * Out-of-bounds counts as solid, which matches the sim — the player really can
 * climb the left and right edges of a room.
 */
const hasWallNeighbour = (g: TileGrid, col: number, row: number): boolean =>
  isSolid(g, col - 1, row) || isSolid(g, col + 1, row)

function neighbours(g: TileGrid, cell: Cell, mv: Movement): Cell[] {
  const { col, row } = cell
  if (!isEmpty(g, col, row)) return []

  const out: Cell[] = []

  // Wall climbing is checked before the "airborne falls straight down" rule,
  // because a shaft is precisely a column of cells with no floor under them.
  if (mv.climbWalls && hasWallNeighbour(g, col, row)) {
    for (const dy of [-1, 1]) {
      const tr = row + dy
      if (isEmpty(g, col, tr) && hasWallNeighbour(g, col, tr)) out.push({ col, row: tr })
    }
    // Pull yourself onto a ledge at the same height. This is the move that ends
    // a climb: the sim gets it for free because a body at ledge-top height that
    // drifts sideways is already standing on the ledge.
    for (const dx of [-1, 1]) {
      if (isEmpty(g, col + dx, row) && isStandable(g, col + dx, row)) {
        out.push({ col: col + dx, row })
      }
    }
  }

  // Airborne: the only move is straight down to the first surface.
  if (!isStandable(g, col, row)) {
    let r = row + 1
    while (!isSolid(g, col, r)) r++
    if (r - 1 > row) out.push({ col, row: r - 1 })
    return out
  }

  // Sideways at the same level: walk, or step off a ledge and fall.
  for (let dx = -mv.jumpDistance; dx <= mv.jumpDistance; dx++) {
    if (dx === 0) continue
    if (!isEmpty(g, col + dx, row)) continue
    if (!corridorClear(g, row, col, dx)) continue
    out.push({ col: col + dx, row })
  }

  // Upward: rise up to jumpHeight, drift up to jumpDistance.
  for (let dy = 1; dy <= mv.jumpHeight; dy++) {
    if (!isEmpty(g, col, row - dy)) break // headroom blocked above
    for (let dx = -mv.jumpDistance; dx <= mv.jumpDistance; dx++) {
      const tc = col + dx
      const tr = row - dy
      if (!isEmpty(g, tc, tr)) continue
      if (!corridorClear(g, tr, col, dx)) continue
      out.push({ col: tc, row: tr })
    }
  }

  return out
}

/** Flood fill of every cell reachable inside one room from a given entry. */
export function reachableCells(g: TileGrid, entry: Cell, mv: Movement): Set<string> {
  const seen = new Set<string>()
  if (isSolid(g, entry.col, entry.row)) return seen

  const stack: Cell[] = [entry]
  while (stack.length > 0) {
    const cell = stack.pop()!
    const k = cellKey(cell.col, cell.row)
    if (seen.has(k)) continue
    seen.add(k)
    for (const n of neighbours(g, cell, mv)) {
      if (!seen.has(cellKey(n.col, n.row))) stack.push(n)
    }
  }
  return seen
}

/** Structural validation. Anything here is a content bug, not a design choice. */
function validate(map: GameMap, gates: Readonly<Record<string, string>>): string[] {
  const errors: string[] = []

  if (!map.rooms[map.startRoom]) {
    errors.push(`startRoom "${map.startRoom}" does not exist`)
  }

  const goalRoom = map.rooms[map.goal.room]
  if (!goalRoom) {
    errors.push(`goal room "${map.goal.room}" does not exist`)
  } else {
    const g = goalRoom.grid
    if (map.goal.col < 0 || map.goal.col >= g.w || map.goal.row < 0 || map.goal.row >= g.h) {
      errors.push(`goal cell (${map.goal.col}, ${map.goal.row}) is outside room "${map.goal.room}"`)
    } else if (!isEmpty(g, map.goal.col, map.goal.row)) {
      errors.push(`goal cell (${map.goal.col}, ${map.goal.row}) is inside solid terrain`)
    }
  }

  const referencedGates = new Set<string>()
  const doorIds = new Set<string>()

  for (const roomId of map.order) {
    const room = map.rooms[roomId]!
    const g = room.grid

    const e = room.entry
    if (e.col < 0 || e.col >= g.w || e.row < 0 || e.row >= g.h) {
      errors.push(`room "${roomId}" entry cell is outside the room`)
    } else if (!isEmpty(g, e.col, e.row)) {
      errors.push(`room "${roomId}" entry cell (${e.col}, ${e.row}) is inside solid terrain`)
    }

    for (const door of room.doors) {
      if (doorIds.has(door.id)) errors.push(`duplicate door id "${door.id}"`)
      doorIds.add(door.id)

      if (!map.rooms[door.to]) {
        errors.push(`door "${door.id}" leads to missing room "${door.to}"`)
      } else {
        const t = map.rooms[door.to]!.grid
        if (door.toCol < 0 || door.toCol >= t.w || door.toRow < 0 || door.toRow >= t.h) {
          errors.push(`door "${door.id}" arrives outside room "${door.to}"`)
        } else if (!isEmpty(t, door.toCol, door.toRow)) {
          errors.push(`door "${door.id}" arrives inside solid terrain in "${door.to}"`)
        }
      }

      if (door.col < 0 || door.col >= g.w || door.row < 0 || door.row >= g.h) {
        errors.push(`door "${door.id}" is placed outside room "${roomId}"`)
      } else if (!isEmpty(g, door.col, door.row)) {
        errors.push(`door "${door.id}" is placed inside solid terrain in "${roomId}"`)
      }

      if (door.gate !== undefined) {
        referencedGates.add(door.gate)
        if (!(door.gate in gates)) {
          errors.push(`door "${door.id}" references gate "${door.gate}" missing from gates.json`)
        }
      }
    }

    for (const item of room.items) {
      if (!KNOWN_ABILITIES.includes(item.ability)) {
        errors.push(`item "${item.id}" grants unknown ability "${item.ability}"`)
      }
      if (item.col < 0 || item.col >= g.w || item.row < 0 || item.row >= g.h) {
        errors.push(`item "${item.id}" is outside room "${roomId}"`)
      } else if (!isEmpty(g, item.col, item.row)) {
        errors.push(`item "${item.id}" is inside solid terrain in "${roomId}"`)
      }
    }

    // Props are scenery, but a prop buried in rock or drawn off the map is a
    // content mistake worth failing on rather than silently not drawing it.
    for (const prop of room.props) {
      if (!KNOWN_PROP_KINDS.includes(prop.kind as (typeof KNOWN_PROP_KINDS)[number])) {
        errors.push(
          `prop "${prop.id}" has unknown kind "${prop.kind}" (known: ${KNOWN_PROP_KINDS.join(', ')})`,
        )
      }
      if (prop.col < 0 || prop.col >= g.w || prop.row < 0 || prop.row >= g.h) {
        errors.push(`prop "${prop.id}" is outside room "${roomId}"`)
      } else if (!isEmpty(g, prop.col, prop.row)) {
        errors.push(`prop "${prop.id}" is inside solid terrain in "${roomId}"`)
      }
    }

    // Enemies must stand on something. One placed over a pit falls out of the
    // room on the first tick and is never seen again, which is silent in play.
    for (const enemy of room.enemies) {
      if (!KNOWN_ENEMY_KINDS.includes(enemy.kind as (typeof KNOWN_ENEMY_KINDS)[number])) {
        errors.push(
          `enemy "${enemy.id}" has unknown kind "${enemy.kind}" (known: ${KNOWN_ENEMY_KINDS.join(', ')})`,
        )
      }
      if (enemy.patrol < 0) {
        errors.push(`enemy "${enemy.id}" has negative patrol ${enemy.patrol}`)
      }
      if (enemy.col < 0 || enemy.col >= g.w || enemy.row < 0 || enemy.row >= g.h) {
        errors.push(`enemy "${enemy.id}" is outside room "${roomId}"`)
        continue
      }
      // Check the whole collider, not just the spawn cell.
      //
      // A boss is three tiles tall, so its head can be buried in a platform while
      // its feet stand on perfectly good ground. A single-cell check passes that
      // and the body wedges on the first tick — the same failure as the player
      // headroom bug, and just as invisible to every other test.
      const arch = archetypeFor(enemy.kind)
      const cx = enemy.col * TILE + TILE / 2
      const feet = (enemy.row + 1) * TILE
      const halfW = (arch?.w ?? ENEMY_W) / 2
      const topRow = Math.floor((feet - (arch?.h ?? ENEMY_H)) / TILE)
      const leftCol = Math.floor((cx - halfW) / TILE)
      const rightCol = Math.floor((cx + halfW - 1e-6) / TILE)

      let buried = false
      for (let row = topRow; row <= enemy.row && !buried; row++) {
        for (let col = leftCol; col <= rightCol; col++) {
          if (!isEmpty(g, col, row)) {
            buried = true
            break
          }
        }
      }

      if (buried) {
        errors.push(`enemy "${enemy.id}" is inside solid terrain in "${roomId}"`)
      } else if (!isSolid(g, enemy.col, enemy.row + 1)) {
        errors.push(`enemy "${enemy.id}" has no ground under it in "${roomId}"`)
      }
    }
  }

  for (const gateId of Object.keys(gates)) {
    if (!referencedGates.has(gateId)) errors.push(`gate "${gateId}" is defined but no door uses it`)
  }
  for (const [gateId, ability] of Object.entries(gates)) {
    if (!KNOWN_ABILITIES.includes(ability)) {
      errors.push(`gate "${gateId}" requires unknown ability "${ability}"`)
    }
  }

  return errors
}

export function solve(map: GameMap): SolveResult {
  const gates = map.gates
  const errors = validate(map, gates)
  const warnings: string[] = []

  if (errors.length > 0) {
    return {
      beatable: false,
      errors,
      warnings,
      abilities: [],
      reachableRooms: [],
      openedDoors: [],
      blockedDoors: [],
      softlocks: [],
      unverified: [],
    }
  }

  const startRoom = map.rooms[map.startRoom]!
  const entries = new Map<string, Cell[]>()
  entries.set(map.startRoom, [{ col: startRoom.entry.col, row: startRoom.entry.row }])

  const abilities = new Set<string>()
  const opened = new Set<string>()
  const cells = new Map<string, Set<string>>()

  // Fixed point: abilities open doors, doors open rooms, rooms hold abilities.
  for (let iter = 0; iter < 64; iter++) {
    let changed = false
    const mv = movementFor(abilities)

    for (const [roomId, entryCells] of entries) {
      const g = map.rooms[roomId]!.grid
      const set = new Set<string>()
      for (const e of entryCells) {
        for (const k of reachableCells(g, e, mv)) set.add(k)
      }
      cells.set(roomId, set)
    }

    for (const [roomId, set] of cells) {
      for (const item of map.rooms[roomId]!.items) {
        if (set.has(cellKey(item.col, item.row)) && !abilities.has(item.ability)) {
          abilities.add(item.ability)
          changed = true
        }
      }
    }

    for (const [roomId, set] of cells) {
      for (const door of map.rooms[roomId]!.doors) {
        if (opened.has(door.id)) continue
        if (!set.has(cellKey(door.col, door.row))) continue
        const required = door.gate === undefined ? undefined : gates[door.gate]
        if (required !== undefined && !abilities.has(required)) continue
        opened.add(door.id)
        changed = true
        const list = entries.get(door.to) ?? []
        list.push({ col: door.toCol, row: door.toRow })
        entries.set(door.to, list)
      }
    }

    if (!changed) break
  }

  const goalCells = cells.get(map.goal.room)
  const beatable = goalCells?.has(cellKey(map.goal.col, map.goal.row)) ?? false

  // A door the player can stand on but not open with any ability they hold.
  const blockedDoors: { door: string; requires: string }[] = []
  for (const roomId of cells.keys()) {
    for (const door of map.rooms[roomId]!.doors) {
      if (opened.has(door.id)) continue
      if (door.gate === undefined) continue
      blockedDoors.push({ door: door.id, requires: gates[door.gate]! })
    }
  }

  // A reachable room with no usable exit and no way to win from it is a trap.
  const softlocks: string[] = []
  for (const [roomId, set] of cells) {
    const goalHere = roomId === map.goal.room && set.has(cellKey(map.goal.col, map.goal.row))
    if (goalHere) continue
    const hasUsableExit = map.rooms[roomId]!.doors.some(
      (d) => opened.has(d.id) && set.has(cellKey(d.col, d.row)),
    )
    if (!hasUsableExit) softlocks.push(roomId)
  }

  // A door the player can only touch while airborne is fragile: a transition
  // that depends on clipping it mid-jump will feel unreliable.
  for (const [roomId, set] of cells) {
    const g = map.rooms[roomId]!.grid
    for (const door of map.rooms[roomId]!.doors) {
      if (!set.has(cellKey(door.col, door.row))) continue
      if (!isStandable(g, door.col, door.row)) {
        warnings.push(`door "${door.id}" sits in mid-air; the player can only touch it mid-jump`)
      }
    }
  }

  // Combat is outside the model. The solver answers "can the player reach this
  // tile", not "can they survive the trip", so any room with an enemy is a place
  // where "beatable" is an assumption rather than a result.
  const unverified: string[] = []
  for (const roomId of map.order) {
    const enemies = map.rooms[roomId]!.enemies
    if (enemies.length === 0) continue

    // A boss is a special case worth naming: it cannot be walked past by
    // accident, it does not respawn, and the goal often sits behind it — so the
    // solver's "the player can reach the goal tile" says nothing about whether
    // they can get there alive.
    const bosses = enemies.filter((e) => archetypeFor(e.kind)?.respawns === false)
    if (bosses.length > 0) {
      unverified.push(
        `room "${roomId}" holds a boss (${bosses.map((e) => e.id).join(', ')}): ` +
          `movement is verified, winning the fight is not`,
      )
    }
    const count = enemies.length - bosses.length
    if (count > 0) {
      unverified.push(
        `room "${roomId}" places ${count} ${count === 1 ? 'enemy' : 'enemies'}: ` +
          `movement is verified, combat is not`,
      )
    }
  }

  return {
    beatable,
    errors,
    warnings,
    unverified,
    abilities: [...abilities].sort(),
    reachableRooms: [...cells.keys()].sort(),
    openedDoors: [...opened].sort(),
    blockedDoors,
    softlocks: softlocks.sort(),
  }
}
