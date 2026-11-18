import { AXES, AXIS_NAMES, POSTS, FACTION_NAMES, RESOURCE_NAMES } from "../data/core";
import { SIDES, SIDE_NAMES, SIDE_GIVES, CATEGORIES, CATEGORY_NAMES, CATEGORY_UNIT, COURSES, SEASON_NAMES } from "../data/economy";
import type { Axis, PostId, Star, Effect, Category, CourseId, PayId, Stock } from "../data/types";
import { BALANCE as B, KNOBS, getAt, setAt, snapshotBalance, restoreBalance, resetBalance, type KnobInfo } from "../sim/balance";
import { PRESETS, newPreset } from "../sim/presets";
import { authorityCap, authoritySupport, authorityWeak, complaintLeft, judge, feast, feastGain, feastCost, FEASTS, type AuthLine, type FeastId } from "../sim/authority";
import {
  zoneOf, patienceWord, handsNow, fieldHands, forecastFork, ledgerOf, payOptions, payTax, taxLeft, setCourse, setFloor,
  seasonKind, elderRel, doer, planSeason, type LedgerLine,
} from "../sim/economy";
import {
  runSeason, assign, assignCost, setHead, talk, giveOrder, holder, getRel, relWord,
  loyaltyWord, expWord, isStale, forecast, consistency, fitness, topAxis, postName,
  axisKnown, axisWord, fitWord, headOpinion, nextTalk, rumorCheck, traitLabel, persuade, command, deskView, orderCost,
  type World, type Person,
} from "../sim/sim";

const $ = (id: string) => document.getElementById(id)!;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
const AXIS_COLOR: Record<Axis, string> = {
  dolg: "var(--axis-dolg)", vygoda: "var(--axis-vygoda)", zabota: "var(--axis-zabota)",
  derzost: "var(--axis-derzost)", obychai: "var(--axis-obychai)",
};
const SEASONS = SEASON_NAMES;

let w: World;
let designer = false;

let tab: "council" | "eco" = "council";

// Адрес страницы помнит семя, заготовку и галочки: ?seed=…&preset=…&lab=1&designer=1&tab=eco&knobs=1
function syncUrl() {
  const q = new URLSearchParams();
  q.set("seed", ($("seed") as HTMLInputElement).value.trim() || "замок");
  const preset = ($("preset") as HTMLSelectElement).value;
  if (preset) q.set("preset", preset);
  if (($("lab") as HTMLInputElement).checked) q.set("lab", "1");
  if (designer) q.set("designer", "1");
  if (tab !== "council") q.set("tab", tab);
  if (!$("knobs-panel").hasAttribute("hidden")) q.set("knobs", "1");
  try { history.replaceState(null, "", `?${q.toString()}`); } catch { /* страница открыта так, что адрес менять нельзя — не беда */ }
}

function start() {
  const seed = ($("seed") as HTMLInputElement).value.trim() || "замок";
  w = newPreset(seed, ($("preset") as HTMLSelectElement).value || null, ($("lab") as HTMLInputElement).checked);
  render();
}

function seasonLabel(n: number) {
  return `${SEASONS[(n - 1) % 4]}, год ${Math.floor((n - 1) / 4) + 1}`;
}

// ---------- Звезда ----------
// Игрок видит звезду только из известного: у известной оси луч до уровня слова, у неизвестной — «?». Настоящая форма — во «Взгляде дизайнера».
const LEVEL: Record<string, number> = { "слабо": 3, "заметно": 6, "сильно": 9 };

function starSvg(p: Person): string {
  const cx = 60, cy = 60, R = 44;
  const pt = (i: number, v: number) => {
    const ang = (-90 + i * 72) * (Math.PI / 180);
    return [cx + Math.cos(ang) * R * (v / 10), cy + Math.sin(ang) * R * (v / 10)];
  };
  const xy = (i: number, v: number) => pt(i, v).map((x) => x.toFixed(1)).join(",");
  const poly = (s: Star) => AXES.map((a, i) => xy(i, s[a])).join(" ");
  const grid = [2.5, 5, 7.5, 10]
    .map((g) => `<polygon class="grid" points="${AXES.map((_, i) => pt(i, g).join(",")).join(" ")}" fill="none" stroke="#e2d8c4" stroke-width="1"/>`)
    .join("");
  const spokes = AXES.map((_, i) => `<line x1="${cx}" y1="${cy}" x2="${pt(i, 10)[0]}" y2="${pt(i, 10)[1]}" stroke="#e2d8c4"/>`).join("");
  const labels = AXES.map((a, i) => {
    const [x, y] = pt(i, 12.4);
    const text = designer || axisKnown(p, a) ? AXIS_NAMES[a].slice(0, 3) : `${AXIS_NAMES[a].slice(0, 3)}?`;
    return `<text x="${x}" y="${y + 3}" text-anchor="middle" font-size="9" fill="${AXIS_COLOR[a]}">${text}</text>`;
  }).join("");
  let shape: string;
  if (designer) {
    shape = `<polygon class="start" points="${poly(p.startStar)}" fill="none" stroke="#8a7a5c" stroke-dasharray="3 2" stroke-width="1"/>`
      + `<polygon class="true" points="${poly(p.star)}" fill="rgba(124,58,29,.22)" stroke="var(--accent)" stroke-width="1.6"/>`;
  } else {
    const known = AXES.map((a, i) => ({ a, i, v: LEVEL[axisWord(p.star[a])] })).filter((k) => axisKnown(p, k.a));
    const rays = known.map((k) => {
      const [x, y] = pt(k.i, k.v);
      const line = `<line class="ray" x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="${AXIS_COLOR[k.a]}" stroke-width="3" stroke-linecap="round"/>`;
      return `${line}<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3" fill="${AXIS_COLOR[k.a]}"/>`;
    }).join("");
    const whole = known.length === AXES.length
      ? `<polygon class="known" points="${known.map((k) => xy(k.i, k.v)).join(" ")}" fill="rgba(124,58,29,.14)" stroke="var(--accent)" stroke-width="1"/>` : "";
    shape = whole + rays;
  }
  return `<svg viewBox="0 0 120 120">${grid}${spokes}${shape}${labels}</svg>`;
}

