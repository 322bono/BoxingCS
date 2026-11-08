import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
test("actual GLB parsing preserves the rig and attaches a playable instance", async ({
  page,
}) => {
  const warnings: string[] = [];
  page.on("console", (m) => {
    if (m.text().includes("3D character load failed")) warnings.push(m.text());
  });
  page.on("pageerror", (e) => warnings.push(e.message));
  const bytes = await readFile(
    new URL("../fixtures/synthetic-rig.glb", import.meta.url),
  );
  await page.route("**/characters/models/manifest.json", (r) =>
    r.fulfill({
      json: {
        version: 1,
        characters: {
          nova: {
            status: "ready",
            model: "/characters/models/synthetic.glb",
            source: "synthetic test fixture",
            taskId: null,
          },
        },
      },
    }),
  );
  await page.route("**/characters/models/synthetic.glb", (r) =>
    r.fulfill({ body: bytes, contentType: "model/gltf-binary" }),
  );
  await page.addInitScript(() => {
    (window as any).loadedRigs = [];
    window.addEventListener("fighter-model-ready", (e: any) =>
      (window as any).loadedRigs.push(e.detail),
    );
  });
  await page.goto("/");
  await page.getByRole("button", { name: "AI 연습", exact: true }).click();
  await expect(page.locator("#character-stage canvas")).toBeVisible();
  await page.getByRole("button", { name: "스킬 시연", exact: true }).click();
  await page
    .getByRole("button", { name: "노바 미리보기", exact: true })
    .click();
  await page.getByRole("button", { name: "이 파이터로 계속" }).click();
  await page.getByLabel("닉네임").fill("rig-test");
  await page.getByRole("button", { name: "연습 시작" }).click();
  await expect
    .poll(() => page.evaluate(() => (window as any).loadedRigs), {
      timeout: 10000,
    })
    .toContain("nova");
  await expect(page.locator("#hud")).toBeVisible();
  await page.waitForTimeout(1200);
  expect(warnings).toEqual([]);
});
