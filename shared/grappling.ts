import { CHARACTERS } from "./game.ts";
import type { Bout, CharacterId, Input } from "./game.ts";

export type GrapplingPosition =
  "standing" | "clinch" | "guard" | "side" | "mount" | "back";
type Seat = 0 | 1;
export type GrapplingState = {
  position: GrapplingPosition;
  top: Seat | null;
  grip: [number, number];
  control: [number, number];
  points: [number, number];
  transition: {
    kind: string;
    actor: Seat;
    from: GrapplingPosition;
    to: GrapplingPosition;
    top: Seat | null;
    elapsed: number;
    duration: number;
    defended: boolean;
  } | null;
  submission: {
    attacker: Seat;
    kind: "armbar" | "triangle" | "rear-choke";
    progress: number;
  } | null;
  actionSerial: number;
  lastAction: string | null;
  lastActor: Seat;
  positionAge: number;
};

export function createGrapplingState(): GrapplingState {
  return {
    position: "standing",
    top: null,
    grip: [0, 0],
    control: [0, 0],
    points: [0, 0],
    transition: null,
    submission: null,
    actionSerial: 0,
    lastAction: null,
    lastActor: 0,
    positionAge: 0,
  };
}

export const bjjSignatures: Record<
  CharacterId,
  { name: string; tag: string; description: string }
> = {
  nova: {
    name: "플로 패스",
    tag: "유연한 연결",
    description: "그립과 포지션 연결을 돕는 빠른 체중 이동.",
  },
  blaze: {
    name: "헤비 프레셔",
    tag: "상위 압박",
    description: "짧고 강한 압박으로 안정적인 컨트롤을 확보.",
  },
  specs: {
    name: "테크니컬 프레임",
    tag: "정교한 방어",
    description: "프레임과 호흡을 회복해 탈출 기회를 확보.",
  },
  volt: {
    name: "힙 스위치",
    tag: "폭발적 전환",
    description: "엉덩이 전환으로 스윕과 탈출을 준비.",
  },
};

const clamp = (value: number, min = 0, max = 100) =>
  Math.max(min, Math.min(max, value));
const other = (seat: Seat): Seat => (seat === 0 ? 1 : 0);
const seats = [0, 1] as const;
const grounded = (position: GrapplingPosition) =>
  position !== "standing" && position !== "clinch";
function character(b: Bout, seat: Seat) {
  // The binding is read here, after game.ts has initialized its character catalog.
  return CHARACTERS.find((entry) => entry.id === b.fighters[seat].character)!;
}
function action(g: GrapplingState, kind: string, actor: Seat) {
  g.actionSerial++;
  g.lastAction = kind;
  g.lastActor = actor;
}
type Attempt = {
  kind: "takedown" | "pass" | "mount" | "back" | "sweep" | "escape";
  actor: Seat;
  to: GrapplingPosition;
  top: Seat | null;
  score: number;
  cost: number;
};

function defenseStops(b: Bout, g: GrapplingState, attempt: Attempt) {
  if (attempt.kind === "escape") return false;
  const defender = other(attempt.actor),
    f = b.fighters[defender];
  if (f.stamina < 4) return false;
  if (attempt.kind === "takedown")
    return (
      (f.guard && g.grip[attempt.actor] < 70 + g.grip[defender] * 0.15) ||
      (f.evade > 0 && g.grip[attempt.actor] < 88)
    );
  return (
    (f.guard || f.evade > 0) &&
    g.control[defender] + (f.evade > 0 ? 35 : 22) >= g.control[attempt.actor]
  );
}

