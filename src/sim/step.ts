import {
  AIR_FRICTION,
  FIXED_DT,
  GRAVITY,
  GROUND_FRICTION,
  JUMP_VELOCITY,
  MAX_FALL,
  RUN_ACCEL,
  RUN_MAX,
  TILE,
} from './constants'
import { BTN, axisX, held, type InputMask } from './input'
import type { WorldState } from './state'

/**
 * M0 world: one flat floor, no solids yet. Tile-grid collision arrives in M1;
 * this exists so the harness has something real to boot and assert against.
 */
export const WORLD_W = 20 * TILE // 320
export const WORLD_H = 11 * TILE // 176
export const FLOOR_Y = 10 * TILE // 160 — player's feet rest here

export function createInitialState(seed = 1234): WorldState {
  return {
    player: {
      pos: { x: 3 * TILE, y: FLOOR_Y },
      vel: { x: 0, y: 0 },
      onGround: true,
      facing: 1,
    },
    tick: 0,
    rngSeed: seed,
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
    player: {
      pos: { x: p.pos.x, y: p.pos.y },
      vel: { x: p.vel.x, y: p.vel.y },
      onGround: p.onGround,
      facing: p.facing,
    },
  }
  const pl = next.player

  // --- horizontal ---
  const dir = axisX(input)
  if (dir !== 0) {
    const accel = pl.onGround ? RUN_ACCEL : RUN_ACCEL * 0.75
    pl.vel.x += dir * accel * dt
    pl.facing = dir
  } else {
    const friction = (pl.onGround ? GROUND_FRICTION : AIR_FRICTION) * dt
    if (Math.abs(pl.vel.x) <= friction) pl.vel.x = 0
    else pl.vel.x -= Math.sign(pl.vel.x) * friction
  }
  pl.vel.x = Math.max(-RUN_MAX, Math.min(RUN_MAX, pl.vel.x))

  // --- jump ---
  if (held(input, BTN.JUMP) && pl.onGround) {
    pl.vel.y = JUMP_VELOCITY
    pl.onGround = false
  }

  // --- gravity ---
  pl.vel.y = Math.min(MAX_FALL, pl.vel.y + GRAVITY * dt)

  // --- integrate + resolve ---
  pl.pos.x += pl.vel.x * dt
  pl.pos.y += pl.vel.y * dt

  if (pl.pos.x < 0) {
    pl.pos.x = 0
    pl.vel.x = 0
  } else if (pl.pos.x > WORLD_W) {
    pl.pos.x = WORLD_W
    pl.vel.x = 0
  }

  if (pl.pos.y >= FLOOR_Y) {
    pl.pos.y = FLOOR_Y
    pl.vel.y = 0
    pl.onGround = true
  } else {
    pl.onGround = false
  }

  return next
}
