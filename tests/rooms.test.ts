import { test } from "node:test";
import assert from "node:assert/strict";
import { Rooms, type Room } from "../server/rooms.ts";
import { idleInput } from "../shared/game.ts";

function loadFighters(m: Rooms, r: Room) {
  assert.ok(r.bout && r.sync);
  for (const f of r.bout.fighters) {
    const p = r.players.find((p) => p.id === f.id)!;
    m.loaded(
      r.code,
      p.token,
      r.bout.id,
      r.sync.id,
      r.sync.deadline ? r.sync.deadline - 1 : 0,
    );
  }
}
// Catch overfilled rooms, premature starts, non-captain changes and late edits.
test("invite joins a real room and rejects full or missing rooms", () => {
  const m = new Rooms();
  const r = m.create("a", "A", "duel", 1);
  m.join(r.code, "b", "B");
  assert.equal(r.players.length, 2);
  assert.throws(() => m.join(r.code, "c", "C"));
  assert.throws(() => m.join("XXXXXX", "d", "D"));
});
test("host cannot start before all equal teams are ready", () => {
  const m = new Rooms();
  const r = m.create("a", "A", "team", 2);
  m.join(r.code, "b", "B");
  assert.throws(() => m.start(r.code, "a", 100));
  m.join(r.code, "c", "C");
  m.join(r.code, "d", "D");
  for (const p of r.players) m.update(r.code, p.token, { ready: true });
  assert.throws(() => m.start(r.code, "b", 100));
  m.start(r.code, "a", 100);
  assert.equal(r.phase, "ordering");
  assert.equal(r.orderDeadline, 30100);
});
test("only random captains can reorder their own team within 30 seconds", () => {
  const m = new Rooms();
  const r = m.create("a", "A", "team", 2);
  for (const t of ["b", "c", "d"]) m.join(r.code, t, t);
  for (const p of r.players) m.update(r.code, p.token, { ready: true });
  m.start(r.code, "a", 100);
  const team = r.players.filter((p) => p.team === 0);
  const captain = team.find((p) => p.id === r.captains[0]);
  assert.ok(captain);
  const other = team.find((p) => p.id !== captain.id);
  assert.ok(other);
  const order = team.map((p) => p.id).reverse();
  assert.throws(() => m.reorder(r.code, other.token, order, 200));
  m.reorder(r.code, captain.token, order, 200);
  assert.deepEqual(r.orders[0], order);
  assert.throws(() =>
    m.reorder(r.code, captain.token, [team[0].id, team[0].id], 200),
  );
  m.tick(30100, 0);
  assert.equal(r.phase, "playing");
  assert.throws(() => m.reorder(r.code, captain.token, order));
});
test("reconnect resumes paused matches and timeout forfeits the disconnected team", () => {
  const m = new Rooms();
  const r = m.create("a", "A", "duel", 1);
  m.join(r.code, "b", "B");
  m.update(r.code, "a", { ready: true });
  m.update(r.code, "b", { ready: true });
  m.start(r.code, "a", Date.now());
  loadFighters(m, r);
  m.disconnect(r.code, "b");
  const before = r.bout!.countdown;
  m.tick(Date.now(), 1 / 30);
  assert.equal(r.bout!.countdown, before);
  m.join(r.code, "b", "B");
  loadFighters(m, r);
  m.tick(Date.now(), 1 / 30);
  assert.ok(r.bout!.countdown < before);
  m.disconnect(r.code, "b");
  m.tick(Date.now() + 30001, 1 / 30);
  assert.equal(r.phase, "finished");
  assert.equal(r.winner, 0);
});
test("team series advances pairs and a tied score requires a deciding bout", () => {
  const m = new Rooms();
  const r = m.create("a", "A", "team", 2);
  for (const t of ["b", "c", "d"]) m.join(r.code, t, t);
  for (const p of r.players) m.update(r.code, p.token, { ready: true });
  m.start(r.code, "a", 100);
  m.tick(30100, 0);
  loadFighters(m, r);
  const first = r.bout!.fighters.map((f) => f.id);
  r.bout!.ended = true;
  r.bout!.winner = 0;
  m.tick(30200, 0);
  m.tick(35201, 0);
  loadFighters(m, r);
  assert.notDeepEqual(
    r.bout!.fighters.map((f) => f.id),
    first,
  );
  r.bout!.ended = true;
  r.bout!.winner = 1;
  m.tick(35300, 0);
  assert.equal(r.phase, "playing");
  m.tick(40301, 0);
  loadFighters(m, r);
  assert.deepEqual(
    r.bout!.fighters.map((f) => f.id),
    first,
  );
  r.bout!.ended = true;
  r.bout!.winner = 1;
  m.tick(40400, 0);
  assert.equal(r.phase, "finished");
  assert.deepEqual(r.score, [1, 2]);
  assert.equal(r.winner, 1);
});
test("leaving transfers the host and rematch resets ready state", () => {
  const m = new Rooms();
  const r = m.create("a", "A", "duel", 1);
  m.join(r.code, "b", "B");
  m.update(r.code, "a", { ready: true });
  m.update(r.code, "b", { ready: true });
  m.start(r.code, "a", Date.now());
  m.leave(r.code, "a");
  assert.equal(r.host, r.players[0].id);
  assert.equal(r.phase, "finished");
  m.rematch(r.code, "b");
  assert.equal(r.phase, "lobby");
  assert.ok(r.players.every((p) => !p.ready));
  assert.equal(r.bout, null);
});

