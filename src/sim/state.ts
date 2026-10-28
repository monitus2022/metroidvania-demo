export interface Vec2 {
  x: number
  y: number
}

export interface PlayerState {
  /** Feet position, not sprite centre. Sprite offset is a render concern. */
  pos: Vec2
  vel: Vec2
  onGround: boolean
  facing: 1 | -1
}

export interface WorldState {
  player: PlayerState
  /** Fixed-step counter. Doubles as the replay frame index. */
  tick: number
  rngSeed: number
}
