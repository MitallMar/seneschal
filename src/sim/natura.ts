// Генератор натур (задача И8): рост древа черт от точек кристаллизации. Замысел и правила — docs/design/natura.md, раздел 5.
// Стоит отдельно от совета: sim.ts его не зовёт. Без экрана; случайность только через Rng, числа — раздел natura в balance.ts.
import type { Axis, Star, Sign, SignVec, NatureDef, BagTrait } from "../data/types";
import { AXES } from "../data/core";
import { SIGNS, NATURES, BAG } from "../data/natura";
import { BALANCE as B } from "./balance";
import { Rng } from "./rng";
import { STAR_MAX } from "./sim";

// Шкала признака (не баланс): −5…+5.
export const SIGN_MAX = 5;
const SIGN_IDS: Sign[] = SIGNS.map((s) => s.id);

export interface NaturaPerson {
  nature: NatureDef;
  traits: BagTrait[];          // в порядке появления
  anchors: string[];           // id черт-якорей из точек кристаллизации ядра
  far: string;                 // id дальнего якоря
  contra: string;              // id черты-противоречия (может совпасть с дальним якорем или вырасти от него)
  from: Record<string, string>; // от какого якоря выросла черта: id черты → id якоря (у якорей и противоречия записи нет)
  events: SignVec[];           // события жизни, которые тянули рост
  signs: Record<Sign, number>; // признаки: ядро + черты
  star: Star;                  // деловые склонности, посчитанные из признаков
}
// taken — сколько раз черту уже взяли другие в этой партии (штраф за повтор); count — сколько черт при рождении.
export interface GrowOpts { events?: SignVec[]; taken?: Map<string, number>; count?: number }

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const round1 = (v: number) => Math.round(v * 10) / 10;
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

