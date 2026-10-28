/**
 * Tuning constants. These are the *feel* knobs — the numbers a human owns and
 * no test can validate (see PLAN.md: "feel cannot be verified").
 * Kept in one file so a taste checkpoint has a single place to look.
 *
 * Every number here is *measured* rather than asserted:
 * `tests/unit/anchor.test.ts` builds rooms with growing pits and ledges, runs
 * the real physics, and pins the solver's movement envelope beneath the result.
 * Changing a value here will change those measurements, which is the point.
 *
 * History: the first pass ran at RUN_MAX 220 px/s with GRAVITY 1800, and the
 * human verdict was "too fast". The retune below halves the walk speed and
 * makes the jump floatier — the horizontal reach lost by walking slower is paid
 * back in airtime — while keeping a single jump too short to clear the gallery
 * ledge, so the double-jump gate stays real.
 */

export const TICK_HZ = 60
export const FIXED_DT = 1 / TICK_HZ

/** Tiles are 16px. */
export const TILE = 16

export const PLAYER_W = 12

/**
 * Sized to the art, not to the tile grid.
 *
 * The character sprite is ~27px tall (measured from the source sheets), so a
 * 16px collider would let the head pass through ceilings the player can plainly
 * see. 24px is 1.5 tiles: the body collides, and the remaining ~3px is hair and
 * sword overhang, which is normal and reads correctly.
 *
 * Changing this re-derives the solver's movement envelope and the gap windows —
 * run `tests/unit/anchor.test.ts` afterwards and trust its numbers.
 */
export const PLAYER_H = 24

/** Longest distance the collision resolver will move in one sub-step. */
export const MAX_SUBSTEP = TILE / 2

export const GRAVITY = 990 // px/s^2 — floatier than the first pass (1800)
export const MAX_FALL = 420 // px/s

export const RUN_ACCEL = 1200 // px/s^2 — ramps in ~0.11s, not instant
export const RUN_MAX = 130 // px/s — crosses the 240px viewport in ~1.85s
export const AIR_ACCEL_FACTOR = 0.6
export const GROUND_FRICTION = 1400 // px/s^2
export const AIR_FRICTION = 200 // px/s^2

/** Rises ~55px (3 tiles). Deliberately less than the 4-tile gallery ledge. */
export const JUMP_VELOCITY = -330 // px/s (negative is up)

/** Impulse for the mid-air jump granted by the doubleJump ability. */
export const DOUBLE_JUMP_VELOCITY = -300

/** Extra jumps available mid-air once the doubleJump ability is held. */
export const MAX_AIR_JUMPS = 1

/**
 * Ticks during which door transitions are suppressed after arriving in a room.
 * A backstop only: the arrival inset below is what normally keeps the player
 * clear of the door they just came through.
 */
export const TRANSITION_LOCK_TICKS = 12

/**
 * Tiles a player is placed *inside* the room they arrive in, away from the door.
 *
 * Without this, arriving on a door's tile means standing inside the trigger for
 * the return door, which fires as soon as the lock expires — every two-way
 * transition becomes a bounce. Doors are two-way by default, so this is not an
 * edge case.
 */
export const DOOR_ARRIVAL_INSET = 3

/** The viewport. Smaller than a room, so the camera has something to do. */
export const VIEW_W = 15 * TILE // 240
export const VIEW_H = 10 * TILE // 160

/** Grace period after walking off a ledge during which a jump still counts. */
export const COYOTE_TIME = 0.1 // s

/** A jump pressed this long before landing still fires on landing. */
export const JUMP_BUFFER = 0.12 // s

/** Releasing jump early clamps upward speed to this, giving variable height. */
export const JUMP_RELEASE_SPEED = 110 // px/s
