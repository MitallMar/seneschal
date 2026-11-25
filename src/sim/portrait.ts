// Портрет человека по Концепту 3 (задача И27а): чего хочет, что его удерживает, чем его взять, что помнит, как говорит, с кем ладит, чем виден.
// Складывается из признаков по правилу по умолчанию (src/data/portrait.ts), происхождения и особенного его черт. Замысел — docs/design/cherty-dannye.md, разделы 1–2.
// Происхождение ложится поверх признаков и под чертами — как слабая черта (задача И27д; natura.md, раздел 9, ответы автора по И27в).
// Случайности нет: один и тот же человек — один и тот же портрет. Стоит отдельно от совета, числа — natura.portrait в balance.ts.
import type {
  Sign, BagTrait, Rarity, Vis, Want, Hold, Approach, MemKey, Bias, Channel, LinkKey, TraitThread, TraitDeed, TraitHolder, TraitTraces, TraitIf, TraitNoteKey,
} from "../data/types";
import { SIGNS } from "../data/natura";
import { POLE_RULES, WANTS, HOLDS, APPROACHES, MEM_KEYS, LINK_GROUPS, POLE_PEOPLE, type PoleRule, type MemScale } from "../data/portrait";
import { ALLOYS, type AlloyDef, type OriginDef } from "../data/origins";
import { BALANCE as B } from "./balance";
import { round2 } from "./util";
import { originById, isSeneschal, type NaturaPerson } from "./natura";

// Откуда строка портрета: от признака (from — имя полюса), от черты (from — имя черты) или от происхождения (origin; from — его имя).
export interface Src { from: string; trait: boolean; origin?: boolean }
// Происхождение для портрета. noStrangers — «чужие» происхождения не применяются: так у Сенешаля.
export interface PortraitOrigin { origin: OriginDef; noStrangers?: boolean }
// Слагаемое числа: кто и сколько добавил.
export interface Part extends Src { v: number }
// from — чей это след: имя полюса признака или черты.
export interface PortraitTrace { gde: Channel[]; text: string; vis: Vis; from: string; trait: boolean }
export interface Portrait {
  wants: Record<Want, number>;
  holds: Record<Hold, number>;
  holdNotes: string[];
  sluchay: number;
  approach: { da: Approach[]; net: Approach[]; notes: string[] };
  memory: Record<MemScale, number> & { pomnit: MemKey[]; proshchaet: MemKey[] };
  voice: { manners: string[]; bias: Bias; biasFrom: string; notes: string[] };
  links: { ladit: LinkKey[]; neLadit: LinkKey[]; start: number; notes: string[] };
  traces: { ten: number; tenSfery: number; yasnost: number; razgovor: number; chuzhie?: TraitTraces["chuzhie"]; lines: PortraitTrace[] };
  ifs: (TraitIf & { from: string })[];          // поправки с оговоркой: в числа выше не входят
  threads: (TraitThread & { from: string; origin?: boolean })[]; // origin — нить от происхождения: к ней человек склонен
  deed: (TraitDeed & { from: string })[];
  holder: (TraitHolder & { from: string })[];
  likho: number;                                // прикрытие лиху от пороков и от засидевшегося с нечистой совестью
  likhoYasnost: number;                         // плюс — следы лиха в его сфере ярче: свои люди честного работают на Сенешаля
  notes: { key: TraitNoteKey; from: string; text: string }[]; // фразы автора по полям черт: оговорки, которых нет в ключах
  alloys: { id: string; name: string; text: string }[]; // сплавы: имя и особенность, когда сошлись все части
  // откуда каждая строка: у чисел — слагаемые, у списков — чей ключ взял верх
  by: {
    wants: Record<Want, Part[]>; holds: Record<Hold, Part[]>; sluchay: Part[]; memory: Record<MemScale, Part[]>;
    approach: Partial<Record<Approach, Src>>; memKeys: Partial<Record<MemKey, Src>>; links: Partial<Record<LinkKey, Src>>;
    manners: Src[]; bias: Src | null;
  };
}

// Полюс признака у человека: строка правила, сила (модуль признака) и имя полюса.
export interface Pole { rule: PoleRule; v: number; name: string }
const RARITY_RANK: Record<Rarity, number> = { common: 0, rare: 1, exceptional: 2 };

