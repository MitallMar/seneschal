// Эмулятор натуры: страница, на которой видно всё наполнение генератора (признаки, натуры, мешок), прогон рероллов с графиками
// и ручки раздела natura. Правил не считает: зовёт src/sim/natura.ts и src/sim/natura-report.ts.
import type { Axis, Sign, SignVec, BagTrait, NatureDef, Star } from "../data/types";
import { AXES, AXIS_NAMES, POSTS, TRAITS, LIFE_TRAITS } from "../data/core";
import { SIGNS, NATURES, BAG } from "../data/natura";
import { BALANCE, KNOBS, getAt, setAt, resetBalance, type KnobInfo } from "../sim/balance";
import { growParty, rollPerson, bagTrait, cos, isFar, isContra, type NaturaPerson } from "../sim/natura";
import { rollAll, metricsOf, naturaWarnings, currentAxes, type NaturaMetrics } from "../sim/natura-report";
import { postAxisTable } from "../sim/axes-report";

const $ = (id: string) => document.getElementById(id)!;
const val = (id: string) => ($(id) as HTMLInputElement | HTMLSelectElement).value;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
const pct = (v: number) => `${Math.round(v * 100)}%`;
const f1 = (v: number) => v.toFixed(1).replace(".", ",");
const f2 = (v: number) => v.toFixed(2).replace(".", ",");
const mean = (xs: number[]) => (xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : 0);
const KIND: Record<BagTrait["kind"], string> = { born: "рождение", life: "жизнь", perk: "перк" };
const RARITY: Record<BagTrait["rarity"], string> = { common: "", rare: " ★", exceptional: " ★★" };
const AXIS_RGB: Record<Axis, string> = { dolg: "75,93,138", vygoda: "160,120,42", zabota: "78,125,74", derzost: "161,69,46", obychai: "107,79,134" };
const signDef = (id: Sign) => SIGNS.find((s) => s.id === id)!;

let people: NaturaPerson[] = [];
let m: NaturaMetrics;
const axesNow = currentAxes(); // нынешняя звезда совета от ручек натуры не зависит: считаем один раз
let personRoll = 0;

// ---------- мелкие куски разметки ----------
const vecTags = (v: SignVec) => (Object.entries(v) as [Sign, number][])
  .map(([k, x]) => `<span class="tag ${x > 0 ? "plus" : "minus"}">${esc(x > 0 ? signDef(k).plus : signDef(k).minus)} ${Math.abs(x)}</span>`).join("");
const traitTag = (t: BagTrait, role = "") => {
  const title = `${t.desc}. ${t.effect}`;
  return `<span class="tag ${t.kind}" title="${esc(title)}">${esc(t.name)}${RARITY[t.rarity]}</span>${role ? `<span class="tag role">${role}</span>` : ""}`;
};
const roleOf = (p: NaturaPerson, id: string) => (id === p.contra ? "против натуры" : id === p.far ? "издалека" : p.anchors.includes(id) ? "якорь" : "");
const track = (share: number, color: string, extra = "") =>
  `<div class="track">${extra}<div class="fill" style="width:${Math.min(100, Math.max(0, share * 100)).toFixed(1)}%;background:${color}"></div></div>`;
const starLine = (s: Star) => AXES.map((a) => `<span style="color:var(--axis-${a})"><b>${AXIS_NAMES[a]}</b> ${f1(s[a])}</span>`).join(" · ");

// ---------- ручки ----------
const GROUPS: { title: string; open: boolean; has: (path: string) => boolean }[] = [
  { title: "Рост древа", open: true, has: (p) => p.split(".").length === 2 && !/lifeSteps|fate/.test(p) },
  { title: "Жизнь и судьба в прогоне", open: true, has: (p) => /lifeSteps|fate/.test(p) },
  { title: "Веса деловых склонностей", open: false, has: (p) => p.startsWith("natura.w.") },
  { title: "Поправки середины склонностей", open: false, has: (p) => p.startsWith("natura.shift.") },
  { title: "Цели отчёта", open: false, has: (p) => p.startsWith("natura.goal.") },
];
const NATURA_KNOBS = KNOBS.filter((q) => q.path.startsWith("natura."));
const knobId = (q: KnobInfo) => `k-${q.path.replace(/\./g, "-")}`;

