// Стол Сенешаля: авторитет и его ведомость, дело сезона и приказ, жалобы, обычаи и пиры.
import { CATEGORY_NAMES } from "../../data/economy";
import { BALANCE as B } from "../../sim/balance";
import { authorityCap, authoritySupport, authorityWeak, complaintLeft, judge, feast, feastGain, feastCost, FEASTS } from "../../sim/authority";
import type { FeastId } from "../../sim/authority";
import type { AuthLine } from "../../sim/state";
import { postName } from "../../sim/state";
import { command, deskView } from "../../sim/season";
import { $, esc } from "../dom";
import { app, seasonLabel, fmt, signed } from "./app";

function authLine(l: AuthLine): string {
  return `<div class="ll" data-kind="${l.kind}"><span class="lv ${l.v > 0 ? "pos" : "neg"}">${signed(l.v)}</span><span class="lt">${esc(l.text)}</span></div>`;
}

export function renderDesk() {
  const a = app.w.auth, support = authoritySupport(app.w), noDeeds = app.w.deedsLeft <= 0;
  const last = a.last
    ? `<div class="auth-ledger" id="auth-ledger"><b>Ведомость авторитета: ${seasonLabel(a.lastSeason)}</b>${a.last.map(authLine).join("") || "<p>Без перемен.</p>"}</div>`
    : `<div class="auth-ledger" id="auth-ledger"><p>Ведомость авторитета появится после первого сезона.</p></div>`;
  const now = a.cur.length ? `<div class="auth-ledger" id="auth-now"><b>В этом сезоне уже</b>${a.cur.map(authLine).join("")}</div>` : "";
  const weak = authorityWeak(app.w) ? `<p class="weak" id="auth-weak">Авторитет ниже ${B.authority.weakBelow}: слово весит меньше — каждая трата дороже на ${B.authority.weakExtra}.</p>` : "";
  const why = support.lines.map((l) => `${signed(l.v)} ${l.text.replace("опора: ", "")}`).join("; ") || "опоры нет";
  $("auth").innerHTML = `<div id="auth-line">Авторитет <b>${fmt(app.w.authority)}</b> из ${fmt(authorityCap(app.w))} · опора за сезон <b>${signed(support.total) || "0"}</b></div>
    <p class="hint" id="auth-support">${esc(why)}. Сверх потолка авторитет сгорает, ниже нуля не уходит.</p>${weak}${now}${last}`;

  const d = deskView(app.w);
  if (!d) $("desk").innerHTML = `<h3>Дело сезона</h3><p class="hint">На столе пусто.</p>`;
  else {
    const advice = d.advisor && d.opinion ? `${esc(d.advisor.name)} (${postName(d.advisor.post!).toLowerCase()}) советует: «${esc(d.opinion.text)}».` : "Должность пуста: советовать некому.";
    const buttons = d.ev.options.map((o) => {
      const mine = d.opinion?.id === o.id ? " ← совет" : "";
      return `<button data-command="${o.id}" ${noDeeds || d.order ? "disabled" : ""}>${esc(o.text)}${mine}</button>`;
    }).join("");
    const state = d.order ? `<p class="ordered" id="desk-order">Приказано: «${esc(d.order.text)}».</p>`
      : `<p class="hint">Приказ — личное дело. Не прикажешь — совет решит сам. Приказал против совета и вышло хорошо — авторитет растёт, плохо — падает.</p>`;
    $("desk").innerHTML = `<h3>Дело сезона: ${esc(d.ev.title)}</h3><p class="desk-text">${esc(d.ev.text)}</p>
      <p class="desk-advice" id="desk-advice">${advice}</p><div class="desk-opts">${buttons}</div>${state}`;
  }
  $("desk").querySelectorAll<HTMLButtonElement>("button[data-command]").forEach((b) =>
    b.addEventListener("click", () => { command(app.w, b.dataset.command!); app.render(); }));

  const list = a.complaints.map((c) => {
    const left = complaintLeft(app.w, c);
    const old = left <= 1 ? " · последний сезон" : ` · ждёт ещё ${left} сез.`;
    return `<div class="complaint"><span>${esc(app.w.people[c.from].name)} на ${esc(app.w.people[c.on].name)}${old}</span>
      <button data-judge="${c.id}" ${noDeeds ? "disabled" : ""}>Разобрать</button></div>`;
  }).join("");
  $("complaints").innerHTML = `<h3>Жалобы</h3>${list || `<p class="hint">Жалоб нет.</p>`}
    ${list ? `<p class="hint">Суд лично — личное дело, авторитет +${fmt(B.authority.judge)}. Жалоба ждёт год; не разобрал — −${fmt(B.authority.complaintLeft)}, и она уходит.</p>` : ""}`;
  $("complaints").querySelectorAll<HTMLButtonElement>("button[data-judge]").forEach((b) =>
    b.addEventListener("click", () => { judge(app.w, Number(b.dataset.judge)); app.render(); }));

  const feasts = FEASTS.map((f) => {
    const cost = feastCost(f.id), off = noDeeds || app.w.eco.stock[f.pay] < cost;
    return `<button data-feast="${f.id}" ${off ? "disabled" : ""} title="${esc(f.text)}">${f.name}: ${CATEGORY_NAMES[f.pay].toLowerCase()} −${fmt(cost)}</button>`;
  }).join("");
  $("feasts").innerHTML = `<h3>Обычаи и пиры</h3><div class="desk-opts">${feasts}</div>
    <p class="hint" id="feast-gain">Личное дело. Сейчас даст авторитета +${fmt(feastGain(app.w))}; каждый следующий за год — вдвое меньше.</p>`;
  $("feasts").querySelectorAll<HTMLButtonElement>("button[data-feast]").forEach((b) =>
    b.addEventListener("click", () => { feast(app.w, b.dataset.feast as FeastId); app.render(); }));
}
