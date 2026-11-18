// Отчёт «должность и характер» (задача И6): как часто события каждой должности задевают каждую склонность,
// что каждая склонность в сумме приносит и отнимает, и читается ли характер в прогонах. Без экрана: зовут тесты и tools/axes.ts.
import type { Axis, PostId, GameEvent } from "../data/types";
import { AXES, AXIS_NAMES, POSTS } from "../data/core";
import { EVENTS } from "../data/events";
import { BALANCE as B } from "./balance";
import { newWorld, runSeason } from "./sim";
import { topAxis } from "./state";

export interface AxisShare { events: number; options: number } // доли от 0 до 1
// Должность × ось. events — в какой доле событий должности есть вариант по этой оси (человеку есть где её проявить);
// options — какая доля вариантов этих событий к ней относится.
export function postAxisTable(events: GameEvent[] = EVENTS): Record<PostId, { count: number; axes: Record<Axis, AxisShare> }> {
  const out = {} as Record<PostId, { count: number; axes: Record<Axis, AxisShare> }>;
  for (const post of POSTS) {
    const evs = events.filter((e) => e.posts.includes(post.id));
    const opts = evs.flatMap((e) => e.options);
    const axes = {} as Record<Axis, AxisShare>;
    for (const a of AXES) {
      axes[a] = {
        events: evs.length ? evs.filter((e) => e.options.some((o) => o.axes.includes(a))).length / evs.length : 0,
        options: opts.length ? opts.filter((o) => o.axes.includes(a)).length / opts.length : 0,
      };
    }
    out[post.id] = { count: evs.length, axes };
  }
  return out;
}

export interface AxisEffects { plus: number; minus: number; options: number; clean: number }
// Что склонность приносит и отнимает: сумма плюсов и минусов по всем вариантам этой оси.
// clean — сколько её вариантов вовсе без минусов («бесплатные»).
export function axisEffects(events: GameEvent[] = EVENTS): Record<Axis, AxisEffects> {
  const out = {} as Record<Axis, AxisEffects>;
  const sum = (xs: number[]) => xs.reduce((s, v) => s + v, 0);
  for (const a of AXES) {
    const opts = events.flatMap((e) => e.options).filter((o) => o.axes.includes(a));
    const vals = opts.flatMap((o) => Object.values(o.effects) as number[]);
    out[a] = {
      plus: sum(vals.filter((v) => v > 0)),
      minus: sum(vals.filter((v) => v < 0)),
      options: opts.length,
      clean: opts.filter((o) => !(Object.values(o.effects) as number[]).some((v) => v < 0)).length,
    };
  }
  return out;
}

export interface RunStats {
  sides: Record<string, number>;                  // в среднем на партию к концу: доверие сторон, порядок, запасы
  own: { matched: number; decisions: number };    // решения людей, чья ведущая склонность — родная для их должности
  foreign: { matched: number; decisions: number }; // остальные члены совета
}
// Прогон без игрока: seeds партий по seasons сезонов. Доля решений по ведущей склонности — отдельно на своей и на чужой должности.
export function runStats(seeds: number, seasons: number, labOpen = false): RunStats {
  const sides: Record<string, number> = {};
  const own = { matched: 0, decisions: 0 }, foreign = { matched: 0, decisions: 0 };
  for (let i = 0; i < seeds; i++) {
    const w = newWorld(`оси-${i + 1}`, labOpen);
    for (let s = 0; s < seasons; s++) runSeason(w);
    for (const [k, v] of [...Object.entries(w.factions), ...Object.entries(w.resources), ...Object.entries(w.eco.stock)]) sides[k] = (sides[k] ?? 0) + v / seeds;
    for (const p of w.people) {
      if (!p.post) continue;
      const native = POSTS.find((d) => d.id === p.post)!.native;
      const bucket = native.includes(topAxis(p.startStar)) ? own : foreign;
      bucket.matched += p.matchedTop; bucket.decisions += p.decisions;
    }
  }
  return { sides, own, foreign };
}

// Замечания к событиям по целям раздела report: пусто — цели выполнены. Их печатает отчёт и проверяет тест данных.
export function axesWarnings(events: GameEvent[] = EVENTS): string[] {
  const out: string[] = [];
  const table = postAxisTable(events);
  for (const post of POSTS) {
    const row = table[post.id].axes;
    const weakest = Math.min(...post.native.map((a) => row[a].events));
    for (const a of AXES) {
      const own = post.native.includes(a), v = row[a].events;
      if (own && v < B.report.nativeEvents) out.push(`${post.name}: родная склонность ${AXIS_NAMES[a]} встречается редко`);
      if (!own && v < B.report.otherEvents) out.push(`${post.name}: склонность ${AXIS_NAMES[a]} почти не встречается`);
      if (!own && v >= weakest) out.push(`${post.name}: чужая склонность ${AXIS_NAMES[a]} встречается не реже родной`);
    }
  }
  const eff = axisEffects(events);
  for (const a of AXES) {
    if (-eff[a].minus < eff[a].plus * B.report.minusShare) out.push(`${AXIS_NAMES[a]}: минусов по событиям мало против плюсов (${eff[a].minus} к +${eff[a].plus})`);
  }
  return out;
}
