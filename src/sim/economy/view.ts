// Что видит игрок: вилка прогноза по годности счетовода, строки ведомости без спрятанных, отношение старосты.
import type { Stock, Category, PostId } from "../../data/types";
import { STOCKS } from "../../data/economy";
import { BALANCE as B } from "../balance";
import { clamp, round1 } from "../util";
import { holder, fitness, STAR_MAX } from "../state";
import type { World, Person, LedgerLine, Ledger, Elder } from "../state";
import { planSeason } from "./plan";

export interface Fork { cat: Stock; lo: number; hi: number; word: "с запасом" | "впритык" | "не хватит" | "пусто"; counter?: Person }
const COUNTER: Record<Stock, PostId> = { eda: "klyuchnik", tovary: "pisar", serebro: "pisar" };
// Прогноз на конец сезона — вилкой: чем хуже счетовод (ключник — еда, писарь — серебро и товары), тем шире и тем дальше середина от правды.
export function forecastFork(w: World): Fork[] {
  const K = B.economy.fork, plan = planSeason(w);
  return STOCKS.map((cat) => {
    const counter = holder(w, COUNTER[cat]);
    const bad = counter ? clamp(1 - fitness(counter, COUNTER[cat]) / STAR_MAX, 0, 1) : K.empty;
    const half = K.min + K.wide * bad, mid = plan.stock[cat] + w.eco.fc[cat] * K.skew * half;
    const lo = round1(Math.max(0, mid - half)), hi = round1(Math.max(0, mid + half));
    const floor = cat === "tovary" ? 0 : w.eco.floor[cat];
    const word = hi <= 0 ? "пусто" : hi < floor ? "не хватит" : lo > floor ? "с запасом" : "впритык";
    return { cat, lo, hi, word, counter };
  });
}
// Строки ведомости по категории. Спрятанные строки игрок не видит: о них говорит только «счёт не сходится».
export function ledgerOf(l: Ledger, cat: Category, all = false): { lines: LedgerLine[]; mismatch: boolean } {
  const mine = l.lines.filter((x) => x.cat === cat);
  return { lines: mine.filter((x) => all || !x.hidden), mismatch: mine.some((x) => x.hidden) };
}
// Отношения старосты деревни с нынешним тиуном; тиуна нет — undefined.
export function elderRel(w: World, el: Elder): number | undefined {
  const tiun = holder(w, "starosta");
  return tiun ? el.rel[tiun.id] : undefined;
}
