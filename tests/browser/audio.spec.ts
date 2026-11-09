import { test, expect } from "@playwright/test";

test("Before the Bell continues through lobby updates and obeys mute, visibility and match start", async ({
  page,
}) => {
  await page.goto("/tests/fixtures/audio-harness.html");
  await page.evaluate(() =>
    (window as any).audioHarness.audio.setScene("menu"),
  );
  await page.getByRole("button", { name: "오디오 시작", exact: true }).click();
  const music = page.locator("#menu-music");
  const playing = () =>
    music.evaluate(
      (element: HTMLAudioElement) => !element.paused && element.currentTime > 0,
    );
  await expect.poll(playing).toBe(true);
  const before = await music.evaluate(
    (element: HTMLAudioElement) => element.currentTime,
  );
  await page.evaluate(() => {
    const audio = (window as any).audioHarness.audio;
    for (let i = 0; i < 60; i++) audio.setScene("lobby");
  });
  await expect
    .poll(() =>
      music.evaluate(
        (element: HTMLAudioElement, start) =>
          !element.paused && element.currentTime > start + 0.3,
        before,
      ),
    )
    .toBe(true);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect.poll(playing).toBe(false);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => false,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect.poll(playing).toBe(true);
  await page.evaluate(() => {
    const audio = (window as any).audioHarness.audio;
    audio.setMusicEnabled(false);
    audio.setScene("menu");
    audio.setScene("lobby");
  });
  await expect.poll(playing).toBe(false);
  await page.evaluate(() =>
    (window as any).audioHarness.audio.setMusicEnabled(true),
  );
  await expect.poll(playing).toBe(true);
  await page.evaluate(() =>
    (window as any).audioHarness.audio.setScene("fight"),
  );
  await expect.poll(playing).toBe(false);
});

test("menu music unlocks, persists its mute preference, and pauses for recorded boxing audio", async ({
  page,
}) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("response", (r) => {
    if (r.status() >= 400 && new URL(r.url()).pathname.startsWith("/audio/"))
      errors.push(r.url());
  });
  await page.addInitScript(() => {
    (window as any).recordedStarts = [];
    const create = AudioContext.prototype.createBufferSource;
    AudioContext.prototype.createBufferSource = function () {
      const source = create.call(this),
        start = source.start;
      source.start = function (
        ...args: Parameters<AudioBufferSourceNode["start"]>
      ) {
        (window as any).recordedStarts.push({
          duration: this.buffer?.duration || 0,
          nonSilent: !!this.buffer
            ?.getChannelData(0)
            .some((v) => Math.abs(v) > 0.0001),
        });
        return start.apply(this, args);
      };
      return source;
    };
  });
  await page.goto("/");
  const music = page.locator("#menu-music");
  await expect(music).toHaveAttribute(
    "src",
    "/audio/music/before-the-bell.mp3",
  );
  expect(await music.evaluate((a) => (a as HTMLAudioElement).loop)).toBe(true);
  await page.getByRole("button", { name: "설정", exact: true }).click();
  await expect
    .poll(() =>
      music.evaluate(
        (a) =>
          !(a as HTMLAudioElement).paused &&
          (a as HTMLAudioElement).currentTime > 0,
      ),
    )
    .toBe(true);
  await page.getByLabel("배경음악", { exact: true }).uncheck();
  await expect
    .poll(() => music.evaluate((a) => (a as HTMLAudioElement).paused))
    .toBe(true);
  await page.reload();
  await page.getByRole("button", { name: "설정", exact: true }).click();
  await expect(page.getByLabel("배경음악", { exact: true })).not.toBeChecked();
  expect(await music.evaluate((a) => (a as HTMLAudioElement).paused)).toBe(
    true,
  );
  await page.getByLabel("배경음악", { exact: true }).check();
  await expect
    .poll(() =>
      music.evaluate(
        (a) =>
          !(a as HTMLAudioElement).paused &&
          (a as HTMLAudioElement).currentTime > 0,
      ),
    )
    .toBe(true);
  await page.getByRole("button", { name: "닫기", exact: true }).click();
  await page.getByRole("button", { name: "AI 연습", exact: true }).click();
  await page
    .getByRole("button", { name: "노바 미리보기", exact: true })
    .click();
  await page.getByRole("button", { name: "이 파이터로 계속" }).click();
  await page.getByLabel("닉네임").fill("사운드테스트");
  await page.locator('input[name="difficulty"][value=".3"]').check();
  await page.getByRole("button", { name: "연습 시작" }).click();
  await expect(page.locator("#hud")).toBeVisible();
  await expect
    .poll(() => music.evaluate((a) => (a as HTMLAudioElement).paused))
    .toBe(true);
  const pausedAt = await music.evaluate(
    (a) => (a as HTMLAudioElement).currentTime,
  );
  const before = await page.evaluate(
    () => (window as any).recordedStarts.length,
  );
  await page.keyboard.down("w");
  await page.keyboard.down("j");
  await expect
    .poll(
      async () =>
        Number((await page.locator("#health-1").innerText()).split(" ")[0]),
      { timeout: 15000 },
    )
    .toBeLessThan(100);
  await page.keyboard.up("w");
  await page.keyboard.up("j");
  await expect
    .poll(() => page.evaluate(() => (window as any).recordedStarts.length))
    .toBeGreaterThan(before);
  expect(
    await page.evaluate(() =>
      (window as any).recordedStarts.every(
        (s: any) => s.duration > 0 && s.nonSilent,
      ),
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: "경기 나가기", exact: true })
    .or(page.getByRole("button", { name: "메인으로", exact: true }))
    .click();
  await expect(page.locator(".console-board")).toBeVisible();
  await expect
    .poll(() =>
      music.evaluate(
        (a, previousTime) =>
          !(a as HTMLAudioElement).paused &&
          (a as HTMLAudioElement).currentTime >= previousTime,
        pausedAt,
      ),
    )
    .toBe(true);
  expect(
    await page.evaluate(
      (startIndex) =>
        (window as any).recordedStarts
          .slice(startIndex)
          .some((s: any) => s.duration < 1 && s.nonSilent),
      before,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