function renderKnobs() {
  $("knobs").innerHTML = GROUPS.map((g) => {
    const rows = NATURA_KNOBS.filter((q) => g.has(q.path)).map((q) => {
      const v = getAt(q.path);
      const label = esc(q.label.replace(/^Натура(, отчёт|, цель)?: /, ""));
      return `<div class="knob${v !== q.def ? " changed" : ""}" id="${knobId(q)}" title="${q.path}">
        <div class="knob-label">${label}</div>
        <div class="knob-row">
          <input type="range" data-knob="${q.path}" min="${q.min}" max="${q.max}" step="${q.step}" value="${v}">
          <span class="knob-val">${v}</span><span class="knob-def">было ${q.def}</span>
        </div></div>`;
    }).join("");
    return `<details class="knob-group"${g.open ? " open" : ""}><summary>${g.title}</summary>${rows}</details>`;
  }).join("");
}
let timer: ReturnType<typeof setTimeout> | undefined;
function onKnob(path: string, raw: string) {
  const q = NATURA_KNOBS.find((x) => x.path === path)!;
  const v = setAt(path, Number(raw));
  const row = $(knobId(q));
  row.classList.toggle("changed", v !== q.def);
  row.querySelector(".knob-val")!.textContent = String(v);
  clearTimeout(timer);
  timer = setTimeout(run, 200);
}
function exportKnobs() {
  const changed = NATURA_KNOBS.filter((q) => getAt(q.path) !== q.def);
  const out = $("export-out") as HTMLTextAreaElement;
  out.hidden = false;
  out.value = changed.length ? changed.map((q) => `${q.path}: ${q.def} → ${getAt(q.path)}   // ${q.label}`).join("\n") : "Ручки не менялись.";
  out.select();
}

// ---------- метрики ----------
function renderMetrics() {
  const G = BALANCE.natura.goal;
  const minSpread = Math.min(...Object.values(m.signSpread));
  const card = (title: string, v: string, goal: string, ok: boolean | null) =>
    `<div class="card${ok === null ? " info" : ok ? "" : " bad"}"><div>${title}</div><div class="v">${v}</div><div class="goal">${goal}</div></div>`;
  $("metric-cards").innerHTML = [
    card("Похожесть рероллов одной натуры", f2(m.jaccard), `цель: не больше ${G.jaccard} · худшая: ${esc(m.jaccardWorst.nature)}, ${f2(m.jaccardWorst.value)}`, m.jaccard <= G.jaccard),
    card("Натура угадывается по чертам", pct(m.nn), `цель: ${pct(G.nnMin)}–${pct(G.nnMax)}`, m.nn >= G.nnMin && m.nn <= G.nnMax),
    card("Не выпали ни разу", String(m.never.length), m.never.length ? esc(m.never.join(", ")) : "цель: таких нет", !m.never.length),
    card("Самая частая обычная черта", pct(m.commonMax.share), `«${esc(m.commonMax.trait)}» · цель: не больше ${pct(G.commonShare)}`, m.commonMax.share <= G.commonShare),
    card("Наименьший разброс признака", f2(minSpread), `цель: не ниже ${G.signSpread}`, minSpread >= G.signSpread),
    card("Черт на человека", f1(m.traitsMean), `рождение ${f1(m.kinds.born)} · жизнь ${f1(m.kinds.life)} · перки ${f1(m.kinds.perk)}`, null),
    card("В мешке", String(BAG.length), (["born", "life", "perk"] as const).map((k) => `${KIND[k]} ${BAG.filter((t) => t.kind === k).length}`).join(" · "), null),
  ].join("");
  const warns = naturaWarnings(m);
  $("warnings").innerHTML = warns.length ? warns.map((x) => `<div class="warn">⚠ ${esc(x)}</div>`).join("") : `<div class="fine">Предупреждений нет: цели выполнены.</div>`;
}

