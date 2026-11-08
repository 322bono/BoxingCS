import { test } from "node:test";
import assert from "node:assert/strict";
import { CHARACTERS, createBout, idleInput, stepBout } from "../shared/game.ts";
import { Rooms } from "../server/rooms.ts";

test("only the four modeled fighters are playable", () => {
  assert.deepEqual(
    CHARACTERS.map((c) => c.id),
    ["nova", "blaze", "specs", "volt"],
  );
});

test("new lobbies default to Nova and the server rejects retired characters", () => {
  const rooms = new Rooms();
  const room = rooms.create("a", "A", "duel", 1);
  rooms.join(room.code, "b", "B");
  assert.ok(room.players.every((p) => p.character === "nova"));
  for (const id of ["mint", "ace", "ink", "stone"]) {
    assert.throws(
      () => rooms.update(room.code, "a", { character: id as any }),
      /캐릭터/,
    );
    assert.equal(room.players[0].character, "nova");
  }
  rooms.update(room.code, "a", { character: "volt" });
  assert.equal(room.players[0].character, "volt");
});

test("a balanced-speed fighter covers 1.35m in half a second without diagonal speed gain", () => {
  const b = createBout(["a", "b"], ["specs", "specs"]);
  b.countdown = 0;
  const before = b.fighters[0].z;
  for (let i = 0; i < 15; i++)
    stepBout(b, [{ ...idleInput(), forward: 1 }, idleInput()], 1 / 30);
  assert.ok(Math.abs(before - b.fighters[0].z - 1.35) < 1e-8);
  const distances = [];
  for (const strafe of [0, 1]) {
    const bout = createBout(["a", "b"], ["specs", "specs"]);
    bout.countdown = 0;
    const z = bout.fighters[0].z;
    stepBout(
      bout,
      [{ ...idleInput(), forward: 1, strafe }, idleInput()],
      1 / 30,
    );
    distances.push(Math.hypot(bout.fighters[0].x, bout.fighters[0].z - z));
  }
  assert.ok(Math.abs(distances[0] - distances[1]) < 1e-8);
});

test("shorter recovery allows three jabs in .7s and two hooks in .8s", () => {
  for (const [attack, ticks, hits] of [
    ["jab", 21, 3],
    ["hook", 24, 2],
  ] as const) {
    const bout = createBout(["a", "b"], ["specs", "specs"]);
    bout.countdown = 0;
    bout.fighters[0].z = 0.5;
    bout.fighters[1].z = -0.5;
    for (let i = 0; i < ticks; i++)
      stepBout(bout, [{ ...idleInput(), [attack]: true }, idleInput()], 1 / 30);
    assert.equal(bout.fighters[0].hits, hits, attack);
  }
});
