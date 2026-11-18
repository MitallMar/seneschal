// Строки ведомости вне плана (события совета, воровство, плата подати), нижняя черта и вложения совета с отдачей позже.
import type { Effect, GameEvent, Later } from "../../data/types";
import { VILLAGES } from "../../data/economy";
import { BALANCE as B } from "../balance";
import { round1, round2 } from "../util";
import type { World, LedgerLine, Pending } from "../state";
import { addTrust } from "./zones";

export const floor1 = (v: number) => Math.floor(v * 10 + 1e-9) / 10;

// ---------- Строки вне плана: события совета, воровство, плата подати ----------

// Запас меняется, строка идёт в ведомость текущего сезона. Ниже нуля запас не опускается: возвращается то, что вышло на деле.
export function addLine(w: World, line: LedgerLine): number {
  if (line.cat === "lyudi") { w.eco.cur.push(line); return line.v; }
  const was = w.eco.stock[line.cat];
  w.eco.stock[line.cat] = round2(Math.max(0, was + line.v));
  const v = round2(w.eco.stock[line.cat] - was);
  w.eco.cur.push({ ...line, v });
  return v;
}
// Расход события уводит запас под нижнюю черту? Совет такого сам не делает (засидевшийся — делает, по-своему).
export function belowFloor(w: World, cat: "eda" | "serebro", v: number): boolean {
  return v < 0 && round2(w.eco.stock[cat] + v) < w.eco.floor[cat];
}

// ---------- Вложения совета ----------

// Вариант события занял руки людей замка на этот сезон.
export function takeHands(w: World, hands: number): void {
  w.eco.recruits.push({ from: "zamok", hands, until: w.season + 1 });
  w.eco.cur.push({ cat: "lyudi", v: -hands, text: "руки заняты делом совета", side: "zamok" });
}
// Вложение: отдача (с тем же множителем умения и исхода, что у самого дела) придёт через later.seasons сезонов.
export function invest(w: World, ev: GameEvent, later: Later, k: number, lines: string[]): void {
  const effects = Object.fromEntries(Object.entries(later.effects).map(([key, v]) => [key, round1(v * k)])) as Pending["effects"];
  w.eco.pending.push({ due: w.season + later.seasons, effects, text: `${later.text} (дело «${ev.title}»)`, village: ev.village });
  lines.push(`Вложение: отдача через ${later.seasons} сез. — ${later.text}.`);
}
// Отдача вложений, срок которых подошёл: запасы — строкой в ведомость, доверие и порядок — сразу.
export function settle(w: World, lines: string[]): void {
  const due = w.eco.pending.filter((x) => x.due <= w.season);
  w.eco.pending = w.eco.pending.filter((x) => x.due > w.season);
  for (const x of due) {
    for (const [key, v] of Object.entries(x.effects) as [Effect, number][]) {
      if (key === "poryadok") w.resources.poryadok = round1(w.resources.poryadok + v);
      else if (key === "kazna" || key === "pripasy") addLine(w, { cat: key === "kazna" ? "serebro" : "eda", v, text: `отдача вложения: ${x.text}` });
      else if (key === "derevni") for (const v2 of x.village ? [x.village] : VILLAGES) addTrust(w, v2, v * B.economy.trust.event);
      else addTrust(w, key, v * B.economy.trust.event);
    }
    lines.push(`🌱 Вложение дало отдачу: ${x.text}.`);
  }
}
