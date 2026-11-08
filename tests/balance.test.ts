import { test } from "node:test";
import assert from "node:assert/strict";
import { CHARACTERS, createBout, stepBout, aiInput } from "../shared/game.ts";
// Catch a roster change that gives one style an outsized advantage under identical AI policies.
// This is an initial regression check, not evidence of balance across human skill levels.
test("all four styles stay within 35–65% wins across 240 seeded sparring bouts", () => {
  const totals = new Map(CHARACTERS.map((c) => [c.id, { wins: 0, bouts: 0 }]));
  for (const a of CHARACTERS)
    for (const b of CHARACTERS)
      if (a.id !== b.id)
        for (let sample = 1; sample <= 20; sample++) {
          let seed = sample;
          const random = () => {
            seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
            return seed / 4294967296;
          };
          const bout = createBout(["a", "b"], [a.id, b.id]);
          for (let step = 0; step < 3000 && !bout.ended; step++)
            stepBout(
              bout,
              [
                aiInput(bout, 0, 0.65, random()),
                aiInput(bout, 1, 0.65, random()),
              ],
              1 / 30,
            );
          assert.ok(bout.ended, "a timed bout must finish");
          totals.get(a.id)!.bouts++;
          totals.get(b.id)!.bouts++;
          if (bout.winner !== null)
            totals.get(bout.winner === 0 ? a.id : b.id)!.wins++;
        }
  for (const [id, { wins, bouts }] of totals) {
    const rate = wins / bouts;
    assert.ok(rate >= 0.35 && rate <= 0.65, `${id}: ${wins}/${bouts} wins`);
  }
});
