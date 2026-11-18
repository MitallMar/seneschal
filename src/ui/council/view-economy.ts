// Вкладка «Хозяйство и подать»: категории и ведомость, урок и способы платить, курс, стороны, сводка года.
import { AXIS_NAMES, POSTS } from "../../data/core";
import { SIDES, SIDE_NAMES, SIDE_GIVES, CATEGORIES, CATEGORY_NAMES, CATEGORY_UNIT, COURSES } from "../../data/economy";
import type { Category, CourseId, PayId, Stock } from "../../data/types";
import { BALANCE as B } from "../../sim/balance";
import { zoneOf, patienceWord, seasonKind } from "../../sim/economy/zones";
import { handsNow, fieldHands, planSeason } from "../../sim/economy/plan";
import { forecastFork, ledgerOf, elderRel } from "../../sim/economy/view";
import { payOptions, payTax, taxLeft } from "../../sim/economy/pay";
import { setCourse, setFloor, doer } from "../../sim/economy/doer";
import type { LedgerLine } from "../../sim/state";
import { relWord } from "../../sim/council/know";
import { $, esc } from "../dom";
import { app, SEASONS, seasonLabel, fmt, signed } from "./app";

const BAR_MAX: Record<Category, number> = { lyudi: 8, eda: 8, tovary: 4, serebro: 8 };

function ledgerLine(l: LedgerLine): string {
  const meta = [l.side ? SIDE_NAMES[l.side] : "", l.who ?? "", l.how ?? ""].filter(Boolean).join(" · ");
  const v = l.v ? `<span class="lv ${l.v > 0 ? "pos" : "neg"}">${signed(l.v)}</span>` : `<span class="lv"></span>`;
  return `<div class="ll${l.hidden ? " hidden-line" : ""}">${v}<span class="lt">${esc(l.text)}${l.hidden ? " (спрятано от Сенешаля)" : ""}</span><span class="lm">${esc(meta)}</span></div>`;
}

// Ведомость категории: прошлый сезон построчно — источник, сторона, ответственный и как исполнял.
function ledgerHtml(cat: Category): string {
  const l = app.w.eco.last;
  if (!l) return `<div class="ledger"><b>${CATEGORY_NAMES[cat]}</b><p>Ведомость появится после первого сезона.</p></div>`;
  const { lines, mismatch } = ledgerOf(l, cat, app.designer);
  const head = cat === "lyudi" ? `${CATEGORY_NAMES[cat]}: ${seasonLabel(l.season)}`
    : `${CATEGORY_NAMES[cat]}: было ${fmt(l.before[cat])} → стало ${fmt(l.after[cat])} · ${seasonLabel(l.season)}`;
  const floor = cat === "eda" || cat === "serebro" ? `<div class="lfoot">нижняя черта: ${fmt(app.w.eco.floor[cat])}</div>` : "";
  const odd = mismatch ? `<div class="lfoot mismatch">Счёт не сходится: чего-то недостаёт. Повод разобраться лично.</div>` : "";
  return `<div class="ledger"><b>${head}</b>${lines.map(ledgerLine).join("") || "<p>Движения не было.</p>"}${odd}${floor}</div>`;
}

