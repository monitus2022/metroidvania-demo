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
8–10 rooms, enemies, a boss.
- [ ] Solver green, fuzzer green on all rooms
- [ ] Every door has a return door; no room is a dead end by accident
- [ ] Every gap and ledge clears the fairness floor above (measured, not eyeballed)
- [ ] Simulated completion time ~5 minutes — currently 5.6 seconds, so this is the real work
- **Evidence:** solver + fuzz output, route timing, per-gap windows

### M5 — Ship
Static deploy, live link, saves.
- [ ] Deployed URL boots in headless Chromium and passes the route test
- [ ] CI green on the deploy
- **Evidence:** live URL + CI run
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
