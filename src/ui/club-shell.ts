import { CHARACTERS, type CharacterId } from "../../shared/game";
import type { Player, Room } from "../../server/rooms";

type ClubSport = "boxing" | "bjj";
type PublicRoom = Omit<Room, "players"> & {
  players: Omit<Player, "token">[];
  sport?: ClubSport;
};

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character]!,
  );

const sportDetails = {
  boxing: {
    name: "복싱",
    english: "BOXING",
    rules: "90초 · KO 또는 판정",
    venue: "THE RING",
    number: "01",
  },
  bjj: {
    name: "주짓수",
    english: "JIU-JITSU",
    rules: "90초 · 탭 또는 포인트",
    venue: "THE MATS",
    number: "02",
  },
} as const;

const arrow = '<span class="club-arrow" aria-hidden="true">↗</span>';
const musicIcon =
  '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 17V5l11-2v12M9 8l11-2"/><ellipse cx="6" cy="17" rx="3" ry="2.5"/><ellipse cx="17" cy="15" rx="3" ry="2.5"/></svg>';
const fullscreenIcon =
  '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/></svg>';

export function homeMarkup(
  sport: ClubSport,
  options: {
    selectedName: string;
    selectedPortrait: string;
    online: boolean;
  },
): string {
  const details = sportDetails[sport];
  return `<section class="console-shell club-home" data-club-sport="${sport}" aria-label="RING CLUB 플레이">
    <div class="club-home-content">
      <div class="club-identity">
        <div class="club-sport-switch" role="group" aria-label="종목 선택">
          <button data-sport="boxing" aria-pressed="${sport === "boxing"}"><span>복싱</span><small>BOXING</small></button>
          <button data-sport="bjj" aria-pressed="${sport === "bjj"}"><span>주짓수</span><small>JIU-JITSU</small></button>
        </div>
        <p class="club-kicker"><span class="club-kicker-line"></span>${details.english}</p>
        <h1 class="club-sport-title">${details.name}<span class="club-title-period">.</span></h1>
        <p class="club-rules">${details.rules}</p>
      </div>
      <div class="club-home-play">
        <div class="console-board club-play-menu" aria-label="게임 모드">
          <button class="console-tile club-duel" data-mode="duel" aria-label="1 vs 1 친구 대전">
            <span class="club-duel-copy"><small>1 vs 1</small><strong>친구와 한 판</strong></span>${arrow}
          </button>
          <div class="club-secondary-modes">
            <button class="console-tile club-mode-link" data-mode="ai" aria-label="AI 연습"><strong>AI 연습</strong><span aria-hidden="true">↗</span></button>
            <button class="console-tile club-mode-link" data-mode="team" aria-label="팀 vs 팀 대전"><strong>팀 배틀</strong><small>2–4 vs 2–4</small></button>
          </div>
          <button class="console-tile club-invite" data-join aria-label="초대코드로 참가"><span class="club-invite-symbol" aria-hidden="true">⌁</span><strong>초대코드로 참가</strong>${arrow}</button>
        </div>
        <button class="club-selected-fighter" id="console-fighters" aria-label="파이터 선택, 현재 ${escapeHtml(options.selectedName)}">
          <span class="club-fighter-image"><img src="${escapeHtml(options.selectedPortrait)}" alt="" /></span>
          <span><small>내 파이터</small><strong>${escapeHtml(options.selectedName)}</strong></span>
          <span class="club-fighter-change">파이터 변경 ${arrow}</span>
        </button>
      </div>
    </div>
    <aside class="club-stage-caption" aria-label="선택한 경기장"><span>${details.venue}</span><b>${details.number}</b><i></i></aside>
    <div class="club-home-utilities">
      <span class="club-connection"><span class="console-online">● ${options.online ? "연결됨" : "연결 중"}</span></span>
      <div class="club-utility-buttons">
        <button id="console-music" aria-label="배경음악 설정" title="배경음악">${musicIcon}</button>
        <button id="console-fullscreen" aria-label="전체 화면" title="전체 화면">${fullscreenIcon}</button>
      </div>
    </div>
  </section>`;
}

