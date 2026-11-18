// Общее для тестов хозяйства: спокойный совет, выключатели исполнителя, главного и почерка, сезон без событий совета.
import { POSTS } from "../src/data/core";
import { EVENTS } from "../src/data/events";
import { BALANCE, setAt } from "../src/sim/balance";
import { newWorld } from "../src/sim/council/generate";
import { holder } from "../src/sim/state";
import type { World } from "../src/sim/state";
import { economySeason } from "../src/sim/economy/season";
import { fix } from "./_world";

export const E = BALANCE.economy;
export const event = (id: string) => EVENTS.find((e) => e.id === id)!;
export const said = (lines: string[], part: string) => lines.some((l) => l.includes(part));
// Совет без настроений: все «как велено» — не засиделись, к Сенешалю ровно, должность не желанная и не чужая. Нижних черт нет.
export function calm(seed = "хозяйство"): World {
  flat();
  const w = newWorld(seed);
  for (const d of POSTS) fix(holder(w, d.id)!, ["dolg"]).loyalty = 0;
  for (const el of w.eco.elders) el.rel = el.rel.map(() => 0);
  w.eco.floor = { eda: 0, serebro: 0 };
  return w;
}
// Старые проверки потоков считают исполнителя «как велено» за единицу: мастерство и опыт в них выключены ручками.
export function flat() {
  noHead();
  setAt("economy.flow.scale", 1);   // и скудость земли: базовые потоки — как записаны в ручках
  for (const key of ["masteryMin", "masteryMax", "expNovice", "expSettled", "expMaster"]) setAt(`economy.doer.${key}`, 1);
  noHand();
}
// …и главный: его довод в настрое проверяется отдельно.
export function noHead() {
  for (const key of ["headFor", "headAgainst"]) setAt(`economy.doer.${key}`, 0);
}
// …и почерк тоже: все его рычаги — в ноль.
export function noHand() {
  for (const key of ["flow", "trust", "order", "hands", "silver", "sell", "patience"]) setAt(`economy.hand.${key}`, 0);
}
// Сезоны без событий совета: только хозяйство.
export function pass(w: World, n = 1): string[] {
  const lines: string[] = [];
  for (let i = 0; i < n; i++) { economySeason(w, lines); w.season++; }
  return lines;
}
export const zoneAt = (z: string) => (z === "заодно" ? E.trust.ally : z === "ладят" ? E.trust.friendly : z === "терпят" ? E.trust.refuse + 1 : E.trust.refuse);
export const r1 = (v: number) => Math.round(v * 10) / 10;
export const line = (w: World, part: string) => w.eco.last!.lines.find((l) => l.text.includes(part));
