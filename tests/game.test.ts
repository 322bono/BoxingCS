import { test } from "node:test";
import assert from "node:assert/strict";
import { createBout, stepBout, idleInput, CHARACTERS } from "../shared/game.ts";
// Catch unrestricted remote damage, ignored block, stamina bypass, and post-KO hits.
test("attacks miss outside reach and damage an opponent inside reach", () => {
  const b = createBout(["a", "b"], ["specs", "specs"]);
  b.countdown = 0;
  stepBout(b, [{ ...idleInput(), jab: true }, idleInput()], 1 / 30);
  assert.equal(b.fighters[1].hp, 100);
  b.fighters[0].z = -0.5;
  b.fighters[1].z = 0.5;
  b.fighters[0].cooldown = 0;
  stepBout(b, [{ ...idleInput(), jab: true }, idleInput()], 1 / 30);
  assert.ok(b.fighters[1].hp < 100);
  assert.equal(b.fighters[0].hits, 1);
});
test("guard reduces damage and exhausted fighters cannot punch", () => {
  const b = createBout(["a", "b"], ["specs", "specs"]);
  b.countdown = 0;
  b.fighters[0].z = -0.5;
  b.fighters[1].z = 0.5;
  stepBout(
    b,
    [
      { ...idleInput(), hook: true },
      { ...idleInput(), guard: true },
    ],
    1 / 30,
  );
  assert.ok(b.fighters[1].hp > 90);
  b.fighters[0].cooldown = 0;
  b.fighters[0].stamina = 0;
  const hp = b.fighters[1].hp;
  stepBout(b, [{ ...idleInput(), hook: true }, idleInput()], 1 / 30);
  assert.equal(b.fighters[1].hp, hp);
});
test("KO locks the result and countdown prevents early punches", () => {
  const b = createBout(["a", "b"], ["blaze", "nova"]);
  b.fighters[0].z = -0.5;
  b.fighters[1].z = 0.5;
  stepBout(b, [{ ...idleInput(), hook: true }, idleInput()], 1 / 30);
  assert.equal(b.fighters[1].hp, 100);
  b.countdown = 0;
  b.fighters[1].hp = 1;
  stepBout(b, [{ ...idleInput(), hook: true }, idleInput()], 1 / 30);
  assert.equal(b.ended, true);
  assert.equal(b.winner, 0);
  const time = b.time;
  stepBout(b, [idleInput(), idleInput()], 1);
  assert.equal(b.time, time);
});
test("movement stays inside ring and cannot overlap fighters", () => {
  const b = createBout(["a", "b"], ["specs", "specs"]);
  b.countdown = 0;
  for (let i = 0; i < 500; i++)
    stepBout(
      b,
      [
        { ...idleInput(), forward: 1 },
        { ...idleInput(), forward: 1 },
      ],
      1 / 30,
    );
  assert.ok(
    Math.hypot(
      b.fighters[0].x - b.fighters[1].x,
      b.fighters[0].z - b.fighters[1].z,
    ) >= 0.75,
  );
});
test("signature consumes a full meter and cannot bypass range or cooldown", () => {
  const b = createBout(["a", "b"], ["specs", "blaze"]);
  b.countdown = 0;
  const a = b.fighters[0] as any;
  a.meter = 100;
  stepBout(b, [{ ...idleInput(), skill: true } as any, idleInput()], 1 / 30);
  assert.equal(a.meter, 0);
  assert.equal(b.fighters[1].hp, 100);
  a.cooldown = 0;
  a.z = 0.5;
  b.fighters[1].z = -0.5;
  stepBout(b, [{ ...idleInput(), skill: true } as any, idleInput()], 1 / 30);
  assert.equal(b.fighters[1].hp, 100);
  a.meter = 100;
  stepBout(b, [{ ...idleInput(), skill: true } as any, idleInput()], 1 / 30);
  assert.ok(b.fighters[1].hp <= 76);
});
test("the remaining power and endurance styles retain their tradeoffs", () => {
  const results = CHARACTERS.map(({ id }) => {
    const b = createBout(["a", "b"], [id, "specs"]);
    b.countdown = 0;
    b.fighters[0].z = 0.5;
    b.fighters[1].z = -0.5;
    b.fighters[0].meter = 100;
    b.fighters[0].stamina = 50;
    stepBout(b, [{ ...idleInput(), skill: true }, idleInput()], 1 / 30);
    return {
      id,
      damage: 100 - b.fighters[1].hp,
      stamina: b.fighters[0].stamina,
    };
  });
  assert.ok(
    results.find((r) => r.id === "blaze")!.damage >
      results.find((r) => r.id === "nova")!.damage,
  );
  assert.ok(
    results.find((r) => r.id === "specs")!.stamina >
      results.find((r) => r.id === "volt")!.stamina,
  );
});