// Видимость черты: своя, а пока не задана — «скрытая» у черты, которая открывается только поступком, иначе «явная».
export const traitVis = (t: BagTrait): Vis => t.vis ?? (t.hidden ? "skrytaya" : "yavnaya");
// Полюса человека — от сильного к слабому; при равной силе — в порядке признаков.
export function polesOf(signs: Record<Sign, number>): Pole[] {
  return SIGNS.filter((s) => signs[s.id]).map((s) => {
    const plus = signs[s.id] > 0;
    return { rule: POLE_RULES.find((r) => r.sign === s.id && r.plus === plus)!, v: Math.abs(signs[s.id]), name: plus ? s.plus : s.minus };
  }).sort((a, b) => b.v - a.v);
}
export const isNotable = (v: number) => Math.abs(v) >= B.natura.portrait.notable;
export const isStrong = (v: number) => Math.abs(v) >= B.natura.portrait.strong;
// Число словами для экрана: насколько желание, удержка или память сильнее или слабее обычного. Пусто — как у всех.
export function strengthWord(v: number): "" | "сильнее" | "намного сильнее" | "слабее" | "намного слабее" {
  const P = B.natura.portrait, a = Math.abs(v);
  if (a < P.wordFrom) return "";
  return v > 0 ? (a >= P.wordStrong ? "намного сильнее" : "сильнее") : a >= P.wordStrong ? "намного слабее" : "слабее";
}
// Слово связи: группа людей или люди полюса признака.
export function linkName(key: LinkKey): string {
  const group = LINK_GROUPS.find((g) => g.id === key);
  if (group) return group.name;
  const sign = key.slice(0, -1) as Sign;
  return key.endsWith("+") ? POLE_PEOPLE[sign].plus : POLE_PEOPLE[sign].minus;
}

// Список с двумя сторонами («работает / не действует», «ладит / не ладит», «помнит / прощает»): у ключа — одна сторона.
// Между признаками верх берёт более сильный полюс, при равной силе — вторая сторона (не тот подход хуже никакого); черта перекрывает признак, поздняя черта — раннюю.
class Sided<K extends string> {
  private at = new Map<K, { second: boolean; force: number; src: Src }>();
  put(keys: K[] | undefined, second: boolean, force: number, src: Src) {
    for (const k of keys ?? []) {
      const was = this.at.get(k);
      if (!was || force > was.force || (force === was.force && second)) this.at.set(k, { second, force, src });
    }
  }
  origin(): Partial<Record<K, Src>> { return Object.fromEntries([...this.at].map(([k, x]) => [k, x.src])) as Partial<Record<K, Src>>; }
  side(second: boolean, order: K[]): K[] {
    const mine = [...this.at].filter(([, x]) => x.second === second).map(([k]) => k);
    return [...order.filter((k) => mine.includes(k)), ...mine.filter((k) => !order.includes(k))];
  }
}

