// Генератор мира (задача И11а, замысел — docs/design/koncept-2.md, «Генератор событий мира»). Без интерфейса и без партии:
// знает только своё состояние WorldSim и свою случайность, поэтому лента на 50 сезонов считается и в Node, и на экране.
// Три слоя: мир и герцогство (состояния на годы), баронство (погода года, указы), место (отголоски; события совета взвешиваются по меткам).
// Рассказчик держит бюджет давления: беда стоит бюджета, после беды — передышка, а долгой тишины не бывает.
import type { GameEvent, WorldShift, WorldStateDef } from "../../data/types";
import { WORLD_STATES, WEATHER_WORDS } from "../../data/world";
import { BALANCE as B } from "../balance";
import { Rng } from "../rng";
import { clamp, round1, round2 } from "../util";
import type { WorldSim, WorldNews, WorldActive } from "../state";
import { seasonKind, SPRING } from "../economy/zones";

export const stateDef = (id: string): WorldStateDef => WORLD_STATES.find((s) => s.id === id)!;
const isBad = (d: WorldStateDef) => d.cost > 0;

// Погода года: множитель урожая, один на год. Тянется весной; состояния мира умножают его уже в worldMods.
function rollWeather(ws: WorldSim): void {
  const W = B.world.weather;
  ws.weather = round2(clamp(1 + ws.rng.gauss() * W.spread, W.min, W.max));
  const m = worldMods(ws).harvest, word = weatherWord(m);
  const text = { bad: "Год обещает недород: поля дадут заметно меньше.", poor: "Год обещает быть скудным.", plain: "Год обещает быть обычным.", good: "Год обещает быть урожайным." }[word];
  ws.news.push({ season: ws.season, layer: "baronstvo", kind: "weather", tone: word === "bad" || word === "poor" ? "bad" : word === "good" ? "good" : "neutral", text });
}

export function initWorld(seed: string): WorldSim {
  const ws: WorldSim = { rng: new Rng(`${seed}|мир`), season: 1, active: [], queue: [], budget: B.world.budget.start, lastBad: 0, decreeFree: 0, weather: 1, news: [] };
  if (B.world.on) rollWeather(ws);
  return ws;
}

// Сила состояния на деле: своя (разброс при рождении) на общую ручку.
const power = (a: { strength: number }) => a.strength * B.world.strength;

// Что мир сейчас делает с хозяйством: множители потоков и надбавка к уроку подати в мерах.
export function worldMods(ws: WorldSim): Required<WorldShift> {
  const out = { harvest: 1, price: 1, duty: 1, forest: 1, lesson: 0 };
  if (!B.world.on) return out;
  out.harvest = ws.weather;
  for (const a of ws.active) {
    const sh = stateDef(a.id).shift;
    if (!sh) continue;
    for (const key of ["harvest", "price", "duty", "forest"] as const) if (sh[key] !== undefined) out[key] *= Math.max(0, 1 + (sh[key]! - 1) * power(a));
    out.lesson += (sh.lesson ?? 0) * power(a);
  }
  for (const key of ["harvest", "price", "duty", "forest"] as const) out[key] = round2(out[key]);
  out.lesson = round1(out.lesson);
  return out;
}

export function weatherWord(harvest: number): keyof typeof WEATHER_WORDS {
  const W = B.world.weather;
  return harvest < W.bad ? "bad" : harvest < W.poor ? "poor" : harvest >= W.good ? "good" : "plain";
}

// Вес события совета: состояние мира с его меткой — чаще, глушащее его метку — реже. Спокойный мир — у всех единица.
export function eventWeight(ws: WorldSim, ev: GameEvent): number {
  const T = B.world.tags;
  if (!B.world.on) return 1;
  let v = 1;
  for (const a of ws.active) {
    const d = stateDef(a.id);
    if (d.tags.some((t) => ev.tags.includes(t))) v += T.more * power(a);
    if (d.mutes?.some((t) => ev.tags.includes(t))) v -= T.less * power(a);
  }
  return round2(Math.max(T.min, v));
}

function pickWeighted(rng: Rng, items: WorldStateDef[]): WorldStateDef {
  let roll = rng.next() * items.reduce((s, d) => s + d.weight, 0);
  for (const d of items) { roll -= d.weight; if (roll < 0) return d; }
  return items[items.length - 1];
}

