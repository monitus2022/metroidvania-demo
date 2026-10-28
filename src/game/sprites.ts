import bossAttack from '../assets/boss/NightBorneAttack.png'
import bossDeath from '../assets/boss/NightBorneDeath.png'
import bossHurt from '../assets/boss/NightBorneHurt.png'
import bossIdle from '../assets/boss/NightBorneIdle.png'
import bossRun from '../assets/boss/NightBorneRun.png'
import enemyAttack from '../assets/enemy/WarriorManAttack1.png'
import enemyDeath from '../assets/enemy/WarriorManDeath.png'
import enemyHit from '../assets/enemy/WarriorManHit.png'
import enemyIdle from '../assets/enemy/WarriorManIdle.png'
import enemyWalk from '../assets/enemy/WarriorManWalk.png'
import womanAttack from '../assets/woman/WarriorWomanAttack1.png'
import womanHit from '../assets/woman/WarriorWomanHit.png'
import womanIdle from '../assets/woman/WarriorWomanIdle.png'
import womanJump from '../assets/woman/WarriorWomanJump.png'
import womanRun from '../assets/woman/WarriorWomanRun.png'

/**
 * Sprite configuration, kept as data so swapping art is a one-line change.
 *
 * Sources:
 *   - Dreamir's "Characters Pack" (free + commercial use, no redistribution)
 *     — the player and the recoloured enemy.
 *   - CreativeKind's "NightBorne" (same terms) — the boss.
 * Only the sheets actually loaded are vendored here.
 *
 * Numbers below are measured from the PNGs, not assumed:
 *   - the *woman* sheets are 80x64; the *man's* are 64x64; the boss is 80x80.
 *     Do not copy one config to another — sibling sheets in one pack are not
 *     guaranteed the same cell size.
 *   - feet rest at y = 47 of 64 for the two humanoids, and y = 63 of 80 for the
 *     boss. The padding underneath is different in every case, which is why
 *     `footOrigin` exists: anchoring at origin y = 1 floats the character a
 *     whole tile above the ground.
 *   - each sprite's ink is not centred in its cell, hence `xNudge`.
 */

export interface SheetDef {
  readonly url: string
  readonly frameWidth: number
  readonly frameHeight: number
}

export interface AnimDef {
  readonly sheet: string
  readonly start: number
  readonly end: number
  readonly frameRate: number
  /** -1 loops forever, 0 plays once and holds the final frame. */
  readonly repeat: number
}

/**
 * Which animation means what.
 *
 * The two packs name the same ideas differently — the husk has `walk` and `hit`,
 * the boss has `run` and `hurt` — so the renderer asks for a *role* and the set
 * says which strip plays it. Without this, adding the boss would have meant
 * branching on its id in the scene.
 */
export interface SpriteRoles {
  readonly idle: string
  /** Used while walking or running. */
  readonly move: string
  readonly attack: string
  readonly hurt: string
  /** Absent for the player, who has no death strip. */
  readonly death?: string
}

export interface SpriteSet {
  readonly id: string
  readonly sheets: Readonly<Record<string, SheetDef>>
  /** Feet position as a fraction of frame height. */
  readonly footOrigin: number
  readonly animations: Readonly<Record<string, AnimDef>>
  readonly roles: SpriteRoles
  /**
   * Horizontal nudge in *frame* pixels, applied in the facing direction.
   * Frame pixels, not world pixels: the scene multiplies by the archetype's
   * render scale, so a 2x boss gets 2x the nudge it needs.
   */
  readonly xNudge: number
}

export const WOMAN: SpriteSet = {
  id: 'woman',
  sheets: {
    idle: { url: womanIdle, frameWidth: 80, frameHeight: 64 },
    run: { url: womanRun, frameWidth: 80, frameHeight: 64 },
    jump: { url: womanJump, frameWidth: 80, frameHeight: 64 },
    attack: { url: womanAttack, frameWidth: 80, frameHeight: 64 },
    hit: { url: womanHit, frameWidth: 80, frameHeight: 64 },
  },
  footOrigin: 47 / 64,
  animations: {
    idle: { sheet: 'idle', start: 0, end: 7, frameRate: 8, repeat: -1 },
    run: { sheet: 'run', start: 0, end: 7, frameRate: 14, repeat: -1 },
    // The jump strip covers the whole arc and ends in a falling pose, so one
    // animation serves jump, fall and the double jump (restarted from frame 0).
    air: { sheet: 'jump', start: 0, end: 10, frameRate: 13, repeat: 0 },
    // One swing. Plays once and holds, and syncView restarts it whenever the sim
    // says a new swing began.
    attack: { sheet: 'attack', start: 0, end: 6, frameRate: 18, repeat: 0 },
    // Two frames of recoil. Plays once and holds while the hurt timer runs.
    hit: { sheet: 'hit', start: 0, end: 1, frameRate: 9, repeat: 0 },
  },
  roles: { idle: 'idle', move: 'run', attack: 'attack', hurt: 'hit' },
  xNudge: 0,
}