test("expired lobby guests free a seat and an expired host transfers authority", () => {
  const m = new Rooms();
  const r = m.create("a", "A", "duel", 1);
  m.join(r.code, "b", "B");
  m.disconnect(r.code, "b");
  m.tick(Date.now() + 30001, 0);
  assert.equal(r.players.length, 1);
  assert.doesNotThrow(() => m.join(r.code, "c", "C"));
  m.disconnect(r.code, "a");
  m.tick(Date.now() + 30001, 0);
  assert.equal(r.host, r.players[0].id);
  assert.equal(r.players[0].token, "c");
});
test("a drawn duel ends once instead of creating team deciders", () => {
  const m = new Rooms();
  const r = m.create("a", "A", "duel", 1);
  m.join(r.code, "b", "B");
  for (const p of r.players) m.update(r.code, p.token, { ready: true });
  m.start(r.code, "a", 100);
  loadFighters(m, r);
  r.bout!.ended = true;
  r.bout!.winner = null;
  r.bout!.reason = "판정";
  m.tick(200, 0);
  assert.equal(r.phase, "finished");
  assert.equal(r.winner, null);
});
test("reorder rejects edits after deadline even before the next server tick", () => {
  const m = new Rooms();
  const r = m.create("a", "A", "team", 2);
  for (const t of ["b", "c", "d"]) m.join(r.code, t, t);
  for (const p of r.players) m.update(r.code, p.token, { ready: true });
  m.start(r.code, "a", 100);
  const captain = r.players.find((p) => p.id === r.captains[0])!;
  const disconnected = r.players.find((p) => p.id !== captain.id)!;
  m.disconnect(r.code, disconnected.token);
  assert.throws(() =>
    m.reorder(r.code, captain.token, [...r.orders[0]].reverse(), 30101),
  );
});

test("neither host nor guest can advance combat before both models are ready", () => {
  const m = new Rooms();
  const r = m.create("host", "H", "duel", 1);
  m.join(r.code, "guest", "G");
  for (const p of r.players) m.update(r.code, p.token, { ready: true });
  m.start(r.code, "host", 1000);
  const countdown = r.bout!.countdown;
  m.tick(1500, 1 / 30);
  assert.equal(
    r.bout!.countdown,
    countdown,
    "one fast device cannot start early",
  );
  assert.ok(r.sync);
  assert.throws(() => m.loaded(r.code, "host", "old-bout", r.sync!.id, 1500));
  m.loaded(r.code, "host", r.bout!.id, r.sync.id, 1600);
  m.loaded(r.code, "host", r.bout!.id, r.sync.id, 1600);
  assert.equal(
    r.sync.ready.length,
    1,
    "duplicate readiness cannot count for the guest",
  );
  m.tick(1700, 1 / 30);
  assert.equal(r.bout!.countdown, countdown);
  loadFighters(m, r);
  m.tick(1800, 1 / 30);
  assert.ok(r.bout!.countdown < countdown);
});

