// Порядок: шаг сезона (задача И13). События толкают шкалу, она тянется к норме на шаг, ступень берёт своё — разбой в смуту,
// гниль на строгом краю; хватка ослабла — гниль всплывает разом. Чтение шкалы — order.ts.
import { VILLAGES } from "../data/economy";
import { BALANCE as B } from "./balance";
import { clamp, round1, round2 } from "./util";
import type { World } from "./state";
import { ORDER_MAX, stepOf, gradeOf, orderNorm, guardCost } from "./order";
import { addTrust } from "./economy/zones";
import { addLine } from "./economy/ledger";

export function orderSeason(w: World, lines: string[]): void {
  const O = B.order, o = w.order, was = o.level, wasStep = stepOf(was);
  // события и решения совета: каждые pushStep единиц порядка — шаг шкалы; остаток копится до следующего сезона
  const steps = clamp(Math.trunc((w.resources.poryadok - o.seen) / O.pushStep), -O.pushMax, O.pushMax);
  o.seen = round1(o.seen + steps * O.pushStep);
  // дрейф к норме: шаг за сезон
  const norm = orderNorm(w).norm;
  let level = clamp(was + steps, 0, ORDER_MAX);
  if (level < norm) level++;
  else if (level > norm) level--;
  o.level = level;
  const step = stepOf(level), g = gradeOf(level).k;
  if (step.id !== wasStep.id) lines.push(`Порядок: теперь «${step.name}» (было «${wasStep.name}»). ${step.plus[0].toUpperCase()}${step.plus.slice(1)}; но ${step.minus}.`);
  // ступень берёт своё
  if (step.id === "smuta") {
    addLine(w, { cat: "serebro", v: -O.robbery * g, text: "разбой на дорогах: смута" });
    addTrust(w, "kuptsy", -O.kuptsySmuta * g);
  }
  if (step.id === "volnitsa") addLine(w, { cat: "serebro", v: -O.pilfer * g, text: "мелкое воровство: вольница" });
  if (step.id === "volnitsa" || step.id === "smuta") addTrust(w, "zamok", -O.brawl * g);
  if (step.id === "ruka") {
    addTrust(w, "les", -O.lesRuka * g);
    // страх — не любовь: деревни при твёрдой руке не выше «ладят»
    const cap = villageCap();
    for (const v of VILLAGES) if (w.factions[v] > cap) w.factions[v] = cap;
  }
  if (step.id === "strogost") o.rot = round2(o.rot + O.rotStrogost * g);
  if (step.id === "ruka") o.rot = round2(o.rot + O.rotRuka * g);
  // застой: в тишине засиживаются быстрее
  o.calm = step.id === "tiho" ? o.calm + 1 : 0;
  if (o.calm && o.calm % O.stagnation === 0) for (const p of w.people) if (p.post) p.tenure++;
  // хватка ослабла: шкала сошла со строгого края — накопленная гниль всплывает разом
  if (was >= STRICT_FROM() && level < STRICT_FROM() && o.rot > 0) {
    const lost = -addLine(w, { cat: "serebro", v: -o.rot * O.rotSilver, text: "всплыла гниль: при строгой руке воровали молча" });
    addTrust(w, "zamok", -o.rot * O.rotTrust);
    for (const v of VILLAGES) addTrust(w, v, (-o.rot * O.rotTrust) / VILLAGES.length);
    lines.push(`⚠ Хватка ослабла — всплыла гниль: пока все молчали, из казны утекло ${lost}; люди замка и деревни припомнили обиды.`);
    o.rot = 0;
  }
  o.spent = round2(o.spent + Math.max(0, guardCost(o.guard)));
  o.history.push(level);
}
// С какой отметки шкалы начинается строгий край: ступень «Строгость».
const STRICT_FROM = (): number => stepOf(B.order.strictFrom).from;
// Потолок доверия деревень при твёрдой руке: на волос ниже «заодно».
export const villageCap = (): number => Math.floor(B.economy.trust.ally * 10 - 1) / 10;
