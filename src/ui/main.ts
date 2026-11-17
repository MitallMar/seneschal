import { AXES, AXIS_NAMES, POSTS, FACTION_NAMES, RESOURCE_NAMES } from "../data/core";
import type { Axis, PostId, Star, Faction, Resource, Effect } from "../data/types";
import {
  newWorld, runSeason, assign, assignCost, setHead, talk, giveOrder, holder, getRel, relWord,
  loyaltyWord, expWord, isStale, forecast, consistency, fitness, topAxis, postName,
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
function starSvg(p: Person): string {
  const cx = 60, cy = 60, R = 44;
  const pt = (i: number, v: number) => {
    const ang = (-90 + i * 72) * (Math.PI / 180);
    return [cx + Math.cos(ang) * R * (v / 10), cy + Math.sin(ang) * R * (v / 10)];
  };
  const poly = (s: Star) => AXES.map((a, i) => pt(i, s[a]).map((x) => x.toFixed(1)).join(",")).join(" ");
  const grid = [2.5, 5, 7.5, 10]
    .map((g) => `<polygon points="${AXES.map((_, i) => pt(i, g).join(",")).join(" ")}" fill="none" stroke="#e2d8c4" stroke-width="1"/>`)
    .join("");
  const spokes = AXES.map((_, i) => `<line x1="${cx}" y1="${cy}" x2="${pt(i, 10)[0]}" y2="${pt(i, 10)[1]}" stroke="#e2d8c4"/>`).join("");
  const labels = AXES.map((a, i) => {
    const [x, y] = pt(i, 12.4);
    return `<text x="${x}" y="${y + 3}" text-anchor="middle" font-size="9" fill="${AXIS_COLOR[a]}">${AXIS_NAMES[a].slice(0, 3)}</text>`;
  }).join("");
  const blur = designer ? 0 : (3 - p.knowledge) * 2.2;
  const filt = blur ? `<defs><filter id="b${p.id}" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="${blur}"/></filter></defs>` : "";
  const shape = `<polygon points="${poly(p.star)}" fill="rgba(124,58,29,.22)" stroke="var(--accent)" stroke-width="1.6" ${blur ? `filter="url(#b${p.id})"` : ""}/>`;
  const start = designer ? `<polygon points="${poly(p.startStar)}" fill="none" stroke="#8a7a5c" stroke-dasharray="3 2" stroke-width="1"/>` : "";
  return `<svg viewBox="0 0 120 120">${filt}${grid}${spokes}${start}${shape}${labels}</svg>`;
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
          if (p.aspiration?.post === def.id) marks.push("хочет сюда");
          if (p.post && p.post !== def.id) marks.push(`сейчас ${postName(p.post).toLowerCase()}`);
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
    const fc = h ? `<div class="forecast">${esc(h.name)}: ${forecast(w, h)}${designer ? ` · ведущая ось: ${AXIS_NAMES[topAxis(h.star)]}` : ""}</div>` : "";
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
function renderPeople() {
  $("people").innerHTML = w.people.map((p) => {
    const totalChoices = AXES.reduce((s, a) => s + p.choices[a], 0) || 1;
    const bars = AXES.map((a) => `<div class="bar"><span>${AXIS_NAMES[a]}</span><div class="track"><div class="fill" style="width:${(p.choices[a] / totalChoices) * 100}%;background:${AXIS_COLOR[a]}"></div></div><span>${p.choices[a]}</span></div>`).join("");
    const orderSel = `<select data-order="${p.id}" title="Наказ (во 2-м акте, стоит 1 авторитета)"><option value="">наказ: нет</option>${AXES.map((a) => `<option value="${a}" ${p.order === a ? "selected" : ""}>наказ: ${AXIS_NAMES[a]}</option>`).join("")}</select>`;
    const knowWord = ["не знает", "немного знает", "знает", "знает хорошо"][p.knowledge];
    return `<div class="card ${p.post ? "on-post" : ""}">
      <div class="card-head">
        <div><div class="card-name">${esc(p.name)}</div><div class="card-meta">${p.age} лет · ${p.post ? postName(p.post) : "без должности"}</div></div>
        <div class="card-meta" style="text-align:right">${loyaltyWord(p.loyalty)}${designer ? ` (${p.loyalty.toFixed(1)})` : ""}<br>Сенешаль ${knowWord}</div>
      </div>
      <div class="tags">
        <span class="tag trait" title="${esc(p.trait.desc)}">${p.trait.name}</span>
        ${p.mark ? `<span class="tag mark" title="${esc(p.mark.desc)}">✶ ${p.mark.name}</span>` : ""}
        ${p.aspiration && (p.knowledge >= 1 || designer) ? `<span class="tag asp">${esc(p.aspiration.text)}</span>` : `<span class="tag asp" style="opacity:.5">стремление неизвестно</span>`}
      </div>
      <div class="card-body">
        <div class="star">${starSvg(p)}</div>
        <div class="stats">
          <div>Решений: <b>${p.decisions}</b>${p.decisions ? ` · по ведущей оси: <b>${consistency(p)}%</b>` : ""}</div>
          <div class="bars">${bars}</div>
        </div>
      </div>
      <details class="bio"><summary>Биография</summary><ul>${p.bio.map((b) => `<li>${esc(b)}</li>`).join("")}</ul></details>
      <div class="card-actions">
        <button data-talk="${p.id}" ${w.deedsLeft <= 0 || p.knowledge >= 3 ? "disabled" : ""}>Поговорить</button>
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