function renderCats() {
  const forks = forecastFork(app.w), hands = fieldHands(app.w), plan = app.designer ? planSeason(app.w) : undefined;
  $("eco-cats").innerHTML = CATEGORIES.map((cat) => {
    const v = cat === "lyudi" ? hands.total : app.w.eco.stock[cat];
    const fill = Math.min(100, (v / BAR_MAX[cat]) * 100);
    let note: string, mark = "";
    if (cat === "lyudi") {
      const h = handsNow(app.w);
      note = seasonKind(app.w.season) === 3 ? `зима: поле стоит, свободно ${fmt(hands.free)}`
        : `в поле ${fmt(hands.field)} из ${fmt(B.economy.hands.field)}${hands.build ? `, стройка ${fmt(hands.build)}` : ""}`;
      note += ` · брод ${fmt(h.brod)}, опушка ${fmt(h.opushka)}, замок ${fmt(h.zamok)}`;
    } else {
      const f = forks.find((x) => x.cat === cat)!;
      const who = f.counter ? `считает ${f.counter.name}` : "считать некому";
      note = `к концу сезона: <b class="fc-${f.word.replace(" ", "-")}">${f.word}</b> (от ${fmt(f.lo)} до ${fmt(f.hi)}) · ${who}`;
      if (plan) note += ` <small>по плану ${fmt(plan.stock[cat as Stock])}</small>`;
      if (cat !== "tovary") mark = `<i class="floor" style="left:${Math.min(100, (app.w.eco.floor[cat] / BAR_MAX[cat]) * 100)}%" title="нижняя черта"></i>`;
    }
    return `<div class="cat" data-cat="${cat}" tabindex="0">
      <div class="cat-head"><span class="cat-name">${CATEGORY_NAMES[cat]}</span><span class="cat-v">${fmt(v)}</span><span class="cat-unit">${CATEGORY_UNIT[cat]}</span></div>
      <div class="bar"><i class="fill" style="width:${fill}%"></i>${mark}</div>
      <div class="cat-note">${note}</div>
      ${ledgerHtml(cat)}
    </div>`;
  }).join("");
}

// Дорожка сезонов: три года окна, весной урок, осенью сборщица; прошедшие годы — закрыт урок или недоимка.
function renderTrack() {
  const t = app.w.eco.tax, year = Math.floor((app.w.season - 1) / 4), from = Math.floor(year / 3) * 3;
  const cells: string[] = [];
  for (let y = from; y < from + 3; y++) {
    for (let k = 0; k < 4; k++) {
      const n = y * 4 + k + 1, past = t.history.find((h) => h.year === y + 1);
      const cls = ["cell", n === app.w.season ? "now" : n < app.w.season ? "past" : ""];
      let mark = "";
      if (k === 0) mark = y + 1 === t.year ? `урок ${fmt(t.due)}` : past ? `урок ${fmt(past.due)}` : "урок";
      if (k === 2) {
        if (past) { mark = past.closed ? (past.early ? "✓ досрочно" : "✓ закрыт") : `✗ недоимка`; cls.push(past.closed ? "ok" : "fail"); }
        else mark = y + 1 === t.year ? `сборщица: ${fmt(t.paid)} из ${fmt(t.due)}` : "сборщица";
      }
      cells.push(`<div class="${cls.join(" ")}" data-season="${n}"><span class="cs">${SEASONS[k]}</span><span class="cm">${mark}</span></div>`);
    }
  }
  const years = [0, 1, 2].map((i) => `<div class="yr">год ${from + i + 1}</div>`).join("");
  $("eco-track").innerHTML = `<div class="yrs">${years}</div><div class="cells">${cells.join("")}</div>`;
}

let payPick: PayId = "serebro";

