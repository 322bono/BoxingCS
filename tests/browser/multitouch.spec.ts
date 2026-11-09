import { test, expect } from "@playwright/test";
import { io } from "socket.io-client";
import { randomUUID } from "node:crypto";
import type { Room } from "../../server/rooms";
import { idleInput } from "../../shared/game";

test.use({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 0.4,
  isMobile: true,
  hasTouch: true,
});

test("lifting a movement finger keeps another finger's grip active on the server", async ({
  page,
}) => {
  test.setTimeout(120000);
  const opponent = io("http://127.0.0.1:3000", {
    auth: { token: randomUUID() },
    forceNew: true,
  });
  let room: Room | null = null;
  opponent.on("room", (value) => (room = value));
  const command = (payload: object) =>
    new Promise<{ ok: boolean }>((resolve, reject) =>
      opponent
        .timeout(4000)
        .emit(
          "action",
          payload,
          (error: Error | null, result: { ok: boolean }) =>
            error ? reject(error) : resolve(result),
        ),
    );
  let pump: ReturnType<typeof setInterval> | undefined;
  const touch = await page.context().newCDPSession(page);
  try {
    await new Promise<void>((resolve) => opponent.once("connect", resolve));
    expect(
      (
        await command({
          type: "create",
          name: "IDLE PARTNER",
          mode: "duel",
          size: 1,
          sport: "bjj",
        })
      ).ok,
    ).toBe(true);
    await expect.poll(() => room?.code).toBeTruthy();
    await page.goto("/");
    await page
      .getByRole("button", { name: "초대코드로 참가", exact: true })
      .tap();
    await page.getByLabel("닉네임").fill("TWO FINGERS");
    await page.getByLabel("초대코드", { exact: true }).fill(room!.code);
    await page.getByRole("button", { name: "참가하기", exact: true }).tap();
    await page.getByRole("button", { name: "준비하기", exact: true }).tap();
    expect((await command({ type: "update", patch: { ready: true } })).ok).toBe(
      true,
    );
    expect((await command({ type: "start" })).ok).toBe(true);
    await expect.poll(() => room?.sync?.id).toBeTruthy();
    expect(
      (
        await command({
          type: "loaded",
          boutId: room!.bout!.id,
          epoch: room!.sync!.id,
        })
      ).ok,
    ).toBe(true);
    await expect(page.locator("#fight-announcement")).toHaveText("", {
      timeout: 65000,
    });
    let forward = 1;
    pump = setInterval(
      () =>
        opponent.emit("input", {
          ...idleInput(),
          forward,
          boutId: room!.bout!.id,
          epoch: room!.sync!.id,
        }),
      33,
    );
    await expect
      .poll(
        () => Math.abs(room!.bout!.fighters[0].z - room!.bout!.fighters[1].z),
        { timeout: 7000 },
      )
      .toBeLessThan(1.3);
    forward = 0;
    const center = async (key: string, id: number) => {
      const box = (await page.locator(`[data-key="${key}"]`).boundingBox())!;
      return { x: box.x + box.width / 2, y: box.y + box.height / 2, id };
    };
    const grip = await center("j", 11),
      movement = await center("w", 12);
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [grip],
    });
    await expect.poll(() => room!.bout!.grappling!.grip[1]).toBeGreaterThan(8);
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [grip, movement],
    });
    await page.waitForTimeout(150);
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [movement],
    });
    const before = room!.bout!.grappling!.grip[1];
    await page.waitForTimeout(650);
    expect(room!.bout!.grappling!.grip[1]).toBeGreaterThanOrEqual(
      Math.min(99, before + 2),
    );
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    const peak = room!.bout!.grappling!.grip[1];
    await expect
      .poll(() => room!.bout!.grappling!.grip[1], { timeout: 2500 })
      .toBeLessThan(peak - 1);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    expect(await page.evaluate(() => visualViewport?.scale)).toBe(1);
    await page.getByRole("button", { name: "경기 나가기", exact: true }).tap();
  } finally {
    clearInterval(pump);
    await touch.detach();
    await command({ type: "leave" }).catch(() => {});
    opponent.disconnect();
  }
});
