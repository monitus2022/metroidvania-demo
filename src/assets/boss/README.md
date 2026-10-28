# Boss sprites — NightBorne

## What this is

`NightBorne*.png` are the five animation strips the game loads, sliced out of
**CreativeKind's `NightBorne` sheet** (the free "NightBorne Warrior" pack). They
are the arena boss in the `summit` room.

Regenerate at any time:

```
python3 tools/extract-boss.py
```

The tool is stdlib-only (zlib for the IDAT stream — no imaging dependency), and
was verified to reproduce these exact files byte-for-byte.

## Licence

> Use in commercial or non-commercial projects and modification are both
> allowed. **It is prohibited to distribute or resell this asset.**

No credit is required, though this README records the source anyway:

- Author: CreativeKind
- Pack: NightBorne (the free "NightBorne Warrior" variant)

The downloaded pack sits in the repo as `NightBorne/` and is **gitignored**.
This repo is public, and publishing the pack files is the one thing the licence
forbids — so only the five strips the game actually loads are tracked here, under
`src/assets/boss/`. Do not commit the pack directory.

That rule already failed once: `git add -A` swept the whole pack into a commit
which reached `main`. `tests/unit/tracked-files.test.ts` now fails the build if
anything outside the expected directories is tracked, whatever it is called.

## The sheet, measured

The source is **1840x400 = 23x5 cells of 80x80**. The rows are, in order, idle /
run / attack / hurt / death, and the populated-cell count in each row matches the
author's published frame counts exactly — which is why the row order is known
rather than guessed. `tools/extract-boss.py` asserts all five on every run:

| Row | Animation | Frames | Published |
|---|---|---|---|
| 0 | idle | 9 | 9 |
| 1 | run | 6 | 6 |
| 2 | attack | 12 | 12 |
| 3 | hurt | 5 | 5 |
| 4 | death | 23 | 23 |

Two measurement traps worth keeping in mind if this is ever redone:

- **The death strip dissolves.** Its last two frames are down to 41 and 6 opaque
  pixels. Counting cells above an ink threshold reports 21 against a published
  23 and sends you hunting a layout bug that is not there. Count *any* ink.
- **The feet row differs per animation** — 63 in idle/run/hurt, but the ink
  reaches row 69 in attack and 77 in death. Those deeper rows are slash and
  dissolve *effects*, not feet; the character's own foot line is 63 in every
  strip. Anchoring to the per-row lowest ink would sink the sprite. All five
  strips therefore use `footOrigin = 64/80 = 0.8`.

The art is also **not centred in its cell**: the ink's horizontal centre is
35.5–37.5 of 80 rather than 40, hence `xNudge` in `src/game/sprites.ts`.

## Why 2x

The ink is 25–32px tall in an 80px cell — essentially **player-sized** (the player
is ~27px of ink). The pack is literally named "NightBorne *Warrior*", and at 1:1
it reads as a rival duelist rather than something you keep your distance from.

So it renders at **integer 2x**, giving ~60px of ink against the player's ~27px.
Integer rather than 1.5x because fractional scaling breaks pixel art. The scale
lives on the sim's archetype (`ARCHETYPES.nightborne.scale`), not in the sprite
table, so the collider and the sprite cannot disagree — a 24x48 collider on a
sprite drawn at 1x would mean hits landing where the art is not.

## Behaviour

One archetype, `nightborne`, sharing the husk's combat machinery with three
differences that are the whole point:

- **Four hits, not one.** `BOSS_HP = 4` against the husk's 1. A fight, not a chore.
- **It comes to you.** Within `BOSS_AGGRO` (140px) it walks at the player at
  70 px/s instead of patrolling. Outside that it returns to its patrol bounds, so
  it does not charge across the arena before you arrive. It stops at a ledge
  rather than turning — turning would flip its facing every tick, because the
  chase re-aims on the next one.
- **It stays dead.** `respawns: false`. Note that this is decided by the
  archetype and *not* by `respawnTimer`: writing "no respawn" as a timer of 0 is
  the same state as "due to respawn now", so the boss used to come back on the
  next tick — healed to the husk's 1 HP, which made it look invincible after
  three hits instead of dead after four. There is a test for the permanence now.

Slower than the player on purpose (70 against 130), so disengaging always works.

## The arena

It stands in the `summit`, between the entry and the goal. The flag sits on a
one-tile plinth at the far end, which is what stops the player simply walking
along the floor to it — they have to step up, and the boss has no jump, so
standing on the plinth is a safe spot. That is also the honest answer to "how
does a player who does not want to fight get through": outrun it and climb.

The room is deliberately **flat**. The boss is 48px tall and 3 tiles wide, so any
platform low enough to be useful would wedge it — the same headroom trap as the
player's ledge bug, one body size up.

## What is not verified

The solver cannot see combat. `summit` is reported in its `unverified` list with
its own wording ("holds a boss ... winning the fight is not"), because "the
player can reach that tile" is a weaker claim there than for a husk in a corridor.

What is checked:

- `tests/unit/boss.test.ts` — the box (2x the player), four hits to kill, one hit
  not killing it, staying dead, the chase closing distance, the patrol fallback,
  the ledge stop, and the husk still respawning.
- `tests/unit/solver.test.ts` — the boss reported as outside the movement model,
  and an enemy whose *whole body* (not just its spawn cell) is buried in terrain
  being rejected.
- `tests/unit/route.test.ts` — the reference playthrough walks the arena, takes a
  hit, and finishes, which is what sets the critical-path health floor.

None of that says whether the fight is *good*. Four hits, 70 px/s and 140px of
notice range are feel choices and belong to a human.
