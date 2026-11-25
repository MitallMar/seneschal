// Панели эмулятора натуры с наполнением: натуры, мешок, признаки, черты и должности совета.
import type { Axis, Sign, SignVec, BagTrait, Star } from "../../data/types";
import { AXES, AXIS_NAMES, POSTS, TRAITS, LIFE_TRAITS } from "../../data/core";
import { SIGNS, NATURES, BAG } from "../../data/natura";
import { BALANCE } from "../../sim/balance";
import { bagTrait, cos, isFar, isContra } from "../../sim/natura";
import { postAxisTable } from "../../sim/axes-report";
import { mean } from "../../sim/util";
import { $, esc } from "../dom";
import { app, val, pct, f1, KIND, TRIGGER, vecTags, traitTag } from "./app";

export function renderTables() {
  const n = Math.max(1, app.people.length);
  const born = BAG.filter((t) => t.kind === "born" && !t.seneschal), lifeBag = BAG.filter((t) => t.kind === "life" && !t.seneschal);
  const names = (list?: string[]) => (list ?? []).map((id) => esc(bagTrait(id).name)).join(", ");
  // натуры
  $("table-natures").innerHTML = `<table><tr><th>Натура</th><th>Ядро</th><th>Точки кристаллизации: сколько врождённых черт у каждой</th>
    <th>Дальняя область (нажитых)</th><th>Против ядра (нажитых)</th><th>Чаще всего выпадает в прогоне</th><th>Ведущая склонность</th></tr>${NATURES.map((x) => {
    const own = app.people.filter((p) => p.nature === x);
    const freq = BAG.map((t) => ({ t, share: own.filter((p) => p.traits.includes(t)).length / Math.max(1, own.length) })).sort((a, b) => b.share - a.share).slice(0, 6);
    const crystals = x.crystals.map((c) => `${vecTags(c)} ${born.filter((t) => cos(t.vec, c) > 0).length}`).join(" ");
    const topAxis = AXES.reduce((best, a) => (mean(own.map((p) => p.star[a])) > mean(own.map((p) => p.star[best])) ? a : best), AXES[0]);
    return `<tr><td><b>${esc(x.name)}</b><br><span class="muted">${x.id}</span></td><td>${vecTags(x.core)}</td><td>${crystals}</td>
      <td class="c">${lifeBag.filter((t) => isFar(x, t)).length}</td><td class="c">${lifeBag.filter((t) => isContra(x, t)).length}</td>
      <td>${freq.map((r) => `${traitTag(r.t)} ${pct(r.share)}`).join(" ")}</td><td>${AXIS_NAMES[topAxis]} ${f1(mean(own.map((p) => p.star[topAxis])))}</td></tr>`;
  }).join("")}</table>`;
  // мешок
  const kind = val("bag-kind"), sort = val("bag-sort");
  let bag = BAG.filter((t) => !kind || t.kind === kind);
  if (sort === "freq") bag = [...bag].sort((a, b) => app.m.count[b.id] - app.m.count[a.id]);
  if (sort === "name") bag = [...bag].sort((a, b) => a.name.localeCompare(b.name, "ru"));
  $("table-bag").innerHTML = `<table><tr><th>Черта</th><th>Вид</th><th>Вектор</th><th>Что это</th><th>Как действует</th><th>Повод в игре</th><th>Не уживается с</th><th>Вытесняет</th><th>Нужна одна из</th>
    <th>Выпадает</th><th>У каких натур чаще</th></tr>${bag.map((t) => {
    const conflicts = BAG.filter((x) => x.conflicts?.includes(t.id) || t.conflicts?.includes(x.id)).map((x) => esc(x.name)).join(", ");
    const at = NATURES.map((x) => ({ x, c: app.people.filter((p) => p.nature === x && p.traits.includes(t)).length })).filter((r) => r.c).sort((a, b) => b.c - a.c).slice(0, 3);
    const flags = `${t.hidden ? `<span class="tag role">скрытая</span>` : ""}${t.council ? `<span class="tag role">уже в совете</span>` : ""}`;
    return `<tr><td>${traitTag(t)}${flags}<br><span class="muted">${t.id}</span></td><td>${KIND[t.kind]}</td><td>${vecTags(t.vec)}</td>
      <td>${esc(t.desc)}</td><td>${esc(t.effect)}</td><td>${TRIGGER[t.trigger ?? ""] ?? ""}</td><td>${conflicts}</td><td>${names(t.replaces)}</td><td>${names(t.requires)}</td>
      <td class="c${app.m.count[t.id] ? "" : " zero"}">${pct(app.m.count[t.id] / n)}</td><td>${at.map((r) => esc(r.x.name)).join(", ")}</td></tr>`;
  }).join("")}</table>`;
  // признаки
  const w = BALANCE.natura.w as Record<Axis, SignVec>;
  const poleCount = (s: Sign, dir: number, k: BagTrait["kind"]) => BAG.filter((t) => t.kind === k && (t.vec[s] ?? 0) * dir > 0).length;
  const poles = (s: Sign, dir: number) => `${poleCount(s, dir, "born")} / ${poleCount(s, dir, "life")} / ${poleCount(s, dir, "perk")}`;
  $("table-signs").innerHTML = `<table><tr><th>Признак</th><th>Плюс</th><th>Минус</th><th>Черт у плюса<br>врожд. / нажитые / перки</th><th>Черт у минуса</th>
    <th>Натур с плюсом в ядре</th><th>Натур с минусом</th>${AXES.map((a) => `<th>вес в ${AXIS_NAMES[a]}</th>`).join("")}</tr>${SIGNS.map((s) => `<tr>
    <td class="muted">${s.id}</td><td>${esc(s.plus)}</td><td>${esc(s.minus)}</td><td class="c">${poles(s.id, 1)}</td><td class="c">${poles(s.id, -1)}</td>
    <td class="c">${NATURES.filter((x) => (x.core[s.id] ?? 0) > 0).length}</td><td class="c">${NATURES.filter((x) => (x.core[s.id] ?? 0) < 0).length}</td>
    ${AXES.map((a) => `<td class="c">${w[a][s.id] ? (w[a][s.id]! > 0 ? "+" : "") + String(w[a][s.id]).replace(".", ",") : ""}</td>`).join("")}</tr>`).join("")}</table>`;
}
export function renderCouncil() {
  const star = (s: Partial<Star>) => (Object.entries(s) as [Axis, number][]).map(([a, v]) => `${AXIS_NAMES[a]} ${v > 0 ? "+" : ""}${v}`).join(", ");
  const mods = (o: object) => Object.entries(o).map(([key, v]) => `${key} ${v}`).join(", ");
  $("table-key").innerHTML = `<table><tr><th>Черта</th><th>Что это</th><th>Сдвиг звезды</th><th>Поправки</th><th>Скрытая</th></tr>${TRAITS
    .map((t) => `<tr><td><b>${esc(t.name)}</b></td><td>${esc(t.desc)}</td><td>${star(t.star)}</td><td>${mods(t.mods)}</td><td>${t.hidden ? `да, выдаёт ${t.revealedBy}` : ""}</td></tr>`).join("")}</table>`;
  const SOURCE: Record<string, string> = { habit: "привычка", post: "должность", rel: "отношения", break: "перелом" };
  $("table-life").innerHTML = `<table><tr><th>Черта</th><th>Откуда</th><th>Что это</th><th>Тянет решения</th><th>Сдвиг звезды</th><th>Поправки</th></tr>${LIFE_TRAITS
    .map((t) => `<tr><td><b>${esc(t.name)}</b></td><td>${SOURCE[t.source ?? ""] ?? ""}</td><td>${esc(t.desc)}</td><td>${star(t.lean ?? {})}</td><td>${star(t.star)}</td><td>${mods(t.mods)}</td></tr>`).join("")}</table>`;
  const table = postAxisTable();
  $("table-posts").innerHTML = `<table><tr><th>Должность</th><th>Сфера</th><th>Оси годности</th><th>Родные склонности</th><th>Событий</th>
    ${AXES.map((a) => `<th>${AXIS_NAMES[a]}</th>`).join("")}</tr>${POSTS.map((d) => `<tr><td><b>${esc(d.name)}</b></td><td>${esc(d.sphere)}</td>
    <td>${d.axes.map((a) => AXIS_NAMES[a]).join(", ")}</td><td>${d.native.map((a) => AXIS_NAMES[a]).join(", ")}</td><td class="c">${table[d.id].count}</td>
    ${AXES.map((a) => `<td class="c${d.native.includes(a) ? " core" : ""}">${pct(table[d.id].axes[a].events)}</td>`).join("")}</tr>`).join("")}</table>`;
}
