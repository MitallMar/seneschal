// Летопись и строка состояния.
import { FACTION_NAMES, RESOURCE_NAMES } from "../../data/core";
import type { Effect } from "../../data/types";
import { authorityCap } from "../../sim/authority";
import { $, esc } from "../dom";
import { app, seasonLabel } from "./app";

function effChips(eff?: Partial<Record<Effect, number>>) {
  if (!eff) return "";
  const names: Record<string, string> = { ...FACTION_NAMES, ...RESOURCE_NAMES };
  const chips = Object.entries(eff).filter(([, v]) => v).map(([k, v]) =>
    `<span class="${v! > 0 ? "pos" : "neg"}">${names[k]} ${v! > 0 ? "+" : ""}${v}</span>`);
  return chips.length ? `<div class="eff">${chips.join("")}</div>` : "";
}

// «Взгляд дизайнера»: из чего сложился выбор — веса вариантов у каждого, кто решал.
function weights(list?: string[]): string {
  if (!app.designer || !list?.length) return "";
  return `<div class="weights">${list.map((l) => `<p>${esc(l)}</p>`).join("")}</div>`;
}

export function renderLog() {
  const items = app.w.log.slice(-250).reverse();
  $("log").innerHTML = items.map((e) => {
    const cls = e.kind === "event" ? e.tone ?? "" : e.kind;
    const s = e.season ? seasonLabel(e.season) : "начало";
    return `<div class="entry ${cls}"><div class="entry-title"><span class="s">${s}</span>${esc(e.title)}</div>${e.lines.map((l) => `<p>${esc(l)}</p>`).join("")}${weights(e.weights)}${effChips(e.effects)}</div>`;
  }).join("");
}

export function renderStatus() {
  $("status").innerHTML = `Сейчас: <b>${seasonLabel(app.w.season)}</b> · Авторитет: <b>${app.w.authority}</b> · Личных дел: <b>${app.w.deedsLeft}</b> · Потолок авторитета: ${authorityCap()}`;
}
