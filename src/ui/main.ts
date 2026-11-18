import { AXES, AXIS_NAMES, POSTS, FACTION_NAMES, RESOURCE_NAMES } from "../data/core";
import { SIDES, SIDE_NAMES, SIDE_GIVES, CATEGORIES, CATEGORY_NAMES, CATEGORY_UNIT, COURSES, SEASON_NAMES } from "../data/economy";
import type { Axis, PostId, Star, Effect, Category, CourseId, PayId, Stock } from "../data/types";
import { BALANCE as B } from "../sim/balance";
import {
  zoneOf, patienceWord, handsNow, fieldHands, forecastFork, ledgerOf, payOptions, payTax, taxLeft, setCourse, setFloor,
  seasonKind, elderRel, doer, planSeason, type LedgerLine,
} from "../sim/economy";
import {
  newWorld, runSeason, assign, assignCost, setHead, talk, giveOrder, holder, getRel, relWord,
  loyaltyWord, expWord, isStale, forecast, consistency, fitness, topAxis, postName,
  axisKnown, axisWord, fitWord, headOpinion, nextTalk, rumorCheck, traitLabel,
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

function start() {
  const seed = ($("seed") as HTMLInputElement).value.trim() || "замок";
  w = newWorld(seed, ($("lab") as HTMLInputElement).checked);
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
    const opts = [`<option value="">— пусто —</option>`]
      .concat(
        w.people.map((p) => {
          const sel = h?.id === p.id ? "selected" : "";
          const marks: string[] = [];
          if (p.aspiration?.post === def.id && (p.know.aspiration || designer)) marks.push("хочет сюда");
          if (p.post && p.post !== def.id) marks.push(`сейчас ${postName(p.post).toLowerCase()}`);
          marks.push(fitWord(p, def.id));
          if (designer) marks.push(`годн. ${fitness(p, def.id).toFixed(1)}`);
          if (!sel) {
            const c = assignCost(w, p, def.id).cost;
            if (c) marks.push(`−${c} авт.`);
          }
          return `<option value="${p.id}" ${sel}>${esc(p.name)}${marks.length ? " · " + marks.join(", ") : ""}</option>`;
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
    const orderSel = `<select data-order="${p.id}" title="Наказ (во 2-м акте, стоит 1 авторитета)"><option value="">наказ: нет</option>${AXES.map((a) => `<option value="${a}" ${p.order === a ? "selected" : ""}>наказ: ${AXIS_NAMES[a]}</option>`).join("")}</select>`;
    const topic = nextTalk(p);
    const talkBtn = `<button data-talk="${p.id}" ${w.deedsLeft <= 0 || !topic ? "disabled" : ""}>${topic ? `Поговорить: ${topic}` : "Всё рассказал"}</button>`;
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
      </div>
    </div>`;
  }).join("");
  $("people").querySelectorAll<HTMLButtonElement>("button[data-talk]").forEach((b) =>
    b.addEventListener("click", () => { talk(w, Number(b.dataset.talk)); render(); }),
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

function renderLog() {
  const items = w.log.slice(-250).reverse();
  $("log").innerHTML = items.map((e) => {
    const cls = e.kind === "event" ? e.tone ?? "" : e.kind;
    const s = e.season ? seasonLabel(e.season) : "начало";
    return `<div class="entry ${cls}"><div class="entry-title"><span class="s">${s}</span>${esc(e.title)}</div>${e.lines.map((l) => `<p>${esc(l)}</p>`).join("")}${effChips(e.effects)}</div>`;
  }).join("");
}

function renderStatus() {
  $("status").innerHTML = `Сейчас: <b>${seasonLabel(w.season)}</b> · Авторитет: <b>${w.authority}</b> · Личных дел: <b>${w.deedsLeft}</b>`;
}

function render() {
  renderStatus();
  renderCouncil();
  renderRelations();
  renderEconomy();
  renderPeople();
  renderLog();
}

$("new").addEventListener("click", start);
$("season").addEventListener("click", () => { runSeason(w); render(); });
$("season5").addEventListener("click", () => { for (let i = 0; i < 5; i++) runSeason(w); render(); });
$("lab").addEventListener("change", () => { w.labOpen = ($("lab") as HTMLInputElement).checked; });
$("designer").addEventListener("change", () => { designer = ($("designer") as HTMLInputElement).checked; render(); });
start();
