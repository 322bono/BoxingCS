import type { Bout } from "../../shared/game";
import type { CombatSoundCue } from "./combat-sounds";

export class GrapplingSoundTracker {
  private previous: {
    key: string;
    serial: number;
    countdown: number;
    ended: boolean;
    x: number;
    z: number;
    skills: number[];
  } | null = null;
  private distance = 0;
  reset() {
    this.previous = null;
    this.distance = 0;
  }
  update(bout: Bout, view: number): CombatSoundCue[] {
    if (bout.sport !== "bjj" || !bout.grappling) {
      this.reset();
      return [];
    }
    const g = bout.grappling,
      own = bout.fighters[view === 1 ? 1 : 0],
      key = `${bout.id}:${view}`;
    const before = this.previous;
    this.previous = {
      key,
      serial: g.actionSerial,
      countdown: bout.countdown,
      ended: bout.ended,
      x: own.x,
      z: own.z,
      skills: bout.fighters.map((f) => f.skillSerial),
    };
    if (!before || before.key !== key) {
      this.distance = 0;
      return [];
    }
    if (before.ended) return [];
    const cues: CombatSoundCue[] = [];
    if (before.countdown > 0 && bout.countdown <= 0)
      cues.push({ sound: "bell-start", pan: 0 });
    if (bout.countdown > 0) return cues;
    if (bout.ended) return [{ sound: "bell-end", pan: 0 }];
    if (g.actionSerial > before.serial) {
      const mat = g.lastAction === "takedown" || g.lastAction === "sweep";
      cues.push({
        sound: mat ? "fall" : "cloth",
        pan: g.lastActor === view ? -0.1 : 0.1,
      });
    } else if (bout.fighters.some((f, i) => f.skillSerial > before.skills[i]))
      cues.push({ sound: "cloth", pan: 0 });
    if (g.position === "standing" || g.position === "clinch") {
      const moved = Math.hypot(own.x - before.x, own.z - before.z);
      if (moved < 1.5) this.distance += moved;
      else this.distance = 0;
      if (this.distance >= 0.55) {
        this.distance %= 0.55;
        cues.push({ sound: "step", pan: 0 });
      }
    } else this.distance = 0;
    return cues;
  }
}
