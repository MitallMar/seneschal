// Метрики генератора натур (docs/design/natura.md, раздел 6): «сто рероллов» автора, только тысячи раз.
// Зовут tools/natura.ts и тесты. Цели — раздел natura.goal в balance.ts.
import type { Axis, Sign, Star } from "../data/types";
import { AXES, AXIS_NAMES } from "../data/core";
import { SIGNS, NATURES, BAG } from "../data/natura";
import { BALANCE as B } from "./balance";
import { rollPerson, type NaturaPerson } from "./natura";
import { newWorld, topAxis } from "./sim";

export interface AxisDist { mean: number; spread: number; top: number } // среднее, разброс, доля людей с этой ведущей склонностью
export interface NaturaMetrics {
  rolls: number;
  traitsMean: number;                         // черт на человека в среднем
  jaccard: number;                            // медианная похожесть двух рероллов одной натуры
  jaccardWorst: { nature: string; value: number };
  nn: number;                                 // как часто натура угадывается по чертам ближайшим соседом
  never: string[];                            // черты, что не выпали ни разу
  commonMax: { trait: string; share: number }; // самая частая обычная черта
  signSpread: Record<Sign, number>;           // разброс признака среди рероллов одной натуры (в среднем по натурам)
  axes: Record<Axis, AxisDist>;               // деловые склонности из признаков
  axesNow: Record<Axis, AxisDist>;            // нынешняя звезда совета, для сравнения
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : 0);
const spread = (xs: number[]) => { const m = mean(xs); return Math.sqrt(mean(xs.map((v) => (v - m) * (v - m)))); };
const median = (xs: number[]) => { const a = [...xs].sort((x, y) => x - y); return a.length ? a[Math.floor(a.length / 2)] : 0; };
const round3 = (v: number) => Math.round(v * 1000) / 1000;

export function jaccard(a: Set<string>, b: Set<string>): number {
  let both = 0;
  for (const x of a) if (b.has(x)) both++;
  const all = a.size + b.size - both;
  return all ? both / all : 0;
}

function axisDist(stars: Star[]): Record<Axis, AxisDist> {
  return Object.fromEntries(AXES.map((a) => {
    const xs = stars.map((s) => s[a]);
    return [a, { mean: round3(mean(xs)), spread: round3(spread(xs)), top: round3(stars.filter((s) => topAxis(s) === a).length / Math.max(1, stars.length)) }];
  })) as Record<Axis, AxisDist>;
}
// Нынешнее распределение звезды: люди из партий совета на многих семенах.
export function currentAxes(seeds = 60): Record<Axis, AxisDist> {
  return axisDist(Array.from({ length: seeds }, (_, i) => newWorld(`натура-${i + 1}`).people.map((p) => p.startStar)).flat());
}

// rolls рероллов: натуры по кругу, у каждого реролла своя судьба. Одно семя — одни и те же числа.
export function rollAll(rolls: number, seed = "натура"): NaturaPerson[] {
  return Array.from({ length: rolls }, (_, i) => rollPerson(`${seed}-${i}`, NATURES[i % NATURES.length]));
}

export function naturaMetrics(rolls: number, seed = "натура"): NaturaMetrics {
  const people = rollAll(rolls, seed);
  const sets = people.map((p) => new Set(p.traits.map((t) => t.id)));
  // похожесть рероллов одной натуры
  const all: number[] = [];
  let worst = { nature: "", value: 0 };
  for (const n of NATURES) {
    const idx = people.map((p, i) => (p.nature === n ? i : -1)).filter((i) => i >= 0);
    const own: number[] = [];
    for (let a = 0; a < idx.length; a++) for (let b = a + 1; b < idx.length; b++) own.push(jaccard(sets[idx[a]], sets[idx[b]]));
    all.push(...own);
    if (median(own) >= worst.value) worst = { nature: n.name, value: round3(median(own)) };
  }
  // различимость: ближайший сосед по набору черт; при равенстве — доля соседей той же натуры
  let hit = 0;
  for (let i = 0; i < people.length; i++) {
    let best = -1, same = 0, total = 0;
    for (let j = 0; j < people.length; j++) {
      if (j === i) continue;
      const v = jaccard(sets[i], sets[j]);
      if (v > best) { best = v; same = 0; total = 0; }
      if (v === best) { total++; if (people[j].nature === people[i].nature) same++; }
    }
    hit += total ? same / total : 0;
  }
  // покрытие мешка
  const count = new Map<string, number>();
  for (const p of people) for (const t of p.traits) count.set(t.id, (count.get(t.id) ?? 0) + 1);
  const common = BAG.filter((t) => t.rarity === "common").map((t) => ({ trait: t.name, share: round3((count.get(t.id) ?? 0) / Math.max(1, rolls)) }));
  // стягивание: разброс признака внутри натуры
  const signSpread = Object.fromEntries(SIGNS.map((s) => {
    const per = NATURES.map((n) => spread(people.filter((p) => p.nature === n).map((p) => p.signs[s.id])));
    return [s.id, round3(mean(per))];
  })) as Record<Sign, number>;
  return {
    rolls,
    traitsMean: round3(mean(people.map((p) => p.traits.length))),
    jaccard: round3(median(all)),
    jaccardWorst: worst,
    nn: round3(hit / Math.max(1, people.length)),
    never: BAG.filter((t) => !count.has(t.id)).map((t) => t.name),
    commonMax: common.reduce((a, b) => (b.share > a.share ? b : a), { trait: "", share: 0 }),
    signSpread,
    axes: axisDist(people.map((p) => p.star)),
    axesNow: currentAxes(),
  };
}

// Что не дотягивает до целей раздела natura.goal: пусто — цели выполнены.
export function naturaWarnings(m: NaturaMetrics): string[] {
  const G = B.natura.goal, out: string[] = [];
  if (m.jaccard > G.jaccard) out.push(`рероллы одной натуры слишком похожи: ${m.jaccard} при цели не больше ${G.jaccard}`);
  if (m.nn < G.nnMin) out.push(`натуры сливаются: угадывается ${m.nn} при цели не меньше ${G.nnMin}`);
  if (m.nn > G.nnMax) out.push(`натуры шаблонны: угадывается ${m.nn} при цели не больше ${G.nnMax}`);
  if (m.never.length) out.push(`не выпадают никогда: ${m.never.join(", ")}`);
  if (m.commonMax.share > G.commonShare) out.push(`черта «${m.commonMax.trait}» выпадает слишком часто: ${m.commonMax.share} при цели не больше ${G.commonShare}`);
  for (const s of SIGNS) {
    if (m.signSpread[s.id] < G.signSpread) out.push(`признак «${s.plus}» стягивается в точку: разброс ${m.signSpread[s.id]} при цели не меньше ${G.signSpread}`);
  }
  for (const a of AXES) {
    const now = m.axesNow[a], got = m.axes[a];
    if (Math.abs(got.mean - now.mean) > G.axisMean) out.push(`${AXIS_NAMES[a]}: среднее ${got.mean} против нынешних ${now.mean}`);
    const ratio = now.spread ? got.spread / now.spread : 1;
    if (ratio < G.axisSpreadMin || ratio > G.axisSpreadMax) out.push(`${AXIS_NAMES[a]}: разброс ${got.spread} против нынешних ${now.spread}`);
  }
  return out;
}
