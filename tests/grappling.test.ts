import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createBout,
  idleInput,
  stepBout,
  aiInput,
  type Bout,
  type Input,
} from "../shared/game.ts";
import {
  aiGrapplingInput,
  bjjSignatures,
  createGrapplingState,
  grapplingContext,
  stepGrappling,
} from "../shared/grappling.ts";

const press = (keys: Partial<Input> = {}): Input => ({
  ...idleInput(),
  ...keys,
});
const neutral = (): [Input, Input] => [press(), press()];
const bout = (): Bout => {
  const b = createBout(["a", "b"], ["specs", "specs"], "bjj");
  b.countdown = 0;
  b.fighters[0].z = 0.6;
  b.fighters[1].z = -0.6;
  return b;
};
const state = (b: Bout) => b.grappling!;
function run(b: Bout, seconds: number, input: [Input, Input] = neutral()) {
  for (let tick = 0; tick < Math.ceil(seconds * 30) && !b.ended; tick++)
    stepBout(b, input, 1 / 30);
}
function ground(
  position: "guard" | "side" | "mount" | "back" = "guard",
  top: 0 | 1 = 0,
) {
  const b = bout();
  Object.assign(state(b), { position, top, control: [35, 0] });
  return b;
}

test("a jiu-jitsu bout starts standing with independent neutral grip and point state", () => {
  const b = createBout(["a", "b"], ["specs", "specs"], "bjj");
  assert.equal(b.sport, "bjj");
  assert.ok(b.grappling, "jiu-jitsu requires its own reducer state");
  assert.equal(b.grappling.position, "standing");
  assert.equal(b.grappling.top, null);
  assert.deepEqual(b.grappling.points, [0, 0]);
  assert.deepEqual(b.grappling.grip, [0, 0]);
});

test("top players cannot retreat with the escape key and farm positional points", () => {
  for (const top of [0, 1] as const) {
    const b = ground("mount", top);
    state(b).control = top === 0 ? [60, 0] : [0, 60];
    const inputs = neutral();
    inputs[top] = press({ dodge: true });
    stepBout(b, inputs, 1 / 30);
    run(b, 1.5);
    assert.equal(state(b).position, "mount");
    assert.equal(state(b).transition, null);
    assert.deepEqual(state(b).points, [0, 0]);
  }
});

test("grips require close contact, build over time, and never deal strike damage", () => {
  const b = bout();
  b.fighters[0].z = 2;
  b.fighters[1].z = -2;
  run(b, 1, [press({ jab: true, hook: true }), press()]);
  assert.equal(state(b).grip[0], 0);
  b.fighters[0].z = 0.6;
  b.fighters[1].z = -0.6;
  run(b, 1, [press({ jab: true }), press()]);
  assert.ok(state(b).grip[0] > 20);
  assert.equal(state(b).position, "clinch");
  assert.deepEqual(
    b.fighters.map((f) => f.hp),
    [100, 100],
  );
  assert.ok(
    state(b).actionSerial < 5,
    "held grips must not replay action cues each frame",
  );
});

test("a committed takedown resolves through a transition and awards two points once", () => {
  const b = bout();
  Object.assign(state(b), { position: "clinch", grip: [65, 0] });
  stepBout(b, [press({ hook: true }), press()], 1 / 30);
  assert.equal(state(b).position, "clinch");
  assert.equal(state(b).transition?.to, "guard");
  assert.equal(state(b).transition?.top, 0);
  run(b, 0.8);
  assert.equal(state(b).position, "guard");
  assert.equal(state(b).top, 0);
  assert.deepEqual(state(b).points, [2, 0]);
  run(b, 1);
  assert.deepEqual(state(b).points, [2, 0]);
});

test("space and a timed sprawl can stop a takedown while exhaustion cannot", () => {
  for (const defense of [{ guard: true }, { dodge: true }]) {
    const defended = bout();
    Object.assign(state(defended), { position: "clinch", grip: [45, 0] });
    run(defended, 0.9, [press({ hook: true }), press(defense)]);
    assert.notEqual(state(defended).position, "guard");
    assert.deepEqual(state(defended).points, [0, 0]);
    assert.ok(defended.fighters[1].stamina < 100);
    const exhausted = bout();
    Object.assign(state(exhausted), { position: "clinch", grip: [45, 0] });
    exhausted.fighters[1].stamina = 0;
    stepBout(exhausted, [press({ hook: true }), press(defense)], 1 / 30);
    run(exhausted, 0.8);
    assert.equal(state(exhausted).top, 0);
  }
});

