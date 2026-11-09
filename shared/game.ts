import {
  createGrapplingState,
  stepGrappling,
  aiGrapplingInput,
  type GrapplingState,
} from "./grappling";

export type Sport = "boxing" | "bjj";
export const sportName = (sport: Sport) =>
  sport === "bjj" ? "주짓수" : "복싱";

export const CHARACTERS = [
  {
    id: "nova",
    name: "노바",
    title: "THE COMBINATION",
    color: "#dfe8f5",
    skin: "#e2b49b",
    power: 0.98,
    speed: 1.08,
    endurance: 0.94,
    description: "빠른 원투로 리듬을 쌓는 콤비네이션.",
    trait: "연타형",
    stats: [3, 4, 3],
  },
  {
    id: "blaze",
    name: "블레이즈",
    title: "THE OVERHAND",
    color: "#da7955",
    skin: "#d5aa90",
    power: 1.1,
    speed: 0.94,
    endurance: 0.96,
    description: "상체 회전을 실은 오버핸드 한 방.",
    trait: "강타형",
    stats: [5, 2, 3],
  },
  {
    id: "specs",
    name: "스펙스",
    title: "THE COUNTER",
    color: "#8bafaa",
    skin: "#dcb399",
    power: 0.95,
    speed: 1,
    endurance: 1.05,
    description: "한 발 물러선 뒤 빈틈을 찌르는 카운터.",
    trait: "카운터형",
    stats: [3, 3, 4],
  },
  {
    id: "volt",
    name: "볼트",
    title: "THE UPPERCUT",
    color: "#bb9fe2",
    skin: "#dfb498",
    power: 1.04,
    speed: 1.03,
    endurance: 0.93,
    description: "낮게 파고들어 솟구치는 어퍼컷.",
    trait: "인파이터",
    stats: [4, 4, 2],
  },
] as const;
export const PENDING_MODEL_IDS = new Set<string>([
  "nova",
  "blaze",
  "specs",
  "volt",
]);
export type CharacterId = (typeof CHARACTERS)[number]["id"];
export type Input = {
  forward: number;
  strafe: number;
  jab: boolean;
  hook: boolean;
  guard: boolean;
  dodge: boolean;
  skill?: boolean;
};
export const idleInput = (): Input => ({
  forward: 0,
  strafe: 0,
  jab: false,
  hook: false,
  guard: false,
  dodge: false,
});
export type Fighter = {
  id: string;
  character: CharacterId;
  x: number;
  z: number;
  hp: number;
  stamina: number;
  cooldown: number;
  attack: number;
  kind: "jab" | "hook" | "skill";
  meter: number;
  combo: number;
  comboTime: number;
  skillSerial: number;
  guard: boolean;
  evade: number;
  dodgeCooldown: number;
  hits: number;
};
export type Bout = {
  sport: Sport;
  grappling?: GrapplingState;
  id: string;
  fighters: [Fighter, Fighter];
  time: number;
  countdown: number;
  ended: boolean;
  winner: number | null;
  reason: string;
};
export function createBout(
  ids: [string, string],
  chars: [CharacterId, CharacterId],
  sport: Sport = "boxing",
): Bout {
  return {
    sport,
    ...(sport === "bjj" ? { grappling: createGrapplingState() } : {}),
    id: crypto.randomUUID(),
    fighters: ids.map((id, i) => ({
      id,
      character: chars[i],
      x: 0,
      z: i === 0 ? 1.7 : -1.7,
      hp: 100,
      stamina: 100,
      cooldown: 0,
      attack: 0,
      kind: "jab",
      guard: false,
      evade: 0,
      dodgeCooldown: 0,
      hits: 0,
      meter: 35,
      combo: 0,
      comboTime: 0,
      skillSerial: 0,
    })) as [Fighter, Fighter],
    time: 90,
    countdown: 3,
    ended: false,
    winner: null,
    reason: "",
  };
}
const clamp = (n: number, min: number, max: number) =>
  Math.max(min, Math.min(max, n));
