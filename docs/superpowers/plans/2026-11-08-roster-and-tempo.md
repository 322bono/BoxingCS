# Four-fighter roster and faster boxing

The user requested faster characters and removal of the first four unmodeled fighters. Existing instructions delegate implementation and publication. Keep Nova, Blaze, Specs and Volt only, including character selection, AI opponents, server validation, signatures and asset manifest. Migrate saved removed/invalid choices to Nova; retain valid saved choices. Keep the four authored GLBs, improved hands, camera and all music/audio intact.

Increase the common movement baseline from2.0 to2.7 metres/second (+35%), reduce jab recovery from0.36 to0.28 seconds and hook recovery from0.85 to0.70, and increase unguarded stamina recovery from15 to18 per second to support that cadence. Preserve character multipliers, damage, hit ranges, dodge and skill rules, simulation tick and 90-second match clock. AI and online players must use the same rules. Re-run the seeded balance check for the remaining four fighters.

Update dependent tests to active characters without losing assertions for host symmetry, readiness, reconnect, real GLB loading and skills. Keep four selection slots filled across desktop/phone layouts. Do not start two heavy GLB downloads merely to initialize a hidden ring; instantiate current placeholders and load real models when requested. If only one modeled fighter is available, an AI mirror uses that modeled fighter rather than an unavailable fallback.

- [x] Write failing tests for faster movement/recovery, four-character roster, saved-choice migration and rejected legacy server selections.
- [x] Remove retired definitions/signatures/manifest entries; migrate defaults and saved selections; update four-slot UI and fixtures.
- [x] Apply common tempo parameters, preserve authoritative fairness and verify four-style balance.
- [x] Verify build, units and browser gameplay/roster/migration checks and inspect screenshots.
- [ ] Publish and confirm exact public build and a live match.

Review focus: old localStorage values must not crash the picker; legacy clients must not inject removed IDs; diagonal movement must remain normalized; faster recovery must still require stamina and respect guard; first-load model initialization must not bypass readiness or load behind the menu.

## Verification so far

All60 unit tests and the complete30-case Chromium suite passed (5.0 minutes), including four-style seeded balance, seat-order fairness, stamina/recovery, real models and skills, online readiness/reconnect, delayed manifest refresh, legacy-choice migration and phone layout. TypeScript and the production build passed. Desktop/phone roster screenshots were inspected; the final thumbnail-only CSS adjustment also passed the focused three-case roster browser check (25.2 seconds) and a new production build. Source GLBs, textures, hands, camera and audio files remain intact. Public version, server movement measurement and live reconnect validation remain before completion.
