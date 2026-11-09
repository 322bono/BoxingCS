import { test, expect, type Locator } from "@playwright/test";

test.use({ isMobile: true, hasTouch: true });

async function expectSeparate(a: Locator, b: Locator) {
  const first = (await a.boundingBox())!,
    second = (await b.boundingBox())!;
  const overlapWidth = Math.max(
    0,
    Math.min(first.x + first.width, second.x + second.width) -
      Math.max(first.x, second.x),
  );
  const overlapHeight = Math.max(
    0,
    Math.min(first.y + first.height, second.y + second.height) -
      Math.max(first.y, second.y),
  );
  expect(
    overlapWidth * overlapHeight,
    `${await a.getAttribute("class")} overlaps ${await b.getAttribute("class")}`,
  ).toBe(0);
}

test("short grappling HUD keeps the camera toggle clear of context, score and bottom controls", async ({
  page,
}) => {
  await page.goto("/tests/fixtures/grappling-hud-layout.html");
  for (const viewport of [
    { width: 320, height: 568 },
    { width: 320, height: 420 },
    { width: 390, height: 420 },
    { width: 844, height: 390 },
    { width: 568, height: 320 },
  ]) {
    await page.setViewportSize(viewport);
    await expect
      .poll(() =>
        page
          .locator("#hud")
          .evaluate((element) =>
            Math.round(element.getBoundingClientRect().height),
          ),
      )
      .toBe(viewport.height);
    const camera = page.locator("#bjj-camera");
    await expectSeparate(camera, page.locator(".bjj-position"));
    await expectSeparate(camera, page.locator(".fight-top"));
    await expectSeparate(camera, page.locator("#fight-leave"));
    await expectSeparate(
      camera,
      page.locator(".fight-bottom > div:first-child"),
    );
    await expectSeparate(
      page.locator(".bjj-position"),
      page.locator(".fight-top"),
    );
    const box = (await camera.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
  }
});
