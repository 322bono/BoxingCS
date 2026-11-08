import { test, expect } from "@playwright/test";

test("the server session is restored before potentially slow WebGL initialization", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    (HTMLCanvasElement.prototype as any).getContext = function (
      this: HTMLCanvasElement,
      kind: string,
      ...args: any[]
    ) {
      if (
        kind.startsWith("webgl") &&
        (window as any).connectionAtGraphicsBoot === undefined
      )
        (window as any).connectionAtGraphicsBoot =
          document.querySelector("#server-text")?.textContent;
      return getContext.apply(this, [kind, ...args] as any);
    };
  });
  await page.goto("/");
  await expect
    .poll(() => page.evaluate(() => (window as any).connectionAtGraphicsBoot))
    .toBe("서버 연결됨");
  await expect(page.locator(".console-board")).toBeVisible();
});

test("local AI practice remains playable when the online server cannot connect", async ({
  page,
}) => {
  await page.route("**/socket.io/**", (route) => route.abort());
  await page.goto("/");
  await expect(page.locator(".console-board")).toBeVisible({ timeout: 15000 });
  await expect(page.locator(".console-online")).toContainText("연결 중");
  await page.getByRole("button", { name: "AI 연습", exact: true }).click();
  await page
    .getByRole("button", { name: "노바 미리보기", exact: true })
    .click();
  await page.getByRole("button", { name: "이 파이터로 계속" }).click();
  await page.getByLabel("닉네임").fill("오프라인검증");
  await page.getByRole("button", { name: "연습 시작", exact: true }).click();
  await expect(page.locator("#hud")).toBeVisible();
  await expect(page.locator("#world canvas")).toBeVisible();
  await page.getByRole("button", { name: "경기 나가기", exact: true }).click();
  await expect(page.locator(".console-board")).toBeVisible();
});