test("a hit received this tick cannot unlock a skill for only the later seat", () => {
  const b = createBout(["host", "guest"], ["specs", "specs"]);
  b.countdown = 0;
  b.fighters[0].z = -0.5;
  b.fighters[1].z = 0.5;
  b.fighters.forEach((f) => (f.meter = 92));
  const attack = { ...idleInput(), jab: true, skill: true };
  stepBout(b, [attack, attack], 1 / 30);
  assert.deepEqual(
    b.fighters.map((f) => f.kind),
    ["jab", "jab"],
  );
  assert.deepEqual(
    b.fighters.map((f) => f.hp),
    [93.35, 93.35],
  );
  assert.deepEqual(
    b.fighters.map((f) => f.meter),
    [100, 100],
  );
});

test("simultaneous skills preserve the same received meter in both seats", () => {
  const b = createBout(["host", "guest"], ["specs", "specs"]);
  b.countdown = 0;
  b.fighters[0].z = -0.5;
  b.fighters[1].z = 0.5;
  b.fighters.forEach((f) => (f.meter = 100));
  const attack = { ...idleInput(), skill: true };
  stepBout(b, [attack, attack], 1 / 30);
  assert.deepEqual(
    b.fighters.map((f) => f.hp),
    [75.3, 75.3],
  );
  assert.deepEqual(
    b.fighters.map((f) => f.meter),
    [8, 8],
  );
});

test("movement is independent of which fighter is processed first", () => {
  const a = createBout(["host", "guest"], ["nova", "volt"]);
  a.countdown = 0;
  a.fighters[0].x = -0.7;
  a.fighters[1].x = 0.9;
  const b = structuredClone(a);
  b.fighters.reverse();
  const first = { ...idleInput(), forward: 1, strafe: 0.6 };
  const second = { ...idleInput(), forward: -0.4, strafe: 1 };
  for (let tick = 0; tick < 30; tick++) {
    stepBout(a, [first, second], 1 / 30);
    stepBout(b, [second, first], 1 / 30);
  }
  for (const f of a.fighters) {
    const swapped = b.fighters.find((g) => g.id === f.id)!;
    assert.ok(Math.abs(f.x - swapped.x) < 1e-10, `${f.id}: x`);
    assert.ok(Math.abs(f.z - swapped.z) < 1e-10, `${f.id}: z`);
  }
});

test("simultaneous lethal punches end in a draw for either host assignment", () => {
  const b = createBout(["host", "guest"], ["specs", "specs"]);
  b.countdown = 0;
  b.fighters[0].z = -0.5;
  b.fighters[1].z = 0.5;
  b.fighters.forEach((f) => (f.hp = 1));
  const attack = { ...idleInput(), jab: true };
  stepBout(b, [attack, attack], 1 / 30);
  assert.deepEqual(
    b.fighters.map((f) => f.hp),
    [0, 0],
  );
  assert.equal(b.ended, true);
  assert.equal(b.winner, null);
});
