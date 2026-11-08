import { test, expect, type Page } from "@playwright/test";

async function probe(page: Page) {
  await page.addInitScript(() => {
    (window as any).arenaSources = [];
    (window as any).arenaDecoded = [];
    (window as any).arenaContexts = [];
    const create = AudioContext.prototype.createBufferSource;
    AudioContext.prototype.createBufferSource = function () {
      if (!(window as any).arenaContexts.includes(this))
        (window as any).arenaContexts.push(this);
      const source = create.call(this),
        start = source.start,
        stop = source.stop;
      let record: any;
      source.start = function (
        ...args: Parameters<AudioBufferSourceNode["start"]>
      ) {
        record = {
          loop: this.loop,
          duration: this.buffer?.duration || 0,
          nonSilent: !!this.buffer
            ?.getChannelData(0)
            .some((v) => Math.abs(v) > 0.0001),
          ended: false,
          stopped: false,
        };
        (window as any).arenaSources.push(record);
        this.addEventListener("ended", () => {
          record.ended = true;
        });
        return start.apply(this, args);
      };
      source.stop = function (
        ...args: Parameters<AudioBufferSourceNode["stop"]>
      ) {
        if (record) record.stopped = true;
        return stop.apply(this, args);
      };
      return source;
    };
    const decode = AudioContext.prototype.decodeAudioData;
    AudioContext.prototype.decodeAudioData = function (bytes: ArrayBuffer) {
      return decode.call(this, bytes).then((buffer) => {
        (window as any).arenaDecoded.push(buffer.duration);
        return buffer;
      });
    };
  });
  await page.goto("/tests/fixtures/audio-harness.html");
  await page.getByRole("button", { name: "오디오 시작", exact: true }).click();
}
const loopCount = (page: Page) =>
  page.evaluate(
    () =>
      (window as any).arenaSources.filter((s: any) => s.loop && !s.ended)
        .length,
  );
const reactions = (page: Page, duration: number) =>
  page.evaluate(
    (d) =>
      (window as any).arenaSources.filter(
        (s: any) => !s.loop && Math.abs(s.duration - d) < 0.01,
      ).length,
    duration,
  );

test("real crowd loop reacts once, pauses for reconnect, and leaves only a celebration tail", async ({
  page,
}) => {
  await probe(page);
  await expect.poll(() => loopCount(page)).toBe(1);
  await page.evaluate(() => {
    const h = (window as any).audioHarness;
    h.bout.fighters[1].hp -= 7;
    h.observe();
  });
  await expect.poll(() => reactions(page, 3.4)).toBe(1);
  await page.evaluate(() => {
    for (let i = 0; i < 120; i++) (window as any).audioHarness.observe();
  });
  expect(await reactions(page, 3.4)).toBe(1);
  expect(await loopCount(page)).toBe(1);
  await page.evaluate(() => {
    const h = (window as any).audioHarness;
    h.bout.fighters[0].skillSerial++;
    h.observe();
  });
  await expect.poll(() => reactions(page, 4.8)).toBe(1);
  await page.evaluate(() => (window as any).audioHarness.observe(true));
  await expect.poll(() => loopCount(page)).toBe(0);
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as any).arenaSources.every((s: any) => s.ended),
      ),
    )
    .toBe(true);
  await page.evaluate(() => {
    const h = (window as any).audioHarness;
    h.bout.fighters[1].hp -= 15;
    h.observe(true);
    h.observe();
  });
  await expect.poll(() => loopCount(page)).toBe(1);
  expect(await reactions(page, 4.8)).toBe(1);
  await page.evaluate(() => {
    const h = (window as any).audioHarness;
    h.bout.ended = true;
    h.bout.fighters[1].hp = 0;
    h.observe();
    h.audio.setScene("result");
    // The real server keeps sending ended snapshots after the result transition.
    for (let i = 0; i < 30; i++) h.observe();
  });
  await expect.poll(() => reactions(page, 4.8)).toBe(2);
  await expect.poll(() => loopCount(page)).toBe(0);
  expect(
    await page.evaluate(() => (window as any).arenaSources.at(-1).stopped),
  ).toBe(false);
  await page.evaluate(() =>
    (window as any).audioHarness.audio.setScene("menu"),
  );
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as any).arenaSources.every((s: any) => s.ended),
      ),
    )
    .toBe(true);
  await expect
    .poll(() =>
      page
        .locator("#menu-music")
        .evaluate((e: HTMLAudioElement) => !e.paused && e.currentTime > 0),
    )
    .toBe(true);
  expect(
    await page.evaluate(() =>
      (window as any).arenaSources.every((s: any) => s.nonSilent),
    ),
  ).toBe(true);
});

