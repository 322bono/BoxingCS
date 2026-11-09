import { test } from "node:test";
import assert from "node:assert/strict";
import { createBout } from "../shared/game.ts";
import { GrapplingSoundTracker } from "../src/audio/grappling-sounds.ts";
import {
  MatchAtmosphereTracker,
  matchTension,
} from "../src/audio/match-atmosphere.ts";

test("grappling produces mat/cloth cues once rather than boxing punch cues", () => {
  const b = createBout(["a", "b"], ["nova", "blaze"], "bjj");
  b.countdown = 0;
  const tracker = new GrapplingSoundTracker();
  tracker.update(b, 0);
  b.grappling!.actionSerial++;
  b.grappling!.lastAction = "takedown";
  assert.deepEqual(
    tracker.update(b, 0).map((c) => c.sound),
    ["fall"],
  );
  for (let i = 0; i < 90; i++) assert.deepEqual(tracker.update(b, 0), []);
  b.grappling!.actionSerial++;
  b.grappling!.lastAction = "pass";
  assert.deepEqual(
    tracker.update(b, 0).map((c) => c.sound),
    ["cloth"],
  );
  b.ended = true;
  b.fighters[1].hp = 0;
  assert.deepEqual(
    tracker.update(b, 0).map((c) => c.sound),
    ["bell-end"],
  );
});
test("new views or tracker resets do not replay an earlier takedown", () => {
  const b = createBout(["a", "b"], ["nova", "blaze"], "bjj");
  b.countdown = 0;
  b.grappling!.actionSerial = 10;
  b.grappling!.lastAction = "takedown";
  const tracker = new GrapplingSoundTracker();
  assert.deepEqual(tracker.update(b, 0), []);
  assert.deepEqual(tracker.update(b, 1), []);
  tracker.reset();
  assert.deepEqual(tracker.update(b, 0), []);
});
test("crowd reacts to resolved grappling positions without needing health damage", () => {
  const b = createBout(["a", "b"], ["nova", "blaze"], "bjj");
  b.countdown = 0;
  const tracker = new MatchAtmosphereTracker();
  tracker.update(b, 0);
  b.time -= 0.1;
  b.grappling!.actionSerial++;
  b.grappling!.lastAction = "pass";
  assert.equal(tracker.update(b, 0).reaction, "cheer");
  b.time -= 0.1;
  b.grappling!.actionSerial++;
  b.grappling!.lastAction = "sweep";
  assert.equal(tracker.update(b, 0).reaction, "roar");
  for (let i = 0; i < 90; i++)
    assert.equal(tracker.update(b, 0).reaction, null);
});
test("submission pressure warns the defender without flashing the attacker", () => {
  const b = createBout(["a", "b"], ["nova", "blaze"], "bjj");
  b.countdown = 0;
  b.grappling!.submission = { attacker: 0, kind: "armbar", progress: 85 };
  assert.equal(matchTension(b, 0).danger, 0);
  assert.ok(matchTension(b, 1).danger > 0.5);
  assert.equal(matchTension(b, 1, true).danger, 0);
});