// Склонности строками: слово-уровень у известной оси, «?» у неизвестной, рядом — сколько раз видели в деле.
function axisRows(p: Person): string {
  return AXES.map((a) => {
    const known = axisKnown(p, a);
    const word = known ? axisWord(p.star[a]) : "?";
    const seen = p.know.seen[a] ? `видели: ${p.know.seen[a]}` : "";
    const real = designer ? ` <small>${p.star[a].toFixed(1)}</small>` : "";
    return `<div class="axis-row" data-axis="${a}" data-known="${known ? 1 : 0}">
      <span class="axis-name" style="color:${AXIS_COLOR[a]}">${AXIS_NAMES[a]}</span>
      <span class="lvl ${known ? "" : "unknown"}">${word}${real}</span><span class="seen">${seen}</span>
    </div>`;
  }).join("");
}

// ---------- Совет ----------
function renderCouncil() {
  const html = POSTS.map((def) => {
    const h = holder(w, def.id);
    const freeCost = h ? assignCost(w, h, null).cost : 0;
    const empty = freeCost > w.authority ? `<option value="" disabled>— пусто — · −${freeCost} авт., не хватает</option>` : `<option value="">— пусто —</option>`;
    const opts = [empty]
      .concat(
        w.people.map((p) => {
          const sel = h?.id === p.id ? "selected" : "";
          const marks: string[] = [];
          let off = "";
          if (p.aspiration?.post === def.id && (p.know.aspiration || designer)) marks.push("хочет сюда");
          if (p.post && p.post !== def.id) marks.push(`сейчас ${postName(p.post).toLowerCase()}`);
          marks.push(fitWord(p, def.id));
          if (designer) marks.push(`годн. ${fitness(p, def.id).toFixed(1)}`);
          if (!sel) {
            const c = assignCost(w, p, def.id).cost;
            if (c) marks.push(c > w.authority ? `−${c} авт., не хватает` : `−${c} авт.`);
            if (c > w.authority) off = "disabled";
          }
          return `<option value="${p.id}" ${sel} ${off}>${esc(p.name)}${marks.length ? " · " + marks.join(", ") : ""}</option>`;
        }),
      )
      .join("");
    const badges: string[] = [];
    if (h) {
      badges.push(`<span class="badge">${expWord(h)} · ${h.tenure} сез.</span>`);
      if (isStale(h)) badges.push(`<span class="badge stale">засиделся</span>`);
      if (w.head === h.id) badges.push(`<span class="badge head">главный</span>`);
    }
    const headBtn = h && w.head !== h.id ? `<button data-head="${h.id}" style="padding:2px 8px;font-size:12px">сделать главным</button>` : "";
    const fc = h ? `<div class="forecast">${esc(h.name)}: ${forecast(h)}${designer ? ` · ведущая ось: ${AXIS_NAMES[topAxis(h.star)]}` : ""}</div>` : "";
    return `<div class="post">
      <div class="post-head"><span class="post-name">${def.name}</span><span class="post-sphere">${def.sphere}</span></div>
      <div class="post-row"><select data-post="${def.id}">${opts}</select>${headBtn}</div>
      <div class="post-row">${badges.join("")}</div>${fc}
    </div>`;
  }).join("");
  $("council").innerHTML = html;
  $("council").querySelectorAll<HTMLSelectElement>("select[data-post]").forEach((s) =>
    s.addEventListener("change", () => {
      const post = s.dataset.post as PostId;
      if (s.value === "") {
        const h = holder(w, post);
        if (h) assign(w, h.id, null);
      } else assign(w, Number(s.value), post);
      render();
    }),
  );
  $("council").querySelectorAll<HTMLButtonElement>("button[data-head]").forEach((b) =>
    b.addEventListener("click", () => { setHead(w, Number(b.dataset.head)); render(); }),
  );
}

