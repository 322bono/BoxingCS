import { test, expect } from "@playwright/test";
import { io, type Socket } from "socket.io-client";
import { randomUUID } from "node:crypto";
import type { Room } from "../../server/rooms";
test("real server enforces captain order and starts 2v2 after 30 seconds", async () => {
  test.setTimeout(50000);
  const clients: Socket[] = [];
  const states: (Room | undefined)[] = [];
  const ids: string[] = [];
  const command = (s: Socket, payload: object) =>
    new Promise<any>((resolve, reject) =>
      s
        .timeout(4000)
        .emit("action", payload, (e: Error | null, r: any) =>
          e ? reject(e) : resolve(r),
        ),
    );
  try {
    for (let i = 0; i < 4; i++) {
      const s = io("http://127.0.0.1:3000", {
        auth: { token: randomUUID() },
        forceNew: true,
      });
      clients.push(s);
      s.on("room", (r) => (states[i] = r));
      s.on("identity", (id) => (ids[i] = id));
      await new Promise<void>((resolve) => s.once("connect", resolve));
    }
    expect(
      (
        await command(clients[0], {
          type: "create",
          name: "팀원0",
          mode: "team",
          size: 2,
        })
      ).ok,
    ).toBe(true);
    await expect.poll(() => states[0]?.code).toBeTruthy();
    const code = states[0]!.code;
    for (let i = 1; i < 4; i++)
      expect(
        (await command(clients[i], { type: "join", code, name: "팀원" + i }))
          .ok,
      ).toBe(true);
    for (const s of clients)
      expect(
        (await command(s, { type: "update", patch: { ready: true } })).ok,
      ).toBe(true);
    expect((await command(clients[0], { type: "start" })).ok).toBe(true);
    await expect.poll(() => states[0]?.phase).toBe("ordering");
    const r = states[0]!;
    const captainIndex = ids.indexOf(r.captains[0]);
    const teammateIndex = ids.findIndex(
      (id) => id !== r.captains[0] && r.orders[0].includes(id),
    );
    const order = [...r.orders[0]].reverse();
    expect(
      (await command(clients[teammateIndex], { type: "reorder", order })).ok,
    ).toBe(false);
    expect(
      (await command(clients[captainIndex], { type: "reorder", order })).ok,
    ).toBe(true);
    await expect.poll(() => states[0]?.orders[0]).toEqual(order);
    expect(JSON.stringify(states[0])).not.toContain("token");
    await expect
      .poll(() => states[0]?.phase, { timeout: 33000, intervals: [100, 500] })
      .toBe("playing");
    expect(states[0]!.bout!.fighters[0].id).toBe(order[0]);
    expect(
      (
        await command(clients[captainIndex], {
          type: "reorder",
          order: order.reverse(),
        })
      ).ok,
    ).toBe(false);
    for (const f of states[0]!.bout!.fighters) {
      expect(
        (
          await command(clients[ids.indexOf(f.id)], {
            type: "loaded",
            boutId: states[0]!.bout!.id,
            epoch: states[0]!.sync!.id,
          })
        ).ok,
      ).toBe(true);
    }
    await expect.poll(() => states[0]?.sync?.deadline).toBe(0);
    const f = states[0]!.bout!.fighters[0];
    const attacking = clients[ids.indexOf(f.id)];
    attacking.emit("input", {
      hp: 0,
      damage: 999,
      jab: true,
      forward: 0,
      strafe: 0,
      boutId: states[0]!.bout!.id,
      epoch: states[0]!.sync!.id,
    });
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(states[0]!.bout!.fighters[1].hp).toBe(100);
  } finally {
    clients.forEach((s) => s.disconnect());
  }
});
test("a fresh connection receives an explicit empty room to clear expired sessions", async () => {
  const client = io("http://127.0.0.1:3000", {
    auth: { token: randomUUID() },
    forceNew: true,
  });
  let received = false;
  let state: unknown = "unset";
  client.on("room", (r) => {
    received = true;
    state = r;
  });
  try {
    await expect.poll(() => received, { timeout: 2000 }).toBe(true);
    expect(state).toBeNull();
  } finally {
    client.disconnect();
  }
});