test("reacting during a takedown window can defend before contact resolves", () => {
  const b = bout();
  Object.assign(state(b), { position: "clinch", grip: [45, 0] });
  stepBout(b, [press({ hook: true }), press()], 1 / 30);
  assert.equal(state(b).transition?.kind, "takedown");
  run(b, 0.8, [press(), press({ dodge: true })]);
  assert.deepEqual(state(b).points, [0, 0]);
  assert.notEqual(state(b).position, "guard");
});

test("equal simultaneous takedowns remain neutral in either seat assignment", () => {
  const b = bout();
  Object.assign(state(b), { position: "clinch", grip: [65, 65] });
  run(b, 0.9, [press({ hook: true }), press({ hook: true })]);
  assert.equal(state(b).top, null);
  assert.deepEqual(state(b).points, [0, 0]);
  assert.equal(b.fighters[0].stamina, b.fighters[1].stamina);
  assert.equal(state(b).lastAction, "scramble");
  assert.ok(b.fighters[0].stamina < 90, "both attempts spend stamina");
});

test("top pressure passes guard then takes mount and back with position points", () => {
  const b = ground();
  run(b, 10, [press({ jab: true }), press()]);
  assert.equal(state(b).position, "back");
  assert.equal(state(b).top, 0);
  assert.deepEqual(state(b).points, [11, 0]);
  assert.deepEqual(
    b.fighters.map((f) => f.hp),
    [100, 100],
  );
});

test("bottom frames create a sweep and shift escapes backward through positions", () => {
  const b = ground();
  run(b, 2, [press(), press({ jab: true })]);
  assert.ok(state(b).control[1] >= 40);
  run(b, 0.9, [press(), press({ hook: true })]);
  assert.equal(state(b).top, 1);
  assert.equal(state(b).position, "guard");
  assert.deepEqual(state(b).points, [0, 2]);
  const trapped = ground("mount");
  state(trapped).control = [0, 60];
  run(trapped, 0.8, [press(), press({ dodge: true })]);
  assert.equal(state(trapped).position, "side");
  assert.equal(state(trapped).top, 0);
  assert.deepEqual(state(trapped).points, [0, 0]);
});

test("equal pass and sweep intentions do not get resolved by array order", () => {
  const b = ground();
  state(b).control = [60, 60];
  run(b, 0.8, [press({ jab: true }), press({ hook: true })]);
  assert.equal(state(b).position, "guard");
  assert.deepEqual(state(b).points, [0, 0]);
  assert.equal(state(b).lastAction, "scramble");
});

test("submission pressure takes sustained K and a tap ends the round", () => {
  for (const [position, top, attacker, kind] of [
    ["mount", 0, 0, "armbar"],
    ["back", 0, 0, "rear-choke"],
    ["guard", 0, 1, "triangle"],
  ] as const) {
    const b = ground(position, top);
    state(b).control[attacker] = 65;
    const input = neutral();
    input[attacker].hook = true;
    stepBout(b, input, 1 / 30);
    assert.equal(state(b).submission?.kind, kind);
    assert.equal(b.ended, false);
    assert.deepEqual(
      b.fighters.map((f) => f.hp),
      [100, 100],
    );
    run(b, 8, input);
    assert.equal(b.ended, true, `${kind} must eventually tap an idle opponent`);
    assert.equal(b.winner, attacker);
    assert.equal(b.fighters[1 - attacker].hp, 0);
    assert.match(b.reason, /탭|서브미션|submission/i);
  }
});

