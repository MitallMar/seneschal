// Эмулятор натуры: страница, на которой видно всё наполнение генератора (признаки, натуры, мешок), прогон рероллов с графиками
// и ручки раздела natura. Правил не считает: зовёт src/sim/natura.ts и src/sim/natura-report.ts.
import type { Axis, Sign, SignVec, BagTrait, NatureDef, Star } from "../data/types";
import { AXES, AXIS_NAMES, POSTS, TRAITS, LIFE_TRAITS } from "../data/core";
import { SIGNS, NATURES, BAG } from "../data/natura";
import { BACKSTORY } from "../data/backstory";
import { BALANCE, KNOBS, getAt, setAt, resetBalance, type KnobInfo } from "../sim/balance";
import { growParty, rollPerson, bagTrait, cos, isFar, isContra, type NaturaPerson } from "../sim/natura";
import { rollAll, metricsOf, naturaWarnings, currentAxes, type NaturaMetrics } from "../sim/natura-report";
import { postAxisTable } from "../sim/axes-report";
import { HEALTH_TRAITS } from "../data/health";
import type { HealthTrait } from "../data/types";
import { Rng } from "../sim/rng";
import { birthHealth, makeFamily, liveThrough, krepostNow, healthTrait, SEASONS_IN_YEAR, WINTER, type Health, type SeasonState } from "../sim/health";
import { healthMetrics, healthWarnings, type HealthMetrics } from "../sim/health-report";
import { mean } from "../sim/util";
import { $, esc } from "./dom";

const val = (id: string) => ($(id) as HTMLInputElement | HTMLSelectElement).value;
const pct = (v: number) => `${Math.round(v * 100)}%`;
const f1 = (v: number) => v.toFixed(1).replace(".", ",");
const f2 = (v: number) => v.toFixed(2).replace(".", ",");
const KIND: Record<BagTrait["kind"], string> = { born: "врождённая", life: "нажитая", perk: "перк" };
const TRIGGER: Record<string, string> = { habit: "привычка", post: "должность", rel: "отношения", break: "перелом", deed: "поступок" };
const RARITY: Record<BagTrait["rarity"], string> = { common: "", rare: " ★", exceptional: " ★★" };
const AXIS_RGB: Record<Axis, string> = { dolg: "75,93,138", vygoda: "160,120,42", zabota: "78,125,74", derzost: "161,69,46", obychai: "107,79,134" };
const signDef = (id: Sign) => SIGNS.find((s) => s.id === id)!;

let people: NaturaPerson[] = [];
let m: NaturaMetrics;
let hm: HealthMetrics;
let shown: NaturaPerson | undefined; // человек из раздела «Один человек»: его же здоровье показано ниже
const axesNow = currentAxes(); // нынешняя звезда совета от ручек натуры не зависит: считаем один раз
let personRoll = 0;

// ---------- мелкие куски разметки ----------
const vecTags = (v: SignVec) => (Object.entries(v) as [Sign, number][])
  .map(([k, x]) => `<span class="tag ${x > 0 ? "plus" : "minus"}">${esc(x > 0 ? signDef(k).plus : signDef(k).minus)} ${Math.abs(x)}</span>`).join("");
const traitTag = (t: BagTrait, role = "") => {
  const title = `${t.desc}. ${t.effect}`;
  return `<span class="tag ${t.kind}" title="${esc(title)}">${esc(t.name)}${RARITY[t.rarity]}</span>${role ? `<span class="tag role">${role}</span>` : ""}`;
};
const roleOf = (p: NaturaPerson, id: string) => (id === p.contra ? "против натуры" : id === p.far ? "издалека" : p.inGame.includes(id) ? "в игре" : "");
// Текст события предыстории без подстановок рода: для подписи, откуда черта.
const storyText = (id: string) => (BACKSTORY.find((ev) => ev.id === id)?.text ?? "").replace(/\{name\}/g, "он").replace(/\{other\}/g, "другой").replace(/\{[^}]*\}/g, "");
const track = (share: number, color: string, extra = "") =>
  `<div class="track">${extra}<div class="fill" style="width:${Math.min(100, Math.max(0, share * 100)).toFixed(1)}%;background:${color}"></div></div>`;