function renderRelations() {
  const c = w.people.filter((p) => p.post);
  if (c.length < 2) { $("relations").innerHTML = `<p class="hint">Нужно хотя бы двое в совете.</p>`; return; }
  let html = `<table class="rel-table"><tr><th></th>${c.map((p) => `<th>${esc(p.name)}</th>`).join("")}</tr>`;
  for (const a of c) {
    html += `<tr><th style="text-align:left">${esc(a.name)}</th>`;
    for (const b of c) {
      if (a.id === b.id) { html += `<td>·</td>`; continue; }
      const v = getRel(w, a.id, b.id), word = relWord(v);
      html += `<td><span class="rel rel-${word}" title="${v.toFixed(1)}">${word}${designer ? `<br><small>${v.toFixed(1)}</small>` : ""}</span></td>`;
    }
    html += `</tr>`;
  }
  $("relations").innerHTML = `<div style="overflow-x:auto">${html}</table></div>`;
}

// ---------- Хозяйство и подать ----------
const fmt = (v: number) => String(Math.round(v * 100) / 100).replace(".", ",");
const signed = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${fmt(Math.abs(v))}`;
const BAR_MAX: Record<Category, number> = { lyudi: 8, eda: 8, tovary: 4, serebro: 8 };

function ledgerLine(l: LedgerLine): string {
  const meta = [l.side ? SIDE_NAMES[l.side] : "", l.who ?? "", l.how ?? ""].filter(Boolean).join(" · ");
  const v = l.v ? `<span class="lv ${l.v > 0 ? "pos" : "neg"}">${signed(l.v)}</span>` : `<span class="lv"></span>`;
  return `<div class="ll${l.hidden ? " hidden-line" : ""}">${v}<span class="lt">${esc(l.text)}${l.hidden ? " (спрятано от Сенешаля)" : ""}</span><span class="lm">${esc(meta)}</span></div>`;
}

// Ведомость категории: прошлый сезон построчно — источник, сторона, ответственный и как исполнял.
function ledgerHtml(cat: Category): string {
  const l = w.eco.last;
  if (!l) return `<div class="ledger"><b>${CATEGORY_NAMES[cat]}</b><p>Ведомость появится после первого сезона.</p></div>`;
  const { lines, mismatch } = ledgerOf(l, cat, designer);
  const head = cat === "lyudi" ? `${CATEGORY_NAMES[cat]}: ${seasonLabel(l.season)}`
    : `${CATEGORY_NAMES[cat]}: было ${fmt(l.before[cat])} → стало ${fmt(l.after[cat])} · ${seasonLabel(l.season)}`;
  const floor = cat === "eda" || cat === "serebro" ? `<div class="lfoot">нижняя черта: ${fmt(w.eco.floor[cat])}</div>` : "";
  const odd = mismatch ? `<div class="lfoot mismatch">Счёт не сходится: чего-то недостаёт. Повод разобраться лично.</div>` : "";
  return `<div class="ledger"><b>${head}</b>${lines.map(ledgerLine).join("") || "<p>Движения не было.</p>"}${odd}${floor}</div>`;
}

function renderCats() {
  const forks = forecastFork(w), hands = fieldHands(w), plan = designer ? planSeason(w) : undefined;
  $("eco-cats").innerHTML = CATEGORIES.map((cat) => {
    const v = cat === "lyudi" ? hands.total : w.eco.stock[cat];
    const fill = Math.min(100, (v / BAR_MAX[cat]) * 100);
    let note: string, mark = "";
    if (cat === "lyudi") {
      const h = handsNow(w);
      note = seasonKind(w.season) === 3 ? `зима: поле стоит, свободно ${fmt(hands.free)}`
        : `в поле ${fmt(hands.field)} из ${fmt(B.economy.hands.field)}${hands.build ? `, стройка ${fmt(hands.build)}` : ""}`;
      note += ` · брод ${fmt(h.brod)}, опушка ${fmt(h.opushka)}, замок ${fmt(h.zamok)}`;
    } else {
      const f = forks.find((x) => x.cat === cat)!;
      const who = f.counter ? `считает ${f.counter.name}` : "считать некому";
      note = `к концу сезона: <b class="fc-${f.word.replace(" ", "-")}">${f.word}</b> (от ${fmt(f.lo)} до ${fmt(f.hi)}) · ${who}`;
      if (plan) note += ` <small>по плану ${fmt(plan.stock[cat as Stock])}</small>`;
      if (cat !== "tovary") mark = `<i class="floor" style="left:${Math.min(100, (w.eco.floor[cat] / BAR_MAX[cat]) * 100)}%" title="нижняя черта"></i>`;
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
  const t = w.eco.tax, year = Math.floor((w.season - 1) / 4), from = Math.floor(year / 3) * 3;
  const cells: string[] = [];
  for (let y = from; y < from + 3; y++) {
    for (let k = 0; k < 4; k++) {
      const n = y * 4 + k + 1, past = t.history.find((h) => h.year === y + 1);
      const cls = ["cell", n === w.season ? "now" : n < w.season ? "past" : ""];
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
  const t = w.eco.tax, left = taxLeft(w), opts = payOptions(w);
  const trial = t.year <= B.economy.tax.trialYears ? " (испытание)" : "";
  const debt = w.eco.debts.length ? ` · долг купцам ${fmt(w.eco.debts.reduce((s, d) => s + d.sum, 0))}` : "";
  const patience = `Герцог <b class="pat-${patienceWord(t.patience).replace(" ", "-")}">${patienceWord(t.patience)}</b>${designer ? ` <small>${fmt(t.patience)}</small>` : ""}`;
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
  const auto = `<label class="chk"><input type="checkbox" id="pay-auto" ${w.eco.autoPay ? "checked" : ""}> осенью остаток закрывает совет: казной, потом амбаром, не ниже черт</label>`;
  $("eco-tax").innerHTML = head + form + auto;
  $("pay-auto").addEventListener("change", () => { w.eco.autoPay = ($("pay-auto") as HTMLInputElement).checked; });
  if (left <= 0) return;
  $("pay-how").addEventListener("change", () => { payPick = ($("pay-how") as HTMLSelectElement).value as PayId; renderTax(); });
  $("pay-go").addEventListener("click", () => { payTax(w, cur.def.id, Number(($("pay-n") as HTMLInputElement).value)); render(); });
}

function renderCourse() {
  const e = w.eco, c = COURSES.find((x) => x.id === e.course);
  const options = [`<option value="">как заведено (курса нет)</option>`]
    .concat(COURSES.map((x) => `<option value="${x.id}" ${x.id === e.course ? "selected" : ""}>${x.name}</option>`)).join("");
  const held = c ? (e.courseSeasons >= 1 ? `держится ${e.courseSeasons} сез. — действует сильнее` : "первый сезон") : "";
  const who = c ? [c.pro.length ? `совет чаще решает по: ${c.pro.map((a) => AXIS_NAMES[a]).join(", ")}` : "",
    c.contra.length ? `против: ${c.contra.map((a) => AXIS_NAMES[a]).join(", ")}` : ""].filter(Boolean).join("; ") : "";
  const doers = POSTS.map((d) => `${d.name}: ${doer(w, d.id).how}`).join(" · ");
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
  $("course").addEventListener("change", () => { setCourse(w, (($("course") as HTMLSelectElement).value || null) as CourseId | null); render(); });
  for (const cat of ["eda", "serebro"] as const) {
    $(`floor-${cat}`).addEventListener("change", () => { setFloor(w, cat, Number(($(`floor-${cat}`) as HTMLInputElement).value)); render(); });
  }
  $("feed").addEventListener("change", () => { e.feedFirst = ($("feed") as HTMLSelectElement).value as "zamok" | "derevni"; render(); });
}

function renderSides() {
  const sides = SIDES.map((s) => {
    const z = zoneOf(w, s);
    const real = designer ? ` <small>${signed(w.factions[s])}</small>` : "";
    return `<div class="side" data-side="${s}" title="${esc(SIDE_GIVES[s])}"><span>${SIDE_NAMES[s]}</span><span class="zone zone-${z}">${z}${real}</span></div>`;
  }).join("");
  const elders = w.eco.elders.map((el) => {
    const r = elderRel(w, el);
    const word = r === undefined ? "тиуна нет" : `с тиуном ${relWord(r)}${designer ? ` (${signed(r)})` : ""}`;
    return `<div class="elder" data-elder="${el.side}">Староста ${el.side === "brod" ? "у брода" : "у опушки"}, ${esc(el.name)}: ${word}</div>`;
  }).join("");
  const order = `<div class="side"><span><i>Порядок</i></span><span class="zone">${signed(w.resources.poryadok)}</span></div>`;
  $("eco-sides").innerHTML = sides + order + elders;
}

// ---------- Стол Сенешаля: авторитет, дело сезона, жалобы, обычаи ----------
function authLine(l: AuthLine): string {
  return `<div class="ll" data-kind="${l.kind}"><span class="lv ${l.v > 0 ? "pos" : "neg"}">${signed(l.v)}</span><span class="lt">${esc(l.text)}</span></div>`;
}

function renderDesk() {
  const a = w.auth, support = authoritySupport(w), noDeeds = w.deedsLeft <= 0;
  const last = a.last
    ? `<div class="auth-ledger" id="auth-ledger"><b>Ведомость авторитета: ${seasonLabel(a.lastSeason)}</b>${a.last.map(authLine).join("") || "<p>Без перемен.</p>"}</div>`
    : `<div class="auth-ledger" id="auth-ledger"><p>Ведомость авторитета появится после первого сезона.</p></div>`;
  const now = a.cur.length ? `<div class="auth-ledger" id="auth-now"><b>В этом сезоне уже</b>${a.cur.map(authLine).join("")}</div>` : "";
  const weak = authorityWeak(w) ? `<p class="weak" id="auth-weak">Авторитет ниже ${B.authority.weakBelow}: слово весит меньше — каждая трата дороже на ${B.authority.weakExtra}.</p>` : "";
  const why = support.lines.map((l) => `${signed(l.v)} ${l.text.replace("опора: ", "")}`).join("; ") || "опоры нет";
  $("auth").innerHTML = `<div id="auth-line">Авторитет <b>${fmt(w.authority)}</b> из ${fmt(authorityCap())} · опора за сезон <b>${signed(support.total) || "0"}</b></div>
    <p class="hint" id="auth-support">${esc(why)}. Сверх потолка авторитет сгорает, ниже нуля не уходит.</p>${weak}${now}${last}`;

  const d = deskView(w);
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
    b.addEventListener("click", () => { command(w, b.dataset.command!); render(); }));

  const list = a.complaints.map((c) => {
    const left = complaintLeft(w, c);
    const old = left <= 1 ? " · последний сезон" : ` · ждёт ещё ${left} сез.`;
    return `<div class="complaint"><span>${esc(w.people[c.from].name)} на ${esc(w.people[c.on].name)}${old}</span>
      <button data-judge="${c.id}" ${noDeeds ? "disabled" : ""}>Разобрать</button></div>`;
  }).join("");
  $("complaints").innerHTML = `<h3>Жалобы</h3>${list || `<p class="hint">Жалоб нет.</p>`}
    ${list ? `<p class="hint">Суд лично — личное дело, авторитет +${fmt(B.authority.judge)}. Жалоба ждёт год; не разобрал — −${fmt(B.authority.complaintLeft)}, и она уходит.</p>` : ""}`;
  $("complaints").querySelectorAll<HTMLButtonElement>("button[data-judge]").forEach((b) =>
    b.addEventListener("click", () => { judge(w, Number(b.dataset.judge)); render(); }));

  const feasts = FEASTS.map((f) => {
    const cost = feastCost(f.id), off = noDeeds || w.eco.stock[f.pay] < cost;
    return `<button data-feast="${f.id}" ${off ? "disabled" : ""} title="${esc(f.text)}">${f.name}: ${CATEGORY_NAMES[f.pay].toLowerCase()} −${fmt(cost)}</button>`;
  }).join("");
  $("feasts").innerHTML = `<h3>Обычаи и пиры</h3><div class="desk-opts">${feasts}</div>
    <p class="hint" id="feast-gain">Личное дело. Сейчас даст авторитета +${fmt(feastGain(w))}; каждый следующий за год — вдвое меньше.</p>`;
  $("feasts").querySelectorAll<HTMLButtonElement>("button[data-feast]").forEach((b) =>
    b.addEventListener("click", () => { feast(w, b.dataset.feast as FeastId); render(); }));
}

function renderEconomy() {
  renderCats();
  renderTrack();
  renderTax();
  renderCourse();
  renderSides();
}

// ---------- Люди ----------
function traitTags(p: Person): string {
  const tags: string[] = [];
  if (p.know.trait || designer) {
    const secret = !p.know.trait ? " secret" : "";
    tags.push(`<span class="tag trait key${secret}" title="${esc(p.trait.desc)}">${p.trait.name}${p.trait.hidden && designer ? " (скрытая)" : ""}</span>`);
  } else {
    tags.push(`<span class="tag trait key unknown">${p.know.traitAsked ? "черта скрыта: выдаст поступок" : "черта неизвестна"}</span>`);
  }
  for (const g of p.gained) {
    if (!g.known && !designer) continue;
    tags.push(`<span class="tag trait gained${g.known ? "" : " secret"}" title="${esc(g.trait.desc)}">${esc(traitLabel(w, g))}</span>`);
  }
  if (p.mark) tags.push(`<span class="tag mark" title="${esc(p.mark.desc)}">✶ ${p.mark.name}</span>`);
  tags.push(p.aspiration && (p.know.aspiration || designer)
    ? `<span class="tag asp">${esc(p.aspiration.text)}</span>` : `<span class="tag asp unknown">стремление неизвестно</span>`);
  return tags.join("");
}

function rumorLine(p: Person): string {
  if (!p.rumor) return "";
  const check = rumorCheck(p);
  const truth = designer ? ` <small>${p.rumor.wrong ? "молва неверная" : "молва верная"}</small>` : "";
  return `<div class="rumor">${esc(p.rumor.text)}${check ? ` <span class="check">Молва ${check}.</span>` : ""}${truth}</div>`;
}

function opinionLine(p: Person): string {
  const o = headOpinion(w, p);
  if (!o) return "";
  const bias = designer ? ` <small>пристрастие ${o.bias > 0 ? "+" : ""}${o.bias.toFixed(1)}</small>` : "";
  const title = "Мнение главного — подсказка с пристрастием: друга похвалит, соперника очернит";
  return `<div class="opinion" title="${title}">Главный, ${esc(o.head.name)}: «${o.text}».${bias}</div>`;
}

function renderPeople() {
  $("people").innerHTML = w.people.map((p) => {
    const noOrder = !p.order && orderCost(w) > w.authority ? "disabled" : "";
    const orderOpts = AXES.map((a) => `<option value="${a}" ${p.order === a ? "selected" : ""} ${noOrder}>наказ: ${AXIS_NAMES[a]}</option>`).join("");
    const orderTitle = `Наказ (во 2-м акте, стоит ${orderCost(w)} авторитета)`;
    const orderSel = `<select data-order="${p.id}" title="${orderTitle}"><option value="">наказ: нет</option>${orderOpts}</select>`;
    const topic = nextTalk(p);
    const talkBtn = `<button data-talk="${p.id}" ${w.deedsLeft <= 0 || !topic ? "disabled" : ""}>${topic ? `Поговорить: ${topic}` : "Всё рассказал"}</button>`;
    const leaveBtn = !p.post ? "" : p.agreed ? `<span class="badge agreed">согласен${p.female ? "на" : ""} уйти</span>`
      : `<button data-persuade="${p.id}" ${w.deedsLeft <= 0 ? "disabled" : ""} title="Личное дело: уговорить уйти с должности — тогда снять можно без потери авторитета">Уговорить уйти</button>`;
    const match = designer && p.decisions ? ` · по ведущей оси (${AXIS_NAMES[topAxis(p.star)]}): <b>${consistency(p)}%</b>` : "";
    return `<div class="card ${p.post ? "on-post" : ""}" data-id="${p.id}">
      <div class="card-head">
        <div><div class="card-name">${esc(p.name)}</div><div class="card-meta">${p.age} лет · ${p.post ? postName(p.post) : "без должности"}</div></div>
        <div class="card-meta" style="text-align:right">${loyaltyWord(p.loyalty)}${designer ? ` (${p.loyalty.toFixed(1)})` : ""}<br>разговоров: ${p.know.talks}</div>
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
    b.addEventListener("click", () => { talk(w, Number(b.dataset.talk)); render(); }),
  );
  $("people").querySelectorAll<HTMLButtonElement>("button[data-persuade]").forEach((b) =>
    b.addEventListener("click", () => { persuade(w, Number(b.dataset.persuade)); render(); }),
  );
  $("people").querySelectorAll<HTMLSelectElement>("select[data-order]").forEach((s) =>
    s.addEventListener("change", () => { giveOrder(w, Number(s.dataset.order), (s.value || null) as Axis | null); render(); }),
  );
}

