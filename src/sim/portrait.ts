// Портрет человека по Концепту 3 (задача И27а): чего хочет, что его удерживает, чем его взять, что помнит, как говорит, с кем ладит, чем виден.
// Складывается из признаков по правилу по умолчанию (src/data/portrait.ts) и особенного его черт. Замысел — docs/design/cherty-dannye.md, разделы 1–2.
// Случайности нет: один и тот же человек — один и тот же портрет. Стоит отдельно от совета, числа — natura.portrait в balance.ts.
import type {
  Sign, BagTrait, Rarity, Vis, Want, Hold, Approach, MemKey, Bias, Channel, LinkKey, TraitThread, TraitDeed, TraitHolder, TraitTraces,
} from "../data/types";
import { SIGNS } from "../data/natura";
import { POLE_RULES, WANTS, HOLDS, APPROACHES, MEM_KEYS, LINK_GROUPS, POLE_PEOPLE, type PoleRule, type MemScale } from "../data/portrait";
import { BALANCE as B } from "./balance";
import { round2 } from "./util";
import type { NaturaPerson } from "./natura";

// from — чей это след: имя полюса признака или черты.
export interface PortraitTrace { gde: Channel[]; text: string; vis: Vis; from: string }
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
  threads: TraitThread[];
  deed: TraitDeed[];
  holder: TraitHolder[];
  likho: number;
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
  private at = new Map<K, { second: boolean; force: number }>();
  put(keys: K[] | undefined, second: boolean, force: number) {
    for (const k of keys ?? []) {
      const was = this.at.get(k);
      if (!was || force > was.force || (force === was.force && second)) this.at.set(k, { second, force });
    }
  }
  side(second: boolean, order: K[]): K[] {
    const mine = [...this.at].filter(([, x]) => x.second === second).map(([k]) => k);
    return [...order.filter((k) => mine.includes(k)), ...mine.filter((k) => !order.includes(k))];
  }
}

