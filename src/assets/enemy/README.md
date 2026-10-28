# Enemy sprites — recoloured WarriorMan

## What this is

`WarriorMan*.png` are **Dreamir's `Characters PackV2/WarriorMan` sheets, recoloured
into a red "enraged" palette.** The pack ships no enemy art at all — only two
player characters — so rather than source a second artist's monsters (and inherit
a style clash), the second humanoid is reused as a melee enemy.

Regenerate at any time:

```
python3 tools/recolour-enemy.py
```

The tool is self-contained (stdlib `zlib` only) and was verified to reproduce
these exact files byte-for-byte.

## Licence

Same pack and terms as the character sprites — free and commercial use,
modification expressly permitted, credit appreciated, **no redistribution**:

> You may not redistribute it or resell it.

The downloaded pack is in `.gitignore`; only the recoloured sheets the game loads
are tracked here. Recolouring is a modification, which the licence allows.

## The palette

Hand-authored, not computed. The source is only 18 colours, and a luminance ramp
collapses the armour, cloth and skin tones into one flat red — the character
loses its shading. Each target preserves the source colour's relative luminance,
so the artist's shading structure survives.

Two measured constraints drove the numbers:

- **The ground is `#6e2727`, luminance 54.** Mid-tones left at that value sit at
  the same brightness as the dirt and separate only by hue, which is weak at
  16px. The mids were lifted to luminance ~65–90.
- **The outline stays near-black** so the silhouette still cuts against a dark
  red-brown background that the enemy stands on for whole rooms.

Scores against the terrain body, over the idle frame:

| Variant | Mean luminance delta | Pixels within 18 of ground | "Redness" |
|---|---|---|---|
| Ember (rejected) | +24.8 | 15% | 72.2 |
| Blood (rejected) | +12.9 | 25% | 70.1 |
| **This one** | **+25.8** | 22% | **84.7** |

Ember separated well but read orange, not red. Blood was properly red and sank
into the dirt. This is red at ember's brightness.

## Behaviour

Wired as of M4. One enemy type, `enraged`, with a deliberately small verb set:

- **Patrol** — walks `patrol` tiles either side of its spawn column and turns at
  walls, ledges and its patrol bounds. Ledges matter: an enemy that did not turn
  at them would walk off the platform it was placed on.
- **Contact damage** — touching the player costs one hit point, then the player
  gets 1.5s of invulnerability so a single collision is a single hit.
- **Hit and death** — two hits kill it; one swing is one hit (a per-enemy
  immunity window, or the 12-tick hitbox would deal 12 damage).
- **Respawn** — 4 seconds later, at its spawn.

Player: 3 hit points, 1.5s invulnerability, one melee verb on `X`, respawn at the
room entry on death. All of it lives in `src/sim/step.ts` and is deterministic.

## What this is not

The solver cannot see combat. It answers "can the player reach this tile", not
"can they survive the trip", so every room holding an enemy is reported in the
solver's `unverified` list — deliberately *not* a warning, because there is
nothing to fix and it must not fail a build.

The measurements that do exist:

- `tests/unit/enemy.test.ts` pins damage, invulnerability, the one-hit-per-swing
  rule, death, respawn and non-penetration.
- `tests/unit/route.test.ts` measures the **critical-path health floor**: the
  reference playthrough reaches the goal with 2 of 3 hit points left, so the
  placed enemies make the shortest route a fight rather than a wall.

What none of that proves is whether the fight is *good*: the numbers (3 HP, 40
px/s, 4s respawn) are feel choices and belong to a human.
