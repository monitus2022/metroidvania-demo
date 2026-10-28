import {
  AIR_ACCEL_FACTOR,
  AIR_FRICTION,
  COYOTE_TIME,
  FIXED_DT,
  GRAVITY,
  GROUND_FRICTION,
  JUMP_BUFFER,
  JUMP_RELEASE_SPEED,
  JUMP_VELOCITY,
  MAX_FALL,
  RUN_ACCEL,
  RUN_MAX,
} from './constants'
import { moveX, moveY } from './collision'
import { BTN, axisX, held, type InputMask } from './input'
import type { WorldState } from './state'
import type { TileGrid } from './tiles'

export function createInitialState(level: TileGrid, seed = 1234): WorldState {
  return {
    level,
    player: {
      pos: { x: level.spawn.x, y: level.spawn.y },
      vel: { x: 0, y: 0 },
      onGround: true,
      facing: 1,
      // Grant coyote time immediately, so a jump on frame 1 works.
      coyoteTimer: COYOTE_TIME,
      jumpBufferTimer: 0,
    },
    tick: 0,
    rngSeed: seed,
    prevInput: 0,
  }
}

/**
 * The pure step function — the load-bearing abstraction of this repo.
 *
 * No DOM, no engine imports, no globals, no wall-clock time. Given the same
 * state and input it must return the same state, every time, on every machine.
 */
export function step(state: WorldState, input: InputMask, dt: number = FIXED_DT): WorldState {
  const p = state.player
  const next: WorldState = {
    ...state,
    tick: state.tick + 1,
    prevInput: input,
    player: {
      pos: { x: p.pos.x, y: p.pos.y },
      vel: { x: p.vel.x, y: p.vel.y },
      onGround: p.onGround,
      facing: p.facing,
      coyoteTimer: p.coyoteTimer,
      jumpBufferTimer: p.jumpBufferTimer,
    },
  }
  const pl = next.player

  const jumpHeld = held(input, BTN.JUMP)
  const jumpPressed = jumpHeld && !held(state.prevInput, BTN.JUMP)

  // Jump buffering: remember a press that arrived slightly too early.
  pl.jumpBufferTimer = jumpPressed ? JUMP_BUFFER : Math.max(0, pl.jumpBufferTimer - dt)

  // --- horizontal ---
  const dir = axisX(input)
  if (dir !== 0) {
    const accel = pl.onGround ? RUN_ACCEL : RUN_ACCEL * AIR_ACCEL_FACTOR
    pl.vel.x += dir * accel * dt
    pl.facing = dir
  } else {
    const friction = (pl.onGround ? GROUND_FRICTION : AIR_FRICTION) * dt
    if (Math.abs(pl.vel.x) <= friction) pl.vel.x = 0
    else pl.vel.x -= Math.sign(pl.vel.x) * friction
  }
  pl.vel.x = Math.max(-RUN_MAX, Math.min(RUN_MAX, pl.vel.x))

  // --- jump (buffered press + coyote grace) ---
  if (pl.jumpBufferTimer > 0 && pl.coyoteTimer > 0) {
    pl.vel.y = JUMP_VELOCITY
    pl.onGround = false
    pl.coyoteTimer = 0
    pl.jumpBufferTimer = 0
  }

  // Variable jump height: releasing early clips the rise.
  if (!jumpHeld && pl.vel.y < -JUMP_RELEASE_SPEED) pl.vel.y = -JUMP_RELEASE_SPEED

  // --- gravity ---
  pl.vel.y = Math.min(MAX_FALL, pl.vel.y + GRAVITY * dt)

  // --- integrate with collision ---
  moveX(pl, next.level, pl.vel.x * dt)
  pl.onGround = moveY(pl, next.level, pl.vel.y * dt)

  // --- coyote grace ---
  pl.coyoteTimer = pl.onGround ? COYOTE_TIME : Math.max(0, pl.coyoteTimer - dt)

  return next
}

/** Advance `ticks` steps with a constant input mask. */
export function run(state: WorldState, input: InputMask, ticks: number, dt = FIXED_DT): WorldState {
  let s = state
  for (let i = 0; i < ticks; i++) s = step(s, input, dt)
  return s
}
