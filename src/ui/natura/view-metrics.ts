// Панели эмулятора натуры: карточки метрик с целями и графики прогона (частота черт, натуры, признаки, склонности).
import type { Axis, Sign, BagTrait, NatureDef } from "../../data/types";
import { AXES, AXIS_NAMES } from "../../data/core";
import { SIGNS, NATURES, BAG } from "../../data/natura";
import { BALANCE } from "../../sim/balance";
import { naturaWarnings } from "../../sim/natura-report";
import { mean } from "../../sim/util";
import { $, esc } from "../dom";
import { app, pct, f1, f2, KIND, RARITY, AXIS_RGB, track } from "./app";

export function renderMetrics() {
  const G = BALANCE.natura.goal;
  const minSpread = Math.min(...Object.values(app.m.signSpread));
  const card = (title: string, v: string, goal: string, ok: boolean | null) =>
    `<div class="card${ok === null ? " info" : ok ? "" : " bad"}"><div>${title}</div><div class="v">${v}</div><div class="goal">${goal}</div></div>`;
  $("metric-cards").innerHTML = [
    card("Похожесть рероллов одной натуры", f2(app.m.jaccard), `цель: не больше ${G.jaccard} · худшая: ${esc(app.m.jaccardWorst.nature)}, ${f2(app.m.jaccardWorst.value)}`, app.m.jaccard <= G.jaccard),
    card("Доля нажитого у человека", pct(app.m.lifeShare), `цель: не меньше ${pct(G.lifeShare)}`, app.m.lifeShare >= G.lifeShare),
    card("Натура угадывается по признакам", pct(app.m.signNn), `цель: не меньше ${pct(G.signNn)}`, app.m.signNn >= G.signNn),
    card("Натура угадывается по набору черт", pct(app.m.nn), `цель: ${pct(G.nnMin)}–${pct(G.nnMax)} — ниже черты случайны, выше шаблон`, app.m.nn >= G.nnMin && app.m.nn <= G.nnMax),
    card("Не выпали ни разу", String(app.m.never.length), app.m.never.length ? esc(app.m.never.join(", ")) : "цель: таких нет", !app.m.never.length),
    card("Самая частая обычная черта", pct(app.m.commonMax.share), `«${esc(app.m.commonMax.trait)}» · цель: не больше ${pct(G.commonShare)}`, app.m.commonMax.share <= G.commonShare),
    card("Наименьший разброс признака", f2(minSpread), `цель: не ниже ${G.signSpread}`, minSpread >= G.signSpread),
    card("Черт на человека", f1(app.m.traitsMean), `врождённых ${f1(app.m.kinds.born)} · нажитых ${f1(app.m.kinds.life)} · перков ${f1(app.m.kinds.perk)}`, null),
    card("В мешке", String(BAG.length), `${(["born", "life", "perk", "look"] as const).map((k) => `${KIND[k]} ${BAG.filter((t) => t.kind === k && !t.seneschal).length}`).join(" · ")}
      · Сенешаль ${BAG.filter((t) => t.seneschal).length}`, null),
  ].join("");
  const warns = naturaWarnings(app.m);
  $("warnings").innerHTML = warns.length ? warns.map((x) => `<div class="warn">⚠ ${esc(x)}</div>`).join("") : `<div class="fine">Предупреждений нет: цели выполнены.</div>`;
}

