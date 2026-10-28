/**
 * Tuning constants. These are the *feel* knobs — the numbers a human owns and
 * no test can validate (see PLAN.md: "feel cannot be verified").
 * Kept in one file so the M3 taste checkpoint has a single place to look.
 *
 * The values below were chosen so a 4-tile gap is clearable with margin
 * (see tests/unit/gap.test.ts). They are a starting point, not a decision.
 */

export const TICK_HZ = 60
export const FIXED_DT = 1 / TICK_HZ

/** Tiles are 16px. */
export const TILE = 16

export const PLAYER_W = 12
export const PLAYER_H = 16

/** Longest distance the collision resolver will move in one sub-step. */
export const MAX_SUBSTEP = TILE / 2

export const GRAVITY = 1800 // px/s^2
export const MAX_FALL = 600 // px/s

export const RUN_ACCEL = 2000 // px/s^2
export const RUN_MAX = 220 // px/s
export const AIR_ACCEL_FACTOR = 0.75
export const GROUND_FRICTION = 2400 // px/s^2
export const AIR_FRICTION = 300 // px/s^2

export const JUMP_VELOCITY = -430 // px/s (negative is up)

/** Grace period after walking off a ledge during which a jump still counts. */
export const COYOTE_TIME = 0.1 // s

/** A jump pressed this long before landing still fires on landing. */
export const JUMP_BUFFER = 0.12 // s

/** Releasing jump early clamps upward speed to this, giving variable height. */
export const JUMP_RELEASE_SPEED = 130 // px/s
