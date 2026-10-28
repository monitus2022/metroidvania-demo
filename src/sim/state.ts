import type { GameMap } from './content'

export interface Vec2 {
  x: number
  y: number
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
}