// Портрет по признакам и чертам. Черты — в порядке появления у человека: последняя нажита позже всех.
export function portraitOf(signs: Record<Sign, number>, traits: BagTrait[] = []): Portrait {
  const P = B.natura.portrait, poles = polesOf(signs), notable = poles.filter((p) => isNotable(p.v));
  const wants = Object.fromEntries(WANTS.map((x) => [x.id, 0])) as Record<Want, number>;
  const holds = Object.fromEntries(HOLDS.map((x) => [x.id, 0])) as Record<Hold, number>;
  const mem: Record<MemScale, number> = { obida: 0, srok: 0, dobro: 0 };
  let sluchay = 0, start = 0, ten = 0, tenSfery = 0, yasnost = 0, razgovor = 0, likho = 0;
  let chuzhie: TraitTraces["chuzhie"];
  // числа: вклад полюса растёт с признаком, порога нет
  for (const { rule: r, v } of poles) {
    const k = v / P.divisor;
    for (const x of WANTS) wants[x.id] += (r.wants?.[x.id] ?? 0) * k;
    for (const x of HOLDS) holds[x.id] += (r.holds?.[x.id] ?? 0) * k;
    sluchay += (r.sluchay ?? 0) * k;
    mem.obida += (r.obida ?? 0) * k; mem.srok += (r.srok ?? 0) * k; mem.dobro += (r.dobro ?? 0) * k;
  }
  // списки: только заметные полюса
  const approach = new Sided<Approach>(), links = new Sided<LinkKey>(), memory = new Sided<MemKey>();
  const holdNotes: string[] = [], approachNotes: string[] = [], linkNotes: string[] = [], voiceNotes: string[] = [], lines: PortraitTrace[] = [];
  for (const { rule: r, v, name } of notable) {
    approach.put(r.da, false, v); approach.put(r.net, true, v);
    links.put(r.ladit, false, v); links.put(r.neLadit, true, v);
    memory.put(r.pomnit, false, v);
    if (r.holdNote) holdNotes.push(`${name}: ${r.holdNote}`);
    if (r.netNote) approachNotes.push(`${name}: ${r.netNote}`);
    if (r.linkNote) linkNotes.push(`${name}: ${r.linkNote}`);
    start += r.start ?? 0; ten += r.ten ?? 0; yasnost += r.yasnost ?? 0;
    if (r.trace) lines.push({ gde: r.trace.gde, text: r.trace.text, vis: isStrong(v) ? "yavnaya" : "so_vremenem", from: name });
  }
  const manners = notable.filter((p) => p.rule.manner).slice(0, 2).map((p) => p.rule.manner!);
  // пристрастие доклада: у самого сильного из заметных полюсов, у которых оно есть
  const biased = notable.find((p) => p.rule.bias && (!p.rule.biasStrong || isStrong(p.v)));
  let bias: Bias = biased?.rule.bias ?? "bez", biasFrom = biased?.name ?? "", biasRank = -1;
  // особенное черт поверх признаков
  const top = Number.MAX_SAFE_INTEGER, threads: TraitThread[] = [], deed: TraitDeed[] = [], holder: TraitHolder[] = [], own: string[] = [];
  traits.forEach((t, i) => {
    for (const x of WANTS) wants[x.id] += t.wants?.[x.id] ?? 0;
    for (const x of HOLDS) holds[x.id] += t.holds?.[x.id] ?? 0;
    sluchay += t.sluchay ?? 0;
    mem.obida += t.memory?.obida ?? 0; mem.srok += t.memory?.srok ?? 0; mem.dobro += t.memory?.dobro ?? 0;
    approach.put(t.approach?.da, false, top - traits.length + i); approach.put(t.approach?.net, true, top - traits.length + i);
    links.put(t.links?.ladit, false, top - traits.length + i); links.put(t.links?.neLadit, true, top - traits.length + i);
    memory.put(t.memory?.pomnit, false, top - traits.length + i); memory.put(t.memory?.proshchaet, true, top - traits.length + i);
    if (t.approach?.note) approachNotes.push(`${t.name}: ${t.approach.note}`);
    if (t.voice?.note) voiceNotes.push(`${t.name}: ${t.voice.note}`);
    if (t.voice?.manner) own.push(t.voice.manner);
    // из двух черт с пристрастием — у более редкой, при равной редкости — у нажитой позже
    if (t.voice?.bias && RARITY_RANK[t.rarity] >= biasRank) { bias = t.voice.bias; biasFrom = t.name; biasRank = RARITY_RANK[t.rarity]; }
    start += t.links?.start ?? 0;
    ten += t.traces?.ten ?? 0; tenSfery += t.traces?.tenSfery ?? 0; yasnost += t.traces?.yasnost ?? 0; razgovor += t.traces?.razgovor ?? 0;
    chuzhie = t.traces?.chuzhie ?? chuzhie;
    for (const l of t.traces?.lines ?? []) lines.push({ gde: [l.gde], text: l.text, vis: traitVis(t), from: t.name });
    threads.push(...(t.threads ?? [])); deed.push(...(t.deed ?? [])); holder.push(...(t.holder ?? []));
    likho += t.likho ?? 0;
  });
  const rounded = <K extends string>(o: Record<K, number>) => Object.fromEntries(Object.entries<number>(o).map(([k, v]) => [k, round2(v)])) as Record<K, number>;
  const approachOrder = APPROACHES.map((x) => x.id), memOrder = MEM_KEYS.map((x) => x.id), linkOrder: LinkKey[] = LINK_GROUPS.map((x) => x.id);
  return {
    wants: rounded(wants), holds: rounded(holds), holdNotes, sluchay: round2(sluchay),
    approach: { da: approach.side(false, approachOrder), net: approach.side(true, approachOrder), notes: approachNotes },
    memory: { ...rounded(mem), pomnit: memory.side(false, memOrder), proshchaet: memory.side(true, memOrder) },
    voice: { manners: [...own, ...manners], bias, biasFrom, notes: voiceNotes },
    links: { ladit: links.side(false, linkOrder), neLadit: links.side(true, linkOrder), start: round2(start), notes: linkNotes },
    traces: { ten: round2(ten), tenSfery: round2(tenSfery), yasnost: round2(yasnost), razgovor: round2(razgovor), chuzhie, lines },
    threads, deed, holder, likho: round2(likho),
  };
}
// Портрет человека из генератора натуры.
export const portrait = (p: NaturaPerson): Portrait => portraitOf(p.signs, p.traits);