function completeTransition(b: Bout, g: GrapplingState) {
  const transition = g.transition!;
  const actor = transition.actor;
  g.transition = null;
  if (transition.defended) {
    g.grip[actor] = Math.max(0, g.grip[actor] - 18);
    g.control[actor] = Math.max(0, g.control[actor] - 12);
    action(
      g,
      transition.kind === "takedown" ? "sprawl" : "frame",
      other(actor),
    );
    return;
  }
  g.position = transition.to;
  g.top = transition.top;
  g.positionAge = 0;
  g.submission = null;
  const points: Record<string, number> = {
    takedown: 2,
    pass: 3,
    mount: 4,
    back: 4,
    sweep: 2,
  };
  g.points[actor] += points[transition.kind] ?? 0;
  if (g.top === null) {
    g.grip = [0, 0];
    g.control = [0, 0];
  } else if (transition.kind === "takedown" || transition.kind === "sweep") {
    g.control[g.top] = 20;
    g.control[other(g.top)] = 5;
  } else {
    g.control[actor] = Math.max(12, g.control[actor] - 22);
    g.control[other(actor)] = Math.max(0, g.control[other(actor)] - 12);
  }
  // A short recovery also prevents held keys from chaining on one resolution tick.
  b.fighters[actor].cooldown = Math.max(b.fighters[actor].cooldown, 0.3);
  b.fighters[actor].meter = clamp(b.fighters[actor].meter + 10);
  action(g, transition.kind, actor);
}

function moveStanding(b: Bout, inputs: [Input, Input], dt: number) {
  const positions = b.fighters.map(({ x, z }) => ({ x, z }));
  for (const seat of seats) {
    const f = b.fighters[seat],
      opponent = positions[other(seat)];
    const dx = opponent.x - positions[seat].x,
      dz = opponent.z - positions[seat].z;
    const length = Math.hypot(dx, dz) || 1;
    const forward = clamp(inputs[seat].forward, -1, 1),
      strafe = clamp(inputs[seat].strafe, -1, 1);
    const norm = Math.max(1, Math.hypot(forward, strafe));
    const speed = 2.3 * character(b, seat).speed * dt * (f.guard ? 0.5 : 1);
    f.x = clamp(
      f.x + (((dx / length) * forward - (dz / length) * strafe) / norm) * speed,
      -2.8,
      2.8,
    );
    f.z = clamp(
      f.z + (((dz / length) * forward + (dx / length) * strafe) / norm) * speed,
      -2.8,
      2.8,
    );
  }
  let dx = b.fighters[1].x - b.fighters[0].x,
    dz = b.fighters[1].z - b.fighters[0].z;
  let distance = Math.hypot(dx, dz);
  if (distance < 0.85) {
    // Stable fighter identity, rather than seat, defines the degenerate contact axis.
    if (distance < 1e-8) {
      dx = 0;
      dz = b.fighters[0].id < b.fighters[1].id ? 1 : -1;
      distance = 1;
    }
    const push =
      (0.85 -
        Math.hypot(
          b.fighters[1].x - b.fighters[0].x,
          b.fighters[1].z - b.fighters[0].z,
        )) /
      2;
    for (const seat of seats) {
      const sign = seat === 0 ? -1 : 1;
      b.fighters[seat].x = clamp(
        b.fighters[seat].x + (dx / distance) * push * sign,
        -2.8,
        2.8,
      );
      b.fighters[seat].z = clamp(
        b.fighters[seat].z + (dz / distance) * push * sign,
        -2.8,
        2.8,
      );
    }
  }
}

function submissionKind(
  g: GrapplingState,
  actor: Seat,
): NonNullable<GrapplingState["submission"]>["kind"] | null {
  if (g.top === actor && g.control[actor] >= 18) {
    if (g.position === "back") return "rear-choke";
    if (g.position === "mount") return "armbar";
  }
  if (g.position === "guard" && g.top !== actor && g.control[actor] >= 62)
    return "triangle";
  return null;
}

