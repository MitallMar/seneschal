// Решения: вес варианта у человека (звезда, наказ, поправки) и его выбор; мастерство исполнения.
import type { GameEvent, EventOption } from "../../data/types";
import { AXIS_DAT } from "../../data/core";
import { BALANCE as B } from "../balance";
import { clamp, round1 } from "../util";
import { isStale } from "../state";
import type { Person, World } from "../state";
import { PROBE } from "../probe";
import { belowFloor, courseLean } from "../economy";
import { activeTraits, mod } from "./people";

// bonus — прибавка наказа в этом весе (ноль, если наказа нет или его не послушали); heard — наказ к варианту подходил
interface Scored { opt: EventOption; score: number; base: number; why: string; bonus: number; heard: boolean }

// Вариант уводит еду или серебро под нижнюю черту: совет такого сам не делает.
export function underFloor(w: World, opt: EventOption): boolean {
  return belowFloor(w, "eda", opt.effects.pripasy ?? 0) || belowFloor(w, "serebro", opt.effects.kazna ?? 0);
}

// mine — человек выбирает для себя: варианты под нижней чертой отпадают (засидевшийся черту не чтит); иначе оцениваются все варианты события.
export function scoreOptions(w: World, p: Person, ev: GameEvent, noisy = true, mine = false): Scored[] {
  const stale = isStale(p);
  const open = mine && !stale ? ev.options.filter((o) => !underFloor(w, o)) : ev.options;
  return (open.length ? open : ev.options).map((opt) => {
    let base = opt.axes.reduce((s, a) => s + p.star[a], 0) / opt.axes.length;
    const parts: string[] = [];
    const lead = opt.axes.reduce((b, a) => (p.star[a] > p.star[b] ? a : b), opt.axes[0]);
    parts.push(`по ${AXIS_DAT[lead]}`);
    let bonus = 0;
    const heard = !!p.order && opt.axes.includes(p.order);
    if (p.order && opt.axes.includes(p.order)) {
      const obey = Math.max(0, p.loyalty + B.decide.orderObeyBase + mod(p, "obedience") - (stale ? B.decide.orderStalePenalty : 0));
      const add = obey * B.decide.orderWeight;
      if (add > B.decide.orderMinBonus) { base += add; bonus = add; parts.push("по наказу"); }
    }
    if (stale && opt.axes.includes("vygoda") && p.star.vygoda >= B.decide.staleGreedFrom) { base += B.decide.staleGreedBonus; parts.push("в свою пользу"); }
    if (opt.risky && p.trait.id === "ostorozhny") base -= B.decide.cautiousRisk;
    // род варианта: смелый чаще берёт Дерзость, осторожный — те, у кого её мало
    const dash = (p.star.derzost - B.star.center) * B.decide.kindLean;
    if (opt.risky) base += dash;
    if (opt.careful) base -= dash;
    // приобретённые черты тянут к своим осям
    const lean = activeTraits(p).reduce((sum, t) => sum + opt.axes.reduce((x, a) => x + (t.lean?.[a] ?? 0), 0) / opt.axes.length, 0);
    if (lean) { base += lean; if (lean > 0) parts.push("по привычке"); }
    const course = courseLean(w, opt.axes);
    if (course) { base += course; parts.push("по курсу"); }
    const noise = noisy ? w.rng.gauss() * Math.max(0, B.decide.noise + mod(p, "random")) : 0;
    return { opt, score: base + noise, base, why: parts.join(", "), bonus, heard };
  });
}

// Веса вариантов последнего события: копятся в decide, runEvent забирает их в запись летописи.
export let trace: string[] = [];
// Начать новый список весов: зовёт runEvent перед событием (переменную модуля снаружи заменить нельзя).
export const resetTrace = (): void => { trace = []; };

// Зонд наказа: поменял ли наказ выбор. Тот же расчёт весов без прибавки наказа; мир не меняется, случайность не тянется.
function probeOrder(scored: Scored[], best: Scored) {
  if (!scored.some((s) => s.heard)) return;
  const o = PROBE.order, plain = scored.reduce((a, b) => (b.score - b.bonus > a.score - a.bonus ? b : a));
  o.fit++;
  if (plain.heard) o.already++;                      // и без наказа выбрал бы вариант по его оси
  else if (best.heard) o.worked++;                   // наказ поменял выбор
  else if (!scored.some((s) => s.bonus > 0)) o.deaf++; // наказ не услышан: послушания не хватило
  else o.weak++;                                     // услышан, но прибавки не хватило
}

export function decide(w: World, p: Person, ev: GameEvent): Scored & { surprise: boolean } {
  const scored = scoreOptions(w, p, ev, true, true);
  const best = scored.reduce((a, b) => (b.score > a.score ? b : a));
  const expected = scored.reduce((a, b) => (b.base > a.base ? b : a));
  probeOrder(scored, best);
  const row = (s: Scored) => `${s.opt.id === best.opt.id ? "→ " : ""}«${s.opt.text}» ${round1(s.score)} (без случая ${round1(s.base)}; ${s.why})`;
  trace.push(`${p.name}: ${scored.map(row).join(" · ")}`);
  if (scored.length < ev.options.length) trace.push(`${p.name}: под нижней чертой, не рассматривал${p.female ? "а" : ""} — ${ev.options.length - scored.length}`);
  return { ...best, surprise: best.opt.id !== expected.opt.id };
}

export function competence(p: Person): number {
  let c = p.exp >= B.exp.master ? B.exp.masterSkill : p.exp >= B.exp.settled ? B.exp.settledSkill : B.exp.novice;
  if (p.post && p.mark?.goodPost === p.post) c += B.exp.markGood;
  if (p.post && p.mark?.badPost === p.post) c += B.exp.markBad;
  c += mod(p, "skill");
  return clamp(c, B.exp.skillMin, B.exp.skillMax);
}