// ---------- графики ----------
function renderCharts() {
  const n = Math.max(1, people.length);
  const G = BALANCE.natura.goal;
  $("legend-kinds").innerHTML = (["born", "life", "perk"] as const).map((k) => `<span><span class="sw" style="background:var(--${k})"></span>${KIND[k]}</span>`).join("");
  // частота черт: две колонки, чтобы 84 строки не тянулись на три экрана
  const rows = BAG.map((t) => ({ t, share: m.count[t.id] / n })).sort((a, b) => b.share - a.share);
  const top = Math.max(G.commonShare * 1.2, rows[0]?.share ?? 0);
  const goalMark = `<div class="mark" style="left:${(G.commonShare / top * 100).toFixed(1)}%"></div>`;
  const cell = (r: { t: BagTrait; share: number }) => `<div title="${esc(r.t.desc)}">${esc(r.t.name)}${RARITY[r.t.rarity]}</div>
    ${track(r.share / top, `var(--${r.t.kind})`, goalMark)}<div class="num${r.share ? "" : " zero"}">${pct(r.share)}</div>`;
  const half = Math.ceil(rows.length / 2);
  $("chart-traits").innerHTML = `<div class="bars cols2">${Array.from({ length: half }, (_, i) => cell(rows[i]) + (rows[i + half] ? cell(rows[i + half]) : "<div></div><div></div><div></div>")).join("")}</div>`;
  // виды
  const kmax = Math.max(m.kinds.born, m.kinds.life, m.kinds.perk, 1);
  $("chart-kinds").innerHTML = `<div class="bars">${(["born", "life", "perk"] as const)
    .map((k) => `<div>${KIND[k]}</div>${track(m.kinds[k] / kmax, `var(--${k})`)}<div class="num">${f2(m.kinds[k])}</div>`).join("")}</div>`;
  // натуры
  const band = `<div class="band" style="left:${G.nnMin * 100}%;width:${(G.nnMax - G.nnMin) * 100}%"></div>`;
  const jmark = `<div class="mark" style="left:${G.jaccard * 100}%"></div>`;
  $("chart-natures").innerHTML = `<div class="bars two">${NATURES.map((x) => {
    const r = m.perNature[x.id];
    const okNn = r.nn >= G.nnMin && r.nn <= G.nnMax;
    return `<div>${esc(x.name)}</div>${track(r.jaccard, r.jaccard <= G.jaccard ? "var(--born)" : "var(--bad)", jmark)}<div class="num">${f2(r.jaccard)}</div>
      ${track(r.nn, okNn ? "var(--good)" : "var(--perk)", band)}<div class="num">${pct(r.nn)}</div>`;
  }).join("")}</div>`;
  // тепловые карты
  const byNature = (x: NatureDef) => people.filter((p) => p.nature === x);
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
    const x = m.axes[a], now = m.axesNow[a];
    return `<div><b>${AXIS_NAMES[a]}</b> из признаков</div>${track(x.mean / 10, `var(--axis-${a})`)}<div class="num">${f1(x.mean)} ± ${f1(x.spread)}, ведущая у ${pct(x.top)}</div>
      ${track(now.mean / 10, "#b9b2a2")}<div class="num">сейчас ${f1(now.mean)} ± ${f1(now.spread)}, у ${pct(now.top)}</div>`;
  }).join("")}</div>`;
}

// ---------- один человек ----------
function traitBlock(t: BagTrait, role = "") {
  return `<div class="trait">${traitTag(t, role)} ${vecTags(t.vec)}<small>${esc(t.desc)}. ${esc(t.effect)}.</small></div>`;
}
function personHtml(p: NaturaPerson) {
  const grown = (anchor: string) => p.traits.filter((t) => p.from[t.id] === anchor && t.id !== p.contra);
  const bush = (title: string, id: string) => `<div class="bush"><h4>${title}</h4>${traitBlock(bagTrait(id))}${grown(id).map((t) => traitBlock(t, t.kind === "born" ? "" : KIND[t.kind])).join("")}</div>`;
  const contra = p.contra && p.contra !== p.far ? `<div class="bush"><h4>Противоречие: против ядра</h4>${traitBlock(bagTrait(p.contra))}</div>` : "";
  const signs = SIGNS.map((s) => {
    const v = p.signs[s.id], core = (p.nature.core[s.id] ?? 0) * BALANCE.natura.coreScale;
    const w = Math.abs(v) * 10, left = v >= 0 ? 50 : 50 - w;
    const coreMark = core ? `<div class="corem" style="left:calc(${50 + Math.max(-5, Math.min(5, core)) * 10}% - 1px)"></div>` : "";
    return `<div class="num">${esc(s.minus)}</div><div class="bi"><div class="fill" style="left:${left}%;width:${w}%;background:${v >= 0 ? "#c9543c" : "#3f6fb0"}"></div>${coreMark}</div>
      <div>${esc(s.plus)}</div><div class="num">${v > 0 ? "+" : ""}${f1(v)}</div>`;
  }).join("");
  const star = AXES.map((a) => `<div>${AXIS_NAMES[a]}</div>${track(p.star[a] / 10, `var(--axis-${a})`)}<div class="num">${f1(p.star[a])}</div>`).join("");
  const events = p.events.length ? `<p class="muted">Судьба тянула к: ${p.events.map(vecTags).join(" ")}</p>` : "";
  return `<p><b>${esc(p.nature.name)}</b> · ядро: ${vecTags(p.nature.core)} · черт: ${p.traits.length}</p>${events}
    <div class="tree">${p.anchors.map((id, i) => bush(`Якорь ядра ${i + 1} и его куст`, id)).join("")}${p.far ? bush("Дальний якорь и его куст", p.far) : ""}${contra}</div>
    <div class="split"><div><h3>Признаки (чёрная метка — ядро)</h3><div class="bipolar">${signs}</div></div>
    <div><h3>Деловые склонности из признаков</h3><div class="bars">${star}</div></div></div>`;
}
function renderPerson() {
  const nature = NATURES.find((x) => x.id === val("nature")) ?? NATURES[0];
  const seed = `${val("seed")}-человек-${personRoll}`;
  $("person-view").innerHTML = personHtml(rollPerson(seed, nature));
  $("person-rerolls").innerHTML = Array.from({ length: 12 }, (_, i) => {
    const p = rollPerson(`${seed}-${i}`, nature);
    return `<div class="reroll">${p.traits.map((t) => traitTag(t, roleOf(p, t.id))).join("")}<div class="muted">${starLine(p.star)}</div></div>`;
  }).join("");
}
function renderParty() {
  const party = growParty(val("seed"), 10);
  $("party-view").innerHTML = `<table><tr><th>Натура</th><th>Черты</th><th>Склонности</th></tr>${party
    .map((p) => `<tr><td><b>${esc(p.nature.name)}</b></td><td>${p.traits.map((t) => traitTag(t, roleOf(p, t.id))).join("")}</td><td>${starLine(p.star)}</td></tr>`).join("")}</table>`;
}

// ---------- таблицы ----------
function renderTables() {
  const n = Math.max(1, people.length);
  const born = BAG.filter((t) => t.kind === "born");
  const names = (list?: string[]) => (list ?? []).map((id) => esc(bagTrait(id).name)).join(", ");
  // натуры
  $("table-natures").innerHTML = `<table><tr><th>Натура</th><th>Ядро</th><th>Точки кристаллизации: сколько черт рождения у каждой</th>
    <th>Дальняя область</th><th>Против ядра</th><th>Чаще всего выпадает в прогоне</th><th>Ведущая склонность</th></tr>${NATURES.map((x) => {
    const own = people.filter((p) => p.nature === x);
    const freq = BAG.map((t) => ({ t, share: own.filter((p) => p.traits.includes(t)).length / Math.max(1, own.length) })).sort((a, b) => b.share - a.share).slice(0, 6);
    const crystals = x.crystals.map((c) => `${vecTags(c)} ${born.filter((t) => cos(t.vec, c) > 0).length}`).join(" ");
    const topAxis = AXES.reduce((best, a) => (mean(own.map((p) => p.star[a])) > mean(own.map((p) => p.star[best])) ? a : best), AXES[0]);
    return `<tr><td><b>${esc(x.name)}</b><br><span class="muted">${x.id}</span></td><td>${vecTags(x.core)}</td><td>${crystals}</td>
      <td class="c">${born.filter((t) => isFar(x, t)).length}</td><td class="c">${born.filter((t) => isContra(x, t)).length}</td>
      <td>${freq.map((r) => `${traitTag(r.t)} ${pct(r.share)}`).join(" ")}</td><td>${AXIS_NAMES[topAxis]} ${f1(mean(own.map((p) => p.star[topAxis])))}</td></tr>`;
  }).join("")}</table>`;
  // мешок
  const kind = val("bag-kind"), sort = val("bag-sort");
  let bag = BAG.filter((t) => !kind || t.kind === kind);
  if (sort === "freq") bag = [...bag].sort((a, b) => m.count[b.id] - m.count[a.id]);
  if (sort === "name") bag = [...bag].sort((a, b) => a.name.localeCompare(b.name, "ru"));
  $("table-bag").innerHTML = `<table><tr><th>Черта</th><th>Вид</th><th>Вектор</th><th>Что это</th><th>Как действует</th><th>Не уживается с</th><th>Нужна одна из</th>
    <th>Выпадает</th><th>У каких натур чаще</th></tr>${bag.map((t) => {
    const conflicts = BAG.filter((x) => x.conflicts?.includes(t.id) || t.conflicts?.includes(x.id)).map((x) => esc(x.name)).join(", ");
    const at = NATURES.map((x) => ({ x, c: people.filter((p) => p.nature === x && p.traits.includes(t)).length })).filter((r) => r.c).sort((a, b) => b.c - a.c).slice(0, 3);
    return `<tr><td>${traitTag(t)}${t.hidden ? `<span class="tag role">скрытая</span>` : ""}<br><span class="muted">${t.id}</span></td><td>${KIND[t.kind]}</td><td>${vecTags(t.vec)}</td>
      <td>${esc(t.desc)}</td><td>${esc(t.effect)}</td><td>${conflicts}</td><td>${names(t.requires)}</td>
      <td class="c${m.count[t.id] ? "" : " zero"}">${pct(m.count[t.id] / n)}</td><td>${at.map((r) => esc(r.x.name)).join(", ")}</td></tr>`;
  }).join("")}</table>`;
  // признаки
  const w = BALANCE.natura.w as Record<Axis, SignVec>;
  const poleCount = (s: Sign, dir: number, k: BagTrait["kind"]) => BAG.filter((t) => t.kind === k && (t.vec[s] ?? 0) * dir > 0).length;
  const poles = (s: Sign, dir: number) => `${poleCount(s, dir, "born")} / ${poleCount(s, dir, "life")} / ${poleCount(s, dir, "perk")}`;
  $("table-signs").innerHTML = `<table><tr><th>Признак</th><th>Плюс</th><th>Минус</th><th>Черт у плюса<br>рожд. / жизнь / перки</th><th>Черт у минуса</th>
    <th>Натур с плюсом в ядре</th><th>Натур с минусом</th>${AXES.map((a) => `<th>вес в ${AXIS_NAMES[a]}</th>`).join("")}</tr>${SIGNS.map((s) => `<tr>
    <td class="muted">${s.id}</td><td>${esc(s.plus)}</td><td>${esc(s.minus)}</td><td class="c">${poles(s.id, 1)}</td><td class="c">${poles(s.id, -1)}</td>
    <td class="c">${NATURES.filter((x) => (x.core[s.id] ?? 0) > 0).length}</td><td class="c">${NATURES.filter((x) => (x.core[s.id] ?? 0) < 0).length}</td>
    ${AXES.map((a) => `<td class="c">${w[a][s.id] ? (w[a][s.id]! > 0 ? "+" : "") + String(w[a][s.id]).replace(".", ",") : ""}</td>`).join("")}</tr>`).join("")}</table>`;
}
function renderCouncil() {
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

// ---------- прогон ----------
function run() {
  const rolls = Number(val("rolls")), seed = val("seed").trim() || "натура";
  people = rollAll(rolls, seed);
  m = metricsOf(people, axesNow);
  $("state").textContent = `${rolls} рероллов, семя «${seed}»`;
  renderMetrics();
  renderCharts();
  renderPerson();
  renderParty();
  renderTables();
}

$("nature").innerHTML = NATURES.map((x) => `<option value="${x.id}">${esc(x.name)}</option>`).join("");
renderKnobs();
renderCouncil();
$("knobs").addEventListener("input", (e) => {
  const el = e.target as HTMLInputElement;
  if (el.dataset.knob) onKnob(el.dataset.knob, el.value);
});
$("run").addEventListener("click", run);
$("rolls").addEventListener("change", run);
$("seed").addEventListener("change", run);
$("reset").addEventListener("click", () => { resetBalance(); renderKnobs(); run(); });
$("export").addEventListener("click", exportKnobs);
$("nature").addEventListener("change", () => { personRoll = 0; renderPerson(); });
$("reroll").addEventListener("click", () => { personRoll++; renderPerson(); });
$("bag-kind").addEventListener("change", renderTables);
$("bag-sort").addEventListener("change", renderTables);
run();

// Для автопроверок в браузере (test/e2e/smoke.py, раздел natura).
declare global { interface Window { __emu: { run: () => void; setKnob: (path: string, v: number) => number; metrics: () => NaturaMetrics; people: () => number } } }
window.__emu = {
  run,
  setKnob: (path, v) => { const got = setAt(path, v); renderKnobs(); run(); return got; },
  metrics: () => m,
  people: () => people.length,
};
