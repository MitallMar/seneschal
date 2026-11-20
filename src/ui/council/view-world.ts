// Мир вокруг: строка «что в мире», действующие состояния, указы Герцога на столе Сенешаля и вкладка «Мир» — лента событий по слоям.
import { CATEGORY_NAMES } from "../../data/economy";
import { WORLD_LAYERS, WORLD_LAYER_NAMES, WORLD_STATES, WEATHER_WORDS } from "../../data/world";
import type { PayId } from "../../data/types";
import { BALANCE as B } from "../../sim/balance";
import type { WorldNews } from "../../sim/state";
import { worldTape, weatherWord } from "../../sim/world/gen";
import { worldView, decreeOptions, decreeLeft, decreeCouncilCan, payDecree, tagNames } from "../../sim/world/apply";
import { $, esc } from "../dom";
import { app, seasonLabel, fmt } from "./app";

const newsItem = (n: WorldNews) => {
  const size = n.measures ? ` <small>${fmt(n.measures)} мер</small>` : "";
  return `<div class="wn ${n.tone}" data-kind="${n.kind}">${esc(n.text)}${size}</div>`;
};

// Указы на столе: счёт в мерах и цена каждого способа «чем и с кого». Кнопка закрывает этим способом сколько можно.
function renderDecrees() {
  const list = app.w.world.decrees.map((d) => {
    const left = decreeLeft(d), last = d.until <= app.w.season;
    const what = d.accepts.map((c) => CATEGORY_NAMES[c].toLowerCase()).join(" или ");
    // предупреждение заранее: по нынешним запасам совет сам указ не закроет — решать игроку
    const can = decreeCouncilCan(app.w, d), short = can < left;
    const why = app.w.eco.autoPay ? `сверх нижних черт у него хватает на ${fmt(can)} из ${fmt(left)} мер` : "указы совету не оставлены";
    const warn = short || !app.w.eco.autoPay ? `<p class="weak decree-warn" data-short="${d.id}">Совет сам этот указ не исполнит: ${why}. Закрыть его — решение Сенешаля.</p>` : "";
    const opts = decreeOptions(app.w, d).map((o) => {
      const m = Math.min(o.max, left), units = fmt(m * o.rate);
      const label = o.blocked ? `${o.def.name}: ${o.blocked}` : `${o.def.name}: ${fmt(m)} мер за ${units} (${CATEGORY_NAMES[o.def.what].toLowerCase()}). Больно ${o.def.hurts}`;
      return `<button data-decree="${d.id}" data-way="${o.def.id}" data-max="${m}" ${m <= 0 ? "disabled" : ""}>${esc(label)}</button>`;
    }).join("");
    return `<div class="decree" data-decree-id="${d.id}">
      <b>${esc(d.title)}</b>: осталось <b class="decree-left">${fmt(left)}</b> из ${fmt(d.due)} мер (${what}) · ${last ? "срок — этот сезон" : `срок — ${seasonLabel(d.until)}`}
      <p class="desk-text">${esc(d.text)}</p><p class="hint decree-note">Встречал ${esc(d.note)}.</p>${warn}<div class="desk-opts">${opts}</div></div>`;
  }).join("");
  const auto = app.w.eco.autoPay ? "совет исполнит его сам в последний сезон срока, не трогая нижних черт" : "совету это не оставлено";
  const D = B.world.decree;
  $("decrees").innerHTML = `<h3>Указы Герцога</h3>${list || `<p class="hint">Указов нет.</p>`}
    ${list ? `<p class="hint" id="decree-hint">Указ закрывается теми же способами, что подать. Не закроешь — ${auto}. Не исполнен к сроку: терпение Герцога −${fmt(D.patience)}, двор обижен, авторитет −${fmt(D.authority)}.</p>` : ""}`;
  $("decrees").querySelectorAll<HTMLButtonElement>("button[data-decree]").forEach((b) =>
    b.addEventListener("click", () => { payDecree(app.w, Number(b.dataset.decree), b.dataset.way as PayId, Number(b.dataset.max)); app.render(); }));
}