function startState(ws: WorldSim, d: WorldStateDef): void {
  const W = B.world, strength = round2(Math.max(W.spread, 1 + ws.rng.gauss() * W.spread));
  const a: WorldActive = { id: d.id, from: ws.season, until: ws.season + ws.rng.int(d.seasons[0], d.seasons[1]), strength };
  ws.active.push(a);
  if (isBad(d)) { ws.budget = round2(ws.budget - d.cost); ws.lastBad = ws.season; }
  // отголосок, который не успевает дойти, пока состояние длится, не приходит вовсе
  (d.echoes ?? []).forEach((e, i) => {
    const at = ws.season + ws.rng.int(e.delay[0], e.delay[1]);
    if (at < a.until) ws.queue.push({ state: d.id, echo: i, at, strength });
  });
  ws.news.push({ season: ws.season, layer: "mir", kind: "start", tone: isBad(d) ? "bad" : "good", text: `${d.name}. ${d.text}`, state: d.id, strength });
}

// Размер указа в мерах: по силе состояния и ручкам.
export const decreeMeasures = (base: number, strength: number): number => round1(base * strength * B.world.strength * B.world.decree.size);

// Шаг генератора: мир переходит в сезон season. Возвращает вести этого сезона (они же лежат в ws.news).
export function worldStep(ws: WorldSim, season: number): WorldNews[] {
  const W = B.world, G = W.budget;
  ws.season = season;
  ws.news = [];
  if (!W.on) return ws.news;
  // состояния кончаются
  for (const a of ws.active.filter((x) => x.until <= season)) {
    const d = stateDef(a.id);
    ws.news.push({ season, layer: "mir", kind: "end", tone: isBad(d) ? "good" : "neutral", text: d.end, state: d.id });
  }
  ws.active = ws.active.filter((x) => x.until > season);
  if (seasonKind(season) === SPRING) rollWeather(ws);
  ws.budget = round2(Math.min(G.cap, ws.budget + G.income * W.act));
  // новое состояние: беда — если по карману и передышка прошла; долгая тишина кончается бедой наверняка
  if (season > W.grace && ws.active.length < W.maxActive) {
    const free = WORLD_STATES.filter((d) => !ws.active.some((a) => a.id === d.id));
    const quiet = season - ws.lastBad;
    const bad = quiet >= G.gap ? free.filter((d) => isBad(d) && d.cost <= ws.budget) : [];
    const good = free.filter((d) => !isBad(d));
    const force = quiet >= G.quiet && bad.length > 0;
    if (force || ws.rng.chance(W.chance)) {
      const pool = force || (bad.length && !ws.rng.chance(W.goodShare)) ? bad : good;
      if (pool.length) startState(ws, pickWeighted(ws.rng, pool));
    }
  }
  // отголоски: местные приходят сразу, указ ждёт, пока не кончится срок прошлого и передышка после него
  ws.queue = ws.queue.filter((x) => ws.active.some((a) => a.id === x.state));
  for (const e of ws.queue.filter((x) => x.at <= season)) {
    const def = stateDef(e.state).echoes![e.echo];
    if (def.decree) {
      if (season < ws.decreeFree) { e.at = ws.decreeFree; continue; }
      const measures = decreeMeasures(def.decree.measures, e.strength);
      if (measures > 0) {
        ws.decreeFree = season + def.decree.term + W.decree.gap;
        ws.news.push({ season, layer: "baronstvo", kind: "decree", tone: "bad", text: def.text, state: e.state, echo: e.echo, strength: e.strength, measures });
      }
    } else {
      const sum = Object.values(def.effects ?? {}).reduce((s, v) => s + v!, 0);
      ws.news.push({ season, layer: "mesto", kind: "echo", tone: sum < 0 ? "bad" : sum > 0 ? "good" : "neutral", text: def.text, state: e.state, echo: e.echo, strength: e.strength });
    }
    e.at = 0;
  }
  ws.queue = ws.queue.filter((x) => x.at > season);
  return ws.news;
}

// Лента мира без партии: что случилось в каждом сезоне и что в нём действовало. Для эмулятора и отчётов.
export interface TapeRow { season: number; news: WorldNews[]; active: WorldActive[]; weather: number; budget: number; mods: Required<WorldShift> }
export function worldTape(seed: string, seasons: number): TapeRow[] {
  const ws = initWorld(seed);
  const row = (): TapeRow => ({ season: ws.season, news: ws.news, active: ws.active.map((a) => ({ ...a })), weather: ws.weather, budget: ws.budget, mods: worldMods(ws) });
  const out = [row()];
  for (let s = 2; s <= seasons; s++) { worldStep(ws, s); out.push(row()); }
  return out;
}
