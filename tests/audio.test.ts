import { test } from "node:test";
import assert from "node:assert/strict";
import { createBout } from "../shared/game.ts";
import { CombatSoundTracker } from "../src/audio/combat-sounds.ts";
const bout = () => {
  const b = createBout(["me", "them"], ["nova", "blaze"]);
  b.countdown = 0;
  return b;
};
test("audio resumes a snapshot without replaying historical hits or skills", () => {
  const b = bout(),
    tracker = new CombatSoundTracker();
  b.fighters[1].hp = 40;
  b.fighters[0].skillSerial = 7;
  assert.deepEqual(tracker.update(b, 0), []);
  assert.deepEqual(tracker.update(b, 0), []);
  b.fighters[1].hp = 32;
  assert.equal(
    tracker.update(b, 0).filter((c) => c.sound === "punch").length,
    1,
  );
  assert.deepEqual(tracker.update(b, 0), []);
});
test("a missed punch makes a swing and repeated snapshots do not repeat it", () => {
  const b = bout(),
    tracker = new CombatSoundTracker();
  tracker.update(b, 0);
  b.fighters[0].attack = 0.2;
  assert.deepEqual(
    tracker.update(b, 0).map((c) => c.sound),
    ["swing"],
  );
  assert.deepEqual(tracker.update(b, 0), []);
  b.fighters[0].attack = 0.1;
  assert.deepEqual(tracker.update(b, 0), []);
  b.fighters[0].attack = 0.22;
  assert.deepEqual(
    tracker.update(b, 0).map((c) => c.sound),
    ["swing"],
  );
});
test("guarded hits and a clean hook use distinct impact cues", () => {
  const b = bout(),
    tracker = new CombatSoundTracker();
  b.fighters[1].guard = true;
  b.fighters[0].kind = "hook";
  tracker.update(b, 0);
  b.fighters[1].hp = 97;
  assert.deepEqual(
    tracker.update(b, 0).map((c) => c.sound),
    ["guard"],
  );
  b.fighters[1].guard = false;
  b.fighters[1].hp = 82;
  assert.deepEqual(
    tracker.update(b, 0).map((c) => c.sound),
    ["heavy"],
  );
});
test("a skill starts once and its landing impact waits for authoritative damage", () => {
  const b = bout(),
    tracker = new CombatSoundTracker();
  tracker.update(b, 0);
  b.fighters[0].skillSerial++;
  b.fighters[0].kind = "skill";
  b.fighters[0].attack = 0.6;
  const cues = tracker.update(b, 0);
  assert.deepEqual(
    cues.map((c) => c.sound),
    ["skill"],
  );
  assert.equal(cues[0].character, "nova");
  assert.deepEqual(tracker.update(b, 0), []);
  b.fighters[1].hp = 70;
  assert.deepEqual(
    tracker.update(b, 0).map((c) => c.sound),
    ["heavy"],
  );
});
test("round bells follow the countdown and the knockout edge only once", () => {
  const b = bout(),
    tracker = new CombatSoundTracker();
  b.countdown = 3;
  tracker.update(b, 0);
  b.countdown = 0;
  assert.deepEqual(
    tracker.update(b, 0).map((c) => c.sound),
    ["bell-start"],
  );
  assert.deepEqual(tracker.update(b, 0), []);
  b.ended = true;
  b.fighters[1].hp = 0;
  b.reason = "KO";
  const cues = tracker.update(b, 0).map((c) => c.sound);
  assert.ok(cues.includes("fall"));
  assert.ok(cues.includes("bell-end"));
  assert.deepEqual(tracker.update(b, 0), []);
});
test("footsteps follow movement and reset on a new bout or spectator view", () => {
  const b = bout(),
    tracker = new CombatSoundTracker();
  tracker.update(b, 0);
  b.fighters[0].x += 0.65;
  assert.ok(tracker.update(b, 0).some((c) => c.sound === "step"));
  assert.deepEqual(tracker.update(b, 0), []);
  const next = bout();
  next.fighters[0].x = 80;
  assert.deepEqual(tracker.update(next, 0), []);
  assert.deepEqual(tracker.update(next, 1), []);
});
