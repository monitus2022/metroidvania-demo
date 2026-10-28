# Plan — metroidvania-demo

Working agreement between human and agent. Read this before starting any milestone.

## Division of labor

| Who | Owns |
|---|---|
| Human | Theme, art direction, level-design intent, **feel** (jump arc, pacing, fun), milestone approval |
| Agent | Stack, architecture, implementation, tests, harness, project scheduling, milestone reports |

**The boundary:** feel cannot be verified by any assertion. Logic, regressions, map validity,
and collision robustness can. Agents never sign off on feel; humans never have to bug-hunt.

## The one architectural rule

`src/sim/` exports `step(state, input, dt) -> state` — pure, no DOM, no engine imports.
Fixed timestep (1/60) with accumulator. Seeded PRNG (mulberry32). No `Date.now()` or
`requestAnimationFrame` inside the sim. Rendering is a read-only pass over sim state.

Rationale: Phaser's `HEADLESS` renderer skips canvas/WebGL but still requires the DOM. A pure
sim makes `step()` a plain function call in Vitest, gives byte-identical replay from a recorded
input bitmask, allows collision fuzzing in milliseconds, and lets the map solver run in plain
Node with no browser.

## Stack

- TypeScript + Vite
- Phaser 4 (MIT) for rendering, assets, audio, input binding, scenes, UI
- Vitest for sim/solver logic
- Playwright (headless Chromium) for the shipped build
- Content as plain JSON under `content/` — never an editor/scene format
- localStorage for saves; static hosting for the demo

## Milestones

Each milestone has **machine-checkable acceptance criteria**. A milestone is not complete
until its evidence is produced. Order is not negotiable: harness → sim → content → solver →
playable → scale → ship.

### M0 — Harness ✅
Vite + TS + Phaser scaffold; one `npm test` running Vitest **and** Playwright.
- [x] `npm test` green from a clean clone
- [x] A trivial sim test passes
- [x] An e2e test boots the *built* bundle, sends a key event, writes a screenshot artifact
- **Evidence:** clean clone at `98a3056`; 6 unit + 3 e2e. Vision review caught a canvas
  scaling bug (canvas sized pre-multiplied instead of at native world resolution) that every
  assertion passed through.

### M1 — Sim core ✅
Fixed-step loop, tile-grid AABB collision, input bitmask, seeded RNG.
- [x] Scripted-input unit tests: hold-right+jump clears a 4-tile gap; walking into a wall stops cleanly
- [x] Replay determinism: same input bitmask twice ⇒ identical final state hash
- [x] Fuzzer: 10k random streams per level, no tunnelling, no stuck-in-geometry, no out-of-bounds
- **Evidence:** clean clone at `e5a99bc`; 31 unit + 3 e2e. The gap test was rewritten twice
  before it meant anything — an endpoint-only assertion counted falling into the pit and
  climbing out as a success.

### M2 — Content as data + solver ✅
`content/rooms.json`, `content/gates.json`; Node reachability solver.
- [x] Solver proves the stub map beatable, every gate has a key, no reachable softlock
- [x] Negative tests *fail as expected*: unkeyed gate, unreachable exit
- **Evidence:** clean clone at `d3c7d7c`; 54 unit + 3 e2e; `npm run solve` reports OK.
  The anchor test caught the solver claiming a 3-tile jump the sim could only make 2 tiles of.

### M3 — Playable stub ✅ ← first human feel checkpoint
3 rooms, movement, one ability gate (double jump), camera, respawn.
- [x] Playwright drives real keys through a full route to the exit
- [x] Agent vision review of screenshots: no invisible platforms, no camera occlusion
- [x] **Human:** does the jump feel right? — **No, first pass.** Two defects reported:
      "overall movement is too fast" and "cannot go back to previous rooms". Both fixed
      (`be8bd16`); human verdict on the retune: **"it feels much better now"**.
- **Evidence:** clean clone at `be8bd16`; 75 unit + 7 e2e; route completes spawn→goal in
  335 ticks (5.6s). Vision review caught a collected item still being drawn.

### Recorded feel verdict (do not re-derive)

Approved tuning, after the human rejected the first pass as too fast:

