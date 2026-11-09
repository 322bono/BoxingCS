import express from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Rooms } from "./rooms.ts";
import { idleInput, type Input, type Sport } from "../shared/game.ts";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const app = express();
const http = createServer(app);
const io = new Server(http, { maxHttpBufferSize: 8192, pingTimeout: 15000 });
const rooms = new Rooms();
const sessions = new Map<string, string>();
app.get("/api/health", (_req, res) =>
  res.json({ status: "ok", game: "ring-club", rooms: rooms.rooms.size }),
);
function publish(code: string) {
  try {
    io.to(code).emit("room", rooms.public(rooms.get(code)));
  } catch {}
}
io.use((s, next) => {
  const t = s.handshake.auth?.token;
  if (typeof t !== "string" || !/^[a-f0-9-]{36}$/.test(t))
    return next(Error("세션을 다시 열어 주세요."));
  next();
});
io.on("connection", (s) => {
  const token = s.handshake.auth.token as string;
  const old = sessions.get(token);
  let code =
    [...rooms.rooms.values()].find((r) =>
      r.players.some((p) => p.token === token),
    )?.code || "";
  // A replacement may arrive before the old transport's disconnect event.
  // It must pass the same fresh readiness gate as an ordinary reconnection.
  if (old && code) rooms.disconnect(code, token);
  sessions.set(token, s.id);
  if (old) io.sockets.sockets.get(old)?.disconnect(true);
  let count = 0;
  let reset = Date.now();
  let lastInput = 0;
  if (code) {
    const r = rooms.join(code, token, "");
    s.join(code);
    s.emit("identity", rooms.player(r, token).id);
    publish(code);
  } else s.emit("room", null);
  s.on("action", (raw: unknown, ack: unknown) => {
    if (typeof ack !== "function") return;
    try {
      if (Date.now() - reset > 1000) {
        count = 0;
        reset = Date.now();
      }
      if (++count > 20) throw Error("잠시 후 다시 시도해 주세요.");
      if (!raw || typeof raw !== "object") throw Error("요청을 확인해 주세요.");
      const a = raw as Record<string, unknown>;
      const type = a.type;
      if (type === "create" || type === "join") {
        if (code) throw Error("현재 로비에서 먼저 나가 주세요.");
        if (typeof a.name !== "string") throw Error("닉네임을 입력해 주세요.");
        const r =
          type === "create"
            ? rooms.create(
                token,
                a.name,
                a.mode as "duel" | "team",
                a.size as number,
                (a.sport ?? "boxing") as Sport,
              )
            : rooms.join(
                typeof a.code === "string" ? a.code.trim().toUpperCase() : "",
                token,
                a.name,
              );
        code = r.code;
        s.join(code);
        s.emit("identity", rooms.player(r, token).id);
      } else if (type === "update") rooms.update(code, token, a.patch as never);
      else if (type === "start") rooms.start(code, token, Date.now());
      else if (type === "reorder")
        rooms.reorder(code, token, a.order as string[]);
      else if (type === "loaded")
        rooms.loaded(code, token, a.boutId as string, a.epoch as string);
      else if (type === "rematch") rooms.rematch(code, token);
      else if (type === "leave") {
        const previous = code;
        rooms.leave(code, token);
        s.leave(code);
        code = "";
        publish(previous);
        s.emit("room", null);
      } else throw Error("지원하지 않는 요청입니다.");
      if (code) publish(code);
      ack({ ok: true });
    } catch (e) {
      ack({
        ok: false,
        error: e instanceof Error ? e.message : "요청에 실패했습니다.",
      });
    }
  });
  s.on("input", (raw: unknown) => {
    const now = Date.now();
    if (now - lastInput < 20 || !code || !raw || typeof raw !== "object")
      return;
    lastInput = now;
    try {
      const r = rooms.get(code),
        p = rooms.player(r, token);
      const v = raw as Record<string, unknown>;
      if (
        sessions.get(token) !== s.id ||
        r.phase !== "playing" ||
        !r.bout ||
        r.bout.ended ||
        !r.sync ||
        r.sync.deadline ||
        r.players.some((p) => !p.connected) ||
        v.boutId !== r.bout.id ||
        v.epoch !== r.sync.id ||
        !r.bout.fighters.some((f) => f.id === p.id)
      )
        return;
      const input = idleInput();
      for (const key of ["forward", "strafe"] as const)
        input[key] =
          typeof v[key] === "number" && Number.isFinite(v[key])
            ? Math.max(-1, Math.min(1, v[key] as number))
            : 0;
      for (const key of ["jab", "hook", "guard", "dodge", "skill"] as const)
        input[key] = v[key] === true;
      rooms.inputs.set(p.id, input);
    } catch {}
  });
  // Stale inputs must never keep punching after a stalled tab or network.
  const stale = setInterval(() => {
    if (code && Date.now() - lastInput > 250) {
      try {
        rooms.inputs.delete(rooms.player(rooms.get(code), token).id);
      } catch {}
    }
  }, 250);
  s.on("disconnect", () => {
    clearInterval(stale);
    if (sessions.get(token) !== s.id) return;
    sessions.delete(token);
    if (code) {
      try {
        rooms.disconnect(code, token);
        publish(code);
      } catch {}
    }
  });
});
setInterval(() => {
  rooms.tick(Date.now(), 1 / 30);
  for (const r of rooms.rooms.values()) publish(r.code);
}, 1000 / 30).unref();
if (process.env.NODE_ENV === "production") {
  app.use(express.static(path.join(root, "dist")));
  app.get("/{*splat}", (_req, res) =>
    res.sendFile(path.join(root, "dist/index.html")),
  );
} else {
  const { createServer: createVite } = await import("vite");
  const vite = await createVite({
    root,
    server: { middlewareMode: true },
    appType: "spa",
  });
  app.use(vite.middlewares);
}
const port = Number(process.env.PORT || 3000);
http.listen(port, "0.0.0.0", () =>
  console.log(`RING CLUB listening on port ${port}`),
);
