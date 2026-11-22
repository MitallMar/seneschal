// Кризисы сторон и «под чужой рукой» на столе Сенешаля: счёт отказов и шрамы, барон, его срок и личные дела при нём.
import { AXES, AXIS_NAMES } from "../../data/core";
import { COURSES, SIDE_NAMES } from "../../data/economy";
import { CRISIS_SIDES, STIR_SIDES, BACK_NAMES } from "../../data/fall";
import type { CourseId, Side } from "../../data/types";
import { BALANCE as B } from "../../sim/balance";
import { zoneOf, patienceWord } from "../../sim/economy/zones";
import { scarOf, disgraced } from "../../sim/fall/base";
import { crisisDef } from "../../sim/fall/crisis";
import { sway, swayChance, askConsent, stir } from "../../sim/fall/under";
import { $, esc } from "../dom";
import { app, seasonLabel, fmt } from "./app";

let swayPick: CourseId | "" = "";

// Что со стороной: кризис на столе, шрам, счёт отказов. Пусто — всё спокойно. Зовут и стол Сенешаля, и панель сторон.
export function crisisWord(side: Side): string {
  const w = app.w, f = w.fall, n = f.refuse[side] ?? 0, scar = scarOf(w, side);
  if (!CRISIS_SIDES.includes(side) || !B.fall.on) return "";
  if (f.queue.includes(side)) return "кризис: дело на столе Сенешаля";
  if (scar) return `шрам, ещё ${scar.scarUntil - w.season} сез.: ${crisisDef(side).scar}`;
  if (n > 0) return `отказывает ${n} сез. подряд из ${B.fall.refuseSeasons} — потом кризис`;
  return "";
}

function underHtml(): string {
  const w = app.w, F = B.fall, u = w.fall.under!, b = u.baron, noDeeds = w.deedsLeft <= 0;
  const star = app.designer ? ` <small id="baron-star">${AXES.map((a) => `${AXIS_NAMES[a]} ${fmt(b.star[a])}`).join(", ")}</small>` : "";
  const real = app.designer ? ` <small id="baron-armor">броня ${fmt(u.armor)} из ${fmt(F.armor)}</small>` : "";
  const course = COURSES.find((c) => c.id === w.eco.course);
  const out = disgraced(w) ? `<p class="weak" id="disgrace">Опала: Сенешаль отстранён от совета — без личных дел до конца сезона «${seasonLabel(w.fall.disgrace)}».</p>` : "";
  const jump = u.jump ? `<p class="hint" id="under-jump">Акт кончается: остаток заберёт прыжок — лес выживет барона за два года, но новый акт начнётся со шрамами и меньшим авторитетом.</p>` : "";
  const consent = u.consent === w.season ? `<span class="ordered" id="consent-on">Согласие барона на перестановки в этом сезоне есть.</span>`
    : `<button id="consent" ${noDeeds ? "disabled" : ""}>Заручиться согласием барона на перестановки</button>`;
  const lean = (id: CourseId) => { const c = swayChance(w, id); return c > F.swayBase ? "ему по душе" : c < F.swayBase ? "ему не по душе" : "ему всё равно"; };
  const others = COURSES.filter((c) => c.id !== w.eco.course);
  if (!others.some((c) => c.id === swayPick)) swayPick = others[0].id;
  const opts = others.map((c) => {
    const chance = app.designer ? `, шанс ${Math.round(swayChance(w, c.id) * 100)}%` : "";
    return `<option value="${c.id}" ${c.id === swayPick ? "selected" : ""}>${c.name} — ${lean(c.id)}${chance}</option>`;
  }).join("");
  const stirs = STIR_SIDES.map((s) => `<button data-stir="${s}" ${noDeeds ? "disabled" : ""}>${SIDE_NAMES[s]} (${zoneOf(w, s)})</button>`).join("");
  return `<div class="under" id="under">
    <h3>Под чужой рукой</h3>
    <p id="baron">Барон <b>${esc(b.name)}</b>, ${esc(b.who)}; по натуре ${esc(b.nature.toLowerCase())}.${star}</p>
    <p id="under-armor">Если ничего не делать, лес выживет его через <b>${Math.ceil(u.armor)}</b> сез.${real}
      Путь двора снял ${fmt(u.steps.dvor)} сез., путь земли — ${fmt(u.steps.zemlya)}.</p>
    <p class="hint" id="under-rules">Курс задаёт барон: «${course ? esc(course.name) : "как заведено"}». Его двор ест за сезон ${fmt(F.courtFood)} еды и ${fmt(F.courtSilver)} серебра.
      Подать и указы — на нём: недоимка сократит его срок на ${fmt(F.stepArrears)} сез., неисполненный указ — на ${fmt(F.stepDecree)}, кризис стороны — на ${fmt(F.stepCrisis)}.
      Потолок авторитета — ${fmt(F.capUnder)}. Попал сюда: ${esc(u.why)}.</p>${out}${jump}
    <div class="desk-opts">${consent}</div>
    <div class="pay"><select id="sway-course">${opts}</select><button id="sway" ${noDeeds ? "disabled" : ""}>Склонить барона к курсу</button></div>
    <p class="hint">Раскачать сторону против барона:</p><div class="desk-opts" id="stir">${stirs}</div>
    <p class="hint" id="stir-hint">Каждое — личное дело. Раскачать: доверие стороны −${fmt(F.stir)} (страдает и своя земля); дойдёт до кризиса — земля барона не примет.
      Барон заметит${app.designer ? ` (шанс ${Math.round(F.stirNotice * 100)}%)` : ""} — опала: ${F.disgraceSeasons} сез. без личных дел и авторитет −${fmt(F.disgraceAuthority)}.</p>
  </div>`;
}

