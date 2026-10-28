/**
 * Tuning constants. These are the *feel* knobs — the numbers a human owns and
 * no test can validate (see PLAN.md: "feel cannot be verified").
 * Kept in one file so the M3 taste checkpoint has a single place to look.
 */

export const TICK_HZ = 60
export const FIXED_DT = 1 / TICK_HZ

/** World units are pixels; tiles are 16px for now. */
export const TILE = 16

export const GRAVITY = 1800 // px/s^2
export const MAX_FALL = 620 // px/s

export const RUN_ACCEL = 1600 // px/s^2
export const RUN_MAX = 150 // px/s
export const GROUND_FRICTION = 2200 // px/s^2
export const AIR_FRICTION = 200 // px/s^2

export const JUMP_VELOCITY = -420 // px/s (negative is up)