test("active submission defense slows pressure and stamina-backed escape bursts break it", () => {
  const idle = ground("mount");
  const guarded = ground("mount");
  run(idle, 1.6, [press({ hook: true }), press()]);
  run(guarded, 1.6, [press({ hook: true }), press({ guard: true })]);
  assert.ok(state(idle).submission);
  assert.ok(
    (state(guarded).submission?.progress ?? 0) <
      state(idle).submission!.progress,
  );
  assert.equal(guarded.ended, false);
  const escaped = ground("back");
  state(escaped).control[1] = 55;
  run(escaped, 0.5, [press({ hook: true }), press()]);
  run(escaped, 0.9, [
    press({ hook: true }),
    press({ guard: true, dodge: true }),
  ]);
  assert.equal(state(escaped).submission, null);
  assert.equal(escaped.ended, false);
  assert.ok(escaped.fighters[1].stamina < 100);
});

test("releasing K lets submission pressure decay and an exhausted attacker cannot finish", () => {
  const b = ground("mount");
  run(b, 1.2, [press({ hook: true }), press()]);
  assert.ok(state(b).submission);
  const pressure = state(b).submission!.progress;
  run(b, 0.5);
  assert.ok((state(b).submission?.progress ?? 0) < pressure);
  const tired = ground("mount");
  tired.fighters[0].stamina = 0;
  run(tired, 2, [press({ hook: true }), press({ guard: true })]);
  assert.equal(tired.ended, false);
  assert.ok((state(tired).submission?.progress ?? 0) < 50);
});

test("full style meter gives a bounded positional bonus without a skill kill", () => {
  const b = ground("back");
  b.fighters[0].meter = 100;
  state(b).submission = { attacker: 0, kind: "rear-choke", progress: 90 };
  stepBout(b, [press({ skill: true }), press()], 1 / 30);
  assert.equal(b.fighters[0].skillSerial, 1);
  assert.ok(b.fighters[0].meter < 1);
  assert.ok(state(b).control[0] > 35 && state(b).control[0] <= 65);
  assert.equal(b.ended, false);
  assert.equal(b.fighters[1].hp, 100);
  run(b, 0.5, [press({ skill: true }), press()]);
  assert.equal(b.fighters[0].skillSerial, 1);
});

test("the clock decides points, ties draw, countdown and ended rounds stay locked", () => {
  for (const [points, winner] of [
    [[5, 2], 0],
    [[2, 5], 1],
    [[2, 2], null],
  ] as const) {
    const b = bout();
    state(b).points = [...points];
    b.time = 1 / 60;
    stepBout(b, neutral(), 1 / 30);
    assert.equal(b.ended, true);
    assert.equal(b.winner, winner);
    assert.deepEqual(
      b.fighters.map((f) => f.hp),
      [100, 100],
    );
    const frozen = structuredClone(b);
    stepBout(b, [press({ hook: true }), press({ hook: true })], 0.1);
    assert.deepEqual(b, frozen);
  }
  const countdown = bout();
  countdown.countdown = 2;
  const original = structuredClone(state(countdown));
  run(countdown, 1, [press({ jab: true, hook: true, skill: true }), press()]);
  assert.deepEqual(state(countdown), original);
  assert.equal(countdown.time, 90);
});

test("stamina and cooldowns prevent exhausted or held-key action floods", () => {
  const b = bout();
  Object.assign(state(b), { position: "clinch", grip: [75, 0] });
  b.fighters[0].stamina = 0;
  stepBout(b, [press({ hook: true }), press()], 1 / 30);
  assert.equal(state(b).transition, null);
  b.fighters[0].stamina = 100;
  run(b, 10, [press({ hook: true }), press({ guard: true })]);
  assert.ok(state(b).actionSerial > 0);
  assert.ok(state(b).actionSerial < 20);
  for (const f of b.fighters) assert.ok(f.stamina >= 0 && f.stamina <= 100);
});

test("holding guard with attack keys keeps a sprawl defensive", () => {
  const b = bout();
  Object.assign(state(b), { position: "clinch", grip: [75, 0] });
  stepBout(
    b,
    [press({ jab: true, hook: true, guard: true, dodge: true }), press()],
    1 / 30,
  );
  assert.equal(state(b).transition, null);
  assert.deepEqual(state(b).points, [0, 0]);
});

