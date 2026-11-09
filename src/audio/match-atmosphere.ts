import type { Bout } from "../../shared/game";

export type ArenaReaction = "cheer" | "roar" | "finish";
export type ArenaFrame = {
  active: boolean;
  urgency: 0 | 1 | 2;
  danger: number;
  energy: number;
  reaction: ArenaReaction | null;
  warning: boolean;
};
const clamp = (value: number, low = 0, high = 1) =>
  Math.max(low, Math.min(high, value));

export function matchTension(bout: Bout, view: number, paused = false) {
  const active = !paused && !bout.ended && bout.countdown <= 0;
  return {
    active,
    urgency: (active ? (bout.time <= 10 ? 2 : bout.time <= 30 ? 1 : 0) : 0) as
      0 | 1 | 2,
    danger: active
      ? bout.sport === "bjj"
        ? bout.grappling?.submission &&
          bout.grappling.submission.attacker !== view
          ? clamp((bout.grappling.submission.progress - 20) / 70)
          : 0
        : clamp((30 - bout.fighters[view === 1 ? 1 : 0].hp) / 30)
      : 0,
  };
}

export class MatchAtmosphereTracker {
  private previous: Bout | null = null;
  private key = "";
  private excitement = 0;
  private cooldown = 0;
  private lastReaction: ArenaReaction | null = null;
  reset() {
    this.previous = null;
    this.key = "";
    this.excitement = 0;
    this.cooldown = 0;
    this.lastReaction = null;
  }
  update(bout: Bout, view: number, paused = false): ArenaFrame {
    const mood = matchTension(bout, view, paused);
    const frame: ArenaFrame = {
      ...mood,
      energy: 0,
      reaction: null,
      warning: false,
    };
    if (paused || bout.countdown > 0) {
      this.reset();
      return frame;
    }
    const key = `${bout.id}:${view}`;
    if (this.key !== key) this.reset();
    const before = this.previous;
    this.previous = {
      ...bout,
      grappling: bout.grappling ? { ...bout.grappling } : undefined,
      fighters: bout.fighters.map((f) => ({ ...f })) as Bout["fighters"],
    };
    this.key = key;
    const base =
      0.18 +
      mood.urgency * 0.15 +
      (bout.fighters.some((f) => f.hp < 30) ? 0.1 : 0);
    frame.energy = mood.active ? base : 0;
    if (!before || before.ended) return frame;
    if (bout.ended) {
      frame.reaction = "finish";
      return frame;
    }
    const elapsed = clamp(before.time - bout.time, 0, 0.25);
    this.cooldown = Math.max(0, this.cooldown - elapsed);
    this.excitement = Math.max(0, this.excitement - elapsed * 0.25);
    let damage = 0,
      combo = false;
    for (let i = 0; i < 2; i++) {
      const hit = Math.max(0, before.fighters[i].hp - bout.fighters[i].hp);
      damage += hit;
      if (hit >= 5 && bout.fighters[1 - i].combo >= 3) combo = true;
    }
    const skill = bout.fighters.some(
      (f, i) => f.skillSerial > before.fighters[i].skillSerial,
    );
    const grapple =
      bout.grappling &&
      before.grappling &&
      bout.grappling.actionSerial > before.grappling.actionSerial
        ? bout.grappling.lastAction
        : null;
    const bigGrapple =
      !!grapple &&
      ["takedown", "sweep", "mount", "back", "submission"].includes(grapple);
    const smallGrapple =
      !!grapple &&
      ["pass", "escape", "sprawl", "submission-escape"].includes(grapple);
    this.excitement = clamp(
      this.excitement +
        damage / 48 +
        (skill ? 0.25 : 0) +
        (bigGrapple ? 0.18 : smallGrapple ? 0.1 : 0),
      0,
      0.7,
    );
    frame.energy = clamp(base + this.excitement);
    frame.warning = before.time > 10 && bout.time <= 10;
    const candidate =
      skill || damage >= 14 || combo || bigGrapple
        ? "roar"
        : damage >= 5 || smallGrapple
          ? "cheer"
          : null;
    if (
      candidate &&
      (this.cooldown === 0 ||
        (candidate === "roar" && this.lastReaction === "cheer"))
    ) {
      frame.reaction = candidate;
      this.lastReaction = candidate;
      this.cooldown = candidate === "roar" ? 3.5 : 2.5;
    }
    return frame;
  }
}