// Вкладка «Мир»: что действует сейчас и лента на много сезонов вперёд — мир от совета не зависит, поэтому лента считается сразу от семени.
function renderTape() {
  const v = worldView(app.w), ws = app.w.world.sim;
  const states = v.states.map((s) => {
    const real = app.designer ? ` <small>сила ${fmt(s.strength)}, до сезона ${s.until}</small>` : "";
    return `<div class="ws ${s.bad ? "bad" : "good"}" data-state="${s.id}"><b>${esc(s.name)}</b>${real} <small>${esc(tagNames(s.tags)) || "без меток"} · идёт ${app.w.season - s.since + 1}-й сезон</small>
      <div>${esc(s.text)}</div>${s.stand ? `<div class="stand ${s.stand.k < 1 ? "good" : s.stand.k > 1 ? "bad" : ""}">Отвечает ${esc(s.stand.text)}${app.designer ? ` <small>потери ×${fmt(s.stand.k)}</small>` : ""}.</div>` : ""}</div>`;
  }).join("");
  const m = v.mods, pct = (x: number) => `${x >= 1 ? "+" : "−"}${Math.round(Math.abs(x - 1) * 100)}%`;
  const shifts = [["урожай", m.harvest], ["цена товаров", m.price], ["пошлины", m.duty], ["лес", m.forest]].filter(([, x]) => x !== 1).map(([name, x]) => `${name} ${pct(x as number)}`);
  if (m.lesson) shifts.push(`урок ${m.lesson > 0 ? "+" : "−"}${fmt(Math.abs(m.lesson))} мер`);
  const real = app.designer ? ` <small id="world-budget">бюджет давления ${fmt(ws.budget)} из ${fmt(B.world.budget.cap)}</small>` : "";
  const tiun = v.tiun ? ` · за худой год отвечает ${esc(v.tiun.text)}` : "";
  $("world-now").innerHTML = `<p id="world-weather">Погода года: <b>${v.weather}</b>${tiun}${real}</p>
    <p class="hint" id="world-shifts">${shifts.length ? `Мир сейчас сдвигает хозяйство: ${shifts.join(", ")}.` : "Мир сейчас хозяйство не сдвигает."}</p>
    ${states || `<p class="hint">В герцогстве тихо.</p>`}`;

  const seed = app.w.seed, tape = worldTape(seed, B.world.tape);
  const rows = tape.map((r) => {
    const cells = WORLD_LAYERS.map((layer) => `<td>${r.news.filter((n) => n.layer === layer).map(newsItem).join("")}</td>`).join("");
    const held = r.active.map((a) => WORLD_STATES.find((s) => s.id === a.id)!).map((s) => `<span class="${s.cost > 0 ? "bad" : "good"}">${esc(s.name)}</span>`).join(", ");
    const sky = WEATHER_WORDS[weatherWord(r.mods.harvest)];
    return `<tr class="${r.season === app.w.season ? "now" : r.season < app.w.season ? "past" : ""}" data-season="${r.season}">
      <th>${r.season}<small>${seasonLabel(r.season)}</small></th>${cells}<td class="held">${held || "—"}<small>${sky}, урожай ×${fmt(r.mods.harvest)}</small></td></tr>`;
  }).join("");
  const news = tape.flatMap((r) => r.news), bad = news.filter((n) => n.kind === "start" && n.tone === "bad").length;
  $("world-tape").innerHTML = `<p class="hint" id="world-sum">Лента на ${tape.length} сезонов по семени «${esc(seed)}»: состояний ${news.filter((n) => n.kind === "start").length},
    из них бед ${bad}; указов ${news.filter((n) => n.kind === "decree").length}; местных отголосков ${news.filter((n) => n.kind === "echo").length}.
    Мир от совета не зависит: лента та же, как ни играй; ручки раздела «Мир вокруг» меняют её сразу.</p>
    <table class="tape"><thead><tr><th>Сезон</th>${WORLD_LAYERS.map((l) => `<th>${WORLD_LAYER_NAMES[l]}</th>`).join("")}<th>Что действует</th></tr></thead><tbody>${rows}</tbody></table>`;
}

export function renderWorld() {
  const v = worldView(app.w);
  $("world-line").innerHTML = `Что в мире: <b>${esc(v.line)}</b>`;
  renderDecrees();
  renderTape();
}