test("fresh bouts do not retain nested state, submissions or transitions from a rematch", () => {
  const a = ground("mount");
  state(a).points[0] = 9;
  run(a, 0.5, [press({ hook: true }), press()]);
  const b = bout();
  assert.deepEqual(state(b).points, [0, 0]);
  assert.deepEqual(state(b).control, [0, 0]);
  assert.equal(state(b).submission, null);
  assert.equal(state(b).transition, null);
  assert.equal(state(b).actionSerial, 0);
});

test("standing movement remains normalized, bounded and reversible by seat", () => {
  const single = bout();
  const diagonal = structuredClone(single);
  const start = { x: single.fighters[0].x, z: single.fighters[0].z };
  stepBout(single, [press({ forward: 1 }), press()], 0.1);
  stepBout(diagonal, [press({ forward: 1, strafe: 1 }), press()], 0.1);
  const distance = (b: Bout) =>
    Math.hypot(b.fighters[0].x - start.x, b.fighters[0].z - start.z);
  assert.ok(distance(single) > 0.1, "movement must make observable progress");
  assert.ok(Math.abs(distance(single) - distance(diagonal)) < 1e-10);
  const a = bout();
  a.fighters[0].x = -1;
  a.fighters[1].x = 0.8;
  const b = structuredClone(a);
  b.fighters.reverse();
  const one = press({ forward: 0.8, strafe: 1 });
  const two = press({ forward: -0.5, strafe: 0.6 });
  run(a, 8, [one, two]);
  run(b, 8, [two, one]);
  for (const f of a.fighters) {
    const other = b.fighters.find((g) => g.id === f.id)!;
    assert.ok(Math.abs(f.x - other.x) < 1e-10);
    assert.ok(Math.abs(f.z - other.z) < 1e-10);
    assert.ok(Math.abs(f.x) <= 2.8 && Math.abs(f.z) <= 2.8);
  }
});

test("grappling actions preserve the same outcome with reversed fighter seats", () => {
  const a = bout();
  Object.assign(state(a), { position: "clinch", grip: [75, 30] });
  a.fighters[0].stamina = 80;
  a.fighters[1].stamina = 55;
  const b = structuredClone(a);
  b.fighters.reverse();
  state(b).grip.reverse();
  run(a, 0.9, [press({ hook: true }), press({ hook: true })]);
  run(b, 0.9, [press({ hook: true }), press({ hook: true })]);
  assert.equal(state(a).position, state(b).position);
  const swappedTop = state(b).top;
  assert.notEqual(swappedTop, null);
  assert.equal(state(a).top, 1 - swappedTop!);
  assert.deepEqual(state(a).points, state(b).points.slice().reverse());
  assert.deepEqual(
    a.fighters.map((f) => f.stamina),
    b.fighters.map((f) => f.stamina).reverse(),
  );
});

test("context labels expose each role's available actions including guard triangles", () => {
  const b = bout();
  assert.match(grapplingContext(b, 0).jab, /그립/);
  assert.match(grapplingContext(b, 0).hook, /테이크다운/);
  Object.assign(state(b), { position: "guard", top: 0, control: [35, 45] });
  assert.match(grapplingContext(b, 1).jab, /프레임/);
  assert.match(grapplingContext(b, 1).hook, /스윕/);
  state(b).control[1] = 65;
  assert.match(grapplingContext(b, 1).hook, /트라이앵글/);
  state(b).position = "mount";
  assert.match(grapplingContext(b, 0).hook, /암바/);
  state(b).submission = { attacker: 0, kind: "armbar", progress: 25 };
  assert.match(grapplingContext(b, 0).hook, /압박/);
  assert.match(grapplingContext(b, 1).dodge, /탈출/);
  assert.equal(grapplingContext(b, 1).role, "서브미션 방어");
});

