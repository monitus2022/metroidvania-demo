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

## Not done yet

These are **art only**. There is no enemy behaviour: no sim entity, AI, hitbox,
damage, death handling, or respawn, and no room places one. The sheet set
(Idle, Walk, Attack1, Hit, Death) is the minimum an enemy needs, and it is ready
for that work.

Worth knowing before wiring it: an enemy that blocks a corridor changes the map's
reachability, and the solver models only the player's movement. Enemy placement
is therefore unverified — a room the solver calls beatable could be one the
player cannot get past.
