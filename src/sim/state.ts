import type { TileGrid } from './tiles'

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
}

export interface WorldState {
  player: PlayerState
  /** Immutable level geometry. Carried in state so `step` needs no extra args. */
  level: TileGrid
  /** Fixed-step counter. Doubles as the replay frame index. */
  tick: number
  rngSeed: number
  /** Previous tick's input, needed to detect jump press edges. */
  prevInput: number
}
