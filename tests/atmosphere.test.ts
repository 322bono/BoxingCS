import { test } from "node:test";
import assert from "node:assert/strict";
import { createBout } from "../shared/game.ts";
import {
  MatchAtmosphereTracker,
  matchTension,
} from "../src/audio/match-atmosphere.ts";
const bout = () => {
  const b = createBout(["a", "b"], ["nova", "blaze"]);
  b.countdown = 0;
  return b;
};
test("crowd starts with ambience without replaying historical damage or skills", () => {
  const b = bout(),
    tracker = new MatchAtmosphereTracker();
  b.fighters[1].hp = 35;
  b.fighters[0].skillSerial = 9;
  const state = tracker.update(b, 0);
  assert.equal(state.active, true);
  assert.equal(state.reaction, null);
  assert.ok(state.energy > 0 && state.energy < 0.5);
  assert.equal(tracker.update(b, 0).reaction, null);
});
test("misses and blocked taps stay quiet; real clean hits trigger a cheer once", () => {
  const b = bout(),
    tracker = new MatchAtmosphereTracker();
  tracker.update(b, 0);
  b.fighters[0].attack = 0.2;
  assert.equal(tracker.update(b, 0).reaction, null);
  b.fighters[1].hp -= 2;
  assert.equal(tracker.update(b, 0).reaction, null);
  b.fighters[1].hp -= 7;
  const hit = tracker.update(b, 0);
  assert.equal(hit.reaction, "cheer");
  assert.ok(hit.energy > 0.18);
  assert.equal(tracker.update(b, 0).reaction, null);
});
test("a heavy hit or a real three-hit combo upgrades a cheer into a roar", () => {
  for (const heavy of [false, true]) {
    const b = bout(),
      tracker = new MatchAtmosphereTracker();
    tracker.update(b, 0);
    b.fighters[1].hp -= 7;
    assert.equal(tracker.update(b, 0).reaction, "cheer");
    b.fighters[1].hp -= heavy ? 16 : 7;
    b.fighters[0].combo = heavy ? 2 : 3;
    assert.equal(tracker.update(b, 0).reaction, "roar");
    b.fighters[1].hp -= 7;
    assert.equal(tracker.update(b, 0).reaction, null);
  }
});
test("crowd reaction cooldown follows match time rather than snapshot frequency", () => {
  const b = bout(),
    tracker = new MatchAtmosphereTracker();
  tracker.update(b, 0);
  b.fighters[1].hp -= 7;
  assert.equal(tracker.update(b, 0).reaction, "cheer");
  for (let i = 0; i < 120; i++)
    assert.equal(tracker.update(b, 0).reaction, null);
  b.fighters[1].hp -= 7;
  assert.equal(tracker.update(b, 0).reaction, null);
  for (let i = 0; i < 12; i++) {
    b.time -= 0.25;
    tracker.update(b, 0);
  }
  b.fighters[1].hp -= 7;
  assert.equal(tracker.update(b, 0).reaction, "cheer");
});
test("a skill activation creates one big reaction and meter changes alone do not", () => {
  const b = bout(),
    tracker = new MatchAtmosphereTracker();
  tracker.update(b, 0);
  b.fighters[0].meter = 100;
  assert.equal(tracker.update(b, 0).reaction, null);
  b.fighters[0].skillSerial++;
  assert.equal(tracker.update(b, 0).reaction, "roar");
  assert.equal(tracker.update(b, 0).reaction, null);
});
test("final-time tension uses the existing clock and warns only on crossing ten seconds", () => {
  const b = bout(),
    tracker = new MatchAtmosphereTracker();
  b.time = 31;
  const normal = tracker.update(b, 0);
  b.time = 30;
  const closing = tracker.update(b, 0);
  assert.equal(closing.urgency, 1);
  assert.ok(closing.energy > normal.energy);
  b.time = 11;
  tracker.update(b, 0);
  b.time = 10;
  assert.equal(tracker.update(b, 0).warning, true);
  assert.equal(tracker.update(b, 0).urgency, 2);
  b.time = 9;
  assert.equal(tracker.update(b, 0).warning, false);
  tracker.reset();
  assert.equal(tracker.update(b, 0).warning, false);
});
test("pause, countdown, a new bout and a spectator view reset historical reactions", () => {
  const b = bout(),
    tracker = new MatchAtmosphereTracker();
  tracker.update(b, 0);
  b.fighters[1].hp = 40;
  const pause = tracker.update(b, 0, true);
  assert.equal(pause.active, false);
  assert.equal(pause.energy, 0);
  assert.equal(pause.reaction, null);
  assert.equal(tracker.update(b, 0).reaction, null);
  b.countdown = 3;
  assert.equal(tracker.update(b, 0).active, false);
  b.countdown = 0;
  assert.equal(tracker.update(b, 0).reaction, null);
  b.fighters[0].skillSerial++;
  assert.equal(tracker.update(b, 1).reaction, null);
  assert.equal(tracker.update(bout(), 0).reaction, null);
});
test("the ending celebration plays once and initial ended snapshots stay silent", () => {
  const b = bout(),
    tracker = new MatchAtmosphereTracker();
  tracker.update(b, 0);
  b.ended = true;
  b.fighters[1].hp = 0;
  const state = tracker.update(b, 0);
  assert.equal(state.active, false);
  assert.equal(state.reaction, "finish");
  assert.equal(tracker.update(b, 0).reaction, null);
  tracker.reset();
  assert.equal(tracker.update(b, 0).reaction, null);
});
test("low-health danger is personal, bounded, and suppressed while paused", () => {
  const b = bout();
  b.fighters[0].hp = 15;
  assert.equal(matchTension(b, 0).danger, 0.5);
  assert.equal(matchTension(b, 1).danger, 0);
  assert.equal(matchTension(b, 0, true).danger, 0);
  b.fighters[0].hp = -100;
  assert.equal(matchTension(b, 0).danger, 1);
  b.ended = true;
  assert.equal(matchTension(b, 0).danger, 0);
});
