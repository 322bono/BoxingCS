import { test } from "node:test";
import assert from "node:assert/strict";
import { createBout } from "../shared/game.ts";
import { CombatCameraMotion } from "../src/combat-camera.ts";

test("combat camera responds mildly to movement and punches without changing simulation state", () => {
  const [own, opponent] = createBout(["a", "b"], ["nova", "volt"]).fighters;
  const motion = new CombatCameraMotion();
  motion.update(own, opponent, 1 / 60, true);
  let visibleMotion = false;
  for (let i = 0; i < 240; i++) {
    own.x += i < 120 ? 0.02 : -0.02;
    own.attack = i % 30 < 12 ? 0.2 - (i % 30) / 60 : 0;
    const snapshot = structuredClone(own);
    const offset = motion.update(own, opponent, 1 / 60, true);
    assert.ok(Math.abs(offset.x) <= 0.012 && Math.abs(offset.y) <= 0.012);
    assert.ok(
      Math.abs(offset.roll) <= 0.012 && Math.abs(offset.pitch) <= 0.012,
    );
    visibleMotion ||=
      Math.abs(offset.y) > 0.001 || Math.abs(offset.roll) > 0.001;
    assert.deepEqual(own, snapshot);
  }
  assert.ok(visibleMotion);
  for (let i = 0; i < 240; i++) {
    own.attack = 0;
    motion.update(own, opponent, 1 / 60, true);
  }
  const settled = motion.update(own, opponent, 1 / 60, true);
  assert.ok(Object.values(settled).every((value) => Math.abs(value) < 0.0001));
});

test("disabled motion and view resets discard movement history without a reconnect kick", () => {
  const [own, opponent] = createBout(["a", "b"], ["nova", "volt"]).fighters;
  const motion = new CombatCameraMotion();
  motion.update(own, opponent, 1 / 30, true);
  own.x += 1;
  const disabled = motion.update(own, opponent, 1 / 30, false);
  assert.ok(Object.values(disabled).every((value) => value === 0));
  motion.reset();
  own.x -= 2;
  own.attack = 0;
  const restored = motion.update(own, opponent, 1 / 30, true);
  assert.ok(Object.values(restored).every((value) => value === 0));
});
