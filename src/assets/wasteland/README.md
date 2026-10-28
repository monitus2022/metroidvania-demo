# Wasteland tileset — provenance and licence

Source: **"TileSet Wasteland" by Dreamir** — https://dreamir.itch.io/tileset-wasteland

Same author and same licence as the character sprites, so the palettes are meant
to sit together.

Licence, verbatim from the pack page:

> This asset pack can be used in both free and commercial projects. You can
> modify it to suit your own needs. Credit is not necessary, but appreciated.
> You may not redistribute it or resell it.

Same handling rule as the character art: using it in the game is allowed, but
**the raw pack must not be committed** — this repo is public and bundling the
pack is closer to "redistributing" than to "using it in a project". The
downloaded packs are listed in `.gitignore`; only the files the game actually
loads are vendored here.

## What is vendored, and why only this

`layers/` — all four parallax backgrounds (Background, Far-Mountains, Mountains,
Clouds), each **640x384**.

**Only two of the four are actually drawn**, and the reason is worth recording
because the pack's description is misleading. It says the backgrounds are
"layered and looped seamless for a parallax effect", but per-row alpha
measurement shows each layer is a **complete opaque scene, not a transparent
silhouette** — every one carries its own sky and becomes 100% opaque from its own
horizon down:

| Layer | Fully opaque from row |
|---|---|
| Background | 0 (pure sky) |
| Clouds | 96 |
| Far-Mountains | 128 |
| Mountains | 160 |

So stacking all four just paints the frontmost over the rest. The first attempt
did exactly that and rendered a flat blue field with no mountains. Only
`Background` + `Mountains` compose at a ~192px-tall room, because Mountains is
the one whose opaque band starts low enough to hide behind the terrain. See
`src/game/parallax.ts`.

`props/` — the flag (8 frames) and chest (6 frames) sheets.

`terrain/terrain.png` — a **32x32, two-frame extract** of the main
`TileSet_Wasteland.png`: the sand-capped ground surface and a flat dirt body
tile. See `src/game/terrain.ts` for exactly which windows of the source art
those are and why those windows were chosen.

**Not vendored:** the full `TileSet_Wasteland.png` and `Objects.png`. The main
tileset is an art kit rather than an autotile sheet — connected-component
analysis found **16 discrete pieces at arbitrary offsets** (y = 16, 22, 23, 64,
80, 98, 104, 112; sizes such as 48x42, 47x35, 26x35), with only two single 16x16
tiles and no inner-corner or cap pieces. `load.spritesheet(frameWidth: 16)` would
slice it into meaningless fragments.

It happens to be enough for this demo anyway, because every solid mass in
`content/rooms.json` is exactly two tiles thick with a flat top: one crust row
plus one dirt row is the whole requirement. If rooms later need slopes,
one-tile shelves or inner corners, those pieces exist (the two 32x32 slopes at
y=64, the 16x24 slopes at y=104) but each needs its own explicit frame and a
rule for when to use it.

Worth knowing: piece 3 is a **ladder**, and `Objects.png` is a 27-piece atlas of
trees, bushes and stones. Both are unwired.