const starLine = (s: Star) => AXES.map((a) => `<span style="color:var(--axis-${a})"><b>${AXIS_NAMES[a]}</b> ${f1(s[a])}</span>`).join(" · ");

// ---------- ручки ----------
const GROUPS: { title: string; open: boolean; has: (path: string) => boolean }[] = [
  { title: "Сколько черт и откуда", open: true, has: (p) => /^natura\.(innate|before|adultAge|eventList|lifeSteps|ageM|perkWeight)/.test(p) },
  { title: "Рост древа", open: true, has: (p) => /^natura\.[a-zA-Z]+$/.test(p) && !/innate|before|adultAge|eventList|lifeSteps|ageM|perkWeight|signSoft|coreScale|axisGain/.test(p) },
  { title: "Признаки и склонности", open: false, has: (p) => /^natura\.(signSoft|coreScale|axisGain)/.test(p) },
  { title: "Веса деловых склонностей", open: false, has: (p) => p.startsWith("natura.w.") },
  { title: "Поправки середины склонностей", open: false, has: (p) => p.startsWith("natura.shift.") },
  { title: "Цели отчёта о натуре", open: false, has: (p) => p.startsWith("natura.goal.") },
  { title: "Здоровье: рождение и семья", open: false, has: (p) => /^health\.(krepostMean|krepostSpread|bornChance|familyChance|inheritChance)/.test(p) },
  { title: "Здоровье: болезни и раны", open: false, has: (p) => /^health\.(ill|winterMult|krepostRisk|krepostDeath|hard|light|wound|incapAt)/.test(p) },
  { title: "Здоровье: старость", open: false, has: (p) => /^health\.(oldFrom|agingStep|ageTraitChance|elderFrom|lifeMax|ageDeathMax)/.test(p) },
  { title: "Здоровье: прогон", open: false, has: (p) => /^health\.(years|ageMin|ageMax|familySize)/.test(p) },
  { title: "Цели отчёта о здоровье", open: false, has: (p) => p.startsWith("health.goal.") },
];
const NATURA_KNOBS = KNOBS.filter((q) => q.path.startsWith("natura.") || q.path.startsWith("health."));
const knobId = (q: KnobInfo) => `k-${q.path.replace(/\./g, "-")}`;