function renderTax() {
  const t = app.w.eco.tax, left = taxLeft(app.w), opts = payOptions(app.w);
  const trial = t.year <= B.economy.tax.trialYears ? " (испытание)" : "";
  const debt = app.w.eco.debts.length ? ` · долг купцам ${fmt(app.w.eco.debts.reduce((s, d) => s + d.sum, 0))}` : "";
  const patience = `Герцог <b class="pat-${patienceWord(t.patience).replace(" ", "-")}">${patienceWord(t.patience)}</b>${app.designer ? ` <small>${fmt(t.patience)}</small>` : ""}`;
  const head = `<div id="tax-line">Урок года${trial}: <b>${fmt(t.due)}</b> мер${t.carried ? ` (в том числе недоимка ${fmt(t.carried)})` : ""} · внесено <b>${fmt(t.paid)}</b>`
    + ` · осталось <b>${fmt(left)}</b> · ${patience}${debt}</div>`;
  const cur = opts.find((o) => o.def.id === payPick) ?? opts[0];
  const options = opts.map((o) => {
    const lim = o.blocked ? o.blocked : `до ${fmt(o.max)} мер`;
    return `<option value="${o.def.id}" ${o.def.id === cur.def.id ? "selected" : ""} ${o.max <= 0 ? "disabled" : ""}>${esc(o.def.name)} — ${fmt(o.rate)} за меру, ${lim}</option>`;
  }).join("");
  const form = left <= 0 ? `<p class="hint">Урок этого года закрыт${t.early ? " досрочно" : ""}.</p>` : `<div class="pay">
      <select id="pay-how">${options}</select>
      <input id="pay-n" type="number" min="0" step="0.1" max="${cur.max}" value="${Math.min(1, cur.max)}" title="сколько мер внести">
      <button id="pay-go" ${cur.max <= 0 ? "disabled" : ""}>Внести</button>
    </div>
    <p class="hint" id="pay-hurts">Чем: ${CATEGORY_NAMES[cur.def.what].toLowerCase()}, с кого: ${esc(cur.def.from)}. Больно ${esc(cur.def.hurts)}.</p>`;
  const auto = `<label class="chk"><input type="checkbox" id="pay-auto" ${app.w.eco.autoPay ? "checked" : ""}> осенью остаток закрывает совет: казной, потом амбаром, не ниже черт</label>`;
  $("eco-tax").innerHTML = head + form + auto;
  $("pay-auto").addEventListener("change", () => { app.w.eco.autoPay = ($("pay-auto") as HTMLInputElement).checked; });
  if (left <= 0) return;
  $("pay-how").addEventListener("change", () => { payPick = ($("pay-how") as HTMLSelectElement).value as PayId; renderTax(); });
  $("pay-go").addEventListener("click", () => { payTax(app.w, cur.def.id, Number(($("pay-n") as HTMLInputElement).value)); app.render(); });
}

function renderCourse() {
  const e = app.w.eco, c = COURSES.find((x) => x.id === e.course);
  const options = [`<option value="">как заведено (курса нет)</option>`]
    .concat(COURSES.map((x) => `<option value="${x.id}" ${x.id === e.course ? "selected" : ""}>${x.name}</option>`)).join("");
  const held = c ? (e.courseSeasons >= 1 ? `держится ${e.courseSeasons} сез. — действует сильнее` : "первый сезон") : "";
  const who = c ? [c.pro.length ? `совет чаще решает по: ${c.pro.map((a) => AXIS_NAMES[a]).join(", ")}` : "",
    c.contra.length ? `против: ${c.contra.map((a) => AXIS_NAMES[a]).join(", ")}` : ""].filter(Boolean).join("; ") : "";
  const doers = POSTS.map((d) => { const x = doer(app.w, d.id); return `${d.name}: ${x.note}${app.designer ? ` ×${fmt(x.mult)}${x.hand ? `, ${x.hand}` : ""}` : ""}`; }).join(" · ");
  $("eco-course").innerHTML = `<div class="pay"><select id="course">${options}</select></div>
    <p class="hint" id="course-desc">${c ? `${esc(c.desc)}. ${who}. ${held}${e.shaky ? " · <b>шатание</b>: курс сменили слишком быстро" : ""}` : "Совет решает мелкие дела по своим склонностям."}</p>
    <p class="hint" id="doers">Исполняют: ${doers}</p>
    <div class="floors">
      <label>Нижняя черта еды <input id="floor-eda" type="number" min="0" step="0.25" value="${e.floor.eda}"></label>
      <label>серебра <input id="floor-serebro" type="number" min="0" step="0.25" value="${e.floor.serebro}"></label>
      <label>Кормим первым <select id="feed"><option value="zamok" ${e.feedFirst === "zamok" ? "selected" : ""}>замок</option>
        <option value="derevni" ${e.feedFirst === "derevni" ? "selected" : ""}>деревни</option></select></label>
    </div>
    <p class="hint">Ниже черты совет сам не тратит; не хватило на прокорм — недодадут последнему в очереди, и он обидится.</p>`;
  $("course").addEventListener("change", () => { setCourse(app.w, (($("course") as HTMLSelectElement).value || null) as CourseId | null); app.render(); });
  for (const cat of ["eda", "serebro"] as const) {
    $(`floor-${cat}`).addEventListener("change", () => { setFloor(app.w, cat, Number(($(`floor-${cat}`) as HTMLInputElement).value)); app.render(); });
  }
  $("feed").addEventListener("change", () => { e.feedFirst = ($("feed") as HTMLSelectElement).value as "zamok" | "derevni"; app.render(); });
}