test("reconnection invalidates old controls and waits for both players again", () => {
  const m = new Rooms();
  const r = m.create("host", "H", "duel", 1);
  m.join(r.code, "guest", "G");
  for (const p of r.players) m.update(r.code, p.token, { ready: true });
  m.start(r.code, "host", Date.now());
  assert.ok(r.sync);
  loadFighters(m, r);
  r.bout!.countdown = 0;
  r.bout!.time = 60;
  const epoch = r.sync.id;
  for (const p of r.players) m.inputs.set(p.id, { ...idleInput(), jab: true });
  m.disconnect(r.code, "guest");
  assert.notEqual(r.sync!.id, epoch);
  for (const p of r.players) assert.equal(m.inputs.has(p.id), false);
  assert.throws(() => m.loaded(r.code, "host", r.bout!.id, epoch));
  m.join(r.code, "guest", "G");
  m.tick(Date.now(), 1 / 30);
  assert.equal(r.bout!.time, 60);
  loadFighters(m, r);
  assert.equal(r.bout!.countdown, 3);
  m.tick(Date.now(), 1 / 30);
  assert.equal(r.bout!.time, 60);
  assert.ok(r.bout!.countdown < 3);
});

test("a readiness timeout treats the host and guest equally and both missing as a draw", () => {
  for (const ready of ["host", "guest", null]) {
    const m = new Rooms();
    const r = m.create("host", "H", "duel", 1);
    m.join(r.code, "guest", "G");
    for (const p of r.players) m.update(r.code, p.token, { ready: true });
    m.start(r.code, "host", 1000);
    assert.ok(r.sync);
    if (ready) m.loaded(r.code, ready, r.bout!.id, r.sync.id, 2000);
    m.tick(60999, 1 / 30);
    assert.equal(r.phase, "playing");
    assert.equal(r.bout!.time, 90);
    m.tick(61000, 1 / 30);
    assert.equal(r.phase, "finished");
    assert.equal(r.winner, ready === null ? null : ready === "host" ? 0 : 1);
  }
});

test("a spectator cannot acknowledge model loading for an active teammate", () => {
  const m = new Rooms();
  const r = m.create("host", "H", "team", 2);
  for (const t of ["guest", "third", "fourth"]) m.join(r.code, t, t);
  for (const p of r.players) m.update(r.code, p.token, { ready: true });
  m.start(r.code, "host", 1000);
  m.tick(31000, 0);
  assert.ok(r.sync && r.bout);
  const spectator = r.players.find(
    (p) => !r.bout!.fighters.some((f) => f.id === p.id),
  )!;
  assert.throws(() =>
    m.loaded(r.code, spectator.token, r.bout!.id, r.sync!.id),
  );
  assert.equal(r.sync.ready.length, 0);
  loadFighters(m, r);
  assert.equal(r.sync.deadline, 0);
});

test("late readiness cannot beat the server deadline between simulation ticks", () => {
  const m = new Rooms();
  const r = m.create("host", "H", "duel", 1);
  m.join(r.code, "guest", "G");
  for (const p of r.players) m.update(r.code, p.token, { ready: true });
  m.start(r.code, "host", 1000);
  m.loaded(r.code, "host", r.bout!.id, r.sync!.id, 2000);
  assert.throws(() => m.loaded(r.code, "guest", r.bout!.id, r.sync!.id, 61000));
  m.tick(61000, 1 / 30);
  assert.equal(r.winner, 0);
  assert.equal(r.phase, "finished");
});