| Knob | First pass (rejected) | Approved |
|---|---|---|
| `RUN_MAX` | 220 px/s | **130 px/s** |
| `RUN_ACCEL` | 2000 px/s² | **1200 px/s²** |
| `GRAVITY` | 1800 px/s² | **990 px/s²** |
| `JUMP_VELOCITY` | −430 px/s | **−330 px/s** |
| `MAX_FALL` | 600 px/s | **420 px/s** |

Measured envelope (from `tests/unit/anchor.test.ts`, which is the source of truth):

| | single jump | with `doubleJump` |
|---|---|---|
| rise | 3 tiles | 5 tiles |
| max gap crossed | 5 tiles | 8 tiles |

Fairness floor to hold for new content: a gap must have a **contiguous window of at least
10 frames** (~0.17s) of valid jump positions, or several tiles of slack. A pit that sits
exactly on the reach limit gives a window of one position and plays as pixel-perfect even
though it looks fine.

### M4 — Scale
8–10 rooms, enemies, a boss. **In progress.**

Built so far: 8 rooms (`atrium, gallery, shaft, overlook, cistern, foundry, ascent,
summit`), 2,080 tiles, 14 doors, 2 abilities (double jump, wall climb), 2 pickups,
3 enemies, 1 goal flag. Real art throughout: parallax backgrounds, tiled terrain, a
recoloured enemy, damage feedback.

- [x] Solver green on all rooms — beatable, `doubleJump` + `wallClimb` both required,
      14/14 doors usable in both directions, no softlocks
- [x] Fuzzer green — no tunnelling, no stuck-in-geometry over random input streams
- [x] **A scripted playthrough with real inputs finishes the shipped level** —
      spawn → goal in 1,104 ticks (18.4s), passing through every room in order
- [x] Enemies: patrol, telegraphed attack, one-hit death, respawn — all deterministic
- [ ] Every gap and ledge clears the fairness floor above, measured per gap.
      Measured for the unit fixtures (the 4-tile pit window is 33–45 frames) and the
      whole route is proven completable, but the window has **not** been measured
      individually for the new rooms' gaps and ledges.
- [ ] Simulated completion time ~5 minutes — **currently 18.4 seconds**, so this is
      still the real work. Content volume, not tooling, is the bottleneck: the
      pipeline would take 20 more rooms as happily as 8.
- [ ] A boss. Nothing exists yet.

**Evidence commands:** `npm run solve` · `npm test` · the route test prints its own
timing and the critical-path health floor.

**Measured, and worth a human decision — the route's health floor is 3/3.** Telegraphing
the enemies' attacks made a player who keeps moving take no damage at all. Fair and
readable, currently harmless. The dials are the lunge speed (120 px/s against your 130)
and the commit range (34px); pushing the lunge above your run speed would make a
committed attack genuinely threatening while keeping it dodgeable by crossing or jumping.

### M4.1 — Known gaps, ranked by what they move

1. **Content volume.** The only thing that turns this from a demo into a game. Target
   20+ rooms and a boss. Everything below is polish by comparison.
2. **Broader automated playtesting.** The route test is a *single scripted path*, and it
   is currently carrying a lot of weight — it is what caught both cases of rooms that were
   literally unplayable while every unit test passed. It says nothing about the 95% of
   play it does not touch. Randomised/beam-searched playthroughs, run **with enemies
   present**, would shrink that risk from one path to many.
3. **The boss.** Art is available (see below); the work is a body-size refactor, a boss
   entity with phases, an arena room, and a sealed-until-dead gate that goes in the
   solver's `unverified` list.
4. **Audio, title/win screens.** Cheapest possible jump in "this is a game".
5. **Visual debt:** no slopes; vertical faces are flat-cut (the tileset has no cap
   pieces); the sprite art is about twice the collider width, so characters overlap at
   fighting distance and the enemy's wind-up pose is partly hidden — the charge indicator
   is a workaround, not a fix.
6. **"Beatable" is a narrower claim than it sounds.** The solver verifies *movement*
   reachability. Since enemies can kill the player, rooms containing them are reported in
   `unverified` (shaft, foundry) rather than being verified passable.

### M4.2 — Boss candidate: NightBorne

`NightBorne/NightBorne.png`, CreativeKind's *NightBorne Warrior* (free). Verified against
the author's published frame counts, so the layout is known rather than guessed:

| Row | Animation | Frames | Published |
|---|---|---|---|
| 0 | idle | 9 | 9 ✅ |
| 1 | run | 6 | 6 ✅ |
| 2 | attack | 12 | 12 ✅ |
| 3 | hurt | 5 | 5 ✅ |
| 4 | death | 23 | 23 ✅ |

Sheet is 23×5 cells of **80×80**. Licence: use in commercial or non-commercial projects
and modification both allowed, **distribution or resale prohibited** — same clause as the
other packs, so the same rule applies: gitignored, and only the sheets actually loaded get
vendored under `src/assets/`.

Two findings that shape how it should be used:

- **It is the same scale as the player, not a hulk.** Ink height is 25–32px against the
  player's ~27px, and the pack is literally named "NightBorne *Warrior*". Used at 1:1 it
  reads as a rival duelist, not a boss. Integer 2× scaling is the natural fix — 80×80
  cells become 160×160, art ~60px tall (~2.2× the player), and 2× keeps pixel art crisp.
- **Purple/white against a warm brown wasteland is a high-contrast read**, which is what a
  boss needs. The risk is stylistic, not legibility: it is a different artist's dark-fantasy
  palette, and it may read as arriving from another game.
- It needs its own **body size**, which is currently a module constant (`PLAYER_W/H`), not
  a property of the `Body` interface. That refactor is the first real task, and it touches
  collision, the solver's model and every measured constant.

### M5 — Ship
Static deploy, live link, saves.
- [x] Deployed URL boots in headless Chromium and passes the checks
- [ ] CI green on the deploy (build succeeds; no CI workflow configured yet)
- [ ] Saves (localStorage) — not implemented
- **Evidence:** **https://metroidvania-demo.pages.dev** — verified by headless Chromium:
      HTTP 200, booted, no console errors, sim advancing ~57 fps, real key events moved
      the player, atrium → gallery → back to atrium, standing still on arrival did not
      bounce (the `DOOR_ARRIVAL_INSET` fix holds in production). Cache headers correct:
      `index.html` revalidates, the hashed asset is `immutable, max-age=31536000`.
      At that verification the deployed bundle matched `dev` HEAD (`9afcaf5`).
- [x] **Production carries M4** as of merge `e526ff9` (`dev` → `main`). Verified by
      headless Chromium against the live URL: boots with no console errors, sim advancing,
      real key events move the player (spawn `x=40` → `x=270.8`), 3 enemies in the state,
      and the M4 art is what renders — painted parallax layers, textured sand/dirt terrain
      rather than flat blocks, the character sprite, the chest prop, the HUD. Deployed
      bundle hash matches a local build of `main`.
- [ ] **The NightBorne pack is still reachable in `main`'s history** (commits `f36660d`
      and `1dfa836`). `main`'s tip no longer tracks it, but the blobs are retrievable, so
      the licence's no-redistribution clause is still not fully satisfied for the public
      repo. Next step: rewrite `main`'s history to drop those paths, or make the repo
      private, which removes the problem outright.
      Note for that rewrite: GitHub keeps old commits reachable through PR refs
      (`refs/pull/5/head`), so a force-push alone may not make the files unrecoverable.
- Deploy config is ready and verified in `DEPLOY.md`: Cloudflare Pages, build `npm run build`,
  output `dist`, `NODE_VERSION=24`. The artifact was verified booting from a deep subpath.
  Remaining work is the human authorising Cloudflare, then verifying the live URL.

## Approval protocol

At each milestone gate the agent stops and reports:

1. What changed (files, diff scope)
2. **Evidence** — actual command output, never a description of it
3. Anything the agent decided that the human might disagree with
4. What it would do next

Then it waits. No work on the next milestone until approved. If a milestone reveals that
earlier criteria were wrong, the agent says so and proposes an amendment rather than quietly
working around it.

## Autonomy limits (agent's own constraints, stated up front)

- **Turn-bounded.** Sustained multi-hour work needs background processes or a scheduled job;
  the agent does not wake on its own otherwise.
- **Context-bounded.** Long builds exhaust context and compression can lose detail. Durable
  state lives in files on disk (`PLAN.md`, and a milestone log the agent appends to) — not in
  conversation memory.
- **Cannot judge feel.** See the boundary above.
- **Must not fabricate verification.** Every "done" carries real command output. The human
  should demand it.
