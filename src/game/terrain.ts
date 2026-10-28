import terrainAtlas from '../assets/wasteland/terrain/terrain.png'

/**
 * Terrain tiles cut out of Dreamir's "TileSet Wasteland".
 *
 * The pack is an art kit, not an autotile sheet: 16 hand-placed pieces, only two
 * of them single 16x16 tiles, and no inner-corner or cap variants. But the demo's
 * terrain only ever needs two things, because every solid mass in `rooms.json` is
 * exactly two tiles thick with a flat top:
 *
 *   surface  the sand-capped crust — one row, on any solid cell with air above it
 *   body     the flat dirt underneath
 *
 * `terrain.png` is a purpose-built 32x32 atlas holding just those two frames,
 * rather than the whole 352x144 sheet. Two reasons: the licence forbids
 * redistributing the pack (see ../assets/wasteland/README.md), and the pieces we
 * don't draw are dead bytes in the bundle.
 *
 * How the windows were chosen, because it is not obvious from the art:
 *
 * - The surface cap is piece 1 (48x42 at 128,16), whose top 16 rows run
 *   bright sand (230,144,78) -> lit sand (251,185,84) -> mid crust (205,104,61)
 *   -> dark dirt (110,39,39). Its outer columns are ragged and partly
 *   transparent, so the frame is a *fully opaque* 32px window found at x=136 —
 *   tiling a ragged edge would punch holes in the ground.
 * - The body is the flattest 16x16 window inside the 2x2 block. It is a single
 *   colour, which is why the interior of the art is also used as the fill colour
 *   below: the surface frame's bottom row is that same colour, so the two join
 *   with no seam.
 *
 * Both frames tile horizontally without a visible seam; the surface pattern
 * repeats every 2 tiles.
 */
export const TERRAIN = {
  key: 'wasteland-terrain',
  url: terrainAtlas,
  frames: {
    surface: { x: 0, y: 0, width: 32, height: 16 },
    body: { x: 0, y: 16, width: 16, height: 16 },
  },
  /** Sampled from the body window — the source art's interior is one colour. */
  bodyColor: 0x6e2727,
} as const
