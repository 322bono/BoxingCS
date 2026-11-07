# Online fairness and publication implementation plan

> **For agentic workers:** Use superpowers:executing-plans; implement inline and request one final independent review.

**Goal:** Keep host privileges out of combat and prevent seat order, cold model loading, or replayed network inputs from giving a player an unfair start.

**Architecture:** Keep the existing authoritative 30 Hz Node server. Resolve movement from the same starting positions and defer received combat rewards until both attacks resolve. Add a server-owned per-bout synchronization epoch: both active fighters acknowledge model readiness before the common countdown advances. A new epoch on reconnection invalidates old inputs.

**Tech stack:** Existing TypeScript, Three.js, Socket.IO, Node test runner and Playwright; no new dependencies or paid assets.

**Spec:** User request: publish and ensure the room host receives no Internet/host advantage. Continue without design approval, as previously authorized.

## Global constraints

- No client-provided health, damage, clock, movement speed or cooldown values are authoritative.
- Host permission covers lobby start and rematch only; captains retain existing team-order permission.
- Both fighters get the same three-second countdown after readiness or reconnection.
- Model readiness expires after 60 seconds; both unready means a draw, one unready means that team forfeits. Existing 30-second disconnection grace remains.
- Input packets carry current bout and synchronization epoch; stale/offline packets cannot affect a later match or reconnection.
- Publication uses the product's supported controls; never fabricate a deployment URL or publication result.

## Review focus

- Simultaneous meter threshold crossings and double KOs must be independent of fighter array order.
- A disconnect during loading or countdown must invalidate acknowledgements and controls from the previous connection.
- Spectators cannot acknowledge readiness for active fighters or inject their inputs.
- A stalled/failed asset load must end fairly rather than let the other player attack or wait forever.
- Asset completion for an old bout must not acknowledge a new bout; offline controls must not be buffered.

## Task 1: Seat-independent simulation

- [x] Add failing tests for simultaneous meter gain, charged skill exchange and movement after swapping seats in `tests/game.test.ts`.
- [x] Run the tests and confirm behavioral failures.
- [x] In `shared/game.ts`, read initial positions for both movements; apply received meter/stamina changes after both strikes.
- [x] Run `npm test`; preserve existing balance regression checks.

## Task 2: Shared readiness and current inputs

- [x] Add failing readiness/reconnect/timeout/unauthorized tests to `tests/rooms.test.ts` and real-network checks under `tests/browser/`.
- [x] Add `Room.sync` and `Rooms.loaded(code, token, boutId, epoch)` in `server/rooms.ts`. Create a new epoch at each bout and reconnect pause; freeze combat while loading; clear both inputs; apply symmetric readiness timeout.
- [x] In `server/index.ts`, accept scoped readiness and input requests only from the current active player. Ignore old bout/epoch packets.
- [x] In `src/world.ts`, expose the actual shared model-loading promise; in `src/main.ts`, acknowledge only the current synchronization after actual models are attached. Display one concise loading message, retain common countdown, send only volatile online scoped inputs.
- [x] Test that one delayed fighter cannot take damage before both loads complete, host and guest privileges are equal, reconnect invalidates old packets, and an offline browser does not buffer controls.
- [x] Run the full unit suite, build and relevant browser suite, including existing music and real invite/reconnect flows.

## Task 3: Review and publication preparation

- [x] Request one independent review of modified simulation, rooms, client and network tests; fix material findings with regression tests.
- [x] Update README and reusable startup instructions to remove obsolete Meshy-blocked/pending notes and capture current capabilities and tests.
- [x] Save the final environment draft preserving repositories, network policy and secrets. Verify save result.
- [x] Report verified behavior and the exact available publication control. The current connector exposes draft save but no Publish operation.

## Execution record

- Existing checkout is already isolated by the managed cloud task. No worktree, reset, remote push, or paid generation is necessary.
- All source files are untracked in an unborn repository; preserve them and review changes against private pre-edit copies rather than making an unrelated initial commit.

- Task 1 complete: three seat-order regressions failed against the old implementation and passed after the fix; simultaneous KO remains a draw. Full unit suite passed.
- Task 2 complete: readiness/timeout/spectator regressions failed first and passed after implementation. The real socket test reproduced stale epoch and still-live replacement behavior. The delayed GLB browser test proved that actual model attachment gates the shared countdown.
- Task 3 source review complete: the independent reviewer found one Important replacement-connection bypass; its real socket regression failed, then passed after replacement invokes synchronization. No Critical issues were found.
- Final validation: npm test -> 42/42; npm run build -> passed; npm run test:e2e -- --workers=1 against npm start -> 16/16 (5.8 minutes).
- Review limits: physical network RTT and device display delay remain; all team-member disconnects still use the existing pause rule. Separate browser offline-transition and old model-promise completion race tests are not included; scoped await checks and volatile transmission were reviewed.
- Deployment remains blocked on external hosting account access until an actual HTTPS game URL exists and is verified. Saving the environment draft or pushing the repository does not complete game website publication.
