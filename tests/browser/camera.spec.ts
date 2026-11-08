import { test, expect } from "@playwright/test";

test("rendered combat camera responds subtly and respects effects and reduced-motion opt-outs", async ({
  page,
}) => {
  test.setTimeout(45000);
  await page.setViewportSize({ width: 800, height: 600 });
  await page.goto("/tests/fixtures/hands-harness.html");
  await expect
    .poll(() => page.evaluate(() => !!(window as any).handHarness), {
      timeout: 30000,
    })
    .toBe(true);
  const rolls = await page.evaluate(() => {
    const { world, bout, pose } = (window as any).handHarness;
    pose("idle");
    world.reduced = false;
    world.shake = true;
    const own = bout.fighters[0];
    const values: number[] = [];
    for (let i = 0; i < 12; i++) {
      own.x += 0.035;
      world.lastFrame = performance.now() - 1000 / 60;
      world.render();
      values.push(world.camera.rotation.z);
    }
    world.shake = false;
    own.x += 0.035;
    world.render();
    const effectsOff = world.camera.rotation.z;
    world.shake = true;
    world.reduced = true;
    own.x += 0.035;
    world.render();
    const reduced = world.camera.rotation.z;
    return { values, effectsOff, reduced };
  });
  expect(rolls.values.some((value) => Math.abs(value) > 0.001)).toBe(true);
  expect(rolls.values.every((value) => Math.abs(value) < 0.012)).toBe(true);
  expect(Math.abs(rolls.effectsOff)).toBeLessThan(0.0001);
  expect(Math.abs(rolls.reduced)).toBeLessThan(0.0001);
});
