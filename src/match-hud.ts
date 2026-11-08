import type { ArenaFrame } from "./audio/match-atmosphere";

export function updateMatchTension(
  hud: HTMLElement,
  arena: ArenaFrame,
  effects: boolean,
) {
  hud.classList.toggle("closing-round", arena.urgency === 1);
  hud.classList.toggle("final-round", arena.urgency === 2);
  hud.classList.toggle("reduced-effects", !effects);
  hud.style.setProperty("--danger", String(effects ? arena.danger : 0));
}
