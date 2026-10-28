import gatesFile from '../../content/gates.json'
import roomsFile from '../../content/rooms.json'
import { loadGameMap, type GatesFile, type RoomsFile } from './content'

/**
 * The real map, loaded from `content/`.
 *
 * The game and the solver read the same file: there is no second copy of level
 * geometry to drift out of sync.
 */
export const GAME_MAP = loadGameMap(roomsFile as RoomsFile, gatesFile as GatesFile)

/** The room the game boots into. */
export const START_LEVEL = GAME_MAP.rooms[GAME_MAP.startRoom]!.grid

/** Alias kept so older tests and the render layer keep working unchanged. */
export const DEMO_LEVEL = START_LEVEL