// ---------- Летопись ----------
function effChips(eff?: Partial<Record<Effect, number>>) {
  if (!eff) return "";
  const names: Record<string, string> = { ...FACTION_NAMES, ...RESOURCE_NAMES };
  const chips = Object.entries(eff).filter(([, v]) => v).map(([k, v]) =>
    `<span class="${v! > 0 ? "pos" : "neg"}">${names[k]} ${v! > 0 ? "+" : ""}${v}</span>`);
  return chips.length ? `<div class="eff">${chips.join("")}</div>` : "";
}

// «Взгляд дизайнера»: из чего сложился выбор — веса вариантов у каждого, кто решал.
function weights(list?: string[]): string {
  if (!designer || !list?.length) return "";
  return `<div class="weights">${list.map((l) => `<p>${esc(l)}</p>`).join("")}</div>`;
}

function renderLog() {
  const items = w.log.slice(-250).reverse();
  $("log").innerHTML = items.map((e) => {
    const cls = e.kind === "event" ? e.tone ?? "" : e.kind;
    const s = e.season ? seasonLabel(e.season) : "начало";
    return `<div class="entry ${cls}"><div class="entry-title"><span class="s">${s}</span>${esc(e.title)}</div>${e.lines.map((l) => `<p>${esc(l)}</p>`).join("")}${weights(e.weights)}${effChips(e.effects)}</div>`;
  }).join("");
}

