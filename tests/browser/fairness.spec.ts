import { test, expect } from "@playwright/test";
import { io, type Socket } from "socket.io-client";
import { randomUUID } from "node:crypto";
import type { Room } from "../../server/rooms";
import { idleInput } from "../../shared/game";
import { readFile } from "node:fs/promises";

test("a fast host waits for the guest and old connection inputs cannot replay", async () => {
  test.setTimeout(25000);
  const tokens = [randomUUID(), randomUUID()];
  const clients: Socket[] = [];
  const states: (Room | null)[] = [null, null];
  const connect = async (index: number) => {
    const s = io("http://127.0.0.1:3000", {
      auth: { token: tokens[index] },
      forceNew: true,
      transports: ["websocket"],
    });
    clients.push(s);
    s.on("room", (r) => (states[index] = r));
    await new Promise<void>((resolve) => s.once("connect", resolve));
    return s;
  };
  const command = (s: Socket, payload: object) =>
    new Promise<{ ok: boolean }>((resolve, reject) =>
      s
        .timeout(3000)
        .emit("action", payload, (e: Error | null, r: { ok: boolean }) =>
          e ? reject(e) : resolve(r),
        ),
    );
  let pump: ReturnType<typeof setInterval> | undefined;
  try {
    const host = await connect(0),
      guest = await connect(1);
    expect(
      (
        await command(host, {
          type: "create",
          name: "H",
          mode: "duel",
          size: 1,
        })
      ).ok,
    ).toBe(true);
    await expect.poll(() => states[0]?.code).toBeTruthy();
    const code = states[0]!.code;
    expect((await command(guest, { type: "join", name: "G", code })).ok).toBe(
      true,
    );
    for (const s of [host, guest])
      expect(
        (await command(s, { type: "update", patch: { ready: true } })).ok,
      ).toBe(true);
    expect((await command(host, { type: "start" })).ok).toBe(true);
    await expect.poll(() => states[0]?.phase).toBe("playing");
    expect(states[0]!.sync).toBeTruthy();
    const original = states[0]!,
      boutId = original.bout!.id,
      epoch = original.sync!.id;
    expect((await command(host, { type: "loaded", boutId, epoch })).ok).toBe(
      true,
    );
    pump = setInterval(
      () =>
        host.emit("input", {
          ...idleInput(),
          forward: 1,
          jab: true,
          hp: 0,
          damage: 999,
          time: 0,
          dt: 100,
          x: 999,
          boutId,
          epoch,
        }),
      5,
    );
    // Model/network delay on one device must not give the host free movement or damage.
    await new Promise((resolve) => setTimeout(resolve, 1100));
    expect(states[0]!.bout!.countdown).toBe(3);
    expect(states[0]!.bout!.time).toBe(90);
    expect(states[0]!.bout!.fighters.map((f) => [f.hp, f.x, f.z])).toEqual([
      [100, 0, 1.7],
      [100, 0, -1.7],
    ]);
    clearInterval(pump);
    expect((await command(guest, { type: "loaded", boutId, epoch })).ok).toBe(
      true,
    );
    await expect.poll(() => states[0]?.sync?.deadline).toBe(0);
    expect((await command(host, { type: "start" })).ok).toBe(false);
    guest.disconnect();
    await expect
      .poll(() => states[0]?.players.some((p) => !p.connected))
      .toBe(true);
    const resumed = await connect(1);
    await expect
      .poll(() => states[0]?.players.every((p) => p.connected))
      .toBe(true);
    const newEpoch = states[0]!.sync!.id;
    expect(newEpoch).not.toBe(epoch);
    expect((await command(host, { type: "loaded", boutId, epoch })).ok).toBe(
      false,
    );
    for (const s of [host, resumed])
      expect(
        (await command(s, { type: "loaded", boutId, epoch: newEpoch })).ok,
      ).toBe(true);
    pump = setInterval(() => {
      host.emit("input", {
        ...idleInput(),
        forward: 1,
        jab: true,
        boutId,
        epoch,
      });
      resumed.emit("input", { ...idleInput(), boutId, epoch: newEpoch });
    }, 33);
    await expect
      .poll(() => states[0]?.bout?.countdown, { timeout: 6000 })
      .toBe(0);
    await expect.poll(() => states[0]?.bout?.time).toBeLessThan(89.6);
    expect(states[0]!.bout!.fighters.map((f) => [f.hp, f.x, f.z])).toEqual([
      [100, 0, 1.7],
      [100, 0, -1.7],
    ]);
    clearInterval(pump);
    // Reject an old bout as well as an old reconnect epoch.
    pump = setInterval(
      () =>
        host.emit("input", {
          ...idleInput(),
          forward: 1,
          boutId: "old-bout",
          epoch: newEpoch,
        }),
      33,
    );
    const until = states[0]!.bout!.time - 0.35;
    await expect.poll(() => states[0]?.bout?.time).toBeLessThan(until);
    expect(states[0]!.bout!.fighters[0].z).toBe(1.7);
    clearInterval(pump);
    pump = setInterval(
      () =>
        host.emit("input", {
          ...idleInput(),
          forward: 1,
          boutId,
          epoch: newEpoch,
        }),
      33,
    );
    await expect.poll(() => states[0]?.bout?.fighters[0].z).toBeLessThan(1.6);
    expect(states[0]!.bout!.fighters.map((f) => f.hp)).toEqual([100, 100]);
    await expect.poll(() => states[1]?.sync?.id).toBe(newEpoch);
    expect(states[1]!.bout!.id).toBe(boutId);
    clearInterval(pump);
    // A page replacement may reconnect before the server observes its old socket closing.
    const replacement = await connect(1);
    await expect.poll(() => states[0]?.sync?.id).not.toBe(newEpoch);
    expect(states[0]!.sync!.ready).toEqual([]);
    expect(states[0]!.sync!.deadline).toBeGreaterThan(0);
    const heldTime = states[0]!.bout!.time;
    await new Promise((resolve) => setTimeout(resolve, 350));
    expect(states[0]!.bout!.time).toBe(heldTime);
    const replacementEpoch = states[0]!.sync!.id;
    for (const s of [host, replacement])
      expect(
        (await command(s, { type: "loaded", boutId, epoch: replacementEpoch }))
          .ok,
      ).toBe(true);
    await expect.poll(() => states[0]?.sync?.deadline).toBe(0);
    expect(states[0]!.bout!.countdown).toBeGreaterThan(2.5);
  } finally {
    clearInterval(pump);
    for (const s of clients) s.disconnect();
  }
});

