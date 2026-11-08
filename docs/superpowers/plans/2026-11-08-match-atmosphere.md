# Match atmosphere plan

**Goal:** Make first-person boxing feel like a live event using crowd recordings and restrained match tension cues.

**Authorization:** The user asked to continue immediately, add crowd cheering and improve urgency. Prior requests delegate implementation details without further design approval. Preserve the published fixes, menu music, characters, combat rules and existing UI structure. No paid generation.

**Design:** Use three verified CC0 recordings: quiet arena bed, medium cheers and a larger roar. Drive energy from authoritative damage, combos, skill serials, time and endings. Rate-limit reactions, prioritize big moments and never replay old events on reconnect. Keep background audio below punches/bells and duck it briefly at impacts. Stop crowd during loading, reconnect waits, hidden tabs and menus. Allow only the final celebration tail into results.

The current clock turns amber in the final30seconds and red with restrained motion in the final10. A low-health edge vignette respects the existing impact setting and reduced motion. Add one crowd-volume slider inside settings; no new persistent HUD panels.

## Tasks

- [x] Implement pure atmosphere state/reaction tracking with tests for real events, repeated snapshots, cooldown, pause/reset, skill, KO and final-time boundaries.
- [x] Research and prepare licensed recordings privately, preserve originals and source metadata, and inspect loop seams and signal levels. Source task writes only .asset-jobs/crowd/.
- [x] Integrate a controlled crowd audio bus and seamless loop in GameAudio, preserve existing music/effects behavior, mute/visibility semantics and action priority.
- [x] Connect paused state, clock/danger styling and saved crowd-volume setting in the existing DOM UI.
- [x] Verify source licenses/hashes, admit only final audio and sanitized provenance, then run units/build and meaningful browser checks of real audio playback and UI transitions.
- [x] Obtain one independent review; resolve material findings, check public rooms, deploy verified source, observe exact public build and smoke-test on https://ring-club-boxing.onrender.com.

## Constraints and review focus

- No change to health, hit timing, movement, input, host permission or server authority.
- No audience during technical pauses; no delayed cheers after a menu transition or a new bout/view.
- FX mute silences crowd; crowd-volume zero stops its loop and reaction voices; menu music remains independent.
- Bounded voices, generation-scoped asynchronous loads, cleanup on stop and no reaction storm from30Hz duplicate snapshots.
- Existing user-file and published code state was clean at commit4368069 when resumed. The earlier unavailable-executor attempt changed no files.

## Execution evidence

- Existing release4368069 was preserved; only the requested audio/UI feature and its tests/docs changed. The uploaded song and all15 prior effect hashes remain identical.
- Three CC0 recordings are committed with sanitized provenance; private originals and author/license page snapshots are retained. WAV format, non-silent peaks, hashes and the circular bed seam were independently inspected.
- Nine atmosphere unit tests cover actual hits/misses/combos/skills, duplicate snapshots, cooldown, final-time boundaries, pauses/reset and endings. Total51 unit tests passed.
- Native WebAudio checks reproduced delayed cheers surviving mute, result snapshots cancelling the finish tail, and a suspended context failing to restart the bed. Each behavior was fixed and its real audio regression passed.
- One independent code review found the result-tail issue, now fixed; no remaining Critical/Important findings. Subjective listening and actual OS/browser policies remain distinct from native playback verification.
- Production build and the full25-test browser suite passed (4.1 minutes).
- Releasea0fa11e was pushed to main and automatically deployed. The public health endpoint returned200 with0 rooms; every referenced JS/CSS bundle and all three crowd WAV files matched the locally verified build byte-for-byte.
- The public Chromium smoke test passed (26.9 seconds): real non-silent bed, actual combat damage, medium cheers and larger roars, crowd cleanup and song restoration on menu return, and crowd-volume persistence independent of music. No page or asset HTTP errors were observed. The first cold probe missed the medium reaction during continuous attacks; an unchanged-code rerun with native diagnostics observed both tiers and passed. Local deterministic reaction tests also passed.
- A public first-person combat screenshot was inspected. The existing playfield and HUD layout are preserved. Private public-version and smoke receipts are retained in .asset-jobs/crowd/.
