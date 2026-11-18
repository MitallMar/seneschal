// Звезда склонностей человека: рисунок и строки по осям.
import { AXES, AXIS_NAMES } from "../../data/core";
import type { Star } from "../../data/types";
import { axisKnown, axisWord } from "../../sim/council/know";
import type { Person } from "../../sim/state";
import { app, AXIS_COLOR } from "./app";

// Игрок видит звезду только из известного: у известной оси луч до уровня слова, у неизвестной — «?». Настоящая форма — во «Взгляде дизайнера».
const LEVEL: Record<string, number> = { "слабо": 3, "заметно": 6, "сильно": 9 };

export function starSvg(p: Person): string {
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
    const text = app.designer || axisKnown(p, a) ? AXIS_NAMES[a].slice(0, 3) : `${AXIS_NAMES[a].slice(0, 3)}?`;
    return `<text x="${x}" y="${y + 3}" text-anchor="middle" font-size="9" fill="${AXIS_COLOR[a]}">${text}</text>`;
  }).join("");
  let shape: string;
  if (app.designer) {
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
export function axisRows(p: Person): string {
  return AXES.map((a) => {
    const known = axisKnown(p, a);
    const word = known ? axisWord(p.star[a]) : "?";
    const seen = p.know.seen[a] ? `видели: ${p.know.seen[a]}` : "";
    const real = app.designer ? ` <small>${p.star[a].toFixed(1)}</small>` : "";
    return `<div class="axis-row" data-axis="${a}" data-known="${known ? 1 : 0}">
      <span class="axis-name" style="color:${AXIS_COLOR[a]}">${AXIS_NAMES[a]}</span>
      <span class="lvl ${known ? "" : "unknown"}">${word}${real}</span><span class="seen">${seen}</span>
    </div>`;
  }).join("");
}
