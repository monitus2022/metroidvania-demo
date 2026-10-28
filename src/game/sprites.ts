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
 * Source: Dreamir's "Characters Pack" (free + commercial use, credit
 * appreciated, no redistribution of the pack itself). Only the sheets we
 * actually use are vendored here.
 *
 * Numbers below are measured from the PNGs, not assumed:
 *   - sheets are horizontal strips of uniform 80x64 frames (the *woman* sheets
 *     are 80 wide; the man's are 64 - do not copy one config to the other)
 *   - the character's opaque content sits at x 27..53 of each 80px cell, so the
 *     art is centred and origin x = 0.5 is correct
 *   - its feet rest at y = 47 of the 64px cell, with 16px of transparent
 *     padding underneath. Anchoring at origin y = 1 would float the character a
 *     full tile above the ground, which is why `footOrigin` exists.
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

export interface SpriteSet {
  readonly id: string
  readonly sheets: Readonly<Record<string, SheetDef>>
  /** Feet position as a fraction of frame height. */
  readonly footOrigin: number
  readonly animations: Readonly<Record<string, AnimDef>>
  /** Horizontal nudge in px, applied in the facing direction. */
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
    // animation serves jump, fall and - per the human's instruction for this
    // stage - the double jump (restarted from frame 0).
    air: { sheet: 'jump', start: 0, end: 10, frameRate: 13, repeat: 0 },
    // One swing. Plays once and holds, and syncView restarts it whenever the sim
    // says a new swing began.
    attack: { sheet: 'attack', start: 0, end: 6, frameRate: 18, repeat: 0 },
    // Two frames of recoil. Plays once and holds while the hurt timer runs.
    hit: { sheet: 'hit', start: 0, end: 1, frameRate: 9, repeat: 0 },
  },
  xNudge: 0,
}

/**
 * The recoloured WarriorMan used as the melee enemy.
 *
 * Measured separately from the woman's set, because the two are not
 * interchangeable: his frames are 64 wide, not 80. Ink sits at x 16..41 (idle)
 * and 21..39 (walk) of a 64px cell, so the art centre is ~29.5 rather than the
 * cell centre at 32 — without `xNudge` he stands ~2.5px left of his collider.
 * Feet rest at y 47 of 64, same padding trick as the woman's sheets.
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
  xNudge: 2.5,
}

/** Every sprite set the game loads. */
export const SPRITE_SETS: readonly SpriteSet[] = [WOMAN, ENEMY]

export const CURRENT: SpriteSet = WOMAN