function stepSubmission(
  b: Bout,
  g: GrapplingState,
  inputs: [Input, Input],
  bursts: [boolean, boolean],
  dt: number,
) {
  const submission = g.submission!;
  const attacker = submission.attacker,
    defender = other(attacker);
  const a = b.fighters[attacker],
    d = b.fighters[defender];
  const pressing = inputs[attacker].hook && !a.guard && a.stamina >= 3;
  const defending = d.guard && d.stamina >= 3;
  if (pressing) {
    a.stamina = clamp(a.stamina - 10 * dt);
    const pressure =
      30 *
      (0.5 + a.stamina / 200) *
      (1 + (character(b, attacker).power - 1) * 0.15);
    submission.progress = clamp(
      submission.progress + (pressure - (defending ? 31 : 0)) * dt,
    );
    if (defending) d.stamina = clamp(d.stamina - 6 * dt);
  } else submission.progress = clamp(submission.progress - 24 * dt);
  if (bursts[defender]) {
    submission.progress = Math.max(0, submission.progress - 32);
    g.control[attacker] = Math.max(0, g.control[attacker] - 12);
  }
  if (submission.progress >= 100) {
    b.ended = true;
    b.winner = attacker;
    b.reason = "서브미션 · 탭";
    b.fighters[defender].hp = 0;
    action(g, "tap", attacker);
  } else if (submission.progress === 0 && (!pressing || bursts[defender])) {
    g.submission = null;
    if (bursts[defender]) a.cooldown = Math.max(a.cooldown, 1.2);
    action(g, "submission-escape", defender);
  }
}