function renderSides() {
  const sides = SIDES.map((s) => {
    const z = zoneOf(app.w, s);
    const real = app.designer ? ` <small>${signed(app.w.factions[s])}</small>` : "";
    return `<div class="side" data-side="${s}" title="${esc(SIDE_GIVES[s])}"><span>${SIDE_NAMES[s]}</span><span class="zone zone-${z}">${z}${real}</span></div>`;
  }).join("");
  const elders = app.w.eco.elders.map((el) => {
    const r = elderRel(app.w, el);
    const word = r === undefined ? "тиуна нет" : `с тиуном ${relWord(r)}${app.designer ? ` (${signed(r)})` : ""}`;
    return `<div class="elder" data-elder="${el.side}">Староста ${el.side === "brod" ? "у брода" : "у опушки"}, ${esc(el.name)}: ${word}</div>`;
  }).join("");
  const order = `<div class="side"><span><i>Порядок</i></span><span class="zone">${signed(app.w.resources.poryadok)}</span></div>`;
  $("eco-sides").innerHTML = sides + order + elders;
}

export function renderEconomy() {
  renderCats();
  renderTrack();
  renderTax();
  renderCourse();
  renderSides();
}

export function renderYear() {
  const e = app.w.eco, forks = forecastFork(app.w), hands = fieldHands(app.w), plan = planSeason(app.w), t = e.tax;
  const rows = CATEGORIES.map((cat) => {
    if (cat === "lyudi") return `<tr data-cat="lyudi"><th>Люди</th><td>${fmt(hands.total)}</td><td>—</td><td>в поле ${fmt(hands.field)} из ${fmt(B.economy.hands.field)}</td></tr>`;
    const f = forks.find((x) => x.cat === cat)!;
    const last = e.last ? `${fmt(e.last.before[cat])} → ${fmt(e.last.after[cat])}` : "—";
    const exact = app.designer ? ` <small>план ${fmt(plan.stock[cat])}</small>` : "";
    return `<tr data-cat="${cat}"><th>${CATEGORY_NAMES[cat]}</th><td>${fmt(e.stock[cat])}</td><td>${last}</td>
      <td><span class="fc-${f.word.replace(" ", "-")}">${f.word}</span> ${fmt(f.lo)}–${fmt(f.hi)}${exact}</td></tr>`;
  }).join("");
  const zones = SIDES.filter((s) => zoneOf(app.w, s) !== "ладят").map((s) => `${SIDE_NAMES[s].toLowerCase()} — ${zoneOf(app.w, s)}`).join("; ");
  $("year").innerHTML = `<table class="year"><tr><th></th><th>сейчас</th><th>прошлый сезон</th><th>к концу сезона</th></tr>${rows}</table>
    <p class="hint" id="year-tax">Урок ${fmt(t.due)} мер, внесено ${fmt(t.paid)}, осталось ${fmt(taxLeft(app.w))} · Герцог ${patienceWord(t.patience)} · авторитет ${fmt(app.w.authority)}</p>
    <p class="hint" id="year-zones">Стороны: ${zones || "все ладят"}.</p>`;
}
