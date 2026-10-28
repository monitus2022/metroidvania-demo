import bgMid from '../assets/wasteland/layers/Mountains.png'
import bgSky from '../assets/wasteland/layers/Background.png'

/**
 * Parallax background layers, back to front.
 *
 * Source: Dreamir's "TileSet Wasteland" (see ../assets/wasteland/README.md).
 *
 * ## Why only two of the four layers are used
 *
 * The pack ships four 640x384 layers and describes them as layered for parallax.
 * Measured per-row alpha says they are **complete opaque scenes, not transparent
 * silhouettes**: each one has its own sky and becomes 100% opaque from its own
 * horizon downward.
 *
 *   Background      100% opaque everywhere          (pure sky)
 *   Clouds          opaque from y=96
 *   Far-Mountains   opaque from y=128
 *   Mountains       opaque from y=160
 *
 * Stacking all four therefore just paints the frontmost one over the others —
 * which is exactly what the first attempt rendered: a flat blue field with no
 * mountains at all. Only the two below compose correctly, because Mountains is
 * the one whose opaque band begins low enough to hide behind the terrain.
 *
 * `opaqueFrom` is the texture row at which the layer stops being transparent.
 * It is aligned to the room's floor line so the flat band ends up behind the
 * floor rather than across the middle of the screen. That works while rooms are
 * ~192px tall; a much taller room will need the band handled differently.
 */
export interface ParallaxLayer {
  readonly key: string
  readonly url: string
  /** Fraction of camera scroll the layer follows. Smaller reads as further. */
  readonly factor: number
  /** Texture row where this layer becomes fully opaque. */
  readonly opaqueFrom: number
}

export const PARALLAX: readonly ParallaxLayer[] = [
  { key: 'wasteland-sky', url: bgSky, factor: 0.08, opaqueFrom: 0 },
  { key: 'wasteland-mid', url: bgMid, factor: 0.3, opaqueFrom: 160 },
]
