import "./style.css";
import { io } from "socket.io-client";
import {
  CHARACTERS,
  PENDING_MODEL_IDS,
  createBout,
  stepBout,
  aiInput,
  idleInput,
  type CharacterId,
  type Bout,
  type Input,
} from "../shared/game";
import type { Room, Player } from "../server/rooms";
import { World } from "./world";
import { CharacterPreview } from "./assets/preview";
import { GameAudio } from "./audio/game-audio";
import { modelEntries } from "./assets/library";
type PublicRoom = Omit<Room, "players"> & { players: Omit<Player, "token">[] };
const $ = <T extends HTMLElement = HTMLElement>(q: string) =>
  document.querySelector<T>(q)!;
const esc = (v: string) =>
  v.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const icon = (name: string) =>
  ({ arrow: "↗", glove: "◉", team: "⚑", ai: "✦" })[name] || name;
let selected: CharacterId =
  (localStorage.getItem("ring-character") as CharacterId) || "ace";
if (!CHARACTERS.some((c) => c.id === selected)) selected = "ace";
let characterPreview: CharacterPreview | null = null;
let toastTimer: ReturnType<typeof setTimeout>;
let room: PublicRoom | null = null,
  myId = "",
  local: Bout | null = null,
  difficulty = 0.65,
  fingerprint = "",
  dialog = "",
  input = idleInput(),
  online = false,
  view = 0;
let preparingSync = "";
let token = sessionStorage.getItem("ring-session");
if (!token) {
  token = crypto.randomUUID();
  sessionStorage.setItem("ring-session", token);
}
const defaults: Record<string, string> = {
  w: "w",
  a: "a",
  s: "s",
  d: "d",
  j: "j",
  k: "k",
  q: "q",
  " ": " ",
  Shift: "Shift",
};
let bindings = { ...defaults };
try {
  const saved = JSON.parse(localStorage.getItem("ring-keys") || "null");
  if (
    saved &&
    Object.keys(defaults).every((k) => typeof saved[k] === "string") &&
    new Set(Object.values(saved)).size === 9
  )
    bindings = saved;
} catch {}
let rebinding: string | null = null;
const keyName = (k: string) =>
  bindings[k] === " " ? "SPACE" : bindings[k].toUpperCase();
const settings = {
  sound: localStorage.getItem("ring-sound") !== "off",
  music: localStorage.getItem("ring-music") !== "off",
  shake: localStorage.getItem("ring-shake") !== "off",
};
$("#app").innerHTML =
  `<div id="world"></div><div id="flash"></div><header class="site-header"><a class="brand" href="/" aria-label="RING CLUB 홈"><span class="brand-mark">R<span>↗</span></span><span>RING<span class="brand-club">CLUB</span><small>THE FRIENDS FIGHT CLUB</small></span></a><nav aria-label="메인 메뉴"><button class="nav-active" data-home>플레이 <span>01</span></button><button data-roster>파이터 <span>02</span></button><button data-help>플레이 가이드 <span>03</span></button></nav><div class="header-right"><span class="server-status"><i></i><span id="server-text">연결 중</span></span><button class="icon-button" data-settings aria-label="설정">⚙</button></div></header><main id="ui"></main><div id="modal-root"></div><div id="toast" role="status" aria-live="polite"></div>`;
const gameAudio = new GameAudio(settings);
let world: World | null = null;
try {
  world = new World($("#world"), () =>
    toast("3D 화면을 복구하려면 페이지를 새로고침해 주세요."),
  );
  world.shake = settings.shake;
} catch {
  toast(
    "WebGL을 시작하지 못했습니다. 브라우저의 하드웨어 가속을 켜고 다시 열어 주세요.",
  );
  $("#world").innerHTML =
    '<p class="webgl-error">3D 렌더러를 시작하지 못했습니다.<br>하드웨어 가속을 확인해 주세요.</p>';
}
const socket = io({ auth: { token }, reconnection: true });
socket.on("connect", () => {
  online = true;
  updateConnection();
});
socket.on("disconnect", () => {
  online = false;
  keys.clear();
  skillPointer = false;
  input = idleInput();
  preparingSync = "";
  updateConnection();
  if (room) toast("서버 연결 중… 30초 안에 연결되면 경기로 복귀합니다.");
});
socket.on("connect_error", () => {
  online = false;
  updateConnection();
});
socket.on("identity", (id: string) => {
  myId = id;
});
socket.on("room", (r: PublicRoom | null) => {
  if (!r && !room && local) return; // An online reconnect must not cancel local training.
  const old = room?.phase;
  room = r;
  if (r) {
    local = null;
    if (r.phase === "finished" && old === "playing" && !r.bout?.ended)
      gameAudio.play("bell-end");
    renderRoom();
  } else {
    fingerprint = "";
    renderHome();
  }
});
function updateConnection() {
  document.body.classList.toggle("offline", !online);
  $("#server-text").textContent = online ? "서버 연결됨" : "서버 연결 중";
  if ($(".console-online"))
    $(".console-online").textContent = online ? "● 연결됨" : "● 연결 중";
  document
    .querySelectorAll<HTMLButtonElement>("[data-online]")
    .forEach((b) => (b.disabled = !online));
}
async function action(payload: object) {
  if (!online) {
    toast("서버 연결을 기다려 주세요.");
    return false;
  }
  return new Promise<boolean>((resolve) => {
    socket
      .timeout(5000)
      .emit(
        "action",
        payload,
        (err: Error | null, r: { ok: boolean; error?: string }) => {
          if (err || !r?.ok) {
            toast(
              err
                ? "서버 응답이 늦습니다. 다시 시도해 주세요."
                : r.error || "요청 실패",
            );
            resolve(false);
          } else resolve(true);
        },
      );
  });
}
function toast(message: string) {
  $("#toast").textContent = message;
  $("#toast").classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $("#toast").classList.remove("show"), 4000);
}
function musicIcon(enabled: boolean) {
  return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m11 5-5 4H3v6h3l5 4V5Z"/>${enabled ? '<path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>' : '<path d="m16 9 5 6m0-6-5 6"/>'}</svg>`;
}
function setMenuMusic(enabled: boolean) {
  settings.music = enabled;
  localStorage.setItem("ring-music", enabled ? "on" : "off");
  gameAudio.setMusicEnabled(enabled);
  const button = $("#console-music");
  if (button) {
    button.setAttribute(
      "aria-label",
      enabled ? "배경음악 끄기" : "배경음악 켜기",
    );
    button.setAttribute("aria-pressed", String(enabled));
    button.innerHTML = musicIcon(enabled);
  }
}
const portrait = (o: CharacterId) =>
  modelEntries.get(o)?.portrait ||
  (PENDING_MODEL_IDS.has(o)
    ? "/characters/pending.svg"
    : `/characters/${o}.svg`);