/** The parent advances the bout clock once; this reducer owns only grappling. */
export function stepGrappling(
  b: Bout,
  inputs: [Input, Input],
  dt: number,
): void {
  if (b.ended || b.countdown > 0) return;
  const g = b.grappling ?? (b.grappling = createGrapplingState());
  if (b.time <= 0) {
    b.ended = true;
    b.winner =
      g.points[0] === g.points[1] ? null : g.points[0] > g.points[1] ? 0 : 1;
    b.reason = "포인트 판정";
    return;
  }
  if (!Number.isFinite(dt)) return;
  dt = clamp(dt, 0, 0.1);
  if (dt === 0) return;
  g.positionAge += dt;
  const bursts: [boolean, boolean] = [false, false];
  for (const seat of seats) {
    const f = b.fighters[seat],
      input = inputs[seat],
      c = character(b, seat);
    f.cooldown = Math.max(0, f.cooldown - dt);
    f.dodgeCooldown = Math.max(0, f.dodgeCooldown - dt);
    f.attack = Math.max(0, f.attack - dt);
    f.evade = Math.max(0, f.evade - dt);
    f.combo = 0;
    f.comboTime = 0;
    f.guard = input.guard && f.stamina > 4;
    const working = input.jab || input.hook;
    f.stamina = clamp(
      f.stamina + dt * (f.guard ? -7 : working ? 2 : 13) * c.endurance,
    );
    f.meter = clamp(f.meter + dt * 1.5);
    if (input.dodge && f.dodgeCooldown <= 0 && f.stamina >= 18) {
      f.stamina -= 18;
      f.evade = 0.24;
      f.dodgeCooldown = 1.2;
      bursts[seat] = true;
    }
  }
  // Apply both style bonuses before deriving either fighter's intent.
  for (const seat of seats) {
    const f = b.fighters[seat];
    if (!inputs[seat].skill || f.meter < 100 || f.cooldown > 0) continue;
    f.meter = 0;
    f.skillSerial++;
    f.kind = "skill";
    f.attack = 0.45;
    const bonus = { nova: 22, blaze: 26, specs: 20, volt: 24 }[f.character];
    if (grounded(g.position)) {
      g.control[seat] = clamp(g.control[seat] + bonus);
      f.stamina = clamp(f.stamina + (g.top === seat ? 7 : 12));
    } else g.grip[seat] = clamp(g.grip[seat] + bonus);
    action(g, "signature", seat);
  }
  if (g.transition) {
    const t = g.transition;
    t.elapsed = Math.min(t.duration, t.elapsed + dt);
    t.defended ||= defenseStops(b, g, {
      kind: t.kind as Attempt["kind"],
      actor: t.actor,
      to: t.to,
      top: t.top,
      score: 0,
      cost: 0,
    });
    if (t.elapsed >= t.duration - 1e-8) completeTransition(b, g);
    return;
  }
  if (!grounded(g.position)) {
    moveStanding(b, inputs, dt);
    const distance = Math.hypot(
      b.fighters[0].x - b.fighters[1].x,
      b.fighters[0].z - b.fighters[1].z,
    );
    for (const seat of seats) {
      const f = b.fighters[seat];
      if (distance < 1.7 && inputs[seat].jab && !f.guard && f.stamina > 3) {
        g.grip[seat] = clamp(
          g.grip[seat] + 30 * dt * (1 + (character(b, seat).speed - 1) * 0.15),
        );
        f.stamina = clamp(f.stamina - 7 * dt);
      } else
        g.grip[seat] = Math.max(
          0,
          g.grip[seat] - (distance > 1.9 ? 20 : 4) * dt,
        );
    }
    if (
      g.position === "standing" &&
      distance < 1.7 &&
      Math.max(...g.grip) >= 20
    ) {
      g.position = "clinch";
      g.positionAge = 0;
      // An exactly simultaneous grip has no competitive effect or seat tie breaker.
      const actor =
        g.grip[0] === g.grip[1] ? g.lastActor : g.grip[0] > g.grip[1] ? 0 : 1;
      action(g, "grip", actor);
    } else if (g.position === "clinch" && distance > 1.95) {
      g.position = "standing";
      g.positionAge = 0;
    }
  } else {
    for (const seat of seats) {
      const f = b.fighters[seat],
        input = inputs[seat];
      const shift = Math.min(
        1,
        Math.hypot(clamp(input.forward, -1, 1), clamp(input.strafe, -1, 1)),
      );
      if (input.jab && !f.guard && f.stamina > 3) {
        g.control[seat] = clamp(
          g.control[seat] + (seat === g.top ? 25 : 30) * dt,
        );
        f.stamina = clamp(f.stamina - 6 * dt);
      } else
        g.control[seat] = clamp(g.control[seat] + (f.guard ? 7 : -0.8) * dt);
      if (
        seat === g.top &&
        input.hook &&
        !input.jab &&
        !f.guard &&
        !g.submission &&
        f.stamina > 3
      ) {
        g.control[seat] = clamp(g.control[seat] + 12 * dt);
        f.stamina = clamp(f.stamina - 4 * dt);
      }
      if (shift && f.stamina > 3) {
        g.control[seat] = clamp(g.control[seat] + shift * 3 * dt);
        f.stamina = clamp(f.stamina - shift * 2 * dt);
      }
    }
  }
  if (g.submission) {
    stepSubmission(b, g, inputs, bursts, dt);
    if (b.ended || g.submission) return;
    // A defender can turn a successful burst into a positional escape below.
  }
  const attempts: Attempt[] = [];
  const submissions: {
    actor: Seat;
    kind: NonNullable<GrapplingState["submission"]>["kind"];
    score: number;
  }[] = [];
  for (const seat of seats) {
    const f = b.fighters[seat],
      input = inputs[seat];
    if (f.cooldown > 0 || (f.guard && !bursts[seat])) continue;
    const score =
      (grounded(g.position) ? g.control[seat] : g.grip[seat]) +
      f.stamina * 0.18;
    if (!grounded(g.position)) {
      if (f.guard) continue;
      if (
        input.hook &&
        g.grip[seat] >= 28 &&
        f.stamina >= 22 &&
        Math.hypot(
          f.x - b.fighters[other(seat)].x,
          f.z - b.fighters[other(seat)].z,
        ) < 1.75
      )
        attempts.push({
          kind: "takedown",
          actor: seat,
          to: "guard",
          top: seat,
          score,
          cost: 22,
        });
      continue;
    }
    if (seat !== g.top && bursts[seat] && g.control[seat] >= 18) {
      const to: GrapplingPosition =
        g.position === "back"
          ? "mount"
          : g.position === "mount"
            ? "side"
            : g.position === "side"
              ? "guard"
              : "standing";
      attempts.push({
        kind: "escape",
        actor: seat,
        to,
        top: to === "standing" ? null : g.top,
        score: score + 8,
        cost: 0,
      });
      continue;
    }
    if (f.guard) continue;
    const kind = input.hook ? submissionKind(g, seat) : null;
    if (kind && f.stamina >= 10) {
      submissions.push({ actor: seat, kind, score });
      continue;
    }
    if (
      seat !== g.top &&
      input.hook &&
      g.control[seat] >= 40 &&
      f.stamina >= 24
    )
      attempts.push({
        kind: "sweep",
        actor: seat,
        to: "guard",
        top: seat,
        score,
        cost: 24,
      });
    if (
      seat === g.top &&
      input.jab &&
      g.control[seat] >= 28 &&
      f.stamina >= 14 &&
      g.position !== "back"
    ) {
      const kind =
        g.position === "guard"
          ? "pass"
          : g.position === "side"
            ? "mount"
            : "back";
      attempts.push({
        kind,
        actor: seat,
        to: kind === "pass" ? "side" : kind,
        top: seat,
        score,
        cost: 14,
      });
    }
  }
  if (attempts.length) {
    // All competing intentions use the same already-updated snapshot. No winner is
    // chosen until both costs and scores are known, including opposing role actions.
    for (const attempt of attempts) {
      b.fighters[attempt.actor].stamina = clamp(
        b.fighters[attempt.actor].stamina - attempt.cost,
      );
      b.fighters[attempt.actor].cooldown = 1.05;
    }
    attempts.sort((a, c) => c.score - a.score);
    if (attempts[1] && Math.abs(attempts[0].score - attempts[1].score) < 3) {
      action(g, "scramble", g.lastActor);
      return;
    }
    const winner = attempts[0];
    g.submission = null;
    g.transition = {
      kind: winner.kind,
      actor: winner.actor,
      from: g.position,
      to: winner.to,
      top: winner.top,
      elapsed: 0,
      duration:
        winner.kind === "takedown"
          ? 0.62
          : winner.kind === "sweep"
            ? 0.6
            : 0.48,
      defended: defenseStops(b, g, winner),
    };
    return;
  }
  if (submissions.length) {
    submissions.sort((a, c) => c.score - a.score);
    if (
      submissions[1] &&
      Math.abs(submissions[0].score - submissions[1].score) < 3
    ) {
      for (const submission of submissions)
        b.fighters[submission.actor].cooldown = 0.8;
      action(g, "scramble", g.lastActor);
      return;
    }
    const submission = submissions[0];
    g.submission = {
      attacker: submission.actor,
      kind: submission.kind,
      progress: 0,
    };
    action(g, "submission", submission.actor);
  }
}

