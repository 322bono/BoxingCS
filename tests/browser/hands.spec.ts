import { test, expect } from "@playwright/test";

test("actual 3D ring renders glove poses with an open center at desktop and phone sizes", async ({
  page,
}) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/tests/fixtures/hands-harness.html");
  await expect
    .poll(() => page.evaluate(() => !!(window as any).handHarness), {
      timeout: 40000,
    })
    .toBe(true);
  for (const [kind, character, phase] of [
    ["idle", "nova", 0.5],
    ["guard", "nova", 0.5],
    ["jab", "nova", 0.5],
    ["hook", "nova", 0.5],
    ["skill", "nova", 0.23],
    ["skill", "blaze", 0.5],
    ["skill", "specs", 0.63],
    ["skill", "volt", 0.5],
  ] as const) {
    await page.evaluate(
      ([kind, character, phase]) =>
        (window as any).handHarness.pose(kind, character, phase),
      [kind, character, phase],
    );
    await page.screenshot({
      path: `test-results/hands-${kind}-${character}.png`,
    });
  }
  const before = await page.evaluate(() => {
    const { world } = (window as any).handHarness;
    return world.handRig.hands[0]
      .getObjectByName("knuckles")
      .material.color.getHexString();
  });
  await page.evaluate(() =>
    (window as any).handHarness.pose("idle", "nova", 0.5, 1),
  );
  const after = await page.evaluate(() =>
    (window as any).handHarness.world.handRig.hands[0]
      .getObjectByName("knuckles")
      .material.color.getHexString(),
  );
  expect(before).not.toBe(after);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => {
    const h = (window as any).handHarness;
    h.world.resize();
    h.pose("idle");
  });
  await page.screenshot({ path: "test-results/hands-phone-idle.png" });
  await page.evaluate(() => (window as any).handHarness.pose("guard"));
  await page.screenshot({ path: "test-results/hands-phone-guard.png" });
  expect(errors).toEqual([]);
  expect(
    await page.evaluate(
      () => (window as any).handHarness.world.renderer.info.render.calls,
    ),
  ).toBeGreaterThan(0);
});
