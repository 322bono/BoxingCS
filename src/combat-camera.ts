import type { Fighter } from "../shared/game";

type Offset = { x: number; y: number; roll: number; pitch: number };
const clamp = (value: number, low: number, high: number) =>
  Math.max(low, Math.min(high, value));

/** Small presentation offsets only; never changes input or combat state. */
export class CombatCameraMotion {
  private previous: { x: number; z: number } | null = null;
  private phase = 0;
  private speed = 0;
  private strafe = 0;
  private offset: Offset = { x: 0, y: 0, roll: 0, pitch: 0 };
  reset() {
    this.previous = null;
    this.phase = this.speed = this.strafe = 0;
    this.offset = { x: 0, y: 0, roll: 0, pitch: 0 };
  }
  update(
    own: Fighter,
    opponent: Fighter,
    dt: number,
    enabled: boolean,
  ): Offset {
    if (!enabled) this.reset();
    const before = this.previous;
    this.previous = { x: own.x, z: own.z };
    if (!enabled || !before) return this.offset;
    const elapsed = clamp(dt, 0, 0.1),
      blend = 1 - Math.exp(-elapsed * 16);
    const dx = own.x - before.x,
      dz = own.z - before.z;
    const distance = Math.hypot(opponent.x - own.x, opponent.z - own.z) || 1;
    const forwardX = (opponent.x - own.x) / distance;
    const forwardZ = (opponent.z - own.z) / distance;
    const speed = clamp(
      Math.hypot(dx, dz) / (Math.max(dt, 1 / 30) * 2.4),
      0,
      1,
    );
    const strafe = clamp(
      (-forwardZ * dx + forwardX * dz) / (Math.max(dt, 1 / 30) * 2.4),
      -1,
      1,
    );
    this.speed += (speed - this.speed) * blend;
    this.strafe += (strafe - this.strafe) * blend;
    this.phase += elapsed * 9 * this.speed;
    const duration =
      own.kind === "skill" ? 0.6 : own.kind === "hook" ? 0.34 : 0.2;
    const punch =
      own.attack > 0
        ? Math.sin(Math.PI * clamp(1 - own.attack / duration, 0, 1))
        : 0;
    const side = own.kind === "jab" ? -1 : 1;
    const target = {
      x: Math.sin(this.phase) * 0.005 * this.speed,
      y: Math.cos(this.phase * 2) * 0.006 * this.speed - punch * 0.003,
      roll: -this.strafe * 0.006 + side * punch * 0.004,
      pitch: -punch * 0.007,
    };
    for (const key of ["x", "y", "roll", "pitch"] as const)
      this.offset[key] += (target[key] - this.offset[key]) * blend;
    return this.offset;
  }
}
