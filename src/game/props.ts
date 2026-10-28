import chestSheet from '../assets/wasteland/props/Chest-Sheet.png'
import flagSheet from '../assets/wasteland/props/Flag-Sheet.png'

/**
 * How each prop kind is drawn. Kept separate from `src/sim/content.ts` so the
 * sim layer knows prop *kinds* as data without ever importing an image.
 *
 * Both sheets are uniform 32x32 cells, measured from the source art:
 *
 *   Flag-Sheet   8 frames — the pole sits at x 11..13 and its base at y 30, so
 *                the origin is offset to put the pole foot on the ground line
 *                and let the banner wave to the right of the placement point.
 *   Chest-Sheet  6 frames — a lid-opening sequence, not an idle loop. Drawn
 *                statically at frame 0 (closed); looping it would look like the
 *                chest repeatedly slamming itself shut.
 *
 * `Objects.png` (trees, bushes, stones) is deliberately not wired yet: it is a
 * 27-piece atlas at arbitrary offsets and sizes, so it needs per-piece rectangles
 * and a decision about which pieces are ground props. Flag and chest are clean
 * uniform sheets.
 */
export interface PropStyle {
  readonly url: string
  readonly frameWidth: number
  readonly frameHeight: number
  readonly frames: number
  /** 0 means static: draw frame 0 and never animate. */
  readonly frameRate: number
  readonly originX: number
  readonly originY: number
}

export const PROP_STYLES: Readonly<Record<string, PropStyle>> = {
  flag: {
    url: flagSheet,
    frameWidth: 32,
    frameHeight: 32,
    frames: 8,
    frameRate: 9,
    originX: 12 / 32,
    originY: 30 / 32,
  },
  chest: {
    url: chestSheet,
    frameWidth: 32,
    frameHeight: 32,
    frames: 6,
    frameRate: 0,
    originX: 0.5,
    originY: 30 / 32,
  },
}
