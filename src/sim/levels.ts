import roomsFile from '../../content/rooms.json'
import { loadGameMap, type RoomsFile } from './content'

/**
 * The real map, loaded from `content/`.
 *
 * The game and the solver read the same file: there is no second copy of level
 * geometry to drift out of sync. Multi-room transitions arrive in M3, so for
 * now the render layer boots the start room only.
 */
export const GAME_MAP = loadGameMap(roomsFile as RoomsFile)

/** The room the game boots into. */
export const START_LEVEL = GAME_MAP.rooms[GAME_MAP.startRoom]!.grid

/** Alias kept so the M1 tests and the render layer keep working unchanged. */
export const DEMO_LEVEL = START_LEVEL