function renderStatus() {
  $("status").innerHTML = `Сейчас: <b>${seasonLabel(w.season)}</b> · Авторитет: <b>${w.authority}</b> · Личных дел: <b>${w.deedsLeft}</b> · Потолок авторитета: ${authorityCap()}`;
}

// ---------- Сводка: ведомость категорий одной таблицей — прошлый сезон и прогноз ----------
function renderYear() {
  const e = w.eco, forks = forecastFork(w), hands = fieldHands(w), plan = planSeason(w), t = e.tax;
  const rows = CATEGORIES.map((cat) => {
    if (cat === "lyudi") return `<tr data-cat="lyudi"><th>Люди</th><td>${fmt(hands.total)}</td><td>—</td><td>в поле ${fmt(hands.field)} из ${fmt(B.economy.hands.field)}</td></tr>`;
    const f = forks.find((x) => x.cat === cat)!;
    const last = e.last ? `${fmt(e.last.before[cat])} → ${fmt(e.last.after[cat])}` : "—";
    const exact = designer ? ` <small>план ${fmt(plan.stock[cat])}</small>` : "";
    return `<tr data-cat="${cat}"><th>${CATEGORY_NAMES[cat]}</th><td>${fmt(e.stock[cat])}</td><td>${last}</td>
      <td><span class="fc-${f.word.replace(" ", "-")}">${f.word}</span> ${fmt(f.lo)}–${fmt(f.hi)}${exact}</td></tr>`;
  }).join("");
  const zones = SIDES.filter((s) => zoneOf(w, s) !== "ладят").map((s) => `${SIDE_NAMES[s].toLowerCase()} — ${zoneOf(w, s)}`).join("; ");
  $("year").innerHTML = `<table class="year"><tr><th></th><th>сейчас</th><th>прошлый сезон</th><th>к концу сезона</th></tr>${rows}</table>
    <p class="hint" id="year-tax">Урок ${fmt(t.due)} мер, внесено ${fmt(t.paid)}, осталось ${fmt(taxLeft(w))} · Герцог ${patienceWord(t.patience)} · авторитет ${fmt(w.authority)}</p>
    <p class="hint" id="year-zones">Стороны: ${zones || "все ладят"}.</p>`;
}

