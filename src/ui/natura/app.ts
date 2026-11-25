// Состояние страницы эмулятора натуры — один объект app: люди прогона, метрики, человек из раздела «Один человек» — и мелкие куски разметки, общие для панелей.
// Панели берут данные из app и зовут app.run(): прогон вписывает main.ts, поэтому панели его не импортируют.
import type { Axis, Sign, SignVec, BagTrait, Star } from "../../data/types";
import { AXES, AXIS_NAMES } from "../../data/core";
import { SIGNS } from "../../data/natura";
import { BACKSTORY } from "../../data/backstory";
import { type NaturaPerson } from "../../sim/natura";
import { type NaturaMetrics } from "../../sim/natura-report";
import { type HealthMetrics } from "../../sim/health-report";
import { $, esc } from "../dom";

// people — рероллы прогона; m и hm — метрики натуры и здоровья по ним; shown — человек из раздела «Один человек»: его же здоровье показано ниже;
// personRoll — номер реролла этого человека; asSeneschal — показан Сенешаль: тот же движок, свой мешок.
export const app: { people: NaturaPerson[]; m: NaturaMetrics; hm: HealthMetrics; shown?: NaturaPerson; personRoll: number; asSeneschal: boolean; run: () => void } = {
  people: [],
  m: undefined as unknown as NaturaMetrics,   // метрики считает run() в main.ts до первой отрисовки панелей
  hm: undefined as unknown as HealthMetrics,
  personRoll: 0,
  asSeneschal: false,
  run: () => {},
};

export const val = (id: string) => ($(id) as HTMLInputElement | HTMLSelectElement).value;
export const pct = (v: number) => `${Math.round(v * 100)}%`;
export const f1 = (v: number) => v.toFixed(1).replace(".", ",");
export const f2 = (v: number) => v.toFixed(2).replace(".", ",");
export const KIND: Record<BagTrait["kind"], string> = { born: "врождённая", life: "нажитая", perk: "перк", look: "облик" };
export const TRIGGER: Record<string, string> = { habit: "привычка", post: "должность", rel: "отношения", break: "перелом", deed: "поступок" };
export const RARITY: Record<BagTrait["rarity"], string> = { common: "", rare: " ★", exceptional: " ★★" };
export const AXIS_RGB: Record<Axis, string> = { dolg: "75,93,138", vygoda: "160,120,42", zabota: "78,125,74", derzost: "161,69,46", obychai: "107,79,134" };
export const signDef = (id: Sign) => SIGNS.find((s) => s.id === id)!;

export const vecTags = (v: SignVec) => (Object.entries(v) as [Sign, number][])
  .map(([k, x]) => `<span class="tag ${x > 0 ? "plus" : "minus"}">${esc(x > 0 ? signDef(k).plus : signDef(k).minus)} ${Math.abs(x)}</span>`).join("");
export const traitTag = (t: BagTrait, role = "") => {
  const title = `${t.desc}. ${t.effect}`;
  return `<span class="tag ${t.kind}" title="${esc(title)}">${esc(t.name)}${RARITY[t.rarity]}</span>${role ? `<span class="tag role">${role}</span>` : ""}`;
};
export const roleOf = (p: NaturaPerson, id: string) => (id === p.contra ? "против натуры" : id === p.far ? "издалека" : p.inGame.includes(id) ? "в игре" : "");
// Текст события предыстории без подстановок рода: для подписи, откуда черта.
export const storyText = (id: string) => (BACKSTORY.find((ev) => ev.id === id)?.text ?? "").replace(/\{name\}/g, "он").replace(/\{other\}/g, "другой").replace(/\{[^}]*\}/g, "");
export const track = (share: number, color: string, extra = "") =>
  `<div class="track">${extra}<div class="fill" style="width:${Math.min(100, Math.max(0, share * 100)).toFixed(1)}%;background:${color}"></div></div>`;
export const starLine = (s: Star) => AXES.map((a) => `<span style="color:var(--axis-${a})"><b>${AXIS_NAMES[a]}</b> ${f1(s[a])}</span>`).join(" · ");
