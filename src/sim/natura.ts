// Генератор натур (задача И8): рост древа черт от точек кристаллизации. Замысел и правила — docs/design/natura.md, раздел 5.
// Стоит отдельно от совета: sim.ts его не зовёт. Без экрана; случайность только через Rng, числа — раздел natura в balance.ts.
import type { Axis, Star, Sign, SignVec, NatureDef, BagTrait, BagTrigger, BackstoryEvent } from "../data/types";
import { AXES } from "../data/core";
import { SIGNS, NATURES, BAG } from "../data/natura";
import { BACKSTORY } from "../data/backstory";
import { BALANCE as B } from "./balance";
import { Rng } from "./rng";
import { STAR_MAX } from "./state";
import { clamp, round1 } from "./util";

// Шкала признака (не баланс): −5…+5.
export const SIGN_MAX = 5;
const SIGN_IDS: Sign[] = SIGNS.map((s) => s.id);

export interface NaturaPerson {
  nature: NatureDef;
  age: number;
  traits: BagTrait[];          // в порядке появления: врождённые, нажитые до игры, нажитые в игре
  anchors: string[];           // id врождённых черт: якоря от точек кристаллизации ядра
  far: string;                 // id дальнего якоря: первая нажитая черта, почти не связанная с ядром
  contra: string;              // id черты-противоречия (может совпасть с дальним якорем или вырасти от него)
  from: Record<string, string>; // от какого якоря выросла черта: id черты → id якоря (у якорей и противоречия записи нет)
  via: Record<string, string>; // какое событие предыстории дало черту: id черты → id события
  inGame: string[];            // id черт и перков, нажитых в игре
  lost: string[];              // id нажитых черт, вытесненных другими
  events: SignVec[];           // события жизни, которые тянули рост
  signs: Record<Sign, number>; // признаки: ядро + черты
  star: Star;                  // деловые склонности, посчитанные из признаков
}
// taken — сколько раз черту уже взяли другие в этой партии (штраф за повтор); age — возраст; backstory — свои события предыстории вместо случайных.
export interface GrowOpts { events?: SignVec[]; taken?: Map<string, number>; age?: number; backstory?: BackstoryEvent[] }
// Повод в игре: по нему отбираются нажитые черты и перки.
export interface LifeOpts { events?: SignVec[]; taken?: Map<string, number>; trigger?: BagTrigger }
export const TRIGGERS: BagTrigger[] = ["habit", "post", "rel", "break", "deed"];

const dot = (a: SignVec, b: SignVec) => SIGN_IDS.reduce((s, k) => s + (a[k] ?? 0) * (b[k] ?? 0), 0);
// Близость двух векторов признаков: 1 — одно направление, 0 — ничего общего, −1 — противоположны.
export function cos(a: SignVec, b: SignVec): number {
  const n = Math.sqrt(dot(a, a) * dot(b, b));
  return n ? dot(a, b) / n : 0;
}
const sum = (vecs: SignVec[], scale = 1): SignVec => {
  const out: SignVec = {};
  for (const v of vecs) for (const k of SIGN_IDS) if (v[k]) out[k] = (out[k] ?? 0) + v[k]! * scale;
  return out;
};

const unit = (v: SignVec): SignVec => sum([v], 1 / (Math.sqrt(dot(v, v)) || 1));

export const bagTrait = (id: string): BagTrait => {
  const t = BAG.find((x) => x.id === id);
  if (!t) throw new Error(`В мешке нет черты ${id}`);
  return t;
};
export const natureById = (id: string): NatureDef => {
  const n = NATURES.find((x) => x.id === id);
  if (!n) throw new Error(`Нет натуры ${id}`);
  return n;
};
// Не уживаются: достаточно, чтобы одна из двух назвала другую.
export const inConflict = (a: BagTrait, b: BagTrait) => !!a.conflicts?.includes(b.id) || !!b.conflicts?.includes(a.id);
// Дальняя область мешка: черта почти не связана с ядром. Против ядра: тянет в обратную сторону.
export const isFar = (n: NatureDef, t: BagTrait) => Math.abs(cos(n.core, t.vec)) <= B.natura.farCos;
export const isContra = (n: NatureDef, t: BagTrait) => cos(n.core, t.vec) <= -B.natura.contraCos;