for (const mute of ["volume", "effects"] as const)
  test(`a buffered cheer is cancelled by ${mute} mute even if immediately re-enabled`, async ({
    page,
  }) => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    await page.route("**/audio/sfx/arena-roar.wav", async (route) => {
      await gate;
      await route.continue();
    });
    try {
      await probe(page);
      await expect.poll(() => loopCount(page)).toBe(1);
      await page.evaluate((kind) => {
        const h = (window as any).audioHarness;
        h.bout.fighters[0].skillSerial++;
        h.observe();
        if (kind === "volume") {
          h.audio.setCrowdVolume(0);
          h.audio.setCrowdVolume(0.7);
        } else {
          h.audio.setEffectsEnabled(false);
          h.audio.setEffectsEnabled(true);
        }
      }, mute);
      release();
      await expect
        .poll(() =>
          page.evaluate(() =>
            (window as any).arenaDecoded.some(
              (d: number) => Math.abs(d - 4.8) < 0.01,
            ),
          ),
        )
        .toBe(true);
      expect(await reactions(page, 4.8)).toBe(0);
      await expect.poll(() => loopCount(page)).toBe(1);
    } finally {
      release();
    }
  });

test("a delayed ambience download cannot start after returning to the main menu", async ({
  page,
}) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  await page.route("**/audio/sfx/arena-bed.wav", async (route) => {
    await gate;
    await route.continue();
  });
  try {
    await probe(page);
    await page.evaluate(() =>
      (window as any).audioHarness.audio.setScene("menu"),
    );
    release();
    await expect
      .poll(() =>
        page.evaluate(() =>
          (window as any).arenaDecoded.some(
            (d: number) => Math.abs(d - 9.6) < 0.01,
          ),
        ),
      )
      .toBe(true);
    expect(await loopCount(page)).toBe(0);
  } finally {
    release();
  }
});

test("visibility events restart the bed after native audio context suspension", async ({
  page,
}) => {
  await probe(page);
  await expect.poll(() => loopCount(page)).toBe(1);
  await page.evaluate(async () => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
    await (window as any).arenaContexts[0].suspend();
  });
  expect(
    await page.evaluate(() =>
      (window as any).arenaSources
        .filter((s: any) => s.loop)
        .every((s: any) => s.stopped),
    ),
  ).toBe(true);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: false,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect.poll(() => loopCount(page)).toBe(1);
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as any).arenaSources.filter((s: any) => s.loop).length,
      ),
    )
    .toBe(2);
});

test("the existing clock and edge vignette communicate pressure and respect motion settings", async ({
  page,
}) => {
  await probe(page);
  const clock = page.locator("#clock"),
    hud = page.locator("#hud");
  const normalColor = await clock.evaluate((e) => getComputedStyle(e).color);
  const normalShadow = await hud.evaluate((e) => getComputedStyle(e).boxShadow);
  await page.evaluate(() => {
    const h = (window as any).audioHarness;
    h.bout.time = 29;
    h.observe();
  });
  await expect(clock).toHaveText("29");
  expect(await clock.evaluate((e) => getComputedStyle(e).color)).not.toBe(
    normalColor,
  );
  await page.evaluate(() => {
    const h = (window as any).audioHarness;
    h.bout.time = 9;
    h.bout.fighters[0].hp = 15;
    h.observe();
  });
  await expect(clock).toHaveText("9");
  await expect
    .poll(() => clock.evaluate((e) => getComputedStyle(e).animationName))
    .not.toBe("none");
  await expect
    .poll(() => hud.evaluate((e) => getComputedStyle(e).boxShadow))
    .not.toBe(normalShadow);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(clock).toHaveCSS("animation-name", "none");
  await page.evaluate(() => (window as any).audioHarness.observe(false, false));
  await expect(hud).toHaveCSS("box-shadow", normalShadow);
  await page.evaluate(() => (window as any).audioHarness.observe(true));
  await expect(clock).toHaveCSS("color", normalColor);
  await page.screenshot({ path: "test-results/arena-pressure-settings.png" });
});

test("crowd volume is a saved setting independent from menu music", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "설정", exact: true }).click();
  const volume = page.getByRole("slider", {
    name: "관중 환호 음량",
    exact: true,
  });
  await expect(volume).toHaveValue("70");
  await volume.press("Home");
  await expect(volume).toHaveValue("0");
  await expect(page.getByLabel("배경음악", { exact: true })).toBeChecked();
  await page.reload();
  await page.getByRole("button", { name: "설정", exact: true }).click();
  await expect(volume).toHaveValue("0");
  await volume.press("End");
  await expect(volume).toHaveValue("100");
  await expect(page.locator("#crowd-level")).toHaveText("100%");
});
