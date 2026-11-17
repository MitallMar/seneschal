import { AXES, AXIS_NAMES, POSTS, FACTION_NAMES, RESOURCE_NAMES } from "../data/core";
import type { Axis, PostId, Star, Faction, Resource, Effect } from "../data/types";
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
const SEASONS = ["весна", "лето", "осень", "зима"];

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

function num(v: number) {
  const cls = v > 0 ? "pos" : v < 0 ? "neg" : "";
  return `<span class="v ${cls}">${v > 0 ? "+" : ""}${v.toFixed(1)}</span>`;
}

function renderWorld() {
  const rows = (Object.keys(w.factions) as Faction[]).map((f) => `<span>${FACTION_NAMES[f]}</span>${num(w.factions[f])}`)
    .concat((Object.keys(w.resources) as Resource[]).map((r) => `<span><i>${RESOURCE_NAMES[r]}</i></span>${num(w.resources[r])}`));
  $("world").innerHTML = `<div class="kv">${rows.join("")}</div><p class="hint" style="margin-top:8px">Накопленные изменения с начала партии: насколько совет угодил каждой стороне.</p>`;
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
  renderWorld();
  renderPeople();
  renderLog();
}

$("new").addEventListener("click", start);
$("season").addEventListener("click", () => { runSeason(w); render(); });
$("season5").addEventListener("click", () => { for (let i = 0; i < 5; i++) runSeason(w); render(); });
$("lab").addEventListener("change", () => { w.labOpen = ($("lab") as HTMLInputElement).checked; });
$("designer").addEventListener("change", () => { designer = ($("designer") as HTMLInputElement).checked; render(); });
start();