// Признаки человека: ядро натуры и сумма векторов его черт. Сложение убывающее: чем сильнее признак, тем меньше добавляет новая черта,
// и в потолок шкалы он не упирается.
export function signsOf(nature: NatureDef, traits: BagTrait[]): Record<Sign, number> {
  const raw = sum([sum([nature.core], B.natura.coreScale), ...traits.map((t) => t.vec)]);
  return Object.fromEntries(SIGN_IDS.map((k) => [k, round1(SIGN_MAX * Math.tanh((raw[k] ?? 0) / B.natura.signSoft))])) as Record<Sign, number>;
}
// Вектор события предыстории в признаках: его сдвиг деловых склонностей, развёрнутый обратно через веса склонностей.
export function eventVec(ev: BackstoryEvent): SignVec {
  const w = B.natura.w as Record<Axis, SignVec>;
  return sum(AXES.filter((a) => ev.shift[a]).map((a) => sum([w[a]], ev.shift[a]!)));
}
// Сколько черт человек нажил до игры: растёт с возрастом.
export function beforeCount(age: number): number {
  const extra = Math.floor(Math.max(0, age - B.natura.adultAge) / B.natura.beforeAgeStep);
  return clamp(B.natura.beforeMin + extra, B.natura.beforeMin, Math.max(B.natura.beforeMin, B.natura.beforeMax));
}
// Деловые склонности из признаков: середина звезды + поправка оси + сумма (вес × признак), в шкале звезды.
export function businessStar(signs: Record<Sign, number>): Star {
  const w = B.natura.w as Record<Axis, SignVec>;
  return Object.fromEntries(AXES.map((a) => [a, round1(clamp(B.star.center + B.natura.shift[a] + B.natura.axisGain * dot(w[a], signs), 0, STAR_MAX))])) as Star;
}

const rarityWeight = (t: BagTrait) => (t.rarity === "rare" ? B.natura.rareWeight : t.rarity === "exceptional" ? B.natura.exceptionalWeight : 1);
// Насыщение: чем сильнее признак уже набран (доля ядра и черты), тем слабее он тянет новую черту того же полюса.
export function saturation(nature: NatureDef, traits: BagTrait[], t: BagTrait): number {
  const cur = sum([sum([nature.core], B.natura.coreSat), ...traits.map((x) => x.vec)]);
  const overlap = SIGN_IDS.reduce((s, k) => s + Math.max(0, (cur[k] ?? 0) * (t.vec[k] ?? 0)), 0);
  return 1 / (1 + B.natura.satK * overlap);
}
// Вес кандидата: (близость к цели × события) с температурой × редкость × насыщение × повтор в партии.
// Температура действует только на близость и события: иначе при холодном выборе редкие черты не выпадали бы вовсе.
// target — вектор якоря или точки кристаллизации; нет цели — близость не учитывается (дальний якорь, противоречие).
export function candidateWeight(nature: NatureDef, traits: BagTrait[], t: BagTrait, target: SignVec | undefined, opts: LifeOpts = {}): number {
  const close = target ? Math.max(0, cos(t.vec, target)) + B.natura.closenessFloor : 1;
  const pull = opts.events?.length ? Math.max(B.natura.closenessFloor, 1 + B.natura.eventK * cos(t.vec, sum(opts.events))) : 1;
  const repeat = Math.pow(B.natura.repeatPenalty, opts.taken?.get(t.id) ?? 0);
  return Math.pow(close * pull, 1 / B.natura.temperature) * rarityWeight(t) * saturation(nature, traits, t) * repeat;
}

