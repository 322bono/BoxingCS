import type { Bout, CharacterId, Fighter } from "../../shared/game";
export type CombatSoundName =
  | "swing"
  | "punch"
  | "heavy"
  | "guard"
  | "cloth"
  | "dodge"
  | "step"
  | "skill"
  | "bell-start"
  | "bell-end"
  | "fall";
export type CombatSoundCue = {
  sound: CombatSoundName;
  pan: number;
  character?: CharacterId;
  attack?: Fighter["kind"];
};
export class CombatSoundTracker {
  private previous: Bout | null = null;
  private key = "";
  private distance = 0;
  reset() {
    this.previous = null;
    this.key = "";
    this.distance = 0;
  }
  update(bout: Bout, view: number): CombatSoundCue[] {
    const key = `${bout.id}:${view}`;
    const before = this.key === key ? this.previous : null;
    this.previous = {
      ...bout,
      fighters: bout.fighters.map((f) => ({ ...f })) as Bout["fighters"],
    };
    this.key = key;
    if (!before) {
      this.distance = 0;
      return [];
    }
    if (before.ended) return [];
    const cues: CombatSoundCue[] = [];
    if (before.countdown > 0 && bout.countdown <= 0)
      cues.push({ sound: "bell-start", pan: 0 });
    if (bout.countdown > 0) return cues;
    for (let i = 0; i < 2; i++) {
      const f = bout.fighters[i],
        old = before.fighters[i],
        attacker = bout.fighters[1 - i];
      const pan = i === view ? -0.1 : 0.1;
      if (f.skillSerial > old.skillSerial)
        cues.push({
          sound: "skill",
          pan,
          character: f.character,
          attack: "skill",
        });
      else if (f.attack > old.attack + 0.01 && f.kind !== "skill")
        cues.push({ sound: "swing", pan, attack: f.kind });
      if (f.evade > 0 && old.evade <= 0) cues.push({ sound: "dodge", pan });
      if (i === view && f.guard && !old.guard)
        cues.push({ sound: "cloth", pan });
      const damage = old.hp - f.hp;
      if (damage > 0)
        cues.push({
          sound:
            f.guard && damage <= 6
              ? "guard"
              : attacker.kind === "jab"
                ? "punch"
                : "heavy",
          pan: i === view ? 0 : pan,
          attack: attacker.kind,
        });
    }
    const own = bout.fighters[view],
      oldOwn = before.fighters[view];
    const moved = Math.hypot(own.x - oldOwn.x, own.z - oldOwn.z);
    if (own.evade <= 0 && moved < 1.5) {
      this.distance += moved;
      if (this.distance >= 0.5) {
        this.distance %= 0.5;
        cues.push({ sound: "step", pan: 0 });
      }
    } else this.distance = 0;
    if (bout.ended) {
      if (bout.fighters.some((f) => f.hp <= 0))
        cues.push({ sound: "fall", pan: 0 });
      cues.push({ sound: "bell-end", pan: 0 });
    }
    return cues;
  }
}
