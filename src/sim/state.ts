import type { GameMap } from './content'

export interface Vec2 {
  x: number
  y: number
}

/**
 * Anything the collision resolver can move: the player, every enemy, and the boss.
 *
 * Size lives on the body rather than in a module constant because it is no longer
 * uniform. It used to be — every body was secretly `PLAYER_W x PLAYER_H`, which
 * was invisible while the only enemy was a recoloured player rig. A boss that is
 * visibly twice the player's size needs a collider to match, or the fight is
 * decided by a box the player cannot see: a player-sized collider slips under a
 * large sprite and lands hits that look like misses.
 */
export interface Body {
  /** Feet position: x is the horizontal centre, y is the bottom edge. */
  pos: Vec2
  vel: Vec2
  /** Collider width, centred on pos.x. */
  w: number
  /** Collider height, measured upwards from pos.y. */
  h: number
}

export interface PlayerState extends Body {
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
 * An enemy. `spawn` and `patrol` mirror the content definition and are carried
 * here so a tick needs no map lookup.
 */
export interface EnemyState extends Body {
  readonly id: string
  readonly roomId: string
  /** Where it started, and where it returns to on respawn. */
  readonly spawn: Vec2
  /** Tiles either side of spawn.x this enemy is allowed to walk. */
  readonly patrol: number
  dir: 1 | -1
  hp: number
  alive: boolean
  /** Ticks until it comes back. 0 while alive. */
  respawnTimer: number
  /** Ticks before it may be damaged again, so one swing is one hit. */
  hitCooldown: number
  /**
   * Attack countdown. 0 means not attacking; otherwise it counts down from
   * `attackTotal`, and the phase is the elapsed part of that span — see
   * `enemyAttackPhase`.
   */
  attackTimer: number
  /** Length of the attack currently in progress. 0 when idle. */
  attackTotal: number
  /** Ticks before it may commit to another attack. */
  attackCooldown: number
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
  /** Ticks the hurt pose shows for. Purely for the renderer. */
  hurtTimer: number
  /** Ticks remaining in the current swing. 0 means not attacking. */
  attackTimer: number
  /** Ticks until another attack is allowed. */
  attackCooldown: number
}