export function aiGrapplingInput(
  b: Bout,
  index: number,
  difficulty: number,
  roll: number,
): Input {
  const input: Input = {
    forward: 0,
    strafe: 0,
    jab: false,
    hook: false,
    guard: false,
    dodge: false,
  };
  if (b.ended || b.countdown > 0) return input;
  const seat: Seat = index === 0 ? 0 : 1,
    g = b.grappling;
  if (!g) return input;
  difficulty = clamp(difficulty, 0, 1);
  const f = b.fighters[seat],
    o = b.fighters[other(seat)];
  const distance = Math.hypot(f.x - o.x, f.z - o.z);
  const threatened = g.transition?.actor === other(seat);
  input.skill = f.meter >= 100 && f.stamina < 65;
  if (!grounded(g.position)) {
    input.forward = distance > 1.25 ? 1 : 0;
    input.strafe =
      distance > 1.7 ? Math.sin(b.time * 0.9 + (seat ? 1.7 : 0)) * 0.12 : 0;
    input.jab = distance < 1.7 && f.stamina > 38;
    input.hook =
      distance < 1.7 &&
      g.grip[seat] >= 37 &&
      f.stamina > 28 &&
      roll < 0.09 + difficulty * 0.15;
    // Roll once per tick for noticing the attempt, then sustain an acquired guard.
    // A large per-frame probability would make a 19-tick window certain defense.
    input.guard = !!threatened && (f.guard || roll < 0.01 + difficulty * 0.025);
    input.dodge = !!threatened && roll > 0.99 - difficulty * 0.008;
    return input;
  }
  if (g.submission) {
    if (g.submission.attacker === seat) input.hook = f.stamina >= 5;
    else {
      input.guard = roll < 0.35 + difficulty * 0.45;
      input.dodge =
        g.submission.progress > 20 && roll > 0.94 - difficulty * 0.04;
      input.jab = !input.guard;
    }
    return input;
  }
  if (g.top === seat) {
    input.jab = f.stamina > 38;
    input.hook =
      (g.position === "mount" || g.position === "back") &&
      g.control[seat] >= 20 &&
      roll < 0.93;
    if (input.hook) input.jab = false;
    input.guard =
      !!threatened && g.control[other(seat)] > 40 && roll < difficulty * 0.45;
  } else {
    input.jab = f.stamina > 38;
    input.hook =
      g.control[seat] >= 44 && f.stamina > 30 && roll < 0.2 + difficulty * 0.2;
    input.dodge =
      g.control[seat] >= 25 && f.stamina > 30 && !!threatened && roll > 0.93;
    input.guard = !!threatened && roll < difficulty * 0.45;
    if (input.hook) input.jab = false;
  }
  return input;
}