// Признаки человека: ядро натуры и сумма векторов его черт.
export function signsOf(nature: NatureDef, traits: BagTrait[]): Record<Sign, number> {
  const raw = sum([sum([nature.core], B.natura.coreScale), ...traits.map((t) => t.vec)]);
  return Object.fromEntries(SIGN_IDS.map((k) => [k, round1(clamp(raw[k] ?? 0, -SIGN_MAX, SIGN_MAX))])) as Record<Sign, number>;
}
// Деловые склонности из признаков: середина звезды + поправка оси + сумма (вес × признак), в шкале звезды.
export function businessStar(signs: Record<Sign, number>): Star {
  const w = B.natura.w as Record<Axis, SignVec>;
  return Object.fromEntries(AXES.map((a) => [a, round1(clamp(B.star.center + B.natura.shift[a] + dot(w[a], signs), 0, STAR_MAX))])) as Star;
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
export function candidateWeight(nature: NatureDef, traits: BagTrait[], t: BagTrait, target: SignVec | undefined, opts: GrowOpts = {}): number {
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
// Кого можно взять: ещё не взят, ни с кем из взятых не в конфликте, для перка выполнено requires.
function allowed(traits: BagTrait[], kinds: BagTrait["kind"][]): BagTrait[] {
  return BAG.filter((t) => kinds.includes(t.kind) && !traits.includes(t) && !traits.some((x) => inConflict(x, t))
    && (!t.requires || t.requires.some((id) => traits.some((x) => x.id === id))));
}
// Очередная черта растёт от одного из якорей: с шансом farShare — от дальнего, иначе от якоря ядра.
function growFrom(rng: Rng, p: NaturaPerson, kinds: BagTrait["kind"][], opts: GrowOpts): BagTrait | undefined {
  const t = pickFrom(rng, p, kinds, opts);
  if (t) { p.traits.push(t.trait); p.from[t.trait.id] = t.anchor; }
  return t?.trait;
}
function pickFrom(rng: Rng, p: NaturaPerson, kinds: BagTrait["kind"][], opts: GrowOpts): { trait: BagTrait; anchor: string } | undefined {
  const fromFar = rng.chance(B.natura.farShare) || !p.anchors.length;
  const anchorId = fromFar ? p.far : rng.pick(p.anchors);
  const anchor = bagTrait(anchorId).vec;
  // куст у якоря ядра тянется и к самому ядру (corePull); куст дальнего якоря растёт сам по себе
  const target = fromFar ? anchor : sum([unit(anchor), sum([unit(p.nature.core)], B.natura.corePull)]);
  const trait = pickWeighted(rng, allowed(p.traits, kinds), (t) => candidateWeight(p.nature, p.traits, t, target, opts));
  return trait && { trait, anchor: anchorId };
}
function refresh(p: NaturaPerson): NaturaPerson {
  p.signs = signsOf(p.nature, p.traits);
  p.star = businessStar(p.signs);
  return p;
}

// Человек при рождении: якоря из точек кристаллизации ядра, один якорь из дальней области, рост от якорей, обязательное противоречие.
export function growPerson(rng: Rng, nature: NatureDef, opts: GrowOpts = {}): NaturaPerson {
  const count = opts.count ?? rng.int(B.natura.birthMin, Math.max(B.natura.birthMin, B.natura.birthMax));
  const p: NaturaPerson = { nature, traits: [], anchors: [], far: "", contra: "", from: {}, events: opts.events ?? [], signs: signsOf(nature, []), star: businessStar(signsOf(nature, [])) };
  const born = () => allowed(p.traits, ["born"]);
  const w = (target?: SignVec) => (t: BagTrait) => candidateWeight(nature, p.traits, t, target, opts);
  // 1. якоря ядра: по одному от разных точек кристаллизации
  for (const crystal of rng.shuffle(nature.crystals).slice(0, B.natura.anchorsNear)) {
    const t = pickWeighted(rng, born().filter((x) => cos(x.vec, crystal) > 0), w(crystal));
    if (t) { p.traits.push(t); p.anchors.push(t.id); }
  }
  // 2. дальний якорь: черта, почти не связанная с ядром, — источник второго куста
  const far = pickWeighted(rng, born().filter((x) => isFar(nature, x)), w());
  if (far) { p.traits.push(far); p.far = far.id; }
  // 3. рост от якорей; последнее место придержано под противоречие, пока его нет
  const hasContra = () => p.traits.find((x) => isContra(nature, x));
  while (p.traits.length < count - (hasContra() ? 0 : 1)) {
    if (!growFrom(rng, p, ["born"], opts)) break;
  }
  // 4. обязательное противоречие: одна черта против ядра
  if (!hasContra()) {
    const t = pickWeighted(rng, born().filter((x) => isContra(nature, x)), w());
    if (t) p.traits.push(t);
  }
  p.contra = hasContra()?.id ?? "";
  return refresh(p);
}

// Жизнь: следующая черта жизни или перк растёт от тех же якорей, события жизни тянут выбор в свою сторону.
export function growLife(rng: Rng, p: NaturaPerson, opts: GrowOpts = {}): BagTrait | undefined {
  const t = growFrom(rng, p, ["life", "perk"], opts);
  if (!t) return undefined;
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

// Событие судьбы для прогонов: случайный признак, случайный полюс.
export function fateEvent(rng: Rng): SignVec {
  return { [rng.pick(SIGN_IDS)]: rng.chance(1 / 2) ? B.natura.fateStrength : -B.natura.fateStrength };
}
// Один реролл для отчёта: судьба (несколько событий), рождение и несколько шагов жизни.
export function rollPerson(seed: string, nature: NatureDef): NaturaPerson {
  const rng = new Rng(seed);
  const events = Array.from({ length: B.natura.fateEvents }, () => fateEvent(rng));
  const p = growPerson(rng, nature, { events });
  for (let i = 0; i < B.natura.lifeSteps; i++) growLife(rng, p, { events: [fateEvent(rng)] });
  return p;
}