test("a browser with delayed 3D files holds the common countdown", async ({
  browser,
}) => {
  test.setTimeout(60000);
  const viewport = { width: 800, height: 600 };
  const a = await browser.newContext({ viewport, deviceScaleFactor: 0.8 }),
    b = await browser.newContext({ viewport, deviceScaleFactor: 0.8 });
  const p = await a.newPage(),
    q = await b.newPage();
  const bytes = await readFile(
    new URL("../fixtures/synthetic-rig.glb", import.meta.url),
  );
  let release!: () => void;
  const delayed = new Promise<void>((resolve) => (release = resolve));
  try {
    for (const page of [p, q]) {
      await page.route("**/characters/models/manifest.json", (r) =>
        r.fulfill({
          json: {
            version: 1,
            characters: {
              nova: {
                status: "ready",
                model: "/characters/models/synthetic.glb",
                source: "test fixture",
                taskId: null,
              },
            },
          },
        }),
      );
      await page.route("**/characters/models/synthetic.glb", async (r) => {
        if (page === q) await delayed;
        await r.fulfill({ body: bytes, contentType: "model/gltf-binary" });
      });
    }
    await Promise.all([p.goto("/"), q.goto("/")]);
    await p.getByRole("button", { name: /1 vs 1/ }).click();
    await p.getByRole("button", { name: "이 파이터로 계속" }).click();
    await p.getByLabel("닉네임").fill("HOST");
    await p.getByRole("button", { name: "로비 만들기" }).click();
    const code = (await p.locator("[data-code]").innerText()).trim();
    await q.getByRole("button", { name: "초대코드로 참가" }).click();
    await q.getByLabel("닉네임").fill("GUEST");
    await q.getByLabel("초대코드", { exact: true }).fill(code);
    await q.getByRole("button", { name: "참가하기", exact: true }).click();
    for (const page of [p, q])
      await page.getByRole("button", { name: "준비하기", exact: true }).click();
    await p.getByRole("button", { name: "경기 시작", exact: true }).click();
    await expect(p.locator("#fight-announcement")).toContainText(
      "상대 준비 대기",
    );
    await expect(q.locator("#fight-announcement")).toContainText(
      "경기 준비 중",
    );
    await p.keyboard.down("w");
    await p.keyboard.down("j");
    await p.waitForTimeout(1100);
    await expect(q.locator("#clock")).toHaveText("90");
    await expect(q.locator("#health-0")).toContainText("100");
    await expect(q.locator("#health-1")).toContainText("100");
    await p.keyboard.up("w");
    await p.keyboard.up("j");
    release();
    await expect(p.locator("#fight-announcement")).toHaveText("", {
      timeout: 12000,
    });
    await expect(q.locator("#fight-announcement")).toHaveText("", {
      timeout: 12000,
    });
    await expect(q.locator("#clock")).not.toHaveText("90");
  } finally {
    release();
    await a.close();
    await b.close();
  }
});