function pickWeighted(rng: Rng, items: BagTrait[], weight: (t: BagTrait) => number): BagTrait | undefined {
  const ws = items.map(weight);
  const total = ws.reduce((s, v) => s + v, 0);
  if (!items.length || total <= 0) return undefined;
  let r = rng.next() * total;
  for (let i = 0; i < items.length; i++) { r -= ws[i]; if (r < 0) return items[i]; }
  return items[items.length - 1];
}
// Кого можно взять: ещё не взят, для перка выполнено requires, ни с кем из взятых не в конфликте.
// swap — в игре нажитая черта может вытеснить ту, что названа у неё в replaces: тогда конфликт с ней не мешает.
function allowed(p: NaturaPerson, kinds: BagTrait["kind"][], swap = false): BagTrait[] {
  const blocks = (held: BagTrait, t: BagTrait) => inConflict(held, t) && !(swap && held.kind === "life" && t.replaces?.includes(held.id) && !isAnchor(p, held.id));
  return BAG.filter((t) => kinds.includes(t.kind) && !p.traits.includes(t) && !p.traits.some((x) => blocks(x, t))
    && (!t.requires || t.requires.some((id) => p.traits.some((x) => x.id === id))));
}
const isAnchor = (p: NaturaPerson, id: string) => p.anchors.includes(id) || p.far === id || p.contra === id;
// Цель роста: с шансом farShare — дальний якорь, иначе якорь ядра вместе с самим ядром (corePull).
function growthTarget(rng: Rng, p: NaturaPerson): { anchor: string; target: SignVec } {
  const fromFar = !!p.far && (rng.chance(B.natura.farShare) || !p.anchors.length);
  if (fromFar) return { anchor: p.far, target: bagTrait(p.far).vec };
  if (!p.anchors.length) return { anchor: "", target: p.nature.core };
  const anchor = rng.pick(p.anchors);
  return { anchor, target: sum([unit(bagTrait(anchor).vec), sum([unit(p.nature.core)], B.natura.corePull)]) };
}
// Событие предлагает короткий список: черты, ближайшие к его вектору. Из него и выбирает натура.
function shortList(pool: BagTrait[], ev: SignVec): BagTrait[] {
  return pool.map((t, i) => ({ t, i, c: cos(t.vec, ev) })).sort((a, b) => b.c - a.c || a.i - b.i).slice(0, B.natura.eventList).map((x) => x.t);
}
function refresh(p: NaturaPerson): NaturaPerson {
  p.signs = signsOf(p.nature, p.traits);
  p.star = businessStar(p.signs);
  return p;
}

// Человек к началу игры. Врождённое: 1–2 черты от точек кристаллизации ядра — они же якоря.
// Нажитое до игры: по черте на событие предыстории, число событий растёт с возрастом. Первая нажитая — из дальней области (дальний якорь),
// последняя — против ядра, если противоречия ещё нет.
export function growPerson(rng: Rng, nature: NatureDef, opts: GrowOpts = {}): NaturaPerson {
  const age = opts.age ?? rng.int(B.natura.ageMin, Math.max(B.natura.ageMin, B.natura.ageMax));
  const zero = signsOf(nature, []);
  const p: NaturaPerson = {
    nature, age, traits: [], anchors: [], far: "", contra: "", from: {}, via: {}, inGame: [], lost: [], events: opts.events ?? [], signs: zero, star: businessStar(zero),
  };
  const w = (target?: SignVec, events?: SignVec[]) => (t: BagTrait) => candidateWeight(nature, p.traits, t, target, { events, taken: opts.taken });
  // 1. врождённое
  const innate = rng.int(B.natura.innateMin, Math.max(B.natura.innateMin, B.natura.innateMax));
  for (const crystal of rng.shuffle(nature.crystals).slice(0, innate)) {
    const t = pickWeighted(rng, allowed(p, ["born"]).filter((x) => cos(x.vec, crystal) > 0), w(crystal, opts.events));
    if (t) { p.traits.push(t); p.anchors.push(t.id); }
  }
  // 2. нажитое до игры
  const count = beforeCount(age);
  const story = opts.backstory ?? rng.shuffle(BACKSTORY).slice(0, count);
  const hasContra = () => p.traits.find((x) => isContra(nature, x));
  story.slice(0, count).forEach((ev, i) => {
    const vec = eventVec(ev);
    const life = allowed(p, ["life"]).filter((x) => x.source.includes("backstory"));
    const far = i === 0, contra = !far && i === Math.min(count, story.length) - 1 && !hasContra();
    const narrowed = far ? life.filter((x) => isFar(nature, x)) : contra ? life.filter((x) => isContra(nature, x)) : life;
    const grow = far || contra ? undefined : growthTarget(rng, p);
    const list = shortList(narrowed.length ? narrowed : life, vec), events = [vec, ...(opts.events ?? [])];
    // если в коротком списке нет ничего в сторону якоря, событие всё равно оставляет след: выбор без оглядки на якорь
    const t = pickWeighted(rng, list, w(grow?.target, events)) ?? pickWeighted(rng, list, w(undefined, events));
    if (!t) return;
    p.traits.push(t);
    p.via[t.id] = ev.id;
    if (far) p.far = t.id;
    else if (grow?.anchor) p.from[t.id] = grow.anchor;
  });
  p.contra = hasContra()?.id ?? "";
  delete p.from[p.contra];
  return refresh(p);
}