export function lobbyMarkup(
  room: PublicRoom,
  myId: string,
  portrait: (id: CharacterId) => string,
): string {
  const me = room.players.find((player) => player.id === myId);
  if (!me) return "";
  const sport = room.sport || "boxing";
  const details = sportDetails[sport];
  const ordering = room.phase === "ordering";
  const canStart =
    room.players.length === room.size * 2 &&
    room.players.every((player) => player.ready && player.connected) &&
    [0, 1].every(
      (team) =>
        room.players.filter((player) => player.team === team).length ===
        room.size,
    );
  const teams = [0, 1]
    .map((team) => {
      const members = room.players.filter((player) => player.team === team);
      const ordered = ordering
        ? room.orders[team]
            .map((id) => members.find((player) => player.id === id))
            .filter((player): player is Omit<Player, "token"> => !!player)
        : members;
      const players = ordered
        .map((player, index) => {
          const character =
            CHARACTERS.find((character) => character.id === player.character) ||
            CHARACTERS[0];
          const tags = [
            player.id === myId ? '<small class="club-me-tag">나</small>' : "",
            player.id === room.host ? "<small>방장</small>" : "",
            player.id === room.captains[team]
              ? '<small class="captain">팀장</small>'
              : "",
          ].join("");
          const status = !player.connected
            ? "재접속 중"
            : player.ready
              ? "READY ✓"
              : "준비 중";
          return `<div class="player-row${player.id === myId ? " is-me" : ""}${!player.connected ? " is-disconnected" : ""}">
            <span class="player-number">${String(index + 1).padStart(2, "0")}</span>
            <img src="${escapeHtml(portrait(player.character))}" alt="${escapeHtml(character.name)}" />
            <div class="club-player-copy"><b title="${escapeHtml(player.name)}">${escapeHtml(player.name)}</b><span class="club-player-details"><span>${character.name}</span>${tags}</span></div>
            <span class="ready-state${player.ready && player.connected ? " is-ready" : ""}"${!player.connected ? ' role="status"' : ""}>${status}</span>
            ${ordering && room.captains[team] === myId ? `<button class="club-order-button" data-up="${escapeHtml(player.id)}" aria-label="${escapeHtml(player.name)} 출전 순서 올리기" ${index === 0 ? "disabled" : ""}>↑</button>` : ""}
          </div>`;
        })
        .join("");
      const emptySeats = Array.from(
        { length: Math.max(0, room.size - members.length) },
        (_, index) =>
          `<div class="empty-player"><span class="player-number">${String(members.length + index + 1).padStart(2, "0")}</span><span class="club-empty-mark" aria-hidden="true">+</span><span>참가 대기</span></div>`,
      ).join("");
      return `<section class="team-column team-${team}">
        <div class="team-heading"><h2><i aria-hidden="true"></i>${team === 0 ? "레드" : "블루"} ${room.mode === "duel" ? "코너" : "팀"}</h2><span>${members.length} / ${room.size}</span></div>
        ${players}${emptySeats}
        ${room.phase === "lobby" && room.mode === "team" && me.team !== team ? `<button class="switch-team" data-team="${team}"${members.length >= room.size ? " disabled" : ""}>이 팀으로 이동 <span aria-hidden="true">↗</span></button>` : ""}
      </section>`;
    })
    .join("");
  const actions =
    room.phase === "lobby"
      ? `<div class="lobby-actions">
          <button class="secondary club-change" id="change-character">파이터 변경</button>
          <button class="${me.ready ? "secondary is-ready" : "primary"}" id="ready" aria-pressed="${me.ready}">${me.ready ? "준비 취소" : "준비하기"}<span aria-hidden="true">${me.ready ? "✓" : "→"}</span></button>
          ${room.host === myId ? `<button class="primary dark" id="start" aria-label="경기 시작"${canStart ? "" : " disabled"}>경기 시작 ${arrow}</button>` : '<span class="waiting-host">방장 시작 대기</span>'}
        </div>`
      : "";
  const footnote = ordering
    ? "첫 번째 선수부터 시작 · 대기 선수는 관전"
    : room.mode === "team"
      ? "같은 순번끼리 대결 · 동률이면 결정전"
      : details.rules;

  return `<section class="lobby club-lobby" data-club-sport="${sport}">
    <div class="lobby-head club-lobby-head">
      <div><p class="club-kicker">${details.name}<span>·</span>${room.mode === "duel" ? "1 vs 1" : `${room.size} vs ${room.size}`}</p><h1>${ordering ? "출전 순서" : "대기실"}<span class="club-title-period">.</span></h1></div>
      <button class="text-button" data-leave aria-label="로비 나가기">나가기 ${arrow}</button>
    </div>
    <div class="club-lobby-rail">
      <div class="lobby-code">
        <div><b>초대코드</b><strong data-code>${escapeHtml(room.code)}</strong></div>
        <button class="copy-button" id="copy-code" aria-label="초대코드 복사"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="8" y="8" width="12" height="13" rx="1"/><path d="M15 8V3H3v13h5"/></svg><span>코드 복사</span></button>
        <span class="club-seat-count">${room.players.length} / ${room.size * 2}명</span>
      </div>
      ${ordering ? '<div class="order-clock"><div><span>팀장이 출전 순서를 정합니다</span><small>남은 시간 후 경기 시작</small></div><b><span id="order-time">30</span><small>초</small></b></div>' : '<p class="club-lobby-prompt">모두 준비하면 경기를 시작합니다.</p>'}
      <div class="club-lobby-space" aria-hidden="true"></div>
      <div class="teams">${teams}</div>
      ${actions}
      <p class="lobby-footnote">${footnote}</p>
    </div>
    <aside class="club-stage-caption" aria-hidden="true"><span>${details.venue}</span><b>${details.number}</b><i></i></aside>
  </section>`;
}