function selectionPortrait(o: CharacterId, e: string) {
  const t = ["nova", "blaze", "specs", "volt"].indexOf(o);
  return t < 0 || modelEntries.get(o)?.portrait
    ? `<img src="${portrait(o)}" alt="${e}"/>`
    : `<div class="reference-panel" style="--reference-x:${(t % 2) * -50}%;--reference-y:${Math.floor(t / 2) * -50}%"><img src="/characters/new-fighters-reference.png" alt="${e} 전신 A포즈 참조 이미지"/></div>`;
}
const modelReady = (o: string) => modelEntries.get(o)?.status === "ready";
function renderHome() {
  if (!room) gameAudio.setScene("menu");
  room ||
    ((local = null),
    (fingerprint = ""),
    (document.body.className = online
      ? "console-home"
      : "console-home offline"),
    world?.menu(),
    ($("#ui").innerHTML =
      `<section class="console-shell"><div class="console-top"><span class="console-logo">RING<b>CLUB</b></span><span class="console-online">● PRIVATE ONLINE / 1ST PERSON</span></div><h1 class="sr-only">친구끼리, 제대로 한 판.</h1><div class="console-board" aria-label="게임 모드"><button class="console-tile battle-tile" data-mode="duel" aria-label="1 vs 1 친구 대전"><span class="tile-symbol">✕</span><strong>대전</strong><em>1 vs 1</em></button><button class="console-tile practice-tile" data-mode="ai" aria-label="AI 연습"><span class="tile-symbol">✦</span><strong>연습</strong><em>AI 난이도 선택</em></button><button class="console-tile fighters-tile" id="console-fighters"><span class="tile-symbol">▧</span><strong>캐릭터</strong><em>능력 · 스킬</em></button><button class="console-tile crew-tile" data-mode="team" aria-label="팀 vs 팀 대전"><span class="tile-symbol">⚑</span><strong>팀 배틀</strong><em>2 vs 2 — 4 vs 4</em></button><button class="console-tile invite-tile" data-join aria-label="초대코드로 참가"><span class="tile-symbol">◎</span><strong>친구 초대</strong><em>초대코드로 참가 ↗</em></button><div class="console-medal" aria-hidden="true"><div class="medal-faces">${[
        ...CHARACTERS.filter((o) => modelReady(o.id)),
        ...CHARACTERS.filter((o) => !modelReady(o.id)),
      ]
        .slice(0, 4)
        .map((o) => `<img src="${portrait(o.id)}" alt=""/>`)
        .join(
          "",
        )}</div><b>VS</b></div></div><aside class="console-rail"><button data-help aria-label="플레이 가이드">?</button><button id="console-music" aria-label="${settings.music ? "배경음악 끄기" : "배경음악 켜기"}" aria-pressed="${settings.music}" title="Before the Bell">${musicIcon(settings.music)}</button><button id="console-settings" aria-label="설정">⚙</button><button id="console-fullscreen" aria-label="전체 화면">⛶</button></aside><div class="console-bottom"><b>모드를 선택하세요</b><small>방향키 이동 · Enter 선택</small></div></section>`),
    ($("#console-fighters").onclick = () => openCharacterPicker()),
    ($("#console-settings").onclick = openSettings),
    ($("#console-fullscreen").onclick = () => {
      document.fullscreenElement
        ? document.exitFullscreen()
        : document.documentElement
            .requestFullscreen()
            .catch(() => toast("전체 화면을 지원하지 않는 브라우저입니다."));
    }),
    bindHomeButtons(),
    updateConnection());
}
function bindHomeButtons() {
  const musicButton = $("#console-music");
  if (musicButton) musicButton.onclick = () => setMenuMusic(!settings.music);
  (document
    .querySelectorAll<HTMLElement>("[data-mode]")
    .forEach(
      (o) =>
        (o.onclick = () =>
          openCharacterPicker(() =>
            openSetup(o.dataset.mode as "duel" | "team" | "ai"),
          )),
    ),
    document
      .querySelectorAll<HTMLElement>("[data-join]")
      .forEach((o) => (o.onclick = () => openSetup("join"))),
    document
      .querySelectorAll<HTMLElement>("[data-character]")
      .forEach(
        (o) =>
          (o.onclick = () => openCharacter(o.dataset.character as CharacterId)),
      ),
    document
      .querySelectorAll<HTMLElement>("[data-help]")
      .forEach((o) => (o.onclick = help)));
}
function modal(o: string, e: string) {
  (characterPreview?.dispose(),
    (characterPreview = null),
    (dialog = e),
    ($("#ui").inert = !0),
    ($(".site-header").inert = !0),
    ($("#modal-root").innerHTML =
      `<div class="modal-backdrop"><section class="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title" tabindex="-1"><button class="dialog-close" aria-label="닫기">✕</button>${o}</section></div>`),
    ($(".dialog-close").onclick = closeModal),
    ($(".modal-backdrop").onclick = (t) => {
      t.target === $(".modal-backdrop") && closeModal();
    }),
    setTimeout(() => $(".dialog").focus(), 0));
}
let modalReturn: HTMLElement | null = null;
function closeModal() {
  (characterPreview?.dispose(),
    (characterPreview = null),
    (rebinding = null),
    ($("#ui").inert = !1),
    ($(".site-header").inert = !1),
    (dialog = ""),
    ($("#modal-root").innerHTML = ""),
    modalReturn?.focus());
}
function openSetup(o: "duel" | "team" | "ai" | "join") {
  modalReturn = document.activeElement as HTMLElement;
  const e = {
      duel: "1 vs 1",
      team: "팀 대전",
      ai: "AI 연습",
      join: "초대코드 참가",
    },
    t = CHARACTERS.find((i) => i.id === selected)!;
  (modal(
    `<h2 id="dialog-title">${e[o]}</h2><p class="dialog-description">${o === "ai" ? "난이도를 선택하세요." : o === "join" ? "초대코드 6자리를 입력하세요." : "모두 준비하면 방장이 시작합니다."}</p><form id="setup-form"><label>닉네임<input name="nickname" aria-label="닉네임" maxlength="16" autocomplete="nickname" value="${esc(localStorage.getItem("ring-name") || "")}" placeholder="링 위에서 불릴 이름" required/></label>${o === "join" ? '<label>초대코드<input name="code" aria-label="초대코드" maxlength="6" minlength="6" pattern="[A-Za-z2-9]{6}" placeholder="ABC234" class="code-input" required autocomplete="off"/></label>' : ""}${o === "team" ? '<fieldset><legend>팀 인원 <small>같은 인원끼리 대결합니다</small></legend><div class="choice-row">' + [2, 3, 4].map((i) => `<label class="choice"><input type="radio" name="size" value="${i}" ${i === 2 ? "checked" : ""}/><span>${i} vs ${i}</span></label>`).join("") + "</div></fieldset>" : ""}${
      o === "ai"
        ? '<fieldset><legend>스파링 난이도</legend><div class="choice-row">' +
          [
            [".3", "루키"],
            [".65", "클럽"],
            ["1", "프로"],
          ]
            .map(
              ([i, s]) =>
                `<label class="choice"><input type="radio" name="difficulty" value="${i}" ${i === ".65" ? "checked" : ""}/><span>${s}</span></label>`,
            )
            .join("") +
          "</div></fieldset>"
        : ""
    }${o !== "join" ? `<div class="selected-summary"><img src="${portrait(selected)}" alt=""/><div><b>${t.name} <span>${t.trait}</span></b></div></div>` : ""}<button class="primary submit" ${o !== "ai" ? "data-online" : ""} type="submit">${o === "join" ? "참가하기" : o === "ai" ? "연습 시작" : "로비 만들기"} <span aria-hidden="true">↗</span></button><p class="form-note">${o === "ai" ? "J 잽 · K 훅 · Space 가드 · Q 스킬" : ""}</p></form>`,
    o,
  ),
    updateConnection(),
    ($("#setup-form").onsubmit = async (i) => {
      i.preventDefault();
      const s = new FormData(i.target as HTMLFormElement),
        n = String(s.get("nickname")).trim();
      if (!n) return;
      if ((localStorage.setItem("ring-name", n), o === "ai")) {
        ((difficulty = Number(s.get("difficulty"))),
          closeModal(),
          startPractice());
        return;
      }
      const a = $<HTMLButtonElement>(".submit");
      ((a.disabled = !0),
        (await action(
          o === "join"
            ? { type: "join", name: n, code: s.get("code") }
            : {
                type: "create",
                name: n,
                mode: o,
                size: o === "team" ? Number(s.get("size")) : 1,
              },
        ))
          ? (closeModal(),
            await action({ type: "update", patch: { character: selected } }))
          : a.isConnected && (a.disabled = !1));
    }));
}