// ---------- Ручки баланса: «было / стало», сброс, выгрузка ----------
const SECTION_NAMES: Record<string, string> = {
  star: "Звезда склонностей", decide: "Решение человека", exp: "Опыт и исход дела", rel: "Отношения", council: "Спор в совете",
  loyalty: "Отношение к Сенешалю", staff: "Перестановки и наказ", know: "Знание о людях", traits: "Черты в течение жизни",
  economy: "Хозяйство и подать", authority: "Авторитет", season: "Сезон", report: "Цели отчёта осей",
};
const SUB_NAMES: Record<string, string> = {
  start: "старт партии", trust: "доверие сторон", zone: "зоны и потоки", doer: "исполнитель", hands: "руки", flow: "потоки", year: "множители по сезонам",
  course: "курс", tax: "урок и терпение Герцога", rate: "курсы подати", pay: "способы платить", goal: "цели отчёта", fork: "прогноз",
};
// Натура и здоровье к совету не подключены: их ручки — в эмуляторе натуры.
const EMU_KNOBS = KNOBS.filter((q) => q.path.split(".")[0] in SECTION_NAMES);
const knobId = (q: KnobInfo) => `k-${q.path.replace(/\./g, "-")}`;
const DEFAULTS: Record<string, number> = Object.fromEntries(KNOBS.map((q) => [q.path, q.def]));
// Два набора значений: «было» (1) и «стало» (2). Правка ручки меняет тот набор, что включён.
const sets: Record<string, number>[] = [{ ...DEFAULTS }, { ...DEFAULTS }];
let active = 1;
const changedKnobs = () => EMU_KNOBS.filter((q) => getAt(q.path) !== q.def);

