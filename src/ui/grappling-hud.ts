import type { Bout } from "../../shared/game";
import { grapplingContext } from "../../shared/grappling";

export function grapplingHudMarkup(
  watching: boolean,
  key: (value: string) => string,
) {
  return `<section id="hud" class="bjj-hud" data-sport="bjj" aria-label="주짓수 경기 화면">
    <div class="fight-top"><div class="health-player"><span id="name-0"></span><strong id="health-0">0 PT</strong><div class="health-track"><i id="hp-0"></i></div></div><div class="fight-clock"><small id="round-label">JIU-JITSU</small><b id="clock">90</b><span>JIU-JITSU</span></div><div class="health-player opponent"><span id="name-1"></span><strong id="health-1">0 PT</strong><div class="health-track"><i id="hp-1"></i></div></div></div>
    <div id="fight-announcement" aria-live="polite"></div><div id="skill-banner"></div>
    <button id="bjj-camera" class="bjj-camera" aria-label="시점 전환">V · 1인칭 ⇄</button>
    ${watching ? '<button id="switch-view" class="view-switch">관전 시점 변경 ⇄</button>' : ""}
    <div id="bjj-submission" class="bjj-submission" hidden><span id="bjj-submission-label"></span><div><i id="bjj-submission-meter"></i></div><small id="bjj-submission-hint"></small></div>
    <div class="bjj-position"><span id="bjj-role">스탠딩</span><strong id="bjj-position">그립 싸움</strong><span id="bjj-control-label"></span><div class="bjj-control-track"><i id="bjj-control"></i></div><small id="bjj-hint"></small></div>
    <button class="signature-button" id="skill-button"><kbd>Q</kbd><span id="skill-name">STYLE</span><div><i id="skill-meter"></i></div><small id="skill-status">CHARGING</small></button>
    <div class="fight-bottom"><div><small>스태미나</small><div class="stamina-track"><i id="stamina"></i></div></div><div class="fight-controls">${key("w")}${key("a")}${key("s")}${key("d")} 이동 <span>${key("j")} <b data-bjj-label="jab">그립</b></span><span>${key("k")} <b data-bjj-label="hook">테이크다운</b></span><span>${key(" ")} <b data-bjj-label="guard">스프롤</b></span><span>${key("Shift")} <b data-bjj-label="dodge">탈출</b></span></div><button class="fight-leave" id="fight-leave">경기 나가기</button></div>
    <div class="touch-controls" aria-label="터치 조작"><div class="touch-move"><button data-key="w" aria-label="앞으로">↑</button><button data-key="a" aria-label="왼쪽">←</button><button data-key="s" aria-label="뒤로">↓</button><button data-key="d" aria-label="오른쪽">→</button></div><div class="touch-actions"><button data-key=" " data-bjj-label="guard">스프롤</button><button data-key="Shift" data-bjj-label="dodge">탈출</button><button data-key="j" data-bjj-label="jab">그립</button><button data-key="k" data-bjj-label="hook">테이크다운</button></div></div>
  </section>`;
}

export function updateGrapplingHud(
  bout: Bout,
  view: number,
  camera: "first" | "broadcast",
) {
  const g = bout.grappling;
  if (!g) return;
  const context = grapplingContext(bout, view);
  const text = (id: string, value: string) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  };
  text("bjj-position", context.position);
  text("bjj-role", context.role);
  text("bjj-hint", context.hint);
  const standing = g.position === "standing" || g.position === "clinch";
  const control = standing ? g.grip[view] : g.control[view];
  const goal = standing || g.top === view ? 28 : 40;
  text(
    "bjj-control-label",
    `${standing ? "그립" : g.top === view ? "지배력" : "프레임"} ${Math.round(control)}%`,
  );
  const fill = document.getElementById("bjj-control");
  if (fill)
    fill.style.width = Math.max(0, Math.min(100, (control / goal) * 100)) + "%";
  if (standing) {
    const own = bout.fighters[view],
      other = bout.fighters[1 - view];
    const distance = Math.hypot(own.x - other.x, own.z - other.z);
    text(
      "bjj-hint",
      distance >= 1.7
        ? "상대에게 가까이 이동하세요."
        : own.stamina < 22
          ? "힘을 빼고 스태미나를 회복하세요."
          : control < 28
            ? "J를 유지해 그립을 만드세요."
            : other.guard && control < 70
              ? "상대가 방어 중입니다. 그립을 더 쌓으세요."
              : "K로 테이크다운 · Space로 진입 방어",
    );
  }
  for (const action of ["jab", "hook", "guard", "dodge"] as const)
    document
      .querySelectorAll<HTMLElement>(`[data-bjj-label="${action}"]`)
      .forEach((el) => {
        el.textContent = context[action];
        if (el instanceof HTMLButtonElement)
          el.setAttribute("aria-label", context[action]);
      });
  text("bjj-camera", `V · ${camera === "first" ? "1인칭" : "중계 시점"} ⇄`);
  const panel = document.getElementById("bjj-submission");
  if (panel) panel.hidden = !g.submission;
  if (g.submission) {
    const attack = g.submission.attacker === view;
    const name = {
      armbar: "암바",
      triangle: "트라이앵글",
      "rear-choke": "리어네이키드 초크",
    }[g.submission.kind];
    text("bjj-submission-label", `${name} · ${attack ? "공격" : "방어"}`);
    text(
      "bjj-submission-hint",
      attack ? "K 유지 · 스태미나를 관리하세요" : "Space 프레임 · Shift 탈출",
    );
    if (panel) panel.dataset.role = attack ? "attack" : "defend";
    const meter = document.getElementById("bjj-submission-meter");
    if (meter) meter.style.width = g.submission.progress + "%";
  }
}