const signatures: Record<
  CharacterId,
  { name: string; tag: string; description: string }
> = {
  mint: {
    name: "체크메이트",
    tag: "PRECISION BREAK",
    description: "가드를 뚫는 카운터",
  },
  ace: {
    name: "플래시 임팩트",
    tag: "FLASH IMPACT",
    description: "빠르고 긴 스트레이트",
  },
  ink: {
    name: "와일드 크래시",
    tag: "WILD CRASH",
    description: "가까이서 묵직한 훅",
  },
  stone: {
    name: "아이언 피니시",
    tag: "IRON FINISH",
    description: "정면 어퍼컷",
  },
  nova: {
    name: "화이트 러시",
    tag: "WHITE RUSH",
    description: "좌우 원투를 잇는 빠른 연타",
  },
  blaze: {
    name: "버닝 훅",
    tag: "BURNING HOOK",
    description: "몸을 실어 올려치는 파워 훅",
  },
  specs: {
    name: "포커스 카운터",
    tag: "FOCUS COUNTER",
    description: "뒤로 피하고 곧게 뻗는 카운터",
  },
  volt: {
    name: "썬더 어퍼",
    tag: "THUNDER UPPER",
    description: "깊게 낮춘 자세에서 솟아오르는 어퍼컷",
  },
};
function openCharacter(id: CharacterId) {
  openCharacterPicker(undefined, id);
}
function fighterSelection(candidate: CharacterId, continuation?: () => void) {
  const unavailable =
    PENDING_MODEL_IDS.has(candidate) && !modelReady(candidate);
  const c = CHARACTERS.find((c) => c.id === candidate)!,
    sig = signatures[c.id];
  modal(
    `<div class="select-arena" style="--fighter:${c.color}"><div class="select-top"><h2 id="dialog-title">캐릭터 선택</h2></div><div class="select-body"><div class="select-portrait"><span class="portrait-word">${c.title.replace("THE ", "")}</span>${selectionPortrait(c.id, c.name)}${modelReady(candidate) ? '<div id="character-stage"></div>' : ""}<b>01 <small>PLAYER</small></b></div><div class="select-info"><h3>${c.name}</h3><span class="select-style">${c.trait}</span><div class="select-stats">${["파워", "스피드", "지구력"].map((label, i) => `<div><span>${label}</span><div>${Array.from({ length: 5 }, (_, j) => `<i class="${j < c.stats[i] ? "filled" : ""}"></i>`).join("")}</div></div>`).join("")}</div><div class="signature-card"><kbd>Q</kbd><div><b>${sig.name}</b><span>${sig.description}</span></div>${modelReady(candidate) ? '<button type="button" id="preview-skill" aria-label="스킬 시연">▶ 시연</button>' : ""}</div><p class="model-status">${modelReady(candidate) ? "3D 모델" : unavailable ? "3D 모델 생성 대기" : "임시 모델"}</p></div></div><div class="select-roster">${CHARACTERS.map((f, i) => `<button data-preview="${f.id}" class="${f.id === candidate ? "active" : ""}" aria-label="${f.name} 미리보기">${selectionPortrait(f.id, "")}<span>0${i + 1} <b>${f.name}</b></span>${f.id === candidate ? "<em>1P</em>" : ""}</button>`).join("")}</div><div class="select-bottom"><span>Q · 게이지 100에서 발동</span><button class="primary" id="select-fighter" ${unavailable ? "disabled" : ""}>${unavailable ? "3D 모델 생성 대기" : continuation ? "이 파이터로 계속" : "이 파이터 선택"} <span>↗</span></button></div></div>`,
    "fighter-select",
  );
  if (modelReady(candidate) && world) {
    try {
      characterPreview = new CharacterPreview(
        $("#character-stage"),
        world.library,
        candidate,
      );
      $("#preview-skill").onclick = () => {
        characterPreview?.skill();
        gameAudio.play("skill", { gain: 0.6 });
      };
    } catch {
      toast("3D 미리보기를 시작하지 못했습니다.");
    }
  }
  document.querySelectorAll<HTMLElement>("[data-preview]").forEach(
    (b) =>
      (b.onclick = () => {
        gameAudio.play("select", { rate: 1.12, gain: 0.7 });
        fighterSelection(b.dataset.preview as CharacterId, continuation);
      }),
  );
  $("#select-fighter").onclick = async () => {
    if (PENDING_MODEL_IDS.has(candidate) && !modelReady(candidate)) return;
    if (room && room.phase !== "lobby") {
      toast("로비에서만 변경할 수 있습니다.");
      return;
    }
    if (
      room &&
      !(await action({ type: "update", patch: { character: candidate } }))
    )
      return;
    selected = candidate;
    localStorage.setItem("ring-character", selected);
    world?.setCharacters(selected, selected === "ink" ? "ace" : "ink");
    closeModal();
    gameAudio.play("select", { rate: 0.95 });
    if (continuation) continuation();
    else if (!room) renderHome();
  };
}
function startPractice() {
  gameAudio.setScene("fight");
  room = null;
  myId = "local";
  view = 0;
  const opponent = (CHARACTERS.find(
    (c) => c.id !== selected && modelReady(c.id),
  ) || CHARACTERS.find((c) => c.id !== selected))!.id;
  local = createBout(["local", "AI"], [selected, opponent]);
  input = idleInput();
  lastHp = [100, 100];
  lastSkills = [0, 0];
  document.body.classList.remove("console-home");
  document.body.classList.add("fighting");
  renderFight();
  world?.fight(local, 0);
}
function renderRoom() {
  if (!room) return;
  const r = room;
  if (r.phase !== "playing" && r.bout?.ended)
    gameAudio.observeCombat(r.bout, view);
  gameAudio.setScene(
    r.phase === "playing"
      ? "fight"
      : r.phase === "finished"
        ? "result"
        : "lobby",
  );
  if (r.phase === "playing") {
    const index = r.bout?.fighters.findIndex((f) => f.id === myId) ?? -1;
    view = index >= 0 ? index : view;
    const watching = index < 0;
    document.body.classList.remove("console-home");
    document.body.classList.add("fighting");
    if (!$("#hud") || fingerprint !== `playing-${r.round}-${watching}`) {
      renderFight(watching);
      fingerprint = `playing-${r.round}-${watching}`;
      input = idleInput();
      lastHp = [100, 100];
      lastSkills = [0, 0];
    }
    if (r.bout) {
      world?.fight(r.bout, view);
      if (!watching && r.sync?.deadline && r.players.every((p) => p.connected))
        void prepareOnlineBout(r);
    }
    updateHud();
    return;
  }
  document.body.classList.remove("fighting");
  document.body.classList.remove("console-home");
  document.body.classList.add("in-room");
  world?.menu();
  const key = JSON.stringify({
    phase: r.phase,
    players: r.players,
    score: r.score,
    orders: r.orders,
    captains: r.captains,
    reason: r.reason,
  });
  if (key === fingerprint) return;
  fingerprint = key;
  if (r.phase === "finished") {
    renderResult(r);
    return;
  }
  const me = r.players.find((p) => p.id === myId);
  if (!me) return;
  const host = r.host === myId;
  $("#ui").innerHTML =
    `<section class="lobby"><div class="lobby-head"><div><h1>${r.phase === "ordering" ? "출전 순서" : "대기실"}</h1><p>${r.phase === "ordering" ? "팀장이 순서를 정합니다." : "모두 준비하면 시작합니다."}</p></div><button class="text-button" data-leave>로비 나가기 ↗</button></div><div class="lobby-code"><div><b>초대코드</b></div><strong data-code>${r.code}</strong><button class="copy-button" id="copy-code">코드 복사 ⧉</button><span>${r.players.length} / ${r.size * 2}명</span></div>${r.phase === "ordering" ? '<div class="order-clock"><span>출전 순서 확정까지</span><b id="order-time">30</b><small>초 후 자동으로 경기가 시작됩니다.</small></div>' : ""}<div class="teams">${[
      0, 1,
    ]
      .map(
        (team) =>
          `<section class="team-column team-${team}"><div class="team-heading"><h2>${r.mode === "duel" ? (team === 0 ? "레드 코너" : "블루 코너") : team === 0 ? "레드 팀" : "블루 팀"}</h2><span>${r.size} PLAYER${r.size > 1 ? "S" : ""}</span></div>${(r.phase ===
          "ordering"
            ? r.orders[team].map((id) => r.players.find((p) => p.id === id)!)
            : r.players.filter((p) => p.team === team)
          )
            .map((p, index) => {
              const c = CHARACTERS.find((c) => c.id === p.character)!;
              return `<div class="player-row"><span class="player-number">0${index + 1}</span><img src="${portrait(p.character)}" alt="${c.name}"/><div><b>${esc(p.name)} ${p.id === r.host ? "<small>방장</small>" : ""}${p.id === r.captains[team] ? '<small class="captain">팀장</small>' : ""}${p.id === myId ? "<small>나</small>" : ""}</b><span>${c.name} · ${c.trait}</span></div>${r.phase === "ordering" && r.captains[team] === myId ? `<button data-up="${p.id}" aria-label="${esc(p.name)} 출전 순서 올리기" ${index === 0 ? "disabled" : ""}>↑</button>` : `<span class="ready-state ${p.ready ? "is-ready" : ""}">${!p.connected ? "재접속 중" : p.ready ? "READY ✓" : "준비 중"}</span>`}</div>`;
            })
            .join(
              "",
            )}${Array.from({ length: r.size - r.players.filter((p) => p.team === team).length }, () => '<div class="empty-player"><span>＋</span>참가 대기</div>').join("")}${r.phase === "lobby" && r.mode === "team" && me.team !== team ? `<button class="switch-team" data-team="${team}">이 팀으로 이동 ↗</button>` : ""}</section>`,
      )
      .join(
        "",
      )}</div>${r.phase === "lobby" ? `<div class="lobby-actions"><button class="secondary" id="change-character">파이터 변경</button><button class="${me.ready ? "secondary" : "primary"}" id="ready">${me.ready ? "준비 취소" : "준비하기"}</button>${host ? `<button class="primary dark" id="start" aria-label="경기 시작" ${r.players.length !== r.size * 2 || r.players.some((p) => !p.ready || !p.connected) ? "disabled" : ""}>경기 시작 <span>↗</span></button>` : '<span class="waiting-host">방장 시작 대기</span>'}</div><p class="lobby-footnote">${r.mode === "team" ? "같은 순번끼리 대결 · 동률이면 결정전" : "90초 · KO 또는 남은 체력으로 승부"}</p>` : '<p class="lobby-footnote">첫 번째 선수부터 시작 · 대기 선수는 관전</p>'}</section>`;
  $("[data-leave]").onclick = () => void leave();
  $("#copy-code").onclick = async () => {
    try {
      await navigator.clipboard.writeText(r.code);
      toast("초대코드를 복사했습니다.");
    } catch {
      toast(`초대코드: ${r.code}`);
    }
  };
  if (r.phase === "lobby") {
    $("#ready").onclick = () =>
      void action({ type: "update", patch: { ready: !me.ready } });
    $("#change-character").onclick = () => openCharacterPicker();
    if (host) $("#start").onclick = () => void action({ type: "start" });
    document.querySelectorAll<HTMLElement>("[data-team]").forEach(
      (b) =>
        (b.onclick = () =>
          void action({
            type: "update",
            patch: { team: Number(b.dataset.team) },
          })),
    );
  } else
    document.querySelectorAll<HTMLElement>("[data-up]").forEach(
      (b) =>
        (b.onclick = () => {
          const order = [...r.orders[me.team]],
            i = order.indexOf(b.dataset.up!);
          if (i > 0) {
            [order[i - 1], order[i]] = [order[i], order[i - 1]];
            void action({ type: "reorder", order });
          }
        }),
    );
}
async function prepareOnlineBout(r: PublicRoom) {
  if (!r.bout || !r.sync || r.sync.ready.includes(myId)) return;
  const epoch = r.sync.id,
    boutId = r.bout.id;
  if (preparingSync === epoch) return;
  preparingSync = epoch;
  keys.clear();
  skillPointer = false;
  input = idleInput();
  const loaded =
    world &&
    (await world.setCharacters(
      r.bout.fighters[0].character,
      r.bout.fighters[1].character,
    ));
  if (
    !online ||
    room?.phase !== "playing" ||
    room.bout?.id !== boutId ||
    room.sync?.id !== epoch
  )
    return;
  if (!loaded) {
    toast("3D 로딩에 실패했습니다. 새로고침하면 경기로 다시 연결합니다.");
    return;
  }
  // Let the attached models render before releasing the shared countdown.
  await new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  );
  if (
    !online ||
    room?.phase !== "playing" ||
    room.bout?.id !== boutId ||
    room.sync?.id !== epoch ||
    room.players.some((p) => !p.connected)
  ) {
    if (preparingSync === epoch) preparingSync = "";
    return;
  }
  if (
    !(await action({ type: "loaded", boutId, epoch })) &&
    preparingSync === epoch
  )
    preparingSync = "";
}
function openCharacterPicker(
  continuation?: () => void,
  id: CharacterId = selected,
) {
  modalReturn = document.activeElement as HTMLElement;
  fighterSelection(id, continuation);
}
function renderFight(watching = false) {
  $("#ui").innerHTML =
    `<section id="hud" aria-label="경기 화면"><div class="fight-top"><div class="health-player"><span id="name-0"></span><div class="health-track"><i id="hp-0"></i></div><small id="health-0"></small></div><div class="fight-clock"><small id="round-label">SPARRING</small><b id="clock">90</b><span>RING CLUB</span></div><div class="health-player opponent"><span id="name-1"></span><div class="health-track"><i id="hp-1"></i></div><small id="health-1"></small></div></div><div id="fight-announcement" aria-live="polite"></div><div class="reticle">·</div><div id="impact-fx"><div class="impact-burst"></div><b id="impact-word"></b><span id="combo-word"></span></div><div id="skill-banner"></div><button class="signature-button" id="skill-button"><kbd>Q</kbd><span id="skill-name">SIGNATURE</span><div><i id="skill-meter"></i></div><small id="skill-status">CHARGING</small></button><div class="fight-bottom"><div><small>${watching ? "SPECTATING / FIRST-PERSON" : "YOUR STAMINA"}</small><div class="stamina-track"><i id="stamina"></i></div></div><div class="fight-controls">${keyName("w")}${keyName("a")}${keyName("s")}${keyName("d")} 이동 <span>${keyName("j")} 잽</span> <span>${keyName("k")} 훅</span> <span>${keyName(" ")} 가드</span> <span>${keyName("Shift")} 회피</span></div><button class="fight-leave" id="fight-leave">경기 나가기</button></div>${watching ? '<button id="switch-view" class="view-switch">관전 시점 변경 ⇄</button>' : ""}<div class="touch-controls" aria-label="터치 조작"><div class="touch-move"><button data-key="w" aria-label="앞으로">↑</button><button data-key="a" aria-label="왼쪽">←</button><button data-key="s" aria-label="뒤로">↓</button><button data-key="d" aria-label="오른쪽">→</button></div><div class="touch-actions"><button data-key=" " aria-label="가드">가드</button><button data-key="Shift" aria-label="회피">회피</button><button data-key="j" aria-label="잽">잽</button><button data-key="k" aria-label="훅">훅</button></div></div></section>`;
  skillPointer = false;
  const skillButton = $("#skill-button");
  skillButton.hidden = watching;
  skillButton.onpointerdown = (e) => {
    e.preventDefault();
    skillPointer = true;
    skillButton.setPointerCapture(e.pointerId);
  };
  skillButton.onpointerup =
    skillButton.onpointercancel =
    skillButton.onlostpointercapture =
      () => {
        skillPointer = false;
      };
  $("#fight-leave").onclick = () => void leave();
  if (watching)
    $("#switch-view").onclick = () => {
      view = 1 - view;
    };
  document.querySelectorAll<HTMLElement>("[data-key]").forEach((b) => {
    b.onpointerdown = (e) => {
      e.preventDefault();
      b.setPointerCapture(e.pointerId);
      keys.add(b.dataset.key!);
    };
    b.onpointerup = b.onpointercancel = () => keys.delete(b.dataset.key!);
  });
}
let lastSkills = [0, 0];
let lastHp = [100, 100],
  practiceResult = false;
