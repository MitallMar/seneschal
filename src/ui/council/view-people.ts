// Карточки людей: черты, молва, мнение главного, почерк, разговор, уговор, перестановки.
import { AXES, AXIS_NAMES } from "../../data/core";
import type { Axis } from "../../data/types";
import { handText } from "../../sim/economy/doer";
import { talk, nextTalk, persuade } from "../../sim/council/talk";
import { giveOrder, orderCost } from "../../sim/council/staff";
import { loyaltyWord, consistency, axisKnown, headOpinion, rumorCheck, traitLabel } from "../../sim/council/know";
import { isStale, topAxis, postName } from "../../sim/state";
import type { Person } from "../../sim/state";
import { $, esc } from "../dom";
import { app, AXIS_COLOR } from "./app";
import { starSvg, axisRows } from "./star";
import { linksText } from "../../sim/council/talk";
import { waysOf } from "../../sim/world/answer";

function traitTags(p: Person): string {
  const tags: string[] = [];
  if (p.know.trait || app.designer) {
    const secret = !p.know.trait ? " secret" : "";
    tags.push(`<span class="tag trait key${secret}" title="${esc(p.trait.desc)}">${p.trait.name}${p.trait.hidden && app.designer ? " (скрытая)" : ""}</span>`);
  } else {
    tags.push(`<span class="tag trait key unknown">${p.know.traitAsked ? "черта скрыта: выдаст поступок" : "черта неизвестна"}</span>`);
  }
  for (const g of p.gained) {
    if (!g.known && !app.designer) continue;
    tags.push(`<span class="tag trait gained${g.known ? "" : " secret"}" title="${esc(g.trait.desc)}">${esc(traitLabel(app.w, g))}</span>`);
  }
  if (p.mark) tags.push(`<span class="tag mark" title="${esc(p.mark.desc)}">✶ ${p.mark.name}</span>`);
  tags.push(p.aspiration && (p.know.aspiration || app.designer)
    ? `<span class="tag asp">${esc(p.aspiration.text)}</span>` : `<span class="tag asp unknown">стремление неизвестно</span>`);
  return tags.join("");
}

function rumorLine(p: Person): string {
  if (!p.rumor) return "";
  const check = rumorCheck(p);
  const truth = app.designer ? ` <small>${p.rumor.wrong ? "молва неверная" : "молва верная"}</small>` : "";
  return `<div class="rumor">${esc(p.rumor.text)}${check ? ` <span class="check">Молва ${check}.</span>` : ""}${truth}</div>`;
}

function opinionLine(p: Person): string {
  const o = headOpinion(app.w, p);
  if (!o) return "";
  const bias = app.designer ? ` <small>пристрастие ${o.bias > 0 ? "+" : ""}${o.bias.toFixed(1)}</small>` : "";
  const title = "Мнение главного — подсказка с пристрастием: друга похвалит, соперника очернит";
  return `<div class="opinion" title="${title}">Главный, ${esc(o.head.name)}: «${o.text}».${bias}</div>`;
}

// Почерк на должности: что склонность человека даёт его сфере и чем за это платят. Виден, когда склонность известна.
function handLine(p: Person): string {
  const hands = handText(p);
  if (!hands.length) return p.post ? `<div class="hand" data-hand="none">Почерк: ровно, без уклона${app.designer ? "" : " (насколько известно)"}.</div>` : "";
  const rows = hands.map((x) => {
    if (!app.designer && !axisKnown(p, x.axis)) return `<div class="hand unknown" data-hand="unknown">${x.shade ? "Оттенок почерка" : "Почерк"}: склонность ещё не раскрыта.</div>`;
    const title = x.shade ? "Оттенок почерка" : `Почерк${isStale(p) ? " (засиделся: вдвое сильнее)" : ""}`;
    return `<div class="hand" data-hand="${x.axis}">${title} — <b style="color:${AXIS_COLOR[x.axis]}">${AXIS_NAMES[x.axis]}</b>: ${esc(x.text)}.</div>`;
  });
  return rows.join("") + waysOf(p).filter((x) => app.designer || axisKnown(p, x.answer.axis)).map((x) =>
    `<div class="hand way" data-way="${x.answer.kind}">В беде${x.shade ? " (оттенок)" : ""} — «${esc(x.answer.name)}»: ${esc(x.answer.good)}; ${esc(x.answer.price)}.</div>`).join("");
}

