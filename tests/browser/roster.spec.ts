import { test, expect } from "@playwright/test";

test("a delayed model list refreshes the open picker without downloading hidden fighters", async ({
  page,
}) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let manifestRequested = false;
  const models: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.endsWith(".glb"))
      models.push(request.url());
  });
  await page.route("**/characters/models/manifest.json", async (route) => {
    manifestRequested = true;
    await gate;
    await route.continue();
  });
  try {
    await page.goto("/");
    await expect.poll(() => manifestRequested).toBe(true);
    expect(models).toEqual([]);
    await page.getByRole("button", { name: "AI 연습", exact: true }).click();
    await expect(page.locator("#select-fighter")).toBeDisabled();
    release();
    await expect(page.locator("#select-fighter")).toBeEnabled();
    await page.getByRole("button", { name: "이 파이터로 계속" }).click();
    await expect(page.getByLabel("닉네임")).toBeVisible();
    expect(await page.getByRole("button", { name: "연습 시작" }).count()).toBe(
      1,
    );
  } finally {
    release();
  }
});

test("a retired saved fighter migrates to Nova and only four modeled choices remain", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem("ring-character", "ace");
  });
  await page.goto("/");
  await page.locator("#console-fighters").click();
  await expect(page.locator(".select-roster button")).toHaveCount(4);
  await expect(page.locator(".select-roster button.active")).toHaveAttribute(
    "data-preview",
    "nova",
  );
  expect(
    await page.evaluate(() => localStorage.getItem("ring-character")),
  ).toBe("nova");
  for (const name of ["노바", "블레이즈", "스펙스", "볼트"])
    await expect(
      page.getByRole("button", { name: name + " 미리보기", exact: true }),
    ).toBeVisible();
  for (const name of ["모스", "에이스", "잉크", "스톤"])
    await expect(
      page.getByRole("button", { name: name + " 미리보기", exact: true }),
    ).toHaveCount(0);
  await expect(page.locator("#character-stage")).toHaveAttribute(
    "data-ready",
    "true",
    { timeout: 30000 },
  );
  await page.screenshot({ path: "test-results/four-fighter-roster.png" });
});

test("a valid saved fighter survives the four-slot phone layout", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    localStorage.setItem("ring-character", "volt");
  });
  await page.goto("/");
  await page.locator("#console-fighters").click();
  await expect(page.locator(".select-roster button")).toHaveCount(4);
  await expect(page.locator(".select-roster button.active")).toHaveAttribute(
    "data-preview",
    "volt",
  );
  expect(
    await page.evaluate(() => localStorage.getItem("ring-character")),
  ).toBe("volt");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await expect(page.locator("#character-stage")).toHaveAttribute(
    "data-ready",
    "true",
    { timeout: 30000 },
  );
  await page.screenshot({ path: "test-results/four-fighter-phone.png" });
});
