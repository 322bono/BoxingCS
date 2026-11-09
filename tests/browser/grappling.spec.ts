import { test, expect } from "@playwright/test";

test("jiu-jitsu selection persists and practice presents contextual controls", async ({
  page,
}) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.locator('button[data-sport="bjj"]').click();
  await expect(page.locator('button[data-sport="bjj"]')).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.reload();
  await expect(page.locator('button[data-sport="bjj"]')).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByRole("button", { name: "AI 연습", exact: true }).click();
  await expect(page.locator(".signature-card b")).toContainText("플로 패스");
  await page.getByRole("button", { name: "이 파이터로 계속" }).click();
  await expect(page.getByRole("heading", { name: /주짓수.*AI/ })).toBeVisible();
  await page.getByLabel("닉네임").fill("매트 연습");
  await page.getByRole("button", { name: "연습 시작", exact: true }).click();
  await expect(page.locator("#hud")).toHaveAttribute("data-sport", "bjj");
  await expect(page.locator("#health-0")).toContainText("PT");
  await expect(page.locator("#bjj-camera")).toContainText("1인칭");
  await page.getByRole("button", { name: "시점 전환", exact: true }).click();
  await expect(page.locator("#bjj-camera")).toContainText("중계 시점");
  await page.keyboard.press("v");
  await expect(page.locator("#bjj-camera")).toContainText("1인칭");
  await expect(page.locator("#bjj-hint")).not.toHaveText("");
  await page.screenshot({ path: "test-results/jiu-jitsu-practice.png" });
  await page.getByRole("button", { name: "경기 나가기", exact: true }).click();
  await expect(page.locator(".club-home")).toBeVisible();
  expect(errors).toEqual([]);
});