export function renderFall() {
  const w = app.w, f = w.fall, F = B.fall;
  if (!F.on) { $("fall").innerHTML = ""; return; }
  const rows = CRISIS_SIDES.map((s) => {
    const word = crisisWord(s);
    return word ? `<div class="crisis${f.queue.includes(s) ? " now" : ""}" data-crisis="${s}"><b>${SIDE_NAMES[s]}</b>: ${esc(word)}</div>` : "";
  }).join("");
  const last = f.falls[f.falls.length - 1];
  const past = last?.back ? `<p class="hint" id="fall-past">Из-под чужой руки вернулся: ${seasonLabel(last.back)} — ${esc(BACK_NAMES[last.how!])}. Падений за партию: ${f.falls.length}.</p>` : "";
  const edge = !f.under && patienceWord(w.eco.tax.patience) === "на исходе" ? `<p class="weak" id="fall-edge">Терпение Герцога на исходе: дойдёт до нуля — баронство отдадут другому.</p>` : "";
  const risk = f.under ? "" : `<p class="hint" id="fall-rules">Сторона ${F.refuseSeasons} сезона подряд «отказывает» — кризис: тяжёлое дело на столе и шрам после.
    Баронство отдадут другому, если терпение Герцога исчерпано, недоимка совпала с кризисом, два кризиса идут сразу или не закрыт внеочередной сбор.</p>`;
  $("fall").innerHTML = `${f.under ? underHtml() : ""}<h3>Кризисы сторон</h3>${rows || `<p class="hint" id="crisis-none">Кризисов нет.</p>`}${edge}${past}${risk}`;
  if (!f.under) return;
  $("fall").querySelector("#consent")?.addEventListener("click", () => { askConsent(w); app.render(); });
  $("sway-course").addEventListener("change", () => { swayPick = ($("sway-course") as HTMLSelectElement).value as CourseId; });
  $("sway").addEventListener("click", () => { if (swayPick) sway(w, swayPick); app.render(); });
  $("fall").querySelectorAll<HTMLButtonElement>("button[data-stir]").forEach((b) =>
    b.addEventListener("click", () => { stir(w, b.dataset.stir as Side); app.render(); }));
}
