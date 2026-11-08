# Boxing hands refinement

The user finds the displayed hand objects unacceptable. Previous instructions delegate design and publication without another approval round. Build within the existing Three.js runtime, with no paid generation or changes to combat/network rules.

Replace sphere gloves with a reusable sculpted glove: rounded knuckle padding, a separate curved thumb, palm, wrist closure, stitching and restrained leather grain. Use the same design on camera hands and rigged opponents. The four generated rigs have open hands but no finger joints; hide only triangles influenced by their hand joints on an instance-owned geometry instead of inflating a sphere around the fingers. Preserve template geometry, face, body, bones, source animations and existing disposal behavior.

Keep camera hands below and beside the opponent's face at rest. Give the lead jab, rear hook and signatures distinct extension, rotation and return paths. Guard raises both hands with an open central view. Derive the camera-facing presentation from current Fighter state, with aspect-aware placement and optional idle motion disabled for reduced motion. Match skin/corner colors to the viewed fighter. No simulation changes.

The user additionally requested restrained dynamic camera movement. Add a few millimetres of movement rhythm and less than one degree of punch/strafe rotation, smoothed by elapsed frame time. Reset movement history on bout/view changes, respect the existing effects setting and reduced motion, and keep all combat/network calculations unchanged. Mobile sizing must preserve the glove's proportions; forearms must continue below the viewport during raised punches.

- [x] Add failing tests for bounded glove dimensions, instance-only hand masking/disposal and viewmodel near-plane/center clearance across aspect ratios and attack states.
- [x] Build detailed glove geometry and mask open rig hands without changing cached templates; update accessory disposal.
- [x] Integrate the camera hand rig and pose adapter; update procedural fallback opponent gloves too.
- [x] Add bounded movement/punch camera offsets with opt-out and view reset regression tests.
- [x] Inspect screenshots at rest, guard, jab, hook and signatures at desktop/mobile sizes; play a real AI bout and check all four generated fighters.
- [x] Run units, build and relevant browser regressions; review changes.
- [x] Publish and verify the exact public assets and a live smoke test.

Review focus: original fingers must not protrude, cached geometry must remain usable by a second instance, accessories must release owned resources, either spectator view must match corner/skin color, and narrow screens must retain a readable central view without clipping at the near plane.

## Verification

- All56 unit tests passed. New regressions cover source geometry ownership, original hand masking, accessory disposal, scaled hand bones, central sightline/near plane, undistorted phone proportions, continuous raised forearms and bounded camera offsets with reset/opt-out behavior.
- TypeScript checking and production build passed. The existing large Three.js chunk warning remains; no new runtime dependency, paid generation, character GLB or audio change was introduced.
- The complete26-test browser suite passed in4.3 minutes. The subsequently added rendered-camera integration test passed separately in10.3 seconds; all27 browser cases are green. It checks actual World camera response and both effects/reduced-motion opt-outs.
- Actual screenshots were inspected at rest, guard, jab, hook and four signatures, including a390×844 viewport and live AI combat. The first screenshot fixture unnecessarily rendered24 frames per pose and timed out; settling the test camera directly and rendering one frame made the same visual pass finish in10.7 seconds.
- An independent reviewer confirmed geometry/masking ownership and view/corner isolation before its tool usage limit prevented a final verdict. The parent completed the remaining source, pose and visual checks; this is not a claim of a complete independent review.
- Releasec07deea was pushed to main and automatically deployed. The public health endpoint returned200 with0 rooms, and every referenced production JS/CSS file matched the tested local build byte-for-byte.
- A public Chromium smoke test passed in25.8 seconds using the actual Nova model: server connection, first-person guard, real punch damage, clean menu return and restored music. Public guard/combat screenshots were inspected and no page/asset HTTP errors occurred. Private version/smoke receipts and screenshots are saved under .asset-jobs/hands/.