export function stepBout(b: Bout, inputs: [Input, Input], dt: number): void {
  if (b.ended) return;
  dt = clamp(dt, 0, 0.1);
  if (b.countdown > 0) {
    b.countdown = Math.max(0, b.countdown - dt);
    return;
  }
  b.time = Math.max(0, b.time - dt);
  if (b.sport === "bjj") {
    stepGrappling(b, inputs, dt);
    return;
  }
  // Both fighters move from the same tick's positions, regardless of seat order.
  const positions = b.fighters.map(({ x, z }) => ({ x, z }));
  for (let i = 0; i < 2; i++) {
    const f = b.fighters[i],
      o = positions[1 - i],
      input = inputs[i],
      c = CHARACTERS.find((c) => c.id === f.character)!;
    f.comboTime = Math.max(0, f.comboTime - dt);
    if (!f.comboTime) f.combo = 0;
    f.meter = clamp(f.meter + dt * 1.5, 0, 100);
    f.cooldown = Math.max(0, f.cooldown - dt);
    f.attack = Math.max(0, f.attack - dt);
    f.evade = Math.max(0, f.evade - dt);
    f.dodgeCooldown = Math.max(0, f.dodgeCooldown - dt);
    f.guard = input.guard && f.stamina > 3;
    f.stamina = clamp(
      f.stamina + dt * (f.guard ? 6 : 18) * c.endurance,
      0,
      100,
    );
    if (input.dodge && f.dodgeCooldown === 0 && f.stamina >= 20) {
      f.stamina -= 20;
      f.evade = 0.22;
      f.dodgeCooldown = 0.9;
    }
    const dx = o.x - f.x,
      dz = o.z - f.z,
      len = Math.hypot(dx, dz) || 1;
    const fw = clamp(input.forward, -1, 1),
      st = clamp(input.strafe, -1, 1),
      norm = Math.max(1, Math.hypot(fw, st));
    const speed =
      dt * 2.7 * c.speed * (f.guard ? 0.45 : 1) * (f.evade > 0 ? 1.8 : 1);
    f.x = clamp(
      f.x + (((dx / len) * fw - (dz / len) * st) / norm) * speed,
      -2.8,
      2.8,
    );
    f.z = clamp(
      f.z + (((dz / len) * fw + (dx / len) * st) / norm) * speed,
      -2.8,
      2.8,
    );
  }
  let dx = b.fighters[1].x - b.fighters[0].x,
    dz = b.fighters[1].z - b.fighters[0].z,
    d = Math.hypot(dx, dz);
  if (d < 0.8) {
    if (d === 0) {
      dx = 0.001;
      d = 0.001;
    }
    const push = (0.8 - d) / 2;
    for (let i = 0; i < 2; i++) {
      b.fighters[i].x = clamp(
        b.fighters[i].x + (dx / d) * push * (i ? 1 : -1),
        -2.8,
        2.8,
      );
      b.fighters[i].z = clamp(
        b.fighters[i].z + (dz / d) * push * (i ? 1 : -1),
        -2.8,
        2.8,
      );
    }
  }
  // Set both guards before resolving strikes so input order gives no advantage.
  const damage = [0, 0];
  const receivedMeter = [0, 0],
    guardCost = [0, 0];
  for (let i = 0; i < 2; i++) {
    const f = b.fighters[i],
      o = b.fighters[1 - i],
      input = inputs[i],
      c = CHARACTERS.find((c) => c.id === f.character)!;
    const special = !!input.skill && f.meter >= 100;
    const heavy = input.hook,
      cost = special ? 0 : heavy ? 23 : 10;
    if (
      (special || input.jab || heavy) &&
      f.cooldown === 0 &&
      !f.guard &&
      f.stamina >= cost
    ) {
      f.stamina -= cost;
      f.cooldown = special ? 1.15 : (heavy ? 0.7 : 0.28) / c.speed;
      if (special) {
        f.meter = 0;
        f.skillSerial++;
      }
      f.attack = special ? 0.6 : heavy ? 0.34 : 0.2;
      f.kind = special ? "skill" : heavy ? "hook" : "jab";
      if (
        Math.hypot(f.x - o.x, f.z - o.z) <
          (special ? 1.9 : heavy ? 1.45 : 1.75) &&
        o.evade === 0
      ) {
        damage[1 - i] =
          (special ? 26 : heavy ? 16 : 7) * c.power * (o.guard ? 0.25 : 1);
        f.hits++;
        f.combo++;
        f.comboTime = 1.8;
        if (!special) f.meter = clamp(f.meter + (o.guard ? 5 : 13), 0, 100);
        receivedMeter[1 - i] += 8;
        if (o.guard) guardCost[1 - i] += 8;
      }
    }
  }
  b.fighters.forEach((f, i) => {
    f.hp = Math.max(0, f.hp - damage[i]);
    f.meter = clamp(f.meter + receivedMeter[i], 0, 100);
    f.stamina = Math.max(0, f.stamina - guardCost[i]);
  });
  if (b.fighters.some((f) => f.hp <= 0) || b.time === 0) {
    b.ended = true;
    const [a, c] = b.fighters;
    b.winner = Math.abs(a.hp - c.hp) < 0.01 ? null : a.hp > c.hp ? 0 : 1;
    b.reason = b.time === 0 ? "판정" : "KO";
  }
}
export function aiInput(
  b: Bout,
  index: number,
  difficulty: number,
  roll: number,
): Input {
  if (b.sport === "bjj") return aiGrapplingInput(b, index, difficulty, roll);
  const f = b.fighters[index],
    o = b.fighters[1 - index],
    distance = Math.hypot(f.x - o.x, f.z - o.z);
  return {
    forward: distance > 1.25 ? 1 : f.stamina < 25 ? -0.7 : 0,
    strafe: Math.sin(b.time * 1.3) * 0.35 * difficulty,
    jab: distance < 1.7 && roll < 0.035 + difficulty * 0.09,
    hook: distance < 1.4 && roll > 0.98 - difficulty * 0.035 && f.stamina > 45,
    guard: (o.attack > 0 && roll < difficulty * 0.8) || f.stamina < 20,
    dodge: o.attack > 0 && roll > 0.96,
  };
}
