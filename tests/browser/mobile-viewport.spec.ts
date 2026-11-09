import { test, expect, type Page, type Locator } from "@playwright/test";
import { io, type Socket } from "socket.io-client";
import { randomUUID } from "node:crypto";

test.use({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 0.4,
  isMobile: true,
  hasTouch: true,
});

async function dragTouch(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
) {
  const session = await page.context().newCDPSession(page);
  try {
    await session.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ ...from, id: 1 }],
    });
    for (let step = 1; step <= 10; step++) {
      await session.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [
          {
            x: from.x + ((to.x - from.x) * step) / 10,
            y: from.y + ((to.y - from.y) * step) / 10,
            id: 1,
          },
        ],
      });
      await page.waitForTimeout(20);
    }
    await session.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
  } finally {
    await session.detach();
  }
}

async function expectInsideViewport(page: Page, target: Locator) {
  const box = await target.boundingBox();
  const viewport = await page.evaluate(() => ({
    width: visualViewport?.width ?? innerWidth,
    height: visualViewport?.height ?? innerHeight,
  }));
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(-1);
  expect(box!.y).toBeGreaterThanOrEqual(-1);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height + 1);
}

test("phone form fields avoid iOS focus zoom without disabling intentional zoom", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "초대코드로 참가", exact: true })
    .tap();
  const nickname = page.getByLabel("닉네임");
  expect(
    await nickname.evaluate((element) =>
      parseFloat(getComputedStyle(element).fontSize),
    ),
  ).toBeGreaterThanOrEqual(16);
  await nickname.tap();
  expect(await page.evaluate(() => visualViewport?.scale ?? 1)).toBe(1);
  const viewport = await page
    .locator('meta[name="viewport"]')
    .getAttribute("content");
  expect(viewport).not.toMatch(
    /user-scalable\s*=\s*(?:no|0)|maximum-scale\s*=\s*1(?:\D|$)/,
  );
});

test("touch drags leave the document fixed while a short dialog scrolls to its action", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".club-home")).toBeVisible();
  await dragTouch(page, { x: 370, y: 650 }, { x: 370, y: 180 });
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  expect(await page.evaluate(() => document.scrollingElement!.scrollTop)).toBe(
    0,
  );

  await page
    .getByRole("button", { name: "초대코드로 참가", exact: true })
    .tap();
  // Chromium does not show an OS keyboard in headless mode. Exercise the
  // visualViewport-only resize that Safari emits with the keyboard instead.
  await page.evaluate(() => {
    Object.defineProperty(visualViewport!, "height", {
      configurable: true,
      value: 320,
    });
    visualViewport!.dispatchEvent(new Event("resize"));
  });
  await expect
    .poll(() =>
      page
        .getByRole("dialog")
        .evaluate((element) => element.getBoundingClientRect().bottom),
    )
    .toBeLessThanOrEqual(320);
  await page.evaluate(() => {
    delete (visualViewport as any).height;
    visualViewport!.dispatchEvent(new Event("resize"));
  });
  await page.setViewportSize({ width: 390, height: 360 });
  const dialog = page.getByRole("dialog");
  await expect
    .poll(() => dialog.evaluate((element) => element.clientHeight))
    .toBeLessThan(360);
  await expect
    .poll(() =>
      dialog.evaluate((element) => element.scrollHeight - element.clientHeight),
    )
    .toBeGreaterThan(0);
  await dragTouch(page, { x: 320, y: 290 }, { x: 320, y: 90 });
  await expect
    .poll(() => dialog.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(0);
  await page.getByLabel("닉네임").fill("PHONE");
  await page.getByLabel("초대코드", { exact: true }).fill("ZZZZZZ");
  const submit = page.getByRole("button", { name: "참가하기", exact: true });
  await submit.scrollIntoViewIfNeeded();
  await expectInsideViewport(page, submit);
  await submit.tap();
  await expect(page.getByRole("status")).toContainText(
    "초대코드를 확인해 주세요.",
  );
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
});

