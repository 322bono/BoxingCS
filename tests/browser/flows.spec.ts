import { test, expect } from "@playwright/test";
test("AI practice runs in first-person and exits cleanly", async ({ page }) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  const missingCharacterAssets: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("response", (response) => {
    const path = new URL(response.url()).pathname;
    if (response.status() >= 400 && path.startsWith("/characters/"))
      missingCharacterAssets.push(path);
  });
  await page.goto("/");
  await expect(page.locator(".console-board")).toBeVisible();
  await page.screenshot({
    path: "test-results/desktop-home.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: /AI 연습/ }).click();
  await page
    .getByRole("button", { name: "노바 미리보기", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "캐릭터 선택" }),
  ).toBeVisible();
  await page.screenshot({ path: "test-results/fighter-select.png" });
  await page.getByRole("button", { name: "이 파이터로 계속" }).click();
  await page.getByLabel("닉네임").fill("연습복서");
  await page.getByRole("button", { name: "연습 시작" }).click();
  await expect(page.locator("#hud")).toBeVisible();
  await expect(page.locator("canvas")).toBeVisible();
  await expect(page.locator("#fight-announcement")).toHaveText("", {
    timeout: 15000,
  });
  const skillBox = await page.locator("#skill-button").boundingBox();
  if (!skillBox) throw Error("skill button must be visible");
  await page.mouse.move(
    skillBox.x + skillBox.width / 2,
    skillBox.y + skillBox.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(600, 300);
  await page.mouse.up();
  await page.keyboard.down("w");
  await page.waitForTimeout(900);
  await page.keyboard.up("w");
  await page.keyboard.down("j");
  await expect
    .poll(
      async () =>
        Number((await page.locator("#health-1").innerText()).split(" ")[0]),
      { timeout: 8000 },
    )
    .toBeLessThan(100);
  await expect(page.locator("#skill-button")).toHaveClass(/charged/, {
    timeout: 18000,
  });
  await page.keyboard.up("j");
  await page.waitForTimeout(300);
  await expect(page.locator("#skill-button")).toHaveClass(/charged/);
  await page.keyboard.down("q");
  await expect(page.locator("#skill-status")).not.toHaveText("발동 가능", {
    timeout: 5000,
  });
  await page.keyboard.up("q");
  await expect(page.locator("#skill-banner b")).toHaveText("화이트 러시");
  await page.screenshot({ path: "test-results/first-person.png" });
  // A bout may finish while a software-rendered screenshot is captured.
  await page
    .getByRole("button", { name: "경기 나가기", exact: true })
    .or(page.getByRole("button", { name: "메인으로", exact: true }))
    .click();
  await expect(page.locator(".console-board")).toBeVisible();
  expect(errors).toEqual([]);
  expect(missingCharacterAssets).toEqual([]);
});
test("two real browsers join by invite and start the same match", async ({
  browser,
}) => {
  test.setTimeout(210000);
  const a = await browser.newContext({
      viewport: { width: 800, height: 600 },
      deviceScaleFactor: 0.8,
    }),
    b = await browser.newContext({
      viewport: { width: 800, height: 600 },
      deviceScaleFactor: 0.8,
    });
  const p = await a.newPage(),
    q = await b.newPage();
  try {
    await Promise.all([p.goto("/"), q.goto("/")]);
    await p.getByRole("button", { name: /1 vs 1/ }).click();
    await p.getByRole("button", { name: "이 파이터로 계속" }).click();
    await p.getByLabel("닉네임").fill("RED");
    await p.getByRole("button", { name: "로비 만들기" }).click();
    await expect(p.locator("[data-code]")).toBeVisible();
    const code = (await p.locator("[data-code]").innerText()).trim();
    await q.getByRole("button", { name: "초대코드로 참가" }).click();
    await q.getByLabel("닉네임").fill("BLUE");
    await q.getByLabel("초대코드", { exact: true }).fill(code);
    await q.getByRole("button", { name: "참가하기", exact: true }).click();
    await Promise.all([
      p.getByRole("button", { name: "준비하기", exact: true }).click(),
      q.getByRole("button", { name: "준비하기", exact: true }).click(),
    ]);
    await p.getByRole("button", { name: "경기 시작", exact: true }).click();
    await expect(p.locator("#hud")).toBeVisible();
    await expect(q.locator("#hud")).toBeVisible();
    await expect(p.locator("#world")).toHaveCSS("opacity", "1");
    await expect(q.locator("#world")).toHaveCSS("opacity", "1");
    await q.reload({ waitUntil: "domcontentloaded" });
    await expect(q.locator("#hud")).toBeVisible();
    await expect(q.locator("#name-0")).toContainText("BLUE");
    await expect(q.locator("#name-1")).toContainText("RED");
    for (const page of [p, q])
      await expect(page.locator("#fight-announcement")).toHaveText("", {
        timeout: 65000,
      });
    await p.getByRole("button", { name: "경기 나가기" }).click();
    await expect(q.getByText("상대 기권")).toBeVisible({ timeout: 15000 });
  } finally {
    await a.close();
    await b.close();
  }
});
test("home adapts to narrow mobile without horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByRole("button", { name: /AI 연습/ })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/mobile-home.png",
    fullPage: true,
  });
});
test("keyboard settings persist and invalid invite shows an actionable error", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "설정", exact: true }).click();
  await page.locator('[data-bind="j"]').click();
  await page.keyboard.press("f");
  await expect(page.locator('[data-bind="j"] kbd')).toHaveText("F");
  await page.getByRole("button", { name: "닫기", exact: true }).click();
  await page.reload();
  await page.getByRole("button", { name: "설정", exact: true }).click();
  await expect(page.locator('[data-bind="j"] kbd')).toHaveText("F");
  await page.getByRole("button", { name: "기본 키 복원", exact: true }).click();
  await expect(page.locator('[data-bind="j"] kbd')).toHaveText("J");
  await page.getByRole("button", { name: "닫기", exact: true }).click();
  await page.getByRole("button", { name: "초대코드로 참가" }).click();
  await page.getByLabel("닉네임").fill("복서");
  await page.getByLabel("초대코드", { exact: true }).fill("ZZZZZZ");
  await page.getByRole("button", { name: "참가하기", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText(
    "초대코드를 확인해 주세요.",
  );
});
test("missing model slots stay explicit and cannot be selected", async ({
  page,
}) => {
  await page.route("**/characters/models/manifest.json", (r) =>
    r.fulfill({
      json: {
        version: 1,
        characters: {
          nova: {
            status: "pending",
            model: null,
            source: "test",
            taskId: null,
          },
        },
      },
    }),
  );
  await page.goto("/");
  await page.locator("#console-fighters").click();
  await page
    .getByRole("button", { name: "노바 미리보기", exact: true })
    .click();
  await expect(page.locator(".model-status")).toContainText("생성 대기");
  await expect(page.locator("#select-fighter")).toBeDisabled();
  await page.screenshot({ path: "test-results/pending-model-roster.png" });
});

test("the live club renders behind the menu and pauses when the page is hidden", async ({
  page,
}) => {
  await page.addInitScript(() => {
    (window as any).ringDraws = 0;
    const prototype = WebGL2RenderingContext.prototype;
    const original = prototype.drawElements;
    prototype.drawElements = function (
      ...args: Parameters<WebGL2RenderingContext["drawElements"]>
    ) {
      if ((this.canvas as HTMLCanvasElement).parentElement?.id === "world")
        (window as any).ringDraws++;
      return original.apply(this, args);
    };
  });
  await page.goto("/");
  await expect(page.locator(".console-board")).toBeVisible();
  await expect(page.locator("#world")).toBeVisible();
  const before = await page.evaluate(() => (window as any).ringDraws);
  await expect
    .poll(() => page.evaluate(() => (window as any).ringDraws))
    .toBeGreaterThan(before);
  const paused = await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
    return (window as any).ringDraws;
  });
  await page.waitForTimeout(120);
  expect(await page.evaluate(() => (window as any).ringDraws)).toBe(paused);
});
