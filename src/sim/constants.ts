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

/**
 * Wall climbing (granted by the `wallClimb` ability).
 *
 * While airborne and pressing into a wall the player clings: gravity is skipped
 * entirely, so these two numbers are the whole vertical behaviour. Holding jump
 * climbs up; otherwise the player slides down slowly rather than dropping.
 *
 * Deliberately slower than a jump — a climb should feel like work, and it keeps
 * a wall from being a free substitute for the double jump.
 */
export const WALL_CLIMB_SPEED = 90 // px/s upward while holding jump on a wall
export const WALL_SLIDE_SPEED = 55 // px/s downward while clinging and not climbing

/** Grace period after walking off a ledge during which a jump still counts. */
export const COYOTE_TIME = 0.1 // s

/** A jump pressed this long before landing still fires on landing. */
export const JUMP_BUFFER = 0.12 // s

/** Releasing jump early clamps upward speed to this, giving variable height. */
export const JUMP_RELEASE_SPEED = 110 // px/s

/* ------------------------------------------------------------------ combat --
 *
 * Combat is deliberately small: one melee verb, one enemy type. The point is
 * that damage, death and respawn are *deterministic*, so they can be tested,
 * while difficulty is not and has to be a human judgement.
 */

export const PLAYER_MAX_HP = 3

/** Ticks of invulnerability after taking a hit, so one touch is one hit. */
export const PLAYER_INVULN_TICKS = 90 // 1.5s

/** Ticks the attack hitbox is live. Press-edge only: holding does not spam. */
export const ATTACK_TICKS = 12
export const ATTACK_COOLDOWN_TICKS = 24
/** How far in front of the player the swing reaches. */
export const ATTACK_REACH = 16

/**
 * One hit. Deliberate: two made clearing an enemy a chore, and it interacted
 * badly with the immunity below — see the note there.
 */
export const ENEMY_HP = 1
/** Patrol speed. Slower than the player, so walking away always works. */
export const ENEMY_SPEED = 40 // px/s
/** Ticks before a killed enemy comes back, so a cleared room does not stay empty. */
export const ENEMY_RESPAWN_TICKS = 240 // 4s
/**
 * Ticks an enemy cannot be damaged again, so one swing is one hit.
 *
 * Must not exceed ATTACK_COOLDOWN_TICKS. It was 30 against a 24-tick cooldown,
 * which meant a player mashing attack had every second swing silently absorbed —
 * no hit, no feedback, no way to tell why the enemy was not dying. With one hit
 * point that cannot happen, but the two numbers are pinned together by a test so
 * raising enemy health later fails loudly instead of quietly reintroducing it.
 */
export const ENEMY_HIT_COOLDOWN = ATTACK_TICKS

/*
 * Enemy attacks are telegraphed. The first version damaged the player on contact
 * with no warning at all, which is the classic cheap hit: every test passed and
 * the fight still felt unfair, because nothing on screen said a hit was coming.
 *
 * An attack is now three phases, and only the middle one can hurt:
 *
 *   windup   the enemy stops, faces you and winds up — the readable part
 *   active   the hitbox is live
 *   recover  committed, cannot immediately swing again
 */

export const ENEMY_WINDUP_TICKS = 20 // 0.33s of visible telegraph
export const ENEMY_ACTIVE_TICKS = 10
export const ENEMY_RECOVER_TICKS = 26
/** Ticks after recovering before it may commit again. */
export const ENEMY_ATTACK_COOLDOWN = 30
/**
 * Horizontal distance at which an enemy commits to a swing.
 *
 * Deliberately wider than its actual reach. The two characters' art is much
 * wider than their 12px colliders, so when an enemy commits from just inside its
 * reach the sprites overlap and the wind-up pose is half-hidden — which defeats
 * the point of telegraphing. It commits from farther out and covers the gap with
 * the lunge below.
 */
export const ENEMY_ATTACK_RANGE = 34
/**
 * Forward speed while the hitbox is live. Zero during the wind-up, so the
 * telegraph reads as a wind-up rather than a walk.
 */
export const ENEMY_LUNGE_SPEED = 120 // px/s
/** Vertical tolerance, so it does not swing at a player on another ledge. */
export const ENEMY_ATTACK_HEIGHT = 20
/** How far in front of the enemy the swing reaches. */
export const ENEMY_ATTACK_REACH = 18

/** Ticks the player's hurt pose shows for. */
export const PLAYER_HURT_TICKS = 20
/** Knockback applied on taking a hit, away from the attacker. */
export const PLAYER_KNOCKBACK_X = 95 // px/s
export const PLAYER_KNOCKBACK_Y = -155 // px/s
