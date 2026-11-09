import { test } from "node:test";
import assert from "node:assert/strict";
import { HeldControls } from "../src/held-controls.ts";

test("releasing a movement finger preserves a separately held attack", () => {
  const held = new HeldControls();
  held.pressPointer(11, "j");
  held.pressPointer(12, "w");
  held.releasePointer(12);
  assert.equal(held.has("w"), false);
  assert.equal(held.has("j"), true);
  held.releasePointer(11);
  assert.equal(held.has("j"), false);
});

test("keyboard and multiple pointers can independently hold the same action", () => {
  const held = new HeldControls();
  held.add("k");
  held.pressPointer(1, "k");
  held.pressPointer(2, "k");
  held.delete("k");
  held.releasePointer(1);
  assert.equal(held.has("k"), true);
  held.add("k");
  held.releasePointer(2);
  assert.equal(held.has("k"), true);
  held.delete("k");
  assert.equal(held.has("k"), false);
});

test("releasing one mouse button preserves another on the same pointer", () => {
  const held = new HeldControls();
  held.pressPointer(1, "j");
  held.pressPointer(1, "k");
  held.releasePointer(1, "j");
  assert.equal(held.has("j"), false);
  assert.equal(held.has("k"), true);
});

test("pause clears every source and repeated pointer cancellation is harmless", () => {
  const held = new HeldControls();
  held.add(" ");
  held.pressPointer(3, "q");
  held.pressPointer(4, "j");
  held.clear();
  held.releasePointer(3);
  held.releasePointer(3);
  for (const key of [" ", "q", "j"]) assert.equal(held.has(key), false);
});