test("direct reducer calls respect countdown, ended state, clamped dt and shared clock ownership", () => {
  const b = bout();
  const fresh = createGrapplingState();
  fresh.points[0] = 4;
  assert.deepEqual(createGrapplingState().points, [0, 0]);
  const unchanged = structuredClone(b);
  stepGrappling(b, neutral(), -1);
  stepGrappling(b, neutral(), Number.NaN);
  assert.deepEqual(b, unchanged);
  stepGrappling(b, neutral(), 2);
  assert.equal(b.time, 90);
  assert.equal(state(b).positionAge, 0.1);
  b.countdown = 1;
  const frozen = structuredClone(b);
  stepGrappling(b, [press({ jab: true, hook: true }), press()], 0.1);
  assert.deepEqual(b, frozen);
  assert.deepEqual(aiGrapplingInput(b, 0, 1, 0), press());
  b.countdown = 0;
  b.ended = true;
  assert.deepEqual(aiGrapplingInput(b, 0, 1, 0), press());
  for (const id of ["nova", "blaze", "specs", "volt"] as const) {
    assert.ok(
      bjjSignatures[id].name &&
        bjjSignatures[id].tag &&
        bjjSignatures[id].description,
    );
  }
});

test("ground contests and submission defenses remain equivalent after seat reversal", () => {
  for (const mode of ["sweep", "submission"] as const) {
    const a = ground(mode === "sweep" ? "guard" : "back");
    a.fighters[0].character = "blaze";
    a.fighters[1].character = "nova";
    state(a).control = mode === "sweep" ? [45, 56] : [40, 60];
    if (mode === "submission")
      state(a).submission = { attacker: 0, kind: "rear-choke", progress: 28 };
    const b = structuredClone(a);
    b.fighters.reverse();
    const g = state(b);
    g.top = 1;
    g.control.reverse();
    g.grip.reverse();
    g.points.reverse();
    if (g.submission) g.submission.attacker = 1;
    const one = mode === "sweep" ? press({ jab: true }) : press({ hook: true });
    const two =
      mode === "sweep"
        ? press({ hook: true })
        : press({ guard: true, dodge: true });
    run(a, 1, [one, two]);
    run(b, 1, [two, one]);
    assert.equal(state(a).position, g.position);
    assert.equal(state(a).top, g.top === null ? null : 1 - g.top);
    assert.deepEqual(state(a).points, g.points.slice().reverse());
    assert.deepEqual(state(a).control, g.control.slice().reverse());
    assert.deepEqual(
      a.fighters.map((f) => f.stamina),
      b.fighters.map((f) => f.stamina).reverse(),
    );
    assert.equal(a.ended, b.ended);
  }
});

test("AI bouts approach, grapple and finish without HP chip or non-finite state", () => {
  for (let seed = 1; seed <= 8; seed++) {
    const b = createBout(
      ["bot-a", "bot-b"],
      [seed % 2 ? "nova" : "volt", seed % 3 ? "specs" : "blaze"],
      "bjj",
    );
    b.countdown = 0;
    let random = seed;
    let reachedGround = false;
    for (let tick = 0; tick < 2800 && !b.ended; tick++) {
      const roll = () =>
        (random = (random * 1664525 + 1013904223) >>> 0) / 2 ** 32;
      stepBout(
        b,
        [aiInput(b, 0, 0.65, roll()), aiInput(b, 1, 0.8, roll())],
        1 / 30,
      );
      reachedGround ||= state(b).top !== null;
      if (!b.ended)
        assert.deepEqual(
          b.fighters.map((f) => f.hp),
          [100, 100],
        );
      for (const f of b.fighters)
        for (const value of [f.x, f.z, f.stamina, f.meter])
          assert.ok(Number.isFinite(value));
    }
    assert.ok(reachedGround, `seed ${seed} must reach a grounded position`);
    assert.ok(b.ended, `seed ${seed} must finish by tap or 90-second points`);
    assert.ok(state(b).actionSerial > 2);
  }
});

test("holding the contextual top-control action builds pressure without throwing strikes", () => {
  const b = createBout(["a", "b"], ["nova", "blaze"], "bjj");
  b.countdown = 0;
  b.grappling!.position = "guard";
  b.grappling!.top = 0;
  b.grappling!.control = [5, 0];
  for (let i = 0; i < 15; i++)
    stepBout(b, [{ ...idleInput(), hook: true }, idleInput()], 1 / 30);
  assert.ok(b.grappling!.control[0] > 8, "K control must not be a no-op");
  assert.equal(b.grappling!.position, "guard");
  assert.deepEqual(
    b.fighters.map((f) => f.hp),
    [100, 100],
  );
});