export function renderCharts() {
  const n = Math.max(1, app.people.length);
  const G = BALANCE.natura.goal;
  $("legend-kinds").innerHTML = (["born", "life", "perk"] as const).map((k) => `<span><span class="sw" style="background:var(--${k})"></span>${KIND[k]}</span>`).join("");
  // частота черт: две колонки, чтобы 84 строки не тянулись на три экрана
  // черты мешка Сенешаля людям не выпадают: в частотах их нет
  const rows = BAG.filter((t) => !t.seneschal).map((t) => ({ t, share: app.m.count[t.id] / n })).sort((a, b) => b.share - a.share);
  const top = Math.max(G.commonShare * 1.2, rows[0]?.share ?? 0);
  const goalMark = `<div class="mark" style="left:${(G.commonShare / top * 100).toFixed(1)}%"></div>`;
  const cell = (r: { t: BagTrait; share: number }) => `<div title="${esc(r.t.desc)}">${esc(r.t.name)}${RARITY[r.t.rarity]}</div>
    ${track(r.share / top, `var(--${r.t.kind})`, goalMark)}<div class="num${r.share ? "" : " zero"}">${pct(r.share)}</div>`;
  const half = Math.ceil(rows.length / 2);
  $("chart-traits").innerHTML = `<div class="bars cols2">${Array.from({ length: half }, (_, i) => cell(rows[i]) + (rows[i + half] ? cell(rows[i + half]) : "<div></div><div></div><div></div>")).join("")}</div>`;
  // виды
  const kmax = Math.max(app.m.kinds.born, app.m.kinds.life, app.m.kinds.perk, 1);
  $("chart-kinds").innerHTML = `<div class="bars">${(["born", "life", "perk"] as const)
    .map((k) => `<div>${KIND[k]}</div>${track(app.m.kinds[k] / kmax, `var(--${k})`)}<div class="num">${f2(app.m.kinds[k])}</div>`).join("")}</div>`;
  // натуры
  const band = `<div class="band" style="left:${G.nnMin * 100}%;width:${(G.nnMax - G.nnMin) * 100}%"></div>`;
  const jmark = `<div class="mark" style="left:${G.jaccard * 100}%"></div>`;
  $("chart-natures").innerHTML = `<div class="bars three"><div></div><div class="muted">похожесть рероллов</div><div></div>
    <div class="muted">угадывается по набору черт</div><div></div><div class="muted">угадывается по признакам</div><div></div>${NATURES.map((x) => {
    const r = app.m.perNature[x.id];
    const okNn = r.nn >= G.nnMin && r.nn <= G.nnMax;
    return `<div>${esc(x.name)}</div>${track(r.jaccard, r.jaccard <= G.jaccard ? "var(--born)" : "var(--bad)", jmark)}<div class="num">${f2(r.jaccard)}</div>
      ${track(r.nn, okNn ? "var(--good)" : "var(--perk)", band)}<div class="num">${pct(r.nn)}</div>
      ${track(r.signNn, r.signNn >= G.signNn ? "var(--good)" : "var(--bad)", `<div class="mark" style="left:${G.signNn * 100}%"></div>`)}<div class="num">${pct(r.signNn)}</div>`;
  }).join("")}</div>`;
  // тепловые карты
  const byNature = (x: NatureDef) => app.people.filter((p) => p.nature === x);
  const signCell = (x: NatureDef, s: Sign) => {
    const v = mean(byNature(x).map((p) => p.signs[s]));
    const color = v >= 0 ? `rgba(201,84,60,${(Math.abs(v) / 5).toFixed(2)})` : `rgba(63,111,176,${(Math.abs(v) / 5).toFixed(2)})`;
    return `<td class="c${x.core[s] ? " core" : ""}" style="background:${color}">${f1(v)}</td>`;
  };
  $("heat-signs").innerHTML = `<table class="heat"><tr><th>Натура</th>${SIGNS.map((s) => `<th title="минус: ${esc(s.minus)}">${esc(s.plus)}</th>`).join("")}</tr>
    ${NATURES.map((x) => `<tr><td>${esc(x.name)}</td>${SIGNS.map((s) => signCell(x, s.id)).join("")}</tr>`).join("")}</table>`;
  const axisCell = (x: NatureDef, a: Axis) => {
    const v = mean(byNature(x).map((p) => p.star[a]));
    return `<td class="c" style="background:rgba(${AXIS_RGB[a]},${Math.max(0, Math.min(1, (v - 2) / 7)).toFixed(2)})">${f1(v)}</td>`;
  };
  $("heat-axes").innerHTML = `<table class="heat"><tr><th>Натура</th>${AXES.map((a) => `<th>${AXIS_NAMES[a]}</th>`).join("")}</tr>
    ${NATURES.map((x) => `<tr><td>${esc(x.name)}</td>${AXES.map((a) => axisCell(x, a)).join("")}</tr>`).join("")}</table>`;
  // деловые склонности
  $("chart-axes").innerHTML = `<div class="bars two">${AXES.map((a) => {
    const x = app.m.axes[a], now = app.m.axesNow[a];
    return `<div><b>${AXIS_NAMES[a]}</b> из признаков</div>${track(x.mean / 10, `var(--axis-${a})`)}<div class="num">${f1(x.mean)} ± ${f1(x.spread)}, ведущая у ${pct(x.top)}</div>
      ${track(now.mean / 10, "#b9b2a2")}<div class="num">сейчас ${f1(now.mean)} ± ${f1(now.spread)}, у ${pct(now.top)}</div>`;
  }).join("")}</div>`;
}