test("an eight-player lobby keeps ready and start reachable in portrait and landscape", async ({
  page,
}) => {
  test.setTimeout(60000);
  const clients: Socket[] = [];
  const hostToken = randomUUID();
  const states: Array<{ code: string } | null> = [];
  const command = (client: Socket, payload: object) =>
    new Promise<{ ok: boolean }>((resolve, reject) => {
      client
        .timeout(4000)
        .emit(
          "action",
          payload,
          (error: Error | null, result: { ok: boolean }) =>
            error ? reject(error) : resolve(result),
        );
    });
  try {
    for (let i = 0; i < 8; i++) {
      const client = io("http://127.0.0.1:3000", {
        auth: { token: i === 0 ? hostToken : randomUUID() },
        forceNew: true,
      });
      clients.push(client);
      client.on("room", (room) => (states[i] = room));
      await new Promise<void>((resolve) => client.once("connect", resolve));
    }
    expect(
      (
        await command(clients[0], {
          type: "create",
          name: "PHONE HOST",
          mode: "team",
          size: 4,
        })
      ).ok,
    ).toBe(true);
    await expect.poll(() => states[0]?.code).toBeTruthy();
    for (let i = 1; i < clients.length; i++) {
      expect(
        (
          await command(clients[i], {
            type: "join",
            name: `PLAYER ${i}`,
            code: states[0]!.code,
          })
        ).ok,
      ).toBe(true);
      expect(
        (await command(clients[i], { type: "update", patch: { ready: true } }))
          .ok,
      ).toBe(true);
    }
    clients[0].disconnect();
    await page.addInitScript(
      (token) => sessionStorage.setItem("ring-session", token),
      hostToken,
    );
    await page.goto("/");
    await expect(page.locator(".player-row")).toHaveCount(8);
    const ready = page.getByRole("button", { name: "준비하기", exact: true });
    await ready.scrollIntoViewIfNeeded();
    await expectInsideViewport(page, ready);
    await ready.tap();
    const start = page.getByRole("button", { name: "경기 시작", exact: true });
    await expect(start).toBeEnabled();
    for (const viewport of [
      { width: 390, height: 420 },
      { width: 844, height: 390 },
    ]) {
      await page.setViewportSize(viewport);
      await start.scrollIntoViewIfNeeded();
      await expectInsideViewport(page, start);
      await page.locator(".player-row").last().scrollIntoViewIfNeeded();
      await expectInsideViewport(page, page.locator(".player-row").last());
      expect(await page.evaluate(() => window.scrollY)).toBe(0);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
  } finally {
    clients.forEach((client) => client.disconnect());
  }
});

for (const sport of ["boxing", "bjj"] as const) {
  test(`${sport} touch controls stay inside the visual viewport and retain capture while dragged`, async ({
    page,
  }) => {
    test.setTimeout(90000);
    await page.goto("/");
    await page.locator(`button[data-sport="${sport}"]`).tap();
    await page.getByRole("button", { name: "AI 연습", exact: true }).tap();
    await page.locator("#select-fighter").tap();
    await page.getByLabel("닉네임").fill("PHONE PRACTICE");
    await page.getByRole("button", { name: "연습 시작", exact: true }).tap();
    await expect(page.locator("#hud")).toBeVisible();
    // Test viewport/input behavior without the live AI ending the bout while
    // SwiftShader catches up with repeated portrait/landscape layout changes.
    await page.clock.install({ time: new Date("2026-01-01T00:00:00Z") });
    await page.clock.pauseAt(new Date("2026-01-01T00:00:01Z"));
    for (const viewport of [
      { width: 390, height: 844 },
      { width: 390, height: 420 },
      { width: 844, height: 390 },
    ]) {
      await page.setViewportSize(viewport);
      await expect
        .poll(() =>
          page.clock
            .runFor(32)
            .then(() =>
              page
                .locator("#hud")
                .evaluate((element) =>
                  Math.round(element.getBoundingClientRect().height),
                ),
            ),
        )
        .toBe(viewport.height);
      await expectInsideViewport(page, page.locator("#fight-leave"));
      await expectInsideViewport(page, page.locator("#skill-button"));
      for (const button of await page.locator(".touch-controls button").all())
        await expectInsideViewport(page, button);
    }
    // A landscape notch can occupy only one edge; neither health column should
    // sit under that inset. Chromium otherwise reports zero hardware safe areas.
    await page.evaluate(() =>
      document.documentElement.style.setProperty("--safe-left", "44px"),
    );
    expect(
      (await page.locator(".fight-top").boundingBox())!.x,
    ).toBeGreaterThanOrEqual(44);
    await page.evaluate(() => {
      const events: string[] = [];
      (window as any).mobilePointerEvents = events;
      for (const type of [
        "pointerdown",
        "pointerup",
        "pointercancel",
        "lostpointercapture",
      ])
        document
          .querySelector('[data-key="w"]')!
          .addEventListener(type, () => events.push(type));
    });
    const button = await page.locator('[data-key="w"]').boundingBox();
    expect(button).not.toBeNull();
    await dragTouch(
      page,
      { x: button!.x + button!.width / 2, y: button!.y + button!.height / 2 },
      { x: 420, y: 100 },
    );
    await expect
      .poll(() =>
        page.evaluate(() =>
          ((window as any).mobilePointerEvents as string[]).includes(
            "pointerup",
          ),
        ),
      )
      .toBe(true);
    const events = await page.evaluate(
      () => (window as any).mobilePointerEvents as string[],
    );
    expect(events).toContain("pointerdown");
    expect(events).toContain("pointerup");
    expect(events).not.toContain("pointercancel");
    expect(await page.evaluate(() => visualViewport?.scale ?? 1)).toBe(1);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    await expect(page.locator("#world canvas")).toHaveCSS(
      "touch-action",
      "none",
    );
    const session = await page.context().newCDPSession(page);
    try {
      await session.send("Input.synthesizePinchGesture", {
        x: 420,
        y: 180,
        scaleFactor: 1.5,
        gestureSourceType: "touch",
      });
      expect(await page.evaluate(() => visualViewport?.scale ?? 1)).toBe(1);
    } finally {
      await session.detach();
    }
  });
}
