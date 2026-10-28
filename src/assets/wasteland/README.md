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

**Not vendored yet:** the main `TileSet_Wasteland.png` and the props
(`Objects.png`, `Chest-Sheet.png`, `Flag-Sheet.png`). The main tileset is an art
kit rather than an autotile sheet — connected-component analysis found **16
discrete pieces at arbitrary offsets** (y = 16, 22, 23, 64, 80, 98, 104, 112;
sizes such as 48x42, 47x35, 26x35), with only two single 16x16 tiles and no
inner-corner or cap pieces. `load.spritesheet(frameWidth: 16)` would slice it
into meaningless fragments; it needs explicit atlas rectangles, and it cannot
autotile the boolean terrain grid in `content/rooms.json`. Bring it in when the
room layouts have settled and there is a reason to hand-place pieces.