function renderKnobs() {
  const sections = [...new Set(EMU_KNOBS.map((q) => q.path.split(".")[0]))];
  $("knobs").innerHTML = sections.map((sec) => {
    const mine = EMU_KNOBS.filter((q) => q.path.split(".")[0] === sec);
    let sub = "";
    const rows = mine.map((q) => {
      const v = getAt(q.path), parts = q.path.split(".");
      const head = parts.length > 2 && parts[1] !== sub ? `<div class="knob-sub">${SUB_NAMES[parts[1]] ?? parts[1]}</div>` : "";
      if (parts.length > 2) sub = parts[1];
      return `${head}<div class="knob${v !== q.def ? " changed" : ""}" id="${knobId(q)}" title="${q.path}">
        <div class="knob-label">${esc(q.label)}</div>
        <div class="knob-row">
          <input type="range" data-knob="${q.path}" min="${q.min}" max="${q.max}" step="${q.step}" value="${v}">
          <span class="knob-val">${v}</span><span class="knob-def">по умолч. ${q.def}</span>
        </div>
      </div>`;
    }).join("");
    const n = mine.filter((q) => getAt(q.path) !== q.def).length;
    const open = n || ($("knobs").querySelector<HTMLDetailsElement>(`details[data-sec="${sec}"]`)?.open ?? false);
    return `<details class="knob-group" data-sec="${sec}"${open ? " open" : ""}><summary>${SECTION_NAMES[sec]} <small>${mine.length}${n ? `, изменено ${n}` : ""}</small></summary>${rows}</details>`;
  }).join("");
  $("ab1").classList.toggle("on", active === 0);
  $("ab2").classList.toggle("on", active === 1);
  const n = changedKnobs().length;
  $("knobs-state").textContent = `Включён набор «${active ? "стало" : "было"}». ${n ? `Изменено ручек: ${n}.` : "Все ручки по умолчанию."} Ручка действует со следующего решения; чтобы сравнить партию целиком — R.`;
}
function setKnob(path: string, value: number): number {
  const v = setAt(path, value);
  sets[active] = snapshotBalance();
  return v;
}
function switchSet(i: number) {
  if (i === active) return;
  sets[active] = snapshotBalance();
  active = i;
  restoreBalance(sets[active]);
  renderKnobs(); render();
}
function dumpKnobs(): string {
  const list = changedKnobs();
  const text = list.length ? list.map((q) => `${q.path}: ${q.def} → ${getAt(q.path)}  // ${q.label}`).join("\n") : "Все ручки по умолчанию.";
  const out = $("dump-out") as HTMLTextAreaElement;
  out.hidden = false; out.value = text;
  out.select();
  return text;
}
function toggleKnobs(show = $("knobs-panel").hasAttribute("hidden")) {
  $("knobs-panel").hidden = !show;
  document.body.classList.toggle("knobs-open", show);
  if (show) renderKnobs();
  syncUrl();
}
function setTab(next: "council" | "eco") {
  tab = next;
  $("tab-council").hidden = tab !== "council";
  $("tab-eco").hidden = tab !== "eco";
  document.querySelectorAll<HTMLButtonElement>(".tabs button").forEach((b) => b.classList.toggle("on", b.dataset.tab === tab));
  syncUrl();
}
function setDesigner(on: boolean) {
  designer = on;
  ($("designer") as HTMLInputElement).checked = on;
  render();
}
const seasons = (n: number) => { for (let i = 0; i < n; i++) runSeason(w); render(); };