function renderKnobs() {
  $("knobs").innerHTML = GROUPS.map((g) => {
    const rows = NATURA_KNOBS.filter((q) => g.has(q.path)).map((q) => {
      const v = getAt(q.path);
      const label = esc(q.label.replace(/^(Натура|Здоровье)(, отчёт|, цель)?: /, ""));
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
    card("Доля нажитого у человека", pct(m.lifeShare), `цель: не меньше ${pct(G.lifeShare)}`, m.lifeShare >= G.lifeShare),
    card("Натура угадывается по признакам", pct(m.signNn), `цель: не меньше ${pct(G.signNn)}`, m.signNn >= G.signNn),
    card("Натура угадывается по набору черт", pct(m.nn), `цель: ${pct(G.nnMin)}–${pct(G.nnMax)} — ниже черты случайны, выше шаблон`, m.nn >= G.nnMin && m.nn <= G.nnMax),
    card("Не выпали ни разу", String(m.never.length), m.never.length ? esc(m.never.join(", ")) : "цель: таких нет", !m.never.length),
    card("Самая частая обычная черта", pct(m.commonMax.share), `«${esc(m.commonMax.trait)}» · цель: не больше ${pct(G.commonShare)}`, m.commonMax.share <= G.commonShare),
    card("Наименьший разброс признака", f2(minSpread), `цель: не ниже ${G.signSpread}`, minSpread >= G.signSpread),
    card("Черт на человека", f1(m.traitsMean), `врождённых ${f1(m.kinds.born)} · нажитых ${f1(m.kinds.life)} · перков ${f1(m.kinds.perk)}`, null),
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
  $("chart-natures").innerHTML = `<div class="bars three"><div></div><div class="muted">похожесть рероллов</div><div></div>
    <div class="muted">угадывается по набору черт</div><div></div><div class="muted">угадывается по признакам</div><div></div>${NATURES.map((x) => {
    const r = m.perNature[x.id];
    const okNn = r.nn >= G.nnMin && r.nn <= G.nnMax;
    return `<div>${esc(x.name)}</div>${track(r.jaccard, r.jaccard <= G.jaccard ? "var(--born)" : "var(--bad)", jmark)}<div class="num">${f2(r.jaccard)}</div>
      ${track(r.nn, okNn ? "var(--good)" : "var(--perk)", band)}<div class="num">${pct(r.nn)}</div>
      ${track(r.signNn, r.signNn >= G.signNn ? "var(--good)" : "var(--bad)", `<div class="mark" style="left:${G.signNn * 100}%"></div>`)}<div class="num">${pct(r.signNn)}</div>`;
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
function traitBlock(p: NaturaPerson, t: BagTrait) {
  const origin = t.kind === "born" ? "врождённая" : p.inGame.includes(t.id) ? `в игре, повод — ${TRIGGER[t.trigger ?? ""]}` : `до игры: ${storyText(p.via[t.id])}`;
  return `<div class="trait">${traitTag(t)} ${vecTags(t.vec)}<small><b>${esc(origin)}</b></small><small>${esc(t.desc)}. ${esc(t.effect)}.</small></div>`;
}
function personHtml(p: NaturaPerson) {
  const grown = (anchor: string) => p.traits.filter((t) => p.from[t.id] === anchor && t.id !== p.contra);
  const has = (id: string) => p.traits.some((t) => t.id === id);
  const bush = (title: string, id: string) => `<div class="bush"><h4>${title}</h4>${has(id) ? traitBlock(p, bagTrait(id)) : ""}${grown(id).map((t) => traitBlock(p, t)).join("")}</div>`;
  const contra = p.contra && p.contra !== p.far && has(p.contra) ? `<div class="bush"><h4>Противоречие: против ядра</h4>${traitBlock(p, bagTrait(p.contra))}</div>` : "";
  const loose = p.traits.filter((t) => !p.anchors.includes(t.id) && t.id !== p.far && t.id !== p.contra && !p.from[t.id]);
  const rest = loose.length ? `<div class="bush"><h4>Само по себе: след события, к якорям не тянется</h4>${loose.map((t) => traitBlock(p, t)).join("")}</div>` : "";
  const lost = p.lost.length ? `<p class="muted">Вытеснено новыми чертами: ${p.lost.map((id) => esc(bagTrait(id).name)).join(", ")}</p>` : "";
  const signs = SIGNS.map((s) => {
    const v = p.signs[s.id], core = (p.nature.core[s.id] ?? 0) * BALANCE.natura.coreScale;
    const w = Math.abs(v) * 10, left = v >= 0 ? 50 : 50 - w;
    const coreMark = core ? `<div class="corem" style="left:calc(${50 + Math.max(-5, Math.min(5, core)) * 10}% - 1px)"></div>` : "";
    return `<div class="num">${esc(s.minus)}</div><div class="bi"><div class="fill" style="left:${left}%;width:${w}%;background:${v >= 0 ? "#c9543c" : "#3f6fb0"}"></div>${coreMark}</div>
      <div>${esc(s.plus)}</div><div class="num">${v > 0 ? "+" : ""}${f1(v)}</div>`;
  }).join("");
  const star = AXES.map((a) => `<div>${AXIS_NAMES[a]}</div>${track(p.star[a] / 10, `var(--axis-${a})`)}<div class="num">${f1(p.star[a])}</div>`).join("");
  const kinds = (["born", "life", "perk"] as const).map((k) => `${KIND[k]}: ${p.traits.filter((t) => t.kind === k).length}`).join(", ");
  return `<p><b>${esc(p.nature.name)}</b>, ${p.age} лет · ядро: ${vecTags(p.nature.core)} · черт: ${p.traits.length} (${kinds})</p>${lost}
    <div class="tree">${p.anchors.map((id, i) => bush(`Врождённый якорь ${i + 1} и его куст`, id)).join("")}${p.far ? bush("Дальний якорь (нажит) и его куст", p.far) : ""}${contra}${rest}</div>
    <div class="split"><div><h3>Признаки (чёрная метка — ядро)</h3><div class="bipolar">${signs}</div></div>
    <div><h3>Деловые склонности из признаков</h3><div class="bars">${star}</div></div></div>`;
}
function renderPerson() {
  const nature = NATURES.find((x) => x.id === val("nature")) ?? NATURES[0];
  const seed = `${val("seed")}-человек-${personRoll}`;
  const age = val("age") ? Number(val("age")) : undefined;
  shown = rollPerson(seed, nature, age);
  $("person-view").innerHTML = personHtml(shown);
  renderHealthPerson(seed);
  $("person-rerolls").innerHTML = Array.from({ length: 12 }, (_, i) => {
    const p = rollPerson(`${seed}-${i}`, nature, age);
    return `<div class="reroll"><span class="muted">${p.age} лет</span> ${p.traits.map((t) => traitTag(t, roleOf(p, t.id))).join("")}<div class="muted">${starLine(p.star)}</div></div>`;
  }).join("");
}
function renderParty() {
  const party = growParty(val("seed"), 10);
  $("party-view").innerHTML = `<table><tr><th>Натура</th><th>Возраст</th><th>Черты</th><th>Склонности</th></tr>${party
    .map((p) => `<tr><td><b>${esc(p.nature.name)}</b></td><td class="c">${p.age}</td><td>${p.traits.map((t) => traitTag(t, roleOf(p, t.id))).join("")}</td><td>${starLine(p.star)}</td></tr>`).join("")}</table>`;
}

// ---------- здоровье ----------
const H_ORIGIN: Record<HealthTrait["origin"], string> = { born: "врождённая", hereditary: "наследственная", gained: "нажитая" };
const healthTag = (id: string) => {
  const t = healthTrait(id);
  return `<span class="tag h-${t.origin}${t.good ? " h-good" : ""}" title="${esc(`${t.desc}. ${t.effect}`)}">${esc(t.name)}</span>`;
};
const strip = (states: SeasonState[]) => `<div class="strip">${states.map((x, i) => `<i class="${x}${i % SEASONS_IN_YEAR === WINTER ? " winter" : ""}" title="год ${Math.floor(i / SEASONS_IN_YEAR) + 1}"></i>`).join("")}</div>`;
const STRIP_LEGEND = `<div class="legend"><span><span class="sw" style="background:#cfe3c8"></span>служит</span><span><span class="sw" style="background:#e2b04a"></span>в постели</span>
  <span><span class="sw" style="background:#9a9a9a"></span>выбыл со службы</span><span><span class="sw" style="background:#24211c"></span>умер</span></div>`;
function liveStory(h: Health, age: number, seed: string) {
  const states: SeasonState[] = [];
  liveThrough(new Rng(seed), h, age, BALANCE.health.years * SEASONS_IN_YEAR, states);
  return states;
}
function renderHealthPerson(seed: string) {
  if (!shown) return;
  const rng = new Rng(`${seed}-здоровье`);
  const h = birthHealth(rng, makeFamily(rng, "семья"), shown.traits.map((t) => t.id));
  const before = [...h.traits], k0 = krepostNow(h, shown.age);
  const states = liveStory(h, shown.age, `${seed}-годы`);
  const vices = h.vices.length ? ` · сказываются черты натуры: ${h.vices.map((id) => esc(bagTrait(id).name)).join(", ")}` : "";
  const log = h.log.length ? h.log.map((e) => `<div>${e.age} лет, год ${Math.floor(e.season / SEASONS_IN_YEAR) + 1}: ${esc(e.text)}</div>`).join("") : `<div class="muted">За эти годы ничего не случилось.</div>`;
  $("health-person").innerHTML = `<p><b>${esc(shown.nature.name)}</b>, ${shown.age} лет · крепость при рождении ${f1(h.krepost)}, сейчас ${f1(k0)}, через ${BALANCE.health.years} лет ${f1(krepostNow(h, shown.age + BALANCE.health.years))}
    · с рождения: ${before.length ? before.map(healthTag).join("") : "здоров"}${vices}</p>${STRIP_LEGEND}${strip(states)}${log}`;
}
function svgCurve(curve: number[]) {
  const W = 560, Hh = 170, L = 34, B0 = 22, x = (i: number) => L + (i / (curve.length - 1)) * (W - L - 8), y = (v: number) => 8 + (1 - v) * (Hh - B0 - 8);
  const grid = [0, 0.25, 0.5, 0.75, 1].map((v) => `<line x1="${L}" x2="${W - 8}" y1="${y(v)}" y2="${y(v)}" stroke="#d9d3c4"/><text x="${L - 4}" y="${y(v) + 4}" text-anchor="end">${pct(v)}</text>`).join("");
  const ticks = curve.map((_, i) => (i % 5 === 0 ? `<text x="${x(i)}" y="${Hh - 6}" text-anchor="middle">${i}-й год</text>` : "")).join("");
  return `<svg class="plot" viewBox="0 0 ${W} ${Hh}">${grid}${ticks}<polyline fill="none" stroke="#3f7a3a" stroke-width="2.5" points="${curve.map((v, i) => `${x(i)},${y(v)}`).join(" ")}"/></svg>`;
}
function svgHist(hist: { age: number; share: number }[]) {
  const W = 560, Hh = 170, L = 34, B0 = 22, top = Math.max(...hist.map((b) => b.share), 0.01), bw = (W - L - 8) / hist.length;
  const y = (v: number) => 8 + (1 - v / top) * (Hh - B0 - 8);
  const color = (age: number) => (age >= BALANCE.health.elderFrom ? "#6b4f86" : age >= BALANCE.health.oldFrom ? "#c0892a" : "#4b6fa8");
  const bars = hist.map((b, i) => `<rect x="${L + i * bw + 1}" y="${y(b.share)}" width="${bw - 2}" height="${Hh - B0 - y(b.share)}" fill="${color(b.age)}"><title>${b.age}–${b.age + 10} лет: ${pct(b.share)}</title></rect>
    ${i % 2 === 0 ? `<text x="${L + i * bw + bw / 2}" y="${Hh - 6}" text-anchor="middle">${b.age}</text>` : ""}`).join("");
  return `<svg class="plot" viewBox="0 0 ${W} ${Hh}"><text x="${L - 4}" y="12" text-anchor="end">${pct(top)}</text>${bars}</svg>
    <div class="legend"><span><span class="sw" style="background:#4b6fa8"></span>зрелость</span><span><span class="sw" style="background:#c0892a"></span>старость</span><span><span class="sw" style="background:#6b4f86"></span>глубокая старость</span></div>`;
}
function renderHealth() {
  const G = BALANCE.health.goal, Hb = BALANCE.health;
  const card = (title: string, v: string, goal: string, ok: boolean | null) =>
    `<div class="card${ok === null ? " info" : ok ? "" : " bad"}"><div>${title}</div><div class="v">${v}</div><div class="goal">${goal}</div></div>`;
  $("health-cards").innerHTML = [
    card(`Выбыло за ${hm.years} лет`, pct(hm.removed), `цель: ${pct(G.removedMin)}–${pct(G.removedMax)} · из них умерло ${pct(hm.dead)}`, hm.removed >= G.removedMin && hm.removed <= G.removedMax),
    card("Из совета в пять человек", f1(hm.removed * 5), "выбывает за партию в среднем", null),
    card("Сезонов в постели", pct(hm.offShare), `цель: ${pct(G.offMin)}–${pct(G.offMax)} · слегали хотя бы раз ${pct(hm.sickEver)}`, hm.offShare >= G.offMin && hm.offShare <= G.offMax),
    card("Половина доживает до", `${hm.life.median} лет`, `цель: не меньше ${G.medianLife} · здоровые ${hm.life.medianHealthy}, с дурной чертой ${hm.life.medianBad}`, hm.life.median >= G.medianLife),
    card(`Доживают до ${Hb.elderFrom} лет`, pct(hm.life.reachElder), `цель: не меньше ${pct(G.reachElder)} · до ${Hb.lifeMax - 10} — ${pct(hm.life.reachMax)}`, hm.life.reachElder >= G.reachElder),
    card("Дурная черта с рождения", pct(hm.badBorn), `цель: ${pct(G.badBornMin)}–${pct(G.badBornMax)}`, hm.badBorn >= G.badBornMin && hm.badBorn <= G.badBornMax),
    card("Наследственная у родни носителя", pct(hm.kinShare.withKin), `в среднем у людей — ${pct(hm.kinShare.base)}`, null),
    card("Нажили черту здоровья", pct(hm.gained), `за ${hm.years} лет партии`, null),
  ].join("");
  const warns = healthWarnings(hm);
  $("health-warnings").innerHTML = warns.length ? warns.map((x) => `<div class="warn">⚠ ${esc(x)}</div>`).join("") : `<div class="fine">Предупреждений нет: цели выполнены.</div>`;
  $("chart-curve").innerHTML = svgCurve(hm.curve);
  $("chart-life").innerHTML = svgHist(hm.life.hist);
  const CAUSE: Record<string, [string, string]> = { "здоровье": ["выбыл по здоровью", "#9a9a9a"], "болезнь": ["умер от болезни", "#b03a26"], "рана": ["умер от раны", "#7c3a1d"], "старость": ["умер от старости", "#6b4f86"] };
  const cmax = Math.max(...Object.values(hm.causes), 0.01);
  $("chart-causes").innerHTML = `<div class="bars">${Object.entries(hm.causes).sort((a, b) => b[1] - a[1])
    .map(([key, v]) => `<div>${CAUSE[key][0]}</div>${track(v / cmax, CAUSE[key][1])}<div class="num">${(v * 100).toFixed(1)}%</div>`).join("")}</div>`;
  $("chart-byage").innerHTML = `<div class="bars">${hm.byAge.map((b) => `<div>${b.from}–${b.to} лет (${b.people} чел.)</div>${track(b.removed, "#c0892a")}<div class="num">${pct(b.removed)}</div>`).join("")}</div>`;
  // партия: те же десять человек, что в разделе «Партия», по семьям
  const party = growParty(val("seed"), 10), rng = new Rng(`${val("seed")}-семьи`);
  let family = makeFamily(rng, "1");
  $("health-party").innerHTML = `${STRIP_LEGEND}<table><tr><th>Семья</th><th>Натура</th><th>Возраст</th><th>Крепость</th><th>Здоровье с рождения</th><th>Двадцать лет</th><th>Нажито и чем кончилось</th></tr>${party.map((p, i) => {
    if (i % BALANCE.health.familySize === 0) family = makeFamily(rng, String(i / BALANCE.health.familySize + 1));
    const h = birthHealth(rng, family, p.traits.map((t) => t.id)), before = [...h.traits];
    const states = liveStory(h, p.age, `${val("seed")}-партия-${i}`);
    const end = h.state === "dead" ? `умер (${h.cause})` : h.state === "out" ? "выбыл со службы" : "служит";
    const fam = `${family.id}${family.hereditary.length ? ` · в роду: ${family.hereditary.map(healthTag).join("")}` : ""}`;
    return `<tr><td>${fam}</td><td><b>${esc(p.nature.name)}</b></td><td class="c">${p.age}</td><td class="c">${f1(h.krepost)}</td><td>${before.map(healthTag).join("") || "здоров"}</td>
      <td style="min-width:260px">${strip(states)}</td><td>${h.traits.filter((id) => !before.includes(id)).map(healthTag).join("")} ${end}</td></tr>`;
  }).join("")}</table>`;
  const mod = (t: HealthTrait) => [t.krepost ? `крепость ${t.krepost > 0 ? "+" : ""}${String(t.krepost).replace(".", ",")}` : "", t.risk ? `болеет ×${String(t.risk).replace(".", ",")}` : "",
    t.winter ? `зимой ×${String(t.winter).replace(".", ",")}` : "", t.death ? `смерть ×${String(t.death).replace(".", ",")}` : "", t.aging ? `старение ×${String(t.aging).replace(".", ",")}` : ""].filter(Boolean).join(", ");
  const CAUSES: Record<string, string> = { illness: "после болезни", wound: "после раны или надрыва", age: "со старостью" };
  $("table-health").innerHTML = `<table><tr><th>Черта</th><th>Происхождение</th><th>Что это</th><th>Поправки</th><th>Как скажется на службе</th><th>У скольких к концу партии</th></tr>${HEALTH_TRAITS
    .map((t) => `<tr><td>${healthTag(t.id)}</td><td>${H_ORIGIN[t.origin]}${t.cause ? `, ${CAUSES[t.cause]}` : ""}</td><td>${esc(t.desc)}</td><td>${mod(t)}</td><td>${esc(t.effect)}</td>
      <td class="c">${(hm.traitShare[t.id] * 100).toFixed(1)}%</td></tr>`).join("")}</table>`;
}

// ---------- таблицы ----------
function renderTables() {
  const n = Math.max(1, people.length);
  const born = BAG.filter((t) => t.kind === "born"), lifeBag = BAG.filter((t) => t.kind === "life");
  const names = (list?: string[]) => (list ?? []).map((id) => esc(bagTrait(id).name)).join(", ");
  // натуры
  $("table-natures").innerHTML = `<table><tr><th>Натура</th><th>Ядро</th><th>Точки кристаллизации: сколько врождённых черт у каждой</th>
    <th>Дальняя область (нажитых)</th><th>Против ядра (нажитых)</th><th>Чаще всего выпадает в прогоне</th><th>Ведущая склонность</th></tr>${NATURES.map((x) => {
    const own = people.filter((p) => p.nature === x);
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
  if (sort === "freq") bag = [...bag].sort((a, b) => m.count[b.id] - m.count[a.id]);
  if (sort === "name") bag = [...bag].sort((a, b) => a.name.localeCompare(b.name, "ru"));
  $("table-bag").innerHTML = `<table><tr><th>Черта</th><th>Вид</th><th>Вектор</th><th>Что это</th><th>Как действует</th><th>Повод в игре</th><th>Не уживается с</th><th>Вытесняет</th><th>Нужна одна из</th>
    <th>Выпадает</th><th>У каких натур чаще</th></tr>${bag.map((t) => {
    const conflicts = BAG.filter((x) => x.conflicts?.includes(t.id) || t.conflicts?.includes(x.id)).map((x) => esc(x.name)).join(", ");
    const at = NATURES.map((x) => ({ x, c: people.filter((p) => p.nature === x && p.traits.includes(t)).length })).filter((r) => r.c).sort((a, b) => b.c - a.c).slice(0, 3);
    const flags = `${t.hidden ? `<span class="tag role">скрытая</span>` : ""}${t.council ? `<span class="tag role">уже в совете</span>` : ""}`;
    return `<tr><td>${traitTag(t)}${flags}<br><span class="muted">${t.id}</span></td><td>${KIND[t.kind]}</td><td>${vecTags(t.vec)}</td>
      <td>${esc(t.desc)}</td><td>${esc(t.effect)}</td><td>${TRIGGER[t.trigger ?? ""] ?? ""}</td><td>${conflicts}</td><td>${names(t.replaces)}</td><td>${names(t.requires)}</td>
      <td class="c${m.count[t.id] ? "" : " zero"}">${pct(m.count[t.id] / n)}</td><td>${at.map((r) => esc(r.x.name)).join(", ")}</td></tr>`;
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
  hm = healthMetrics(1200, seed);
  $("state").textContent = `${rolls} рероллов, семя «${seed}»`;
  renderMetrics();
  renderCharts();
  renderPerson();
  renderParty();
  renderHealth();
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
$("age").addEventListener("change", renderPerson);
$("reroll").addEventListener("click", () => { personRoll++; renderPerson(); });
$("bag-kind").addEventListener("change", renderTables);
$("bag-sort").addEventListener("change", renderTables);
run();

// Для автопроверок в браузере (test/e2e/smoke.py, раздел natura).
declare global {
  interface Window { __emu: { run: () => void; setKnob: (path: string, v: number) => number; metrics: () => NaturaMetrics; health: () => HealthMetrics; people: () => number } }
}
window.__emu = {
  run,
  setKnob: (path, v) => { const got = setAt(path, v); renderKnobs(); run(); return got; },
  metrics: () => m,
  health: () => hm,
  people: () => people.length,
};
