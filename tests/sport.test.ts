import { test } from "node:test";
import assert from "node:assert/strict";
import { createBout, idleInput, stepBout } from "../shared/game.ts";
import { Rooms } from "../server/rooms.ts";

test("existing callers keep boxing while jiu-jitsu bouts get independent grappling state", () => {
  assert.equal(createBout(["a", "b"], ["nova", "blaze"]).sport, "boxing");
  const a = createBout(["a", "b"], ["nova", "blaze"], "bjj");
  const b = createBout(["c", "d"], ["specs", "volt"], "bjj");
  assert.equal(a.sport, "bjj");
  assert.equal(a.grappling!.position, "standing");
  assert.notEqual(a.grappling, b.grappling);
  a.countdown = 0;
  stepBout(a, [idleInput(), idleInput()], 1 / 30);
  assert.ok(a.time < 90);
  assert.deepEqual(
    a.fighters.map((f) => f.hp),
    [100, 100],
  );
});

test("jiu-jitsu invitations, team rounds and rematches retain their room sport", () => {
  const rooms = new Rooms();
  const room = rooms.create("host", "HOST", "team", 2, "bjj");
  for (const token of ["b", "c", "d"]) rooms.join(room.code, token, token);
  for (const p of room.players)
    rooms.update(room.code, p.token, { ready: true });
  rooms.start(room.code, "host", 1000);
  assert.equal(room.sport, "bjj");
  rooms.tick(31001, 1 / 30);
  assert.equal(room.bout!.sport, "bjj");
  assert.ok(room.bout!.grappling);
  room.phase = "finished";
  rooms.rematch(room.code, "host");
  assert.equal(room.sport, "bjj");
  assert.equal(room.bout, null);
});

test("room creation rejects unsupported disciplines rather than accepting client rules", () => {
  assert.throws(
    () => new Rooms().create("a", "A", "duel", 1, "mma" as any),
    /종목/,
  );
  assert.equal(new Rooms().create("a", "A", "duel", 1).sport, "boxing");
});