test("a boxing-preference guest inherits the invited jiu-jitsu rules and shared points", async ({
  browser,
}) => {
  test.setTimeout(240000);
  const contexts = await Promise.all(
    [0, 1].map(() =>
      browser.newContext({
        viewport: { width: 800, height: 600 },
        deviceScaleFactor: 0.5,
      }),
    ),
  );
  const [host, guest] = await Promise.all(
    contexts.map((context) => context.newPage()),
  );
  const errors: string[] = [];
  for (const page of [host, guest])
    page.on("pageerror", (error) => errors.push(error.message));
  const started = Date.now();
  const checkpoint = (label: string) =>
    console.log(`BJJ online ${Date.now() - started}ms: ${label}`);
  for (const [index, page] of [host, guest].entries()) {
    let signature = "";
    page.on("websocket", (socket) =>
      socket.on("framereceived", ({ payload }) => {
        if (typeof payload !== "string" || !payload.startsWith('42["room",'))
          return;
        const value = JSON.parse(payload.slice(2))[1];
        const summary = value && {
          phase: value.phase,
          reason: value.reason,
          epoch: value.sync?.id,
          ready: value.sync?.ready,
          connected: value.players.map((player: any) => player.connected),
        };
        const next = JSON.stringify(summary);
        if (signature !== next) {
          signature = next;
          checkpoint(`wire ${index}: ${next}`);
        }
      }),
    );
  }
  try {
    await Promise.all([host.goto("/"), guest.goto("/")]);
    await host.locator('button[data-sport="bjj"]').click();
    await host.getByRole("button", { name: /1 vs 1/ }).click();
    await host.getByRole("button", { name: "이 파이터로 계속" }).click();
    await host.getByLabel("닉네임").fill("MAT RED");
    await host
      .getByRole("button", { name: "로비 만들기", exact: true })
      .click();
    await expect(host.locator("[data-code]")).toBeVisible();
    const code = (await host.locator("[data-code]").innerText()).trim();
    await expect(guest.locator('button[data-sport="boxing"]')).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await guest
      .getByRole("button", { name: "초대코드로 참가", exact: true })
      .click();
    await guest.getByLabel("닉네임").fill("MAT BLUE");
    await guest.getByLabel("초대코드", { exact: true }).fill(code);
    await guest.getByRole("button", { name: "참가하기", exact: true }).click();
    await expect(guest.locator(".club-lobby")).toHaveAttribute(
      "data-club-sport",
      "bjj",
    );
    checkpoint("invited guest inherited the room sport");
    for (const page of [host, guest])
      await expect
        .poll(() =>
          page
            .locator("#menu-music")
            .evaluate(
              (music: HTMLAudioElement) =>
                !music.paused && music.currentTime > 0,
            ),
        )
        .toBe(true);
    await Promise.all(
      [host, guest].map((page) =>
        page.getByRole("button", { name: "준비하기", exact: true }).click(),
      ),
    );
    await host.getByRole("button", { name: "경기 시작", exact: true }).click();
    for (const page of [host, guest]) {
      await expect(page.locator("#hud")).toHaveAttribute("data-sport", "bjj");
      await expect(page.locator("#fight-announcement")).toHaveText("", {
        timeout: 65000,
      });
    }
    checkpoint("both real models passed the common countdown");
    for (const page of [host, guest])
      await expect
        .poll(() =>
          page
            .locator("#menu-music")
            .evaluate((music: HTMLAudioElement) => music.paused),
        )
        .toBe(true);
    // Exercise the real authoritative server through player controls. No test
    // hooks or client snapshot mutation: the guest deliberately stays neutral.
    await host.keyboard.down("w");
    await host.keyboard.down("j");
    await expect(host.locator("#bjj-position")).toHaveText("클린치", {
      timeout: 10000,
    });
    await host.keyboard.up("w");
    await expect
      .poll(async () =>
        Number(
          (await host.locator("#bjj-control-label").innerText()).match(
            /\d+/,
          )?.[0] || 0,
        ),
      )
      .toBeGreaterThanOrEqual(32);
    await host.keyboard.down("k");
    await expect
      .poll(
        async () =>
          Number((await host.locator("#health-0").innerText()).split(" ")[0]),
        { timeout: 10000 },
      )
      .toBeGreaterThanOrEqual(2);
    await host.keyboard.up("j");
    await host.keyboard.up("k");
    await expect(guest.locator("#health-1")).toHaveText(
      await host.locator("#health-0").innerText(),
    );
    await expect(guest.locator("#bjj-role")).toHaveText("하위");
    checkpoint("takedown points agree on both browsers");
    await host.screenshot({ path: "test-results/jiu-jitsu-online.png" });
    await guest.reload({ waitUntil: "domcontentloaded" });
    await expect(guest.locator("#hud")).toHaveAttribute("data-sport", "bjj");
    await expect(guest.locator("#health-1")).toHaveText(
      await host.locator("#health-0").innerText(),
    );
    // Session/HUD restoration intentionally precedes slow graphics boot. A
    // resumed match is ready only after both models pass the fresh epoch gate.
    for (const page of [host, guest])
      await expect(page.locator("#fight-announcement")).toHaveText("", {
        timeout: 65000,
      });
    checkpoint("guest rejoined the same scored bout");
    await host
      .getByRole("button", { name: "경기 나가기", exact: true })
      .click();
    await expect(guest.getByText("상대 기권", { exact: true })).toBeVisible({
      timeout: 30000,
    });
    checkpoint("forfeit result reached the guest");
    expect(errors).toEqual([]);
  } finally {
    for (const page of [host, guest]) {
      await page.keyboard.up("w").catch(() => {});
      await page.keyboard.up("j").catch(() => {});
      await page.keyboard.up("k").catch(() => {});
    }
    await Promise.all(contexts.map((context) => context.close()));
  }
});

test("switching real cached fighters between sports preserves bare skin and boxing gloves", async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.goto("/tests/fixtures/world-bjj-harness.html");
  await page.waitForFunction(() => !!(window as any).worldBjjHarness);
  const samples = await page.evaluate(async () => {
    const { world } = (window as any).worldBjjHarness;
    const result = [];
    for (const sport of ["boxing", "bjj", "boxing", "bjj"]) {
      await world.setCharacters("nova", "blaze", sport);
      result.push(
        world.fighters.map((root: any) => {
          let gloves = 0,
            vertices = 0;
          root.traverse((object: any) => {
            if (object.name === "boxing-glove") gloves++;
            if (object.isSkinnedMesh)
              vertices += object.geometry.attributes.position.count;
          });
          return { sport: root.userData.sport, gloves, vertices };
        }),
      );
    }
    return result;
  });
  for (const index of [0, 2]) {
    expect(samples[index].map((sample: any) => sample.gloves)).toEqual([2, 2]);
    expect(samples[index].map((sample: any) => sample.sport)).toEqual([
      "boxing",
      "boxing",
    ]);
  }
  for (const index of [1, 3]) {
    expect(samples[index].map((sample: any) => sample.gloves)).toEqual([0, 0]);
    expect(samples[index].map((sample: any) => sample.sport)).toEqual([
      "bjj",
      "bjj",
    ]);
    expect(
      samples[index].every(
        (sample: any, seat: number) =>
          sample.vertices >= samples[0][seat].vertices,
      ),
    ).toBe(true);
  }
  expect(samples[2]).toEqual(samples[0]);
  expect(samples[3]).toEqual(samples[1]);
});