export function grapplingContext(b: Bout, view: number) {
  const g = b.grappling,
    seat: Seat = view === 0 ? 0 : 1;
  const position = g?.position ?? "standing";
  const names: Record<GrapplingPosition, string> = {
    standing: "스탠딩",
    clinch: "클린치",
    guard: "클로즈드 가드",
    side: "사이드 컨트롤",
    mount: "마운트",
    back: "백 컨트롤",
  };
  if (!g || !grounded(position))
    return {
      position: names[position],
      role: "그립 싸움",
      jab: "그립",
      hook: "테이크다운",
      guard: "테이크다운 방어",
      dodge: "스프롤",
      hint: "가까이 이동해 J로 그립을 쌓고 K로 테이크다운. Space 또는 Shift로 방어하세요.",
    };
  if (g.submission) {
    const attacking = g.submission.attacker === seat;
    return {
      position: names[position],
      role: attacking ? "서브미션 공격" : "서브미션 방어",
      jab: attacking ? "컨트롤" : "프레임",
      hook: attacking ? "압박 유지" : "스윕 준비",
      guard: "압박 방어",
      dodge: "탈출 버스트",
      hint: attacking
        ? "K를 유지해 압박하세요. 스태미나가 부족하면 쉬어가세요."
        : "Space로 압박을 막고 Shift를 눌러 탈출하세요. 스태미나를 관리하세요.",
    };
  }
  const top = g.top === seat,
    submission = submissionKind(g, seat);
  return {
    position: names[position],
    role: top ? "상위" : "하위",
    jab: top ? "포지션 전진" : "프레임 만들기",
    hook:
      submission === "rear-choke"
        ? "리어 네이키드 초크"
        : submission === "armbar"
          ? "암바"
          : submission === "triangle"
            ? "트라이앵글"
            : top
              ? "컨트롤 유지"
              : "스윕",
    guard: "포지션 방어",
    dodge: top ? "전환 방어" : "포지션 탈출",
    hint: top
      ? "J로 컨트롤을 쌓고 가드 → 사이드 → 마운트 → 백으로 전진하세요."
      : "J로 프레임을 쌓고 K로 스윕. 가드에서 컨트롤이 충분하면 트라이앵글을 노리세요.",
  };
}
