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

### M0 — Harness
Vite + TS + Phaser scaffold; one `npm test` running Vitest **and** Playwright.
- [ ] `npm test` green from a clean clone
- [ ] A trivial sim test passes
- [ ] An e2e test boots the *built* bundle, sends a key event, writes a screenshot artifact
- **Evidence:** `npm test` output + screenshot path

### M1 — Sim core
Fixed-step loop, tile-grid AABB collision, input bitmask, seeded RNG.
- [ ] Scripted-input unit tests: hold-right+jump clears a 4-tile gap; walking into a wall stops cleanly
- [ ] Replay determinism: same input bitmask twice ⇒ identical final state hash
- [ ] Fuzzer: 10k random input streams, no tunneling, no stuck-in-geometry, no out-of-bounds
- **Evidence:** test output + the state hash

### M2 — Content as data + solver
`content/rooms.json`, `content/gates.json`; Node reachability solver.
- [ ] Solver proves the stub map beatable, every gate has a key, no reachable softlock
- [ ] Negative tests *fail as expected*: unkeyed gate, unreachable exit
- **Evidence:** solver output on the stub + the two negative cases

### M3 — Playable stub  ← first human feel checkpoint
3 rooms, movement, one ability gate (double jump), camera, respawn.
- [ ] Playwright drives real keys through a full route to the exit
- [ ] Agent vision review of screenshots: no invisible platforms, no camera occlusion
- [ ] **Human:** does the jump feel right?
- **Evidence:** route test output + screenshots + human verdict

### M4 — Scale
8–10 rooms, enemies, a boss.
- [ ] Solver green, fuzzer green on all rooms
- [ ] Simulated completion time ~5 minutes
- **Evidence:** solver + fuzz output, route timing

### M5 — Ship
Static deploy, live link, saves.
- [ ] Deployed URL boots in headless Chromium and passes the route test
- [ ] CI green on the deploy
- **Evidence:** live URL + CI run

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
