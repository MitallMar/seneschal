// Панели эмулятора натуры о здоровье: здоровье человека из раздела «Один человек» и его двадцать лет, метрики, графики, семьи, таблица черт здоровья.
import { BALANCE } from "../../sim/balance";
import { growParty, bagTrait } from "../../sim/natura";
import { HEALTH_TRAITS } from "../../data/health";
import type { HealthTrait } from "../../data/types";
import { Rng } from "../../sim/rng";
import { birthHealth, makeFamily, liveThrough, krepostNow, healthTrait, SEASONS_IN_YEAR, WINTER, type Health, type SeasonState } from "../../sim/health";
import { healthWarnings } from "../../sim/health-report";
import { $, esc } from "../dom";
import { app, val, pct, f1, track } from "./app";

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
  const seasons = BALANCE.health.years * SEASONS_IN_YEAR;
  liveThrough(new Rng(seed), h, age, seasons, states);
  while (states.length < seasons) states.push("dead");   // умер раньше срока: лента дорисовывается до конца партии
  return states;
}
export function renderHealthPerson(seed: string) {
  if (!app.shown) return;
  const rng = new Rng(`${seed}-здоровье`);
  const h = birthHealth(rng, makeFamily(rng, "семья"), app.shown.traits.map((t) => t.id));
  const before = [...h.traits], k0 = krepostNow(h, app.shown.age);
  const states = liveStory(h, app.shown.age, `${seed}-годы`);
  const vices = h.vices.length ? ` · сказываются черты натуры: ${h.vices.map((id) => esc(bagTrait(id).name)).join(", ")}` : "";
  const log = h.log.length ? h.log.map((e) => `<div>${e.age} лет, год ${Math.floor(e.season / SEASONS_IN_YEAR) + 1}: ${esc(e.text)}</div>`).join("") : `<div class="muted">За эти годы ничего не случилось.</div>`;
  $("health-person").innerHTML = `<p><b>${esc(app.shown.nature.name)}</b>, ${app.shown.age} лет · крепость при рождении ${f1(h.krepost)}, сейчас ${f1(k0)}, через ${BALANCE.health.years} лет ${f1(krepostNow(h, app.shown.age + BALANCE.health.years))}
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
export function renderHealth() {
  const G = BALANCE.health.goal, Hb = BALANCE.health;
  const card = (title: string, v: string, goal: string, ok: boolean | null) =>
    `<div class="card${ok === null ? " info" : ok ? "" : " bad"}"><div>${title}</div><div class="v">${v}</div><div class="goal">${goal}</div></div>`;
  $("health-cards").innerHTML = [
    card(`Выбыло за ${app.hm.years} лет`, pct(app.hm.removed), `цель: ${pct(G.removedMin)}–${pct(G.removedMax)} · из них умерло ${pct(app.hm.dead)}`, app.hm.removed >= G.removedMin && app.hm.removed <= G.removedMax),
    card("Из совета в пять человек", f1(app.hm.removed * 5), "выбывает за партию в среднем", null),
    card("Сезонов в постели", pct(app.hm.offShare), `цель: ${pct(G.offMin)}–${pct(G.offMax)} · слегали хотя бы раз ${pct(app.hm.sickEver)}`, app.hm.offShare >= G.offMin && app.hm.offShare <= G.offMax),
    card("Половина доживает до", `${app.hm.life.median} лет`, `цель: не меньше ${G.medianLife} · здоровые ${app.hm.life.medianHealthy}, с дурной чертой ${app.hm.life.medianBad}`, app.hm.life.median >= G.medianLife),
    card(`Доживают до ${Hb.elderFrom} лет`, pct(app.hm.life.reachElder), `цель: не меньше ${pct(G.reachElder)}`, app.hm.life.reachElder >= G.reachElder),
    card(`Доживают до ${G.lateAge} лет`, pct(app.hm.life.reachLate), `цель: не больше ${pct(G.lateMax)} · предел жизни ${Hb.lifeMax}`, app.hm.life.reachLate <= G.lateMax),
    card("Дурная черта с рождения", pct(app.hm.badBorn), `цель: ${pct(G.badBornMin)}–${pct(G.badBornMax)}`, app.hm.badBorn >= G.badBornMin && app.hm.badBorn <= G.badBornMax),
    card("Наследственная у родни носителя", pct(app.hm.kinShare.withKin), `в среднем у людей — ${pct(app.hm.kinShare.base)}`, null),
    card("Нажили черту здоровья", pct(app.hm.gained), `за ${app.hm.years} лет партии`, null),
  ].join("");
  const warns = healthWarnings(app.hm);
  $("health-warnings").innerHTML = warns.length ? warns.map((x) => `<div class="warn">⚠ ${esc(x)}</div>`).join("") : `<div class="fine">Предупреждений нет: цели выполнены.</div>`;
  $("chart-curve").innerHTML = svgCurve(app.hm.curve);
  $("chart-life").innerHTML = svgHist(app.hm.life.hist);
  const CAUSE: Record<string, [string, string]> = { "здоровье": ["выбыл по здоровью", "#9a9a9a"], "болезнь": ["умер от болезни", "#b03a26"], "рана": ["умер от раны", "#7c3a1d"], "старость": ["умер от старости", "#6b4f86"] };
  const cmax = Math.max(...Object.values(app.hm.causes), 0.01);
  $("chart-causes").innerHTML = `<div class="bars">${Object.entries(app.hm.causes).sort((a, b) => b[1] - a[1])
    .map(([key, v]) => `<div>${CAUSE[key][0]}</div>${track(v / cmax, CAUSE[key][1])}<div class="num">${(v * 100).toFixed(1)}%</div>`).join("")}</div>`;
  $("chart-byage").innerHTML = `<div class="bars">${app.hm.byAge.map((b) => `<div>${b.from}–${b.to} лет (${b.people} чел.)</div>${track(b.removed, "#c0892a")}<div class="num">${pct(b.removed)}</div>`).join("")}</div>`;
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
      <td class="c">${(app.hm.traitShare[t.id] * 100).toFixed(1)}%</td></tr>`).join("")}</table>`;
}
