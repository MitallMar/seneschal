// Порядок — шкала строгости (задача И13, замысел — docs/design/hozyaystvo.md, раздел 8). Не «хорошо ↔ плохо», а «вольно ↔ строго»:
// каждый шаг от середины усиливает и плюсы, и минусы своего края. Здесь — чтение шкалы: ступень, градация, множители, норма, цена стражи.
// Сезонный шаг (дрейф к норме, толчки событий, гниль) — order-season.ts. Числа — раздел order в balance.ts.
import { BALANCE as B } from "./balance";
import { clamp, round1, round2 } from "./util";
import { holder, STAR_MAX } from "./state";
import type { World } from "./state";

export const ORDER_MAX = 15;
export type StepId = "smuta" | "volnitsa" | "tiho" | "strogost" | "ruka";
export interface Step { id: StepId; name: string; from: number; to: number; plus: string; minus: string }
// Пять ступеней. Плюсы и минусы словами — для игрока; что из них считается, видно в orderMods.
export const STEPS: Step[] = [
  { id: "smuta", name: "Смута", from: 0, to: 2, plus: "всё тайное всплывает: молва громкая; деревням вольно; торг вольный", minus: "разбой и кражи, пошлин почти нет, купцы объезжают" },
  { id: "volnitsa", name: "Вольница", from: 3, to: 5, plus: "доверие деревень растёт легче; товары дороже; молва обильная", minus: "мелкое воровство; пошлины ниже; засидевшиеся подворовывают чаще" },
  { id: "tiho", name: "Тихо", from: 6, to: 8, plus: "всё по обычной цене", minus: "застой: засиживаются быстрее; ни удач, ни громких событий" },
  { id: "strogost", name: "Строгость", from: 9, to: 11, plus: "пошлины выше; кражи ловят; дозор приносит удачи", minus: "стража дороже; доверие деревень растёт медленнее; молва тише; копится гниль" },
  { id: "ruka", name: "Твёрдая рука", from: 12, to: ORDER_MAX, plus: "пошлины ещё выше; казнокрадство почти невозможно; дозор приносит удачи часто", minus: "страх — не любовь: деревни не выше «ладят»; люди молчат; лес ворчит на дозоры; гниль копится быстро" },
];
export const stepOf = (level: number): Step => STEPS.find((s) => level >= s.from && level <= s.to) ?? STEPS[STEPS.length - 1];
// Градация внутри ступени: чем дальше от середины шкалы, тем глубже. «Тихо» — всегда единица.
export function gradeOf(level: number): { k: number; word: "лёгкая" | "полная" | "глубокая" } {
  const s = stepOf(level);
  if (s.id === "tiho") return { k: 1, word: "полная" };
  const depth = s.from > STEPS[2].to ? level - s.from : s.to - level;   // шагов от ближнего к середине края ступени
  return depth <= 0 ? { k: B.order.light, word: "лёгкая" } : depth === 1 ? { k: 1, word: "полная" } : { k: B.order.deep, word: "глубокая" };
}

// Что ступень делает с хозяйством и знанием о людях. Множитель ступени тянется от единицы на градацию: лёгкая — слабее, глубокая — сильнее.
export interface OrderMods { duty: number; price: number; villageGain: number; villageCap: boolean; seen: number; theft: number; strictWeight: number }
export function orderMods(w: World): OrderMods {
  const O = B.order, level = w.order.level, id = stepOf(level).id, g = gradeOf(level).k;
  const by = (v: number) => round2(1 + (v - 1) * g);
  const free = id === "smuta" || id === "volnitsa", strict = id === "strogost" || id === "ruka";
  return {
    duty: by(id === "smuta" ? O.dutySmuta : id === "volnitsa" ? O.dutyVolnitsa : id === "strogost" ? O.dutyStrogost : id === "ruka" ? O.dutyRuka : 1),
    price: by(free ? O.priceVolnitsa : 1),
    villageGain: by(free ? O.trustVolnitsa : strict ? O.trustStrogost : 1),
    villageCap: id === "ruka",
    seen: by(free ? O.seenVolnitsa : id === "strogost" ? O.seenStrogost : id === "ruka" ? O.seenRuka : 1),
    theft: by(id === "smuta" ? O.theftSmuta : id === "volnitsa" ? O.theftVolnitsa : id === "strogost" ? O.theftStrogost : id === "ruka" ? O.theftRuka : 1),
    strictWeight: id === "ruka" ? O.strictWeight : 1,
  };
}

// Норма: куда шкала тянется на шаг за сезон. Стража, стиль десятника и курс.
export function orderNorm(w: World): { norm: number; parts: string[] } {
  const O = B.order, p = holder(w, "desyatnik"), parts: string[] = [];
  let norm = O.base;
  if (w.order.guard) { norm += w.order.guard * O.guardStep; parts.push(w.order.guard > 0 ? `стража затянута на ${w.order.guard}` : `стража распущена на ${-w.order.guard}`); }
  if (!p) { norm -= O.noDesyatnik; parts.push("десятника нет"); }
  else {
    const lean = ((p.star.dolg + p.star.derzost) / 2 - p.star.zabota) / STAR_MAX, shift = round1(lean * O.desyatnik);
    norm += shift;
    if (shift >= 1) parts.push(`десятник ${p.name} держит строго`);
    if (shift <= -1) parts.push(`десятник ${p.name} держит вольно`);
  }
  if (w.eco?.course === "dorogi") { norm += O.course; parts.push("курс «Порядок на дорогах»"); }
  if (w.eco?.course === "polegche") { norm -= O.course; parts.push("курс «Людям полегче»"); }
  return { norm: Math.round(clamp(norm, 0, ORDER_MAX)), parts };
}

// Стража: затянуть — каждая ступень дороже предыдущей; распустить — сберегает немного серебра.
export function guardCost(guard: number): number {
  const O = B.order;
  return guard > 0 ? round2((O.guardCost * guard * (guard + 1)) / 2) : round2(guard * O.guardSave);
}
export const guardHands = (guard: number): number => (guard > 0 ? round2(guard * B.order.guardHands) : 0);
// Приказ страже: затянуть или отпустить. Отпустить ничего не стоит — но накопленная гниль всплывёт, когда шкала сойдёт со строгого края.
export function setGuard(w: World, guard: number): boolean {
  const g = Math.round(clamp(guard, B.order.guardMin, B.order.guardMax));
  if (g === w.order.guard) return false;
  const was = w.order.guard;
  w.order.guard = g;
  const cost = guardCost(g);
  const price = cost > 0 ? `${cost} серебра и ${guardHands(g)} рук в дозорах каждый сезон` : cost < 0 ? `казна сберегает ${-cost} серебра за сезон` : "по обычной цене";
  w.log.push({ season: w.season, kind: "staff", title: "Стража", lines: [`Сенешаль велел страже ${g > was ? "затянуть" : "отпустить"}: ${price}. Шкала порядка пойдёт к норме по шагу за сезон.`] });
  return true;
}
export const initOrder = (): World["order"] => ({ level: B.order.start, guard: 0, seen: 0, rot: 0, calm: 0, history: [], spent: 0 });