// Сплавы человека: все части сошлись. Часть дана чертой — она у человека есть; полюсом — он не слабее порога.
// Сошлись одни признаки — нужны сильные полюса; хотя бы одна часть дана чертой — полюсам хватит заметного.
export function alloysOf(signs: Record<Sign, number>, traits: BagTrait[] = []): AlloyDef[] {
  const P = B.natura.portrait, has = (ids: string[] | undefined) => !!ids?.some((id) => traits.some((t) => t.id === id));
  const value = (pole: string) => signs[pole.slice(0, -1) as Sign] * (pole.endsWith("+") ? 1 : -1);
  return ALLOYS.filter((a) => {
    const need = a.parts.some((x) => has(x.traits)) ? P.notable : P.strong;
    return a.parts.every((x) => has(x.traits) || (!!x.pole && value(x.pole) >= need));
  });
}
// Портрет по признакам и чертам. Черты — в порядке появления у человека: последняя нажита позже всех.
// Особенность сплава ложится поверх всего — как у черты, нажитой последней.
// Происхождение — поверх признаков и под чертами: желания и удержки складываются со всеми, а где оно спорит с чертой («ладит / не ладит»), верна черта.
export function portraitOf(signs: Record<Sign, number>, own: BagTrait[] = [], whence?: PortraitOrigin): Portrait {
  const P = B.natura.portrait, poles = polesOf(signs), notable = poles.filter((p) => isNotable(p.v));
  const alloys = alloysOf(signs, own);
  const traits: BagTrait[] = [...own, ...alloys.map((a): BagTrait => ({
    id: a.id, name: `сплав «${a.name}»`, desc: a.text, effect: a.text, kind: "life", vec: {}, rarity: "common", source: [], ...a.c3,
  }))];
  const zero = <K extends string>(list: { id: K }[]) => Object.fromEntries(list.map((x) => [x.id, 0])) as Record<K, number>;
  const parts = <K extends string>(list: { id: K }[]) => Object.fromEntries(list.map((x) => [x.id, [] as Part[]])) as Record<K, Part[]>;
  const MEM: { id: MemScale }[] = [{ id: "obida" }, { id: "srok" }, { id: "dobro" }];
  const wants = zero(WANTS), holds = zero(HOLDS), mem = zero(MEM);
  const from = { wants: parts(WANTS), holds: parts(HOLDS), sluchay: [] as Part[], memory: parts(MEM) };
  // слагаемое числа: нулевые не записываются
  const add = <K extends string>(sum: Record<K, number>, log: Record<K, Part[]>, key: K, v: number | undefined, src: Src) => {
    if (v) { sum[key] += v; log[key].push({ ...src, v: round2(v) }); }
  };
  let sluchay = 0, start = 0, ten = 0, tenSfery = 0, yasnost = 0, razgovor = 0, likho = 0, likhoYasnost = 0;
  let chuzhie: TraitTraces["chuzhie"];
  const chance = (v: number | undefined, src: Src) => { if (v) { sluchay += v; from.sluchay.push({ ...src, v: round2(v) }); } };
  // числа: вклад полюса растёт с признаком, порога нет
  for (const { rule: r, v, name } of poles) {
    const k = v / P.divisor, src: Src = { from: name, trait: false };
    for (const x of WANTS) add(wants, from.wants, x.id, (r.wants?.[x.id] ?? 0) * k, src);
    for (const x of HOLDS) add(holds, from.holds, x.id, (r.holds?.[x.id] ?? 0) * k, src);
    chance((r.sluchay ?? 0) * k, src);
    for (const x of MEM) add(mem, from.memory, x.id, (r[x.id] ?? 0) * k, src);
  }
  // списки: только заметные полюса
  const approach = new Sided<Approach>(), links = new Sided<LinkKey>(), memory = new Sided<MemKey>();
  const holdNotes: string[] = [], approachNotes: string[] = [], linkNotes: string[] = [], voiceNotes: string[] = [], lines: PortraitTrace[] = [];
  for (const { rule: r, v, name } of notable) {
    const src: Src = { from: name, trait: false };
    approach.put(r.da, false, v, src); approach.put(r.net, true, v, src);
    links.put(r.ladit, false, v, src); links.put(r.neLadit, true, v, src);
    memory.put(r.pomnit, false, v, src);
    if (r.holdNote) holdNotes.push(`${name}: ${r.holdNote}`);
    if (r.netNote) approachNotes.push(`${name}: ${r.netNote}`);
    if (r.linkNote) linkNotes.push(`${name}: ${r.linkNote}`);
    start += r.start ?? 0; ten += r.ten ?? 0; yasnost += r.yasnost ?? 0;
    if (r.trace) lines.push({ gde: r.trace.gde, text: r.trace.text, vis: isStrong(v) ? "yavnaya" : "so_vremenem", from: name, trait: false });
  }
  const mannered = notable.filter((p) => p.rule.manner).slice(0, 2);
  // пристрастие доклада: у самого сильного из заметных полюсов, у которых оно есть
  const biased = notable.find((p) => p.rule.bias && (!p.rule.biasStrong || isStrong(p.v)));
  let bias: Bias = biased?.rule.bias ?? "bez", biasSrc: Src | null = biased ? { from: biased.name, trait: false } : null, biasRank = -1;
  const top = Number.MAX_SAFE_INTEGER, said: { text: string; src: Src }[] = [];
  const ifs: Portrait["ifs"] = [], threads: Portrait["threads"] = [], deed: Portrait["deed"] = [], holder: Portrait["holder"] = [], notes: Portrait["notes"] = [];
  // происхождение: сильнее любого признака, слабее любой черты
  if (whence) {
    const o = whence.origin, src: Src = { from: o.name, trait: false, origin: true }, force = top - traits.length - 1;
    for (const k of o.wants) add(wants, from.wants, k, P.originForce, src);
    for (const k of o.holds ?? []) add(holds, from.holds, k, P.originForce, src);
    links.put(o.ladit, false, force, src);
    if (!whence.noStrangers) links.put(o.neLadit, true, force, src);
    for (const nit of o.threads) threads.push({ nit, kak: "tolkaet", from: o.name, origin: true });
  }
  // особенное черт поверх признаков и происхождения
  traits.forEach((t, i) => {
    const src: Src = { from: t.name, trait: true }, force = top - traits.length + i;
    for (const x of WANTS) add(wants, from.wants, x.id, t.wants?.[x.id], src);
    for (const x of HOLDS) add(holds, from.holds, x.id, t.holds?.[x.id], src);
    chance(t.sluchay, src);
    for (const x of MEM) add(mem, from.memory, x.id, t.memory?.[x.id], src);
    approach.put(t.approach?.da, false, force, src); approach.put(t.approach?.net, true, force, src);
    links.put(t.links?.ladit, false, force, src); links.put(t.links?.neLadit, true, force, src);
    memory.put(t.memory?.pomnit, false, force, src); memory.put(t.memory?.proshchaet, true, force, src);
    if (t.approach?.note) approachNotes.push(`${t.name}: ${t.approach.note}`);
    if (t.voice?.note) voiceNotes.push(`${t.name}: ${t.voice.note}`);
    if (t.voice?.manner) said.push({ text: t.voice.manner, src });
    // из двух черт с пристрастием — у более редкой, при равной редкости — у нажитой позже; «сильнее любой другой черты» — выше всякой редкости
    const rank = RARITY_RANK[t.rarity] + (t.voice?.top ? Object.keys(RARITY_RANK).length : 0);
    if (t.voice?.bias && rank >= biasRank) { bias = t.voice.bias; biasSrc = src; biasRank = rank; }
    start += t.links?.start ?? 0;
    ten += t.traces?.ten ?? 0; tenSfery += t.traces?.tenSfery ?? 0; yasnost += t.traces?.yasnost ?? 0; razgovor += t.traces?.razgovor ?? 0;
    chuzhie = t.traces?.chuzhie ?? chuzhie;
    for (const l of t.traces?.lines ?? []) lines.push({ gde: [l.gde], text: l.text, vis: traitVis(t), from: t.name, trait: true });
    for (const x of t.ifs ?? []) ifs.push({ ...x, from: t.name });
    for (const x of t.threads ?? []) threads.push({ ...x, from: t.name });
    for (const x of t.deed ?? []) deed.push({ ...x, from: t.name });
    for (const x of t.holder ?? []) holder.push({ ...x, from: t.name });
    for (const [key, text] of Object.entries(t.notes ?? {})) notes.push({ key: key as TraitNoteKey, from: t.name, text });
    likho += t.likho ?? 0;
  });
  // лихо по весам: свои люди засидевшегося прикрывают лихо, если совесть его не держит, и служат глазами, если он честен
  const sovest = round2(holds.sovest);
  const cover = traits.filter((x) => x.likhoByWeights).length;
  if (sovest < 0) likho += cover;
  else if (sovest >= P.honestFrom) likhoYasnost += cover;
  const rounded = <K extends string>(o: Record<K, number>) => Object.fromEntries(Object.entries<number>(o).map(([k, v]) => [k, round2(v)])) as Record<K, number>;
  const approachOrder = APPROACHES.map((x) => x.id), memOrder = MEM_KEYS.map((x) => x.id), linkOrder: LinkKey[] = LINK_GROUPS.map((x) => x.id);
  return {
    wants: rounded(wants), holds: rounded(holds), holdNotes, sluchay: round2(sluchay),
    approach: { da: approach.side(false, approachOrder), net: approach.side(true, approachOrder), notes: approachNotes },
    memory: { ...rounded(mem), pomnit: memory.side(false, memOrder), proshchaet: memory.side(true, memOrder) },
    voice: { manners: [...said.map((x) => x.text), ...mannered.map((p) => p.rule.manner!)], bias, biasFrom: biasSrc?.from ?? "", notes: voiceNotes },
    links: { ladit: links.side(false, linkOrder), neLadit: links.side(true, linkOrder), start: round2(start), notes: linkNotes },
    traces: { ten: round2(ten), tenSfery: round2(tenSfery), yasnost: round2(yasnost), razgovor: round2(razgovor), chuzhie, lines },
    ifs, threads, deed, holder, likho: round2(likho), likhoYasnost: round2(likhoYasnost), notes,
    alloys: alloys.map((a) => ({ id: a.id, name: a.name, text: a.text })),
    by: {
      ...from, approach: approach.origin(), memKeys: memory.origin(), links: links.origin(),
      manners: [...said.map((x) => x.src), ...mannered.map((p): Src => ({ from: p.name, trait: false }))], bias: biasSrc,
    },
  };
}
// Портрет человека из генератора натуры. В счёт идёт настоящее происхождение: у человека с тайной — то, кем он был, а не кем зовётся на людях.
export const portrait = (p: NaturaPerson): Portrait => portraitOf(p.signs, p.traits, { origin: originById(p.origin), noStrangers: isSeneschal(p) });