/**
 * The recoloured WarriorMan used as the melee enemy.
 *
 * Measured separately from the woman's set: his frames are 64 wide, not 80. Ink
 * sits at x 16..41 (idle) and 21..39 (walk) of a 64px cell, so the art centre is
 * ~29.5 rather than the cell centre at 32.
 */
export const ENEMY: SpriteSet = {
  id: 'enemy',
  sheets: {
    idle: { url: enemyIdle, frameWidth: 64, frameHeight: 64 },
    walk: { url: enemyWalk, frameWidth: 64, frameHeight: 64 },
    attack: { url: enemyAttack, frameWidth: 64, frameHeight: 64 },
    hit: { url: enemyHit, frameWidth: 64, frameHeight: 64 },
    death: { url: enemyDeath, frameWidth: 64, frameHeight: 64 },
  },
  footOrigin: 48 / 64,
  animations: {
    idle: { sheet: 'idle', start: 0, end: 7, frameRate: 6, repeat: -1 },
    walk: { sheet: 'walk', start: 0, end: 7, frameRate: 8, repeat: -1 },
    attack: { sheet: 'attack', start: 0, end: 6, frameRate: 12, repeat: 0 },
    hit: { sheet: 'hit', start: 0, end: 1, frameRate: 12, repeat: 0 },
    // 7 frames, played once. The scene hides the corpse on animationcomplete
    // rather than leaving a pile of dead bodies standing around.
    death: { sheet: 'death', start: 0, end: 6, frameRate: 10, repeat: 0 },
  },
  roles: { idle: 'idle', move: 'walk', attack: 'attack', hurt: 'hit', death: 'death' },
  xNudge: 2.5,
}

/**
 * The boss: CreativeKind's NightBorne, a 23x5 sheet of 80x80 cells.
 *
 * The row order (idle 9, run 6, attack 12, hurt 5, death 23) is not guessed —
 * the populated-cell count in each row matches the author's published frame
 * counts exactly, and the strip slicer asserts it.
 *
 * Two things worth knowing before adjusting anything here:
 *   - the art is essentially player-sized (25-32px of ink in an 80px cell), so
 *     it reads as a rival, not a boss, until the archetype's 2x render scale is
 *     applied. The scale lives on the archetype, not here: the collider and the
 *     sprite must not be able to disagree.
 *   - the death strip ends in a dissolve — 23 frames tapering to six opaque
 *     pixels — so it plays all the way out rather than snapping to the last one.
 */
export const BOSS: SpriteSet = {
  id: 'boss',
  sheets: {
    idle: { url: bossIdle, frameWidth: 80, frameHeight: 80 },
    run: { url: bossRun, frameWidth: 80, frameHeight: 80 },
    attack: { url: bossAttack, frameWidth: 80, frameHeight: 80 },
    hurt: { url: bossHurt, frameWidth: 80, frameHeight: 80 },
    death: { url: bossDeath, frameWidth: 80, frameHeight: 80 },
  },
  footOrigin: 64 / 80,
  animations: {
    idle: { sheet: 'idle', start: 0, end: 8, frameRate: 7, repeat: -1 },
    run: { sheet: 'run', start: 0, end: 5, frameRate: 10, repeat: -1 },
    attack: { sheet: 'attack', start: 0, end: 11, frameRate: 16, repeat: 0 },
    hurt: { sheet: 'hurt', start: 0, end: 4, frameRate: 12, repeat: 0 },
    death: { sheet: 'death', start: 0, end: 22, frameRate: 14, repeat: 0 },
  },
  roles: { idle: 'idle', move: 'run', attack: 'attack', hurt: 'hurt', death: 'death' },
  xNudge: 3.5,
}

/** Every sprite set the game loads. */
export const SPRITE_SETS: readonly SpriteSet[] = [WOMAN, ENEMY, BOSS]

export const CURRENT: SpriteSet = WOMAN

/**
 * Which sprite set draws a given archetype kind.
 *
 * Keyed by the sim's `kind`, so content and art cannot drift: a `nightborne` in
 * rooms.json is a NightBorne on screen, and an unknown kind falls back to the
 * husk rather than rendering nothing.
 */
const BY_KIND: Readonly<Record<string, SpriteSet>> = {
  enraged: ENEMY,
  nightborne: BOSS,
}

export function spriteSetFor(kind: string): SpriteSet {
  return BY_KIND[kind] ?? ENEMY
}