function updateHud() {
  const b = local || room?.bout;
  if (!b || !$("#hud")) return;
  gameAudio.observeCombat(b, view);
  const own = b.fighters[view],
    other = b.fighters[1 - view];
  for (const [i, f] of [own, other].entries()) {
    const p = room?.players.find((p) => p.id === f.id);
    const c = CHARACTERS.find((c) => c.id === f.character)!;
    $(`#name-${i}`).textContent =
      `${p?.name || (f.id === "AI" ? "AI " + ["루키", "클럽", "프로"][difficulty < 0.4 ? 0 : difficulty < 0.8 ? 1 : 2] : localStorage.getItem("ring-name") || "나")} / ${c.name}`;
    $(`#hp-${i}`).style.width = f.hp + "%";
    $(`#health-${i}`).textContent = Math.ceil(f.hp) + " HP";
    if (f.hp < lastHp[i]) {
      world?.impact(i === 0 ? 1 : 0.65);
      if (i === 1) {
        const heavy = own.kind !== "jab";
        $("#impact-word").textContent =
          own.kind === "skill" ? "BREAK!" : heavy ? "SMASH!" : "HIT!";
        $("#combo-word").textContent =
          own.combo > 1 ? own.combo + " HIT COMBO" : "";
        $("#impact-fx").classList.remove("active");
        void $("#impact-fx").offsetWidth;
        $("#impact-fx").classList.add("active");
      }
      if (i === 0 && settings.shake) {
        $("#flash").classList.remove("hit");
        void $("#flash").offsetWidth;
        $("#flash").classList.add("hit");
      }
    }
    lastHp[i] = f.hp;
  }
  $("#skill-meter").style.width = own.meter + "%";
  $("#skill-name").textContent = signatures[own.character].name;
  $("#skill-status").textContent =
    own.meter >= 100 ? "발동 가능" : Math.floor(own.meter) + " / 100";
  $("#skill-button").classList.toggle("charged", own.meter >= 100);
  [own, other].forEach((f, i) => {
    if (f.skillSerial > lastSkills[i]) {
      const sig = signatures[f.character];
      $("#skill-banner").innerHTML =
        `<small>${i === 0 ? "내 스킬" : "상대 스킬"}</small><b>${sig.name}</b>`;
      $("#skill-banner").classList.remove("active");
      void $("#skill-banner").offsetWidth;
      $("#skill-banner").classList.add("active");
    }
    lastSkills[i] = f.skillSerial;
  });
  $("#stamina").style.width = own.stamina + "%";
  $("#clock").textContent = String(Math.ceil(b.time)).padStart(2, "0");
  $("#round-label").textContent = local
    ? "AI SPARRING"
    : room!.round >= room!.size
      ? "DECIDER"
      : `BOUT ${room!.round + 1} / ${room!.size}`;
  const missing = room?.players.some((p) => !p.connected);
  $("#fight-announcement").innerHTML = missing
    ? "<b>재접속 대기</b><span>최대 30초 동안 경기를 멈춥니다.</span>"
    : room?.sync?.deadline
      ? room.sync.ready.includes(myId)
        ? "<b>상대 준비 대기</b><span>두 선수가 준비되면 함께 시작합니다.</span>"
        : "<b>경기 준비 중</b><span>3D 캐릭터를 불러오고 있습니다.</span>"
      : b.countdown > 0
        ? `<b>${Math.ceil(b.countdown)}</b><span>준비</span>`
        : b.ended
          ? `<b>${b.winner === null ? "DRAW" : b.reason}</b><span>${room ? "다음 경기 준비 중…" : ""}</span>`
          : "";
  if (local && b.ended && !practiceResult) {
    practiceResult = true;
    setTimeout(() => {
      if (local === b) renderPracticeResult(b);
    }, 1500);
  }
}
function renderResult(r: PublicRoom) {
  document.body.classList.remove("fighting");
  $("#ui").innerHTML =
    `<section class="result"><h1>${r.winner === null ? "좋은 승부였습니다." : r.winner === 0 ? "RED CORNER WINS." : "BLUE CORNER WINS."}</h1><p>${esc(r.reason)}</p><div class="result-score"><span>${r.score[0]}</span><small>:</small><span>${r.score[1]}</span></div><div class="result-buttons">${r.host === myId ? '<button class="primary" id="rematch">재대결 로비 열기 ↗</button>' : "<span>방장이 재대결 로비를 열 수 있습니다.</span>"}<button class="secondary" id="result-leave">메인으로</button></div></section>`;
  if ($("#rematch"))
    $("#rematch").onclick = () => void action({ type: "rematch" });
  $("#result-leave").onclick = () => void leave();
}
function renderPracticeResult(b: Bout) {
  gameAudio.setScene("result");
  document.body.classList.remove("fighting");
  world?.menu();
  $("#ui").innerHTML =
    `<section class="result"><p class="eyebrow">TRAINING COMPLETE</p><h1>${b.winner === 0 ? "NICE ROUND." : b.winner === null ? "EVEN MATCH." : "ONE MORE ROUND?"}</h1><p>${b.reason} · ${b.winner === 0 ? "스파링 승리" : b.winner === null ? "무승부" : "다음에는 더 잘할 수 있어요."}</p><div class="training-stats"><div><b>${b.fighters[0].hits}</b><span>유효 타격</span></div><div><b>${Math.ceil(b.fighters[0].hp)}</b><span>남은 체력</span></div><div><b>${Math.ceil(90 - b.time)}s</b><span>경기 시간</span></div></div><div class="result-buttons"><button class="primary" id="practice-again">다시 연습 ↗</button><button class="secondary" id="practice-home">메인으로</button></div></section>`;
  $("#practice-again").onclick = () => {
    practiceResult = false;
    startPractice();
  };
  $("#practice-home").onclick = () => {
    local = null;
    renderHome();
  };
}
async function leave() {
  keys.clear();
  skillPointer = false;
  input = idleInput();
  if (room) {
    if (!online) {
      toast("서버 연결 후 나갈 수 있습니다.");
      return;
    }
    if (!(await action({ type: "leave" }))) return;
  }
  room = null;
  local = null;
  practiceResult = false;
  fingerprint = "";
  closeModal();
  renderHome();
}
function help() {
  modal(
    `<p class="eyebrow">LEARN THE RHYTHM</p><h2 id="dialog-title">먼저 거리부터.</h2><p class="dialog-description">상대를 자동으로 바라보는 1인칭 복싱입니다.<br>잽으로 거리를 재고, 가드가 풀리는 순간 훅을 넣으세요.</p><div class="guide-grid">${[
      ["W A S D", "전후 이동 · 좌우 스텝"],
      ["J / 좌클릭", "빠르고 긴 잽"],
      ["K / 우클릭", "짧고 강한 훅"],
      ["Q", "게이지 100에서 시그니처 스킬"],
      ["SPACE", "가드 · 피해 75% 감소"],
      ["SHIFT", "스태미나를 쓰는 순간 회피"],
      ["ESC", "입력 해제 · 도움말 닫기"],
    ]
      .map(([k, v]) => `<div><kbd>${k}</kbd><span>${v}</span></div>`)
      .join(
        "",
      )}</div><p class="form-note">가드 중에는 공격할 수 없습니다. 훅과 회피는 스태미나를 많이 소모합니다.<br>90초 안에 KO하거나, 시간이 끝났을 때 더 많은 체력을 남기세요.<br>모바일에서는 화면 하단 터치 버튼을 사용하세요.</p>`,
    "help",
  );
}
function openSettings() {
  modal(
    `<p class="eyebrow">MAKE IT YOURS</p><h2 id="dialog-title">클럽 설정.</h2><label class="setting-row">효과음<input id="sound" type="checkbox" ${settings.sound ? "checked" : ""}/></label><label class="setting-row">배경음악<input id="music" type="checkbox" ${settings.music ? "checked" : ""}/></label><label class="setting-row">피격 화면 효과<input id="shake" type="checkbox" ${settings.shake ? "checked" : ""}/></label><div class="key-settings"><p>키 설정 <small>버튼을 누른 다음 새 키를 입력하세요.</small></p>${[
      ["w", "앞으로"],
      ["s", "뒤로"],
      ["a", "왼쪽"],
      ["d", "오른쪽"],
      ["j", "잽"],
      ["k", "훅"],
      [" ", "가드"],
      ["Shift", "회피"],
    ]
      .map(
        ([key, name]) =>
          `<button type="button" data-bind="${key}"><span>${name}</span><kbd>${keyName(key)}</kbd></button>`,
      )
      .join(
        "",
      )}<button type="button" id="reset-keys">기본 키 복원</button></div><p class="form-note">설정은 이 브라우저에 저장됩니다.<br>운영체제의 모션 줄이기 설정도 자동으로 반영합니다.</p>`,
    "settings",
  );
  document.querySelectorAll<HTMLElement>("[data-bind]").forEach(
    (b) =>
      (b.onclick = () => {
        rebinding = b.dataset.bind!;
        b.querySelector("kbd")!.textContent = "입력…";
      }),
  );
  $("#reset-keys").onclick = () => {
    bindings = { ...defaults };
    localStorage.removeItem("ring-keys");
    openSettings();
  };
  $<HTMLInputElement>("#sound").onchange = (e) => {
    settings.sound = (e.target as HTMLInputElement).checked;
    localStorage.setItem("ring-sound", settings.sound ? "on" : "off");
    gameAudio.setEffectsEnabled(settings.sound);
    gameAudio.play("select");
  };
  $<HTMLInputElement>("#music").onchange = (e) =>
    setMenuMusic((e.target as HTMLInputElement).checked);
  $<HTMLInputElement>("#shake").onchange = (e) => {
    settings.shake = (e.target as HTMLInputElement).checked;
    if (world) world.shake = settings.shake;
    localStorage.setItem("ring-shake", settings.shake ? "on" : "off");
  };
}
let skillPointer = false;
const keys = new Set<string>();
const gameplayKeys = ["w", "a", "s", "d", "j", "k", "q", " ", "Shift"];
addEventListener("keydown", (e) => {
  const physical = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (rebinding && e.key !== "Escape") {
    e.preventDefault();
    if (
      ["Tab", "Control", "Alt", "Meta"].includes(physical) ||
      Object.entries(bindings).some(
        ([k, v]) => k !== rebinding && v === physical,
      )
    ) {
      toast("다른 조작과 겹치지 않는 키를 선택해 주세요.");
      return;
    }
    bindings[rebinding] = physical;
    localStorage.setItem("ring-keys", JSON.stringify(bindings));
    rebinding = null;
    openSettings();
    return;
  }
  const mapped = Object.keys(bindings).find((k) => bindings[k] === physical);
  if (e.key === "Escape") {
    keys.clear();
    skillPointer = false;
    if (dialog) closeModal();
    return;
  }
  if (
    (local || room?.phase === "playing") &&
    !dialog &&
    mapped &&
    gameplayKeys.includes(mapped)
  ) {
    e.preventDefault();
    keys.add(mapped);
  }
});
addEventListener("keyup", (e) => {
  const physical = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  const mapped = Object.keys(bindings).find((k) => bindings[k] === physical);
  if (mapped) keys.delete(mapped);
});
addEventListener("blur", () => {
  keys.clear();
  skillPointer = false;
  input = idleInput();
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    keys.clear();
    skillPointer = false;
    input = idleInput();
  }
});
$("#world").addEventListener("pointerdown", (e) => {
  if (!(local || room?.phase === "playing") || dialog) return;
  if (e.button === 0) keys.add("j");
  if (e.button === 2) keys.add("k");
});
addEventListener("pointerup", () => {
  keys.delete("j");
  keys.delete("k");
});
$("#world").addEventListener("contextmenu", (e) => {
  if (local || room?.phase === "playing") e.preventDefault();
});
// Accessible dialog focus containment.
addEventListener("keydown", (e) => {
  if (e.key !== "Tab" || !dialog) return;
  const focusable = Array.from(
    document.querySelectorAll<HTMLElement>(
      '.dialog button:not(:disabled),.dialog input,.dialog [tabindex="0"]',
    ),
  );
  if (!focusable.length) return;
  const first = focusable[0],
    last = focusable.at(-1)!;
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
});
$("[data-home]").onclick = () => {
  if (room || local) toast("먼저 로비 또는 경기에서 나가 주세요.");
  else renderHome();
};
$("[data-roster]").onclick = () => {
  if (room) openCharacterPicker();
  else if (!local) $("#roster").scrollIntoView({ behavior: "smooth" });
};
$("[data-help]").onclick = help;
$("[data-settings]").onclick = openSettings;
let previousTick = performance.now();
let accumulated = 0;
setInterval(() => {
  const currentTime = performance.now();
  const elapsed = Math.min(0.25, (currentTime - previousTick) / 1000);
  previousTick = currentTime;
  const active = !!local || room?.phase === "playing";
  if (active && !dialog && !document.hidden && (!room || online)) {
    input = {
      forward: Number(keys.has("w")) - Number(keys.has("s")),
      strafe: Number(keys.has("d")) - Number(keys.has("a")),
      skill: keys.has("q") || skillPointer,
      jab: keys.has("j"),
      hook: keys.has("k"),
      guard: keys.has(" "),
      dodge: keys.has("Shift"),
    };
  } else input = idleInput();
  if (local && !document.hidden) {
    accumulated += elapsed;
    while (accumulated >= 1 / 30) {
      stepBout(
        local,
        [input, aiInput(local, 1, difficulty, Math.random())],
        1 / 30,
      );
      accumulated -= 1 / 30;
    }
    world?.fight(local, 0);
    updateHud();
  } else if (room?.phase === "playing") {
    accumulated = 0;
    if (
      online &&
      room.bout &&
      room.sync &&
      !room.sync.deadline &&
      room.players.every((p) => p.connected)
    )
      socket.volatile.emit("input", {
        ...input,
        boutId: room.bout.id,
        epoch: room.sync.id,
      });
    updateHud();
  }
  if (!local || document.hidden) accumulated = 0;
  if (room?.phase === "ordering" && $("#order-time"))
    $("#order-time").textContent = String(
      Math.max(0, Math.ceil((room.orderDeadline - Date.now()) / 1000)),
    );
}, 1000 / 30);
renderHome();

addEventListener("keydown", (e) => {
  if (
    !document.body.classList.contains("console-home") ||
    dialog ||
    !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)
  )
    return;
  e.preventDefault();
  const buttons = Array.from(
    document.querySelectorAll<HTMLButtonElement>(".console-tile"),
  );
  const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
  buttons[
    (Math.max(0, index) +
      (e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 1) +
      buttons.length) %
      buttons.length
  ].focus();
});

addEventListener("fighter-model-error", () =>
  toast("3D 모델을 불러오지 못했습니다. 현재 임시 모델을 표시합니다."),
);

addEventListener("fighter-assets-ready", () => {
  if (!localStorage.getItem("ring-character"))
    selected = CHARACTERS.find((c) => modelReady(c.id))?.id || selected;
  if (
    document.body.classList.contains("console-home") &&
    !dialog &&
    !room &&
    !local
  )
    renderHome();
});