// Связи: кто за человека стоит, с кем он ладит и на кого в обиде. Видны после разговора о связях.
function linksLine(p: Person): string {
  if (!p.know.links && !app.designer) return "";
  return `<div class="links" data-links="${p.id}">Связи: ${esc(linksText(app.w, p))}.</div>`;
}

export function renderPeople() {
  $("people").innerHTML = app.w.people.map((p) => {
    const noOrder = !p.order && orderCost(app.w) > app.w.authority ? "disabled" : "";
    const orderOpts = AXES.map((a) => `<option value="${a}" ${p.order === a ? "selected" : ""} ${noOrder}>наказ: ${AXIS_NAMES[a]}</option>`).join("");
    const orderTitle = `Наказ (во 2-м акте, стоит ${orderCost(app.w)} авторитета)`;
    const orderSel = `<select data-order="${p.id}" title="${orderTitle}"><option value="">наказ: нет</option>${orderOpts}</select>`;
    const topic = nextTalk(p);
    const talkBtn = `<button data-talk="${p.id}" ${app.w.deedsLeft <= 0 || !topic ? "disabled" : ""}>${topic ? `Поговорить: ${topic}` : "Всё рассказал"}</button>`;
    const leaveBtn = !p.post ? "" : p.agreed ? `<span class="badge agreed">согласен${p.female ? "на" : ""} уйти</span>`
      : `<button data-persuade="${p.id}" ${app.w.deedsLeft <= 0 ? "disabled" : ""} title="Личное дело: уговорить уйти с должности — тогда снять можно без потери авторитета">Уговорить уйти</button>`;
    const match = app.designer && p.decisions ? ` · по ведущей оси (${AXIS_NAMES[topAxis(p.star)]}): <b>${consistency(p)}%</b>` : "";
    return `<div class="card ${p.post ? "on-post" : ""}" data-id="${p.id}">
      <div class="card-head">
        <div><div class="card-name">${esc(p.name)}</div><div class="card-meta">${p.age} лет · ${p.post ? postName(p.post) : "без должности"}</div></div>
        <div class="card-meta" style="text-align:right">${loyaltyWord(p.loyalty)}${app.designer ? ` (${p.loyalty.toFixed(1)})` : ""}<br>разговоров: ${p.know.talks}</div>
      </div>
      <div class="tags">${traitTags(p)}</div>
      ${rumorLine(p)}
      <div class="card-body">
        <div class="star">${starSvg(p)}</div>
        <div class="stats">
          <div class="axes">${axisRows(p)}</div>
          <div class="decisions">Решений: <b>${p.decisions}</b>${match}</div>
        </div>
      </div>
      ${handLine(p)}
      ${linksLine(p)}
      ${opinionLine(p)}
      <details class="bio"><summary>Биография</summary><ul>${p.bio.map((b) => `<li>${esc(b)}</li>`).join("")}</ul></details>
      <div class="card-actions">
        ${talkBtn}
        ${orderSel}
        ${leaveBtn}
      </div>
    </div>`;
  }).join("");
  $("people").querySelectorAll<HTMLButtonElement>("button[data-talk]").forEach((b) =>
    b.addEventListener("click", () => { talk(app.w, Number(b.dataset.talk)); app.render(); }),
  );
  $("people").querySelectorAll<HTMLButtonElement>("button[data-persuade]").forEach((b) =>
    b.addEventListener("click", () => { persuade(app.w, Number(b.dataset.persuade)); app.render(); }),
  );
  $("people").querySelectorAll<HTMLSelectElement>("select[data-order]").forEach((s) =>
    s.addEventListener("change", () => { giveOrder(app.w, Number(s.dataset.order), (s.value || null) as Axis | null); app.render(); }),
  );
}
