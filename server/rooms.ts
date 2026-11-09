import { randomInt, randomUUID } from "node:crypto";
import {
  createBout,
  stepBout,
  idleInput,
  CHARACTERS,
  type CharacterId,
  type Bout,
  type Input,
  type Sport,
} from "../shared/game.ts";
export type Player = {
  id: string;
  token: string;
  name: string;
  character: CharacterId;
  team: number;
  ready: boolean;
  connected: boolean;
  disconnectedAt: number | null;
};
export type Room = {
  sport: Sport;
  code: string;
  mode: "duel" | "team";
  size: number;
  host: string;
  players: Player[];
  phase: "lobby" | "ordering" | "playing" | "finished";
  captains: [string, string];
  orders: [string[], string[]];
  orderDeadline: number;
  bout: Bout | null;
  sync: { id: string; ready: string[]; deadline: number } | null;
  score: [number, number];
  round: number;
  nextAt: number;
  winner: number | null;
  reason: string;
  lastActive: number;
};
export class Rooms {
  rooms = new Map<string, Room>();
  inputs = new Map<string, Input>();
  get(code: string) {
    const r = this.rooms.get(code.toUpperCase());
    if (!r) throw Error("초대코드를 확인해 주세요.");
    return r;
  }
  player(r: Room, token: string) {
    const p = r.players.find((p) => p.token === token);
    if (!p) throw Error("로비 참여가 필요합니다.");
    return p;
  }
  create(
    token: string,
    name: string,
    mode: "duel" | "team",
    size: number,
    sport: Sport = "boxing",
  ) {
    if (!["boxing", "bjj"].includes(sport))
      throw Error("종목을 확인해 주세요.");
    if (
      !["duel", "team"].includes(mode) ||
      !Number.isInteger(size) ||
      size < 1 ||
      size > 4 ||
      (mode === "team" && size < 2)
    )
      throw Error("팀 규모가 올바르지 않습니다.");
    this.assertAvailable(token);
    let code = "";
    do {
      code = Array.from(
        { length: 6 },
        () => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[randomInt(32)],
      ).join("");
    } while (this.rooms.has(code));
    const r: Room = {
      sport,
      code,
      mode,
      size: mode === "duel" ? 1 : size,
      host: "",
      players: [],
      phase: "lobby",
      captains: ["", ""],
      orders: [[], []],
      orderDeadline: 0,
      bout: null,
      sync: null,
      score: [0, 0],
      round: 0,
      nextAt: 0,
      winner: null,
      reason: "",
      lastActive: Date.now(),
    };
    this.rooms.set(code, r);
    this.join(code, token, name);
    r.host = r.players[0].id;
    return r;
  }
  assertAvailable(token: string) {
    if (
      [...this.rooms.values()].some((r) =>
        r.players.some((p) => p.token === token),
      )
    )
      throw Error("현재 로비에서 먼저 나가 주세요.");
  }
  join(code: string, token: string, name: string) {
    const r = this.get(code);
    const existing = r.players.find((p) => p.token === token);
    if (existing) {
      existing.connected = true;
      existing.disconnectedAt = null;
      return r;
    }
    this.assertAvailable(token);
    if (r.phase !== "lobby") throw Error("이미 경기가 시작되었습니다.");
    if (r.players.length >= r.size * 2) throw Error("로비가 가득 찼습니다.");
    const team =
      r.players.filter((p) => p.team === 0).length <=
      r.players.filter((p) => p.team === 1).length
        ? 0
        : 1;
    r.players.push({
      id: randomUUID(),
      token,
      name: name.trim().slice(0, 16) || "복서",
      character: "nova",
      team,
      ready: false,
      connected: true,
      disconnectedAt: null,
    });
    r.lastActive = Date.now();
    return r;
  }
  update(
    code: string,
    token: string,
    patch: { ready?: boolean; character?: CharacterId; team?: number },
  ) {
    const r = this.get(code),
      p = this.player(r, token);
    if (r.phase !== "lobby") throw Error("경기 중에는 변경할 수 없습니다.");
    if (patch.character !== undefined) {
      if (!CHARACTERS.some((c) => c.id === patch.character))
        throw Error("캐릭터를 확인해 주세요.");
      p.character = patch.character;
      p.ready = false;
    }
    if (patch.team !== undefined && patch.team !== p.team) {
      if (
        ![0, 1].includes(patch.team) ||
        r.players.filter((x) => x.team === patch.team).length >= r.size
      )
        throw Error("해당 팀이 가득 찼습니다.");
      p.team = patch.team;
      p.ready = false;
    }
    if (typeof patch.ready === "boolean") p.ready = patch.ready;
  }
  start(code: string, token: string, now: number) {
    const r = this.get(code),
      p = this.player(r, token);
    if (r.host !== p.id || r.phase !== "lobby")
      throw Error("방장만 시작할 수 있습니다.");
    if (
      r.players.length !== r.size * 2 ||
      r.players.some((p) => !p.ready || !p.connected) ||
      [0, 1].some(
        (t) => r.players.filter((p) => p.team === t).length !== r.size,
      )
    )
      throw Error("동일한 인원의 두 팀이 모두 준비해야 합니다.");
    r.orders = [0, 1].map((t) =>
      r.players.filter((p) => p.team === t).map((p) => p.id),
    ) as [string[], string[]];
    r.captains = r.orders.map((order) => order[randomInt(order.length)]) as [
      string,
      string,
    ];
    if (r.mode === "team") {
      r.phase = "ordering";
      r.orderDeadline = now + 30000;
    } else this.beginBout(r, now);
  }
  reorder(code: string, token: string, order: string[], now = Date.now()) {
    const r = this.get(code),
      p = this.player(r, token);
    if (
      r.phase !== "ordering" ||
      now >= r.orderDeadline ||
      r.captains[p.team] !== p.id
    )
      throw Error("출전 순서는 팀장만 변경할 수 있습니다.");
    const valid = r.orders[p.team];
    if (
      !Array.isArray(order) ||
      order.length !== valid.length ||
      new Set(order).size !== valid.length ||
      order.some((id) => !valid.includes(id))
    )
      throw Error("팀원 순서가 올바르지 않습니다.");
    r.orders[p.team] = order;
  }
  beginBout(r: Room, now = Date.now()) {
    const index = r.round < r.size ? r.round : 0;
    const a = r.players.find((p) => p.id === r.orders[0][index])!,
      b = r.players.find((p) => p.id === r.orders[1][index])!;
    r.bout = createBout([a.id, b.id], [a.character, b.character], r.sport);
    r.phase = "playing";
    r.nextAt = 0;
    this.synchronize(r, now);
  }
  private synchronize(r: Room, now: number) {
    r.sync = { id: randomUUID(), ready: [], deadline: now + 60000 };
    for (const f of r.bout!.fighters) this.inputs.delete(f.id);
  }
  loaded(
    code: string,
    token: string,
    boutId: string,
    epoch: string,
    now = Date.now(),
  ) {
    const r = this.get(code),
      p = this.player(r, token);
    if (
      r.phase !== "playing" ||
      !r.bout ||
      r.bout.ended ||
      r.bout.id !== boutId ||
      !r.sync ||
      r.sync.id !== epoch ||
      !r.bout.fighters.some((f) => f.id === p.id) ||
      r.players.some((p) => !p.connected)
    )
      throw Error("현재 경기의 두 선수가 연결된 후 준비할 수 있습니다.");
    if (r.sync.deadline && now >= r.sync.deadline)
      throw Error("경기 준비 시간이 지났습니다.");
    if (!r.sync.deadline || r.sync.ready.includes(p.id)) return;
    r.sync.ready.push(p.id);
    if (r.sync.ready.length === 2) {
      r.sync.deadline = 0;
      r.bout.countdown = 3;
      for (const f of r.bout.fighters) this.inputs.delete(f.id);
    }
  }
  tick(now: number, dt: number) {
    for (const r of this.rooms.values()) {
      if (r.players.length === 0 || now - r.lastActive > 4 * 3600000) {
        this.rooms.delete(r.code);
        continue;
      }
      const missing = r.players.find(
        (p) =>
          !p.connected &&
          p.disconnectedAt !== null &&
          now - p.disconnectedAt >= 30000,
      );
      if (missing && ["playing", "ordering"].includes(r.phase)) {
        r.phase = "finished";
        r.winner = 1 - missing.team;
        r.reason = "연결 종료로 인한 기권";
      }
      if (r.phase === "lobby" || r.phase === "finished") {
        const expired = r.players.filter(
          (p) =>
            !p.connected &&
            p.disconnectedAt !== null &&
            now - p.disconnectedAt >= 30000,
        );
        for (const p of expired) this.inputs.delete(p.id);
        r.players = r.players.filter((p) => !expired.includes(p));
        if (!r.players.some((p) => p.id === r.host))
          r.host =
            (r.players.find((p) => p.connected) || r.players[0])?.id || "";
        if (!r.players.length) {
          this.rooms.delete(r.code);
          continue;
        }
      }
      if (r.phase === "ordering" && now >= r.orderDeadline)
        this.beginBout(r, now);
      if (
        r.phase !== "playing" ||
        !r.bout ||
        r.players.some((p) => !p.connected)
      )
        continue;
      if (r.sync?.deadline) {
        if (now >= r.sync.deadline) {
          r.phase = "finished";
          const ready = r.players.filter((p) => r.sync!.ready.includes(p.id));
          r.winner = ready.length === 1 ? ready[0].team : null;
          r.reason =
            ready.length === 1
              ? "경기 준비 시간 초과로 인한 기권"
              : "경기 준비 시간 초과";
          for (const f of r.bout.fighters) this.inputs.delete(f.id);
        }
        continue;
      }
      if (r.bout.ended) {
        if (!r.nextAt) {
          if (r.bout.winner !== null) r.score[r.bout.winner]++;
          r.round++;
          if (r.mode === "duel") {
            r.phase = "finished";
            r.winner = r.bout.winner;
            r.reason = r.bout.winner === null ? "무승부" : r.bout.reason;
            continue;
          }
          if (r.round >= r.size && r.score[0] !== r.score[1]) {
            r.phase = "finished";
            r.winner = r.score[0] > r.score[1] ? 0 : 1;
            r.reason = r.bout.reason;
            continue;
          }
          r.nextAt = now + 5000;
        } else if (now >= r.nextAt) this.beginBout(r, now);
      } else
        stepBout(
          r.bout,
          r.bout.fighters.map((f) => this.inputs.get(f.id) || idleInput()) as [
            Input,
            Input,
          ],
          dt,
        );
    }
  }
  leave(code: string, token: string) {
    const r = this.get(code),
      p = this.player(r, token);
    this.inputs.delete(p.id);
    if (["playing", "ordering"].includes(r.phase)) {
      r.phase = "finished";
      r.winner = 1 - p.team;
      r.reason = "상대 기권";
    }
    r.players = r.players.filter((x) => x !== p);
    if (r.host === p.id) r.host = r.players[0]?.id || "";
    if (!r.players.length) this.rooms.delete(code);
  }
  disconnect(code: string, token: string) {
    const r = this.get(code),
      p = this.player(r, token);
    p.connected = false;
    p.disconnectedAt = Date.now();
    this.inputs.delete(p.id);
    if (r.phase === "playing" && r.bout && !r.bout.ended)
      this.synchronize(r, p.disconnectedAt);
  }
  rematch(code: string, token: string) {
    const r = this.get(code),
      p = this.player(r, token);
    if (r.host !== p.id || r.phase !== "finished")
      throw Error("방장만 재대결을 열 수 있습니다.");
    r.phase = "lobby";
    r.bout = null;
    r.sync = null;
    r.score = [0, 0];
    r.round = 0;
    r.winner = null;
    r.reason = "";
    r.players.forEach((p) => (p.ready = false));
  }
  public(r: Room) {
    return { ...r, players: r.players.map(({ token, ...p }) => p) };
  }
}