function render() {
  renderStatus();
  renderDesk();
  renderCouncil();
  renderRelations();
  renderEconomy();
  renderPeople();
  renderLog();
  renderYear();
  syncUrl();
}

$("new").addEventListener("click", start);
$("season").addEventListener("click", () => seasons(1));
$("season5").addEventListener("click", () => seasons(5));
$("lab").addEventListener("change", () => { w.labOpen = ($("lab") as HTMLInputElement).checked; syncUrl(); });
$("designer").addEventListener("change", () => setDesigner(($("designer") as HTMLInputElement).checked));
$("preset").addEventListener("change", start);
$("knobs-toggle").addEventListener("click", () => toggleKnobs());
$("ab1").addEventListener("click", () => switchSet(0));
$("ab2").addEventListener("click", () => switchSet(1));
$("knobs-reset").addEventListener("click", () => { resetBalance(); sets[active] = snapshotBalance(); renderKnobs(); render(); });
$("knobs-dump").addEventListener("click", dumpKnobs);
$("knobs").addEventListener("input", (e) => {
  const el = e.target as HTMLInputElement;
  if (!el.dataset.knob) return;
  const v = setKnob(el.dataset.knob, Number(el.value));
  const q = KNOBS.find((x) => x.path === el.dataset.knob)!, row = $(knobId(q));
  row.classList.toggle("changed", v !== q.def);
  row.querySelector(".knob-val")!.textContent = String(v);
  render();
});
$("knobs").addEventListener("change", renderKnobs);
document.querySelectorAll<HTMLButtonElement>(".tabs button").forEach((b) => b.addEventListener("click", () => setTab(b.dataset.tab as "council" | "eco")));
// После щелчка кнопка не держит фокус: иначе пробел нажал бы её ещё раз.
document.addEventListener("click", (e) => { if (e.target instanceof HTMLButtonElement) e.target.blur(); });

// Горячие клавиши — по коду клавиши, раскладка не важна. В полях ввода и списках клавиши работают как обычно.
document.addEventListener("keydown", (e) => {
  const t = e.target as HTMLElement;
  const typing = ["INPUT", "SELECT", "TEXTAREA"].includes(t.tagName) && t.id !== "dump-out"; // поле выгрузки только для чтения: клавиши в нём работают
  if (e.ctrlKey || e.metaKey || e.altKey || typing) return;
  const keys: Record<string, () => void> = {
    Space: () => seasons(1), KeyF: () => seasons(5), KeyR: start, KeyD: () => setDesigner(!designer), Tab: () => toggleKnobs(),
    KeyP: () => { toggleKnobs(true); dumpKnobs(); }, Digit1: () => switchSet(0), Digit2: () => switchSet(1),
  };
  const run = keys[e.code];
  if (!run) return;
  e.preventDefault();
  run();
});

// Параметры адреса
const params = new URLSearchParams(location.search);
$("preset").innerHTML = `<option value="">без заготовки</option>${PRESETS.map((p) => `<option value="${p.id}" title="${esc(p.desc)}">${esc(p.name)}</option>`).join("")}`;
if (params.get("seed")) ($("seed") as HTMLInputElement).value = params.get("seed")!;
if (PRESETS.some((p) => p.id === params.get("preset"))) ($("preset") as HTMLSelectElement).value = params.get("preset")!;
($("lab") as HTMLInputElement).checked = params.get("lab") === "1";
designer = params.get("designer") === "1";
($("designer") as HTMLInputElement).checked = designer;
start();
setTab(params.get("tab") === "eco" ? "eco" : "council");
if (params.get("knobs") === "1") toggleKnobs(true);

// Для автопроверок и консоли: то же, что кнопки, без щелчков.
interface Emu {
  restart: (seed?: string, preset?: string) => void; season: (n?: number) => void; setKnob: (path: string, v: number) => number;
  snapshot: () => { season: number; authority: number; stock: Record<Stock, number>; knobs: Record<string, number>; set: string; log: number };
}
const emu: Emu = {
  restart: (seed, preset) => {
    if (seed !== undefined) ($("seed") as HTMLInputElement).value = seed;
    if (preset !== undefined) ($("preset") as HTMLSelectElement).value = preset;
    start();
  },
  season: (n = 1) => seasons(n),
  setKnob: (path, v) => { const out = setKnob(path, v); renderKnobs(); render(); return out; },
  snapshot: () => ({
    season: w.season, authority: w.authority, stock: { ...w.eco.stock }, set: active ? "стало" : "было", log: w.log.length,
    knobs: Object.fromEntries(changedKnobs().map((q) => [q.path, getAt(q.path)])),
  }),
};
(window as unknown as { __emu: Emu }).__emu = emu;
