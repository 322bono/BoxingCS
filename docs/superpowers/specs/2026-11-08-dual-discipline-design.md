# Boxing and jiu-jitsu in a live 3D club

The user requests playable boxing/jiu-jitsu selection and a substantial main/waiting/lobby redesign that feels like a dynamic 3D game rather than flat generated panels. Existing instructions delegate implementation and publication. Keep the four real models and established boxing, audio, tempo and authoritative networking. No additional paid generation is authorized or necessary.

## Play

Add Sport = "boxing" | "bjj" to bouts and rooms, defaulting to boxing for existing callers. A room's sport is chosen at creation and immutable. Invite joins inherit it. Both sports support real invitations, equal-sized teams, the existing captain/order phase, AI and reconnect gates.

Jiu-jitsu uses standing grips, defended takedowns, closed guard, side control, mount and back control. J creates grips or advances/frames; K commits a takedown, sweep or submission according to position; Space defends; Shift escapes; Q spends the existing full style meter for a bounded positional bonus. WASD is movement standing and weight shifting on the ground. Keep the command count low and disclose only the currently useful action names. Deterministic server actions use shared snapshots and stamina/cooldowns, with no seat priority or random guaranteed finishes. A defended attempt can fail. A submission must build pressure against active defense; it is not an instant skill kill. Award takedown2, pass3, mount/back4 and sweep2. Tap or 90-second points decides the bout. Boxing HP rules remain intact.

Paired poses and short transitions align both existing rigs to one contact anchor: grip, sprawl, takedown, guard, pass, sweep, mount, escape and submissions. Jiu-jitsu instances retain original bare hands rather than boxing glove masking. Preserve original geometry, face textures and source animations. Standing/ground cameras have a stable horizon and bounded smoothing. First person remains the default with an accessible alternative broadcast camera. Reduced motion and effect opt-out remain effective.

## Visual direction

A live arena fills the backdrop of the home screen and lobby: tangible ring or mats, practical overhead lights, floor reflections/shadows, an orbit/dolly camera and two selected 3D fighters. Boxing warm amber, jiu-jitsu restrained cool jade; dark neutral surfaces and warm white type. Sport switch, one dominant play action, secondary AI/team/invite actions and short labels. No equal-weight rainbow dashboard cards, decorative status paragraphs or large center HUD panels. Lobby code and ready/team actions remain obvious. Character selection retains recognizable real faces.

## Engineering

Keep simulation out of Three.js. Add the grappling reducer separately; route existing Bout/Input entry points by sport. Rendering consumes the authoritative grappling state without modifying it. Use separate authored pose/presentation and UI template/style modules. Existing GLB cache stays shared; boxing and bare-hand instances remain independent. New crowd/mat/cloth cues use existing licensed samples and scoped snapshot trackers. All existing rules and song/mute controls continue working.

Validate pure action fairness, defenses, stamina, points/tap, AI and resets; exercise both disciplines in real browser AI/invite/team/reconnect flows; inspect actual 3D poses/screens at desktop and phone sizes; check performance and accessibility; publish only after appropriate verification and observe the exact public build.
