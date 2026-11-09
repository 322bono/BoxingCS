# Dual discipline club Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans for parent integration; independently owned simulation, presentation and UI modules are delegated under dispatching-parallel-agents. Checkboxes track delivery. The user's standing instruction authorizes direct implementation and publication without another design gate.

**Goal:** Add casual, recognizable jiu-jitsu and an immersive live 3D club interface while preserving boxing.

**Architecture:** Sport-aware shared Bout/Room state; pure grappling reducer; paired rig presentation; common DOM shell with live WebGL venue. Retain server30Hz and readiness epochs. Modules never mutate another layer's state.

**Tech Stack:** Existing TypeScript, Three.js, Vite, Express, Socket.IO, Node tests and Playwright. No new paid generation.

**Spec:** ../specs/2026-11-08-dual-discipline-design.md

## Global Constraints

- Four modeled fighters only; preserve GLBs, photos, licenses and the uploaded song.
- First person default with optional broadcast camera in grappling; respect reduced motion.
- Existing invitations, equal teams, captain30-second order,60-second model readiness and30-second disconnect grace apply to both sports.
- Keep boxing tempo and damage intact. New sport defaults to boxing for old callers.
- Do not publish an untested partial sport or expose test harness APIs in production.

## Review Focus

- Two simultaneous grappling intents must not favor array/host order; reducer tests reverse seats.
- Changing sport must replace equipment/pose state, not mutate the cached GLB; instance tests cover both variants.
- Repeated room snapshots and reconnects must not replay old actions/audio or preserve held inputs.
- Pointer/keyboard/touch controls must agree with current position, and hidden/paused UI must release inputs.
- Ground poses/camera must avoid clipping, detached bodies and obstruction; inspect real rigs in both views and mobile sizes.

## Tasks

- [x] Shared grappling state/reducer/AI and tests: shared/grappling.ts, tests/grappling.test.ts. Export documented state and context labels.
- [x] Paired presentation and pose/hand helpers: src/grappling-world.ts, src/assets/grappling-poses.ts, optional focused helpers and fixture. Render only; no simulation writes.
- [x] Home/lobby templates and themed styles: src/ui/club-shell.ts, src/ui/club.css. Preserve semantic action selectors and low-chrome fight UI.
- [x] Parent sport integration: shared/game.ts, server/rooms.ts, server/index.ts, asset library/preview, World venue/camera and main sport/setup/HUD/controls.
- [x] Contextual grappling sounds/crowd and gameplay verification. Add meaningful tests for sport rooms, actual AI/invite play, paired contact, camera/equipment, mobile and menu/lobby presentation.
- [x] Run units/typecheck/build/full appropriate browser suite, inspect captures, review and correct material findings.

## Verification

- `npm test`:108 passing; `npm run build`: typecheck and production build pass.
-40 browser scenarios checked in focused groups: existing30, grappling/mobile9 and waiting-room music1. The existing run was interrupted after18 successes; its remaining12 then passed together. No source assets or uploaded music were replaced.
- Real GLBs verified in both equipment variants; actual paired poses, first-person clearance and a grounded armbar inspected. Mobile checks include real touch drags/pinch, short keyboard-height dialogs, an eight-player lobby, landscape safe areas and independent two-finger input. Real iOS OS keyboard/address-bar behavior remains a device-check boundary.
- Review findings fixed: independent pointer/keyboard holds, bottom-only positional escape to prevent top-player point farming, and disposal of copied hand geometry/materials without releasing shared textures.
- A240-bout seeded grappling AI sample scored each style between41.3% and56.3% after counting draws as half a win. This is a regression sample, not a claim of human competitive balance.

## Public release check

Push the tested change to main normally. Compare the public JavaScript/CSS bytes and four-character manifest against the local build, then exercise real boxing and jiu-jitsu invitations/reconnect, lobby music, and phone layouts at the public HTTPS URL. Store the rollout receipt and browser captures under `.asset-jobs/dual/`.