// Жизнь в игре: по поводу (привычка, должность, отношения, перелом, поступок) человек наживает черту или перк.
// Растёт она от тех же якорей, события тянут выбор; нажитая черта может вытеснить ту, что названа у неё в replaces.
export function growLife(rng: Rng, p: NaturaPerson, opts: LifeOpts = {}): BagTrait | undefined {
  const pool = allowed(p, ["life", "perk"], true).filter((t) => !opts.trigger || t.trigger === opts.trigger);
  const grow = growthTarget(rng, p);
  const weight = (target?: SignVec) => (x: BagTrait) => candidateWeight(p.nature, p.traits, x, target, opts) * (x.kind === "perk" ? B.natura.perkWeight : 1);
  // повод случился — что-то да прилипнет: если к якорю ничего не тянется, выбор без оглядки на якорь
  const t = pickWeighted(rng, pool, weight(grow.target)) ?? pickWeighted(rng, pool, weight());
  if (!t) return undefined;
  const gone = p.traits.filter((x) => x.kind === "life" && t.replaces?.includes(x.id) && !isAnchor(p, x.id));
  p.traits = p.traits.filter((x) => !gone.includes(x));
  p.lost.push(...gone.map((x) => x.id));
  p.inGame = p.inGame.filter((id) => !gone.some((x) => x.id === id));
  p.traits.push(t);
  p.inGame.push(t.id);
  if (grow.anchor) p.from[t.id] = grow.anchor;
  if (opts.events) p.events = [...p.events, ...opts.events];
  refresh(p);
  return t;
}

// Партия: люди растут по очереди, и черта, уже взятая кем-то, выпадает следующему реже. Без natureIds натуры случайные и не повторяются.
export function growParty(seed: string, size: number, natureIds?: string[]): NaturaPerson[] {
  const rng = new Rng(seed);
  const natures = natureIds ? natureIds.map(natureById) : rng.shuffle(NATURES).slice(0, size);
  const taken = new Map<string, number>();
  return natures.map((n) => {
    const p = growPerson(rng, n, { taken });
    for (const t of p.traits) taken.set(t.id, (taken.get(t.id) ?? 0) + 1);
    return p;
  });
}

// Один реролл для отчёта: случайный возраст (или заданный), рождение, предыстория и несколько поводов в игре.
export function rollPerson(seed: string, nature: NatureDef, age?: number): NaturaPerson {
  const rng = new Rng(seed);
  const p = growPerson(rng, nature, { age });
  for (let i = 0; i < B.natura.lifeSteps; i++) growLife(rng, p, { trigger: rng.pick(TRIGGERS), events: [eventVec(rng.pick(BACKSTORY))] });
  return p;
}
