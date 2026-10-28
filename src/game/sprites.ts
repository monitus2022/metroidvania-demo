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
  },
  footOrigin: 47 / 64,
  animations: {
    idle: { sheet: 'idle', start: 0, end: 7, frameRate: 8, repeat: -1 },
    run: { sheet: 'run', start: 0, end: 7, frameRate: 14, repeat: -1 },
    // The jump strip covers the whole arc and ends in a falling pose, so one
    // animation serves jump, fall and - per the human's instruction for this
    // stage - the double jump (restarted from frame 0).
    air: { sheet: 'jump', start: 0, end: 10, frameRate: 13, repeat: 0 },
  },
  xNudge: 0,
}

export const CURRENT: SpriteSet = WOMAN
