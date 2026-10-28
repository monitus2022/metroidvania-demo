import type { GameMap } from './content'

export interface Vec2 {
  x: number
  y: number
}

/**
 * Anything the collision resolver can move: the player and every enemy.
 *
 * Bodies all share the player's dimensions (see PLAYER_W/PLAYER_H) because the
 * enemy art is the same rig. If an enemy ever needs a different body, the size
 * has to move onto this interface rather than staying a module constant.
 */
export interface Body {
  pos: Vec2
  vel: Vec2
}

export interface PlayerState {
  /** Feet position: x is the horizontal centre, y is the bottom edge. */
  pos: Vec2
  vel: Vec2
  onGround: boolean
  facing: 1 | -1
  /** Seconds of jump grace remaining after leaving the ground. */
  coyoteTimer: number
  /** Seconds remaining on a jump pressed slightly too early. */
  jumpBufferTimer: number
  /** Mid-air jumps already spent since the player last stood on something. */
  airJumpsUsed: number
}

/**
 * An enemy. Same rig and body size as the player, so the collision helpers work
 * on it unchanged; `spawnX` and `patrol` mirror the content definition and are
 * carried here so a tick needs no map lookup.
 */
export interface EnemyState {
  readonly id: string
  readonly roomId: string
  /** Where it started, and where it returns to on respawn. */
  readonly spawn: Vec2
  /** Tiles either side of spawn.x this enemy is allowed to walk. */
  readonly patrol: number
  pos: Vec2
  vel: Vec2
  dir: 1 | -1
  hp: number
  alive: boolean
  /** Ticks until it comes back. 0 while alive. */
  respawnTimer: number
  /** Ticks before it may be damaged again, so one swing is one hit. */
  hitCooldown: number
}

export interface WorldState {
  /** The whole map. Immutable content, carried so `step` needs no extra args. */
  map: GameMap
  roomId: string
  player: PlayerState
  /** Ability ids held, kept sorted so state hashing is stable. */
  abilities: readonly string[]
  /** Item ids already picked up, kept sorted. */
  collected: readonly string[]
  /** Fixed-step counter. Doubles as the replay frame index. */
  tick: number
  rngSeed: number
  /** Previous tick's input, needed to detect jump press edges. */
  prevInput: number
  /** Ticks remaining during which door transitions are suppressed. */
  transitionLock: number
  reachedGoal: boolean
  /** Every enemy in the level, in content order. Order is part of the hash. */
  enemies: readonly EnemyState[]
  /** Player hit points. Hitting 0 respawns the player at the room entry. */
  hp: number
  /** Ticks of invulnerability remaining after taking a hit. */
  invulnTimer: number
  /** Ticks remaining in the current swing. 0 means not attacking. */
  attackTimer: number
  /** Ticks until another attack is allowed. */
  attackCooldown: number
}
