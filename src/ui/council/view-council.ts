// Вкладка «Совет и люди»: должности совета и таблица отношений.
import { AXIS_NAMES, POSTS } from "../../data/core";
import type { PostId } from "../../data/types";
import { assign, assignCost, setHead } from "../../sim/council/staff";
import { holder, getRel, isStale, fitness, topAxis, postName } from "../../sim/state";
import { relWord, expWord, forecast, fitWord } from "../../sim/council/know";
import { staffBlock } from "../../sim/fall/base";
import { $, esc } from "../dom";
import { app } from "./app";

export function renderCouncil() {
  const u = app.w.fall.under;
  const html = POSTS.map((def) => {
    const h = holder(app.w, def.id);
    const freeCost = h ? assignCost(app.w, h, null).cost : 0;
    const locked = h ? staffBlock(app.w, h, null) : undefined;
    const empty = locked ? `<option value="" disabled>— пусто — · ${esc(locked)}</option>` : freeCost > app.w.authority ? `<option value="" disabled>— пусто — · −${freeCost} авт., не хватает</option>` : `<option value="">— пусто —</option>`;
    const opts = [empty]
      .concat(
        app.w.people.map((p) => {
          const sel = h?.id === p.id ? "selected" : "";
          const marks: string[] = [];
          let off = "";
          if (p.aspiration?.post === def.id && (p.know.aspiration || app.designer)) marks.push("хочет сюда");
          if (p.post && p.post !== def.id) marks.push(`сейчас ${postName(p.post).toLowerCase()}`);
          marks.push(fitWord(p, def.id));
          if (app.designer) marks.push(`годн. ${fitness(p, def.id).toFixed(1)}`);
          if (u?.retinue.includes(p.id)) marks.unshift("человек барона");
          const block = sel ? undefined : staffBlock(app.w, p, def.id);
          if (block) off = "disabled";
          else if (!sel) {
            const c = assignCost(app.w, p, def.id).cost;
            if (c) marks.push(c > app.w.authority ? `−${c} авт., не хватает` : `−${c} авт.`);
            if (c > app.w.authority) off = "disabled";
          }
          return `<option value="${p.id}" ${sel} ${off}>${esc(p.name)}${marks.length ? " · " + marks.join(", ") : ""}</option>`;
        }),
      )
      .join("");
    const badges: string[] = [];
    if (h) {
      badges.push(`<span class="badge">${expWord(h)} · ${h.tenure} сез.</span>`);
      if (isStale(h)) badges.push(`<span class="badge stale">засиделся</span>`);
      if (app.w.head === h.id) badges.push(`<span class="badge head">главный</span>`);
      if (u?.retinue.includes(h.id)) badges.push(`<span class="badge stale" data-retinue="${h.id}">человек барона</span>`);
    }
    const headBtn = h && app.w.head !== h.id ? `<button data-head="${h.id}" style="padding:2px 8px;font-size:12px">сделать главным</button>` : "";
    const fc = h ? `<div class="forecast">${esc(h.name)}: ${forecast(h)}${app.designer ? ` · ведущая ось: ${AXIS_NAMES[topAxis(h.star)]}` : ""}</div>` : "";
    return `<div class="post">
      <div class="post-head"><span class="post-name">${def.name}</span><span class="post-sphere">${def.sphere}</span></div>
      <div class="post-row"><select data-post="${def.id}">${opts}</select>${headBtn}</div>
      <div class="post-row">${badges.join("")}</div>${fc}
    </div>`;
  }).join("");
  const consent = u ? `<p class="weak" id="council-under">${u.consent === app.w.season ? "Барон дал согласие на перестановки в этом сезоне; своих людей трогать не велел."
    : "Под чужой рукой перестановки — только с согласия барона (личное дело на столе Сенешаля). Его людей не тронуть и с согласием."}</p>` : "";
  $("council").innerHTML = consent + html;
  $("council").querySelectorAll<HTMLSelectElement>("select[data-post]").forEach((s) =>
    s.addEventListener("change", () => {
      const post = s.dataset.post as PostId;
      if (s.value === "") {
        const h = holder(app.w, post);
        if (h) assign(app.w, h.id, null);
      } else assign(app.w, Number(s.value), post);
      app.render();
    }),
  );
  $("council").querySelectorAll<HTMLButtonElement>("button[data-head]").forEach((b) =>
    b.addEventListener("click", () => { setHead(app.w, Number(b.dataset.head)); app.render(); }),
  );
}

export function renderRelations() {
  const c = app.w.people.filter((p) => p.post);
  if (c.length < 2) { $("relations").innerHTML = `<p class="hint">Нужно хотя бы двое в совете.</p>`; return; }
  let html = `<table class="rel-table"><tr><th></th>${c.map((p) => `<th>${esc(p.name)}</th>`).join("")}</tr>`;
  for (const a of c) {
    html += `<tr><th style="text-align:left">${esc(a.name)}</th>`;
    for (const b of c) {
      if (a.id === b.id) { html += `<td>·</td>`; continue; }
      const v = getRel(app.w, a.id, b.id), word = relWord(v);
      html += `<td><span class="rel rel-${word}" title="${v.toFixed(1)}">${word}${app.designer ? `<br><small>${v.toFixed(1)}</small>` : ""}</span></td>`;
    }
    html += `</tr>`;
  }
  $("relations").innerHTML = `<div style="overflow-x:auto">${html}</table></div>`;
}
