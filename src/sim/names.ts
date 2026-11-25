// Генератор имени (задача И26): имя из мешка по группе и полу, без тёзок в одном месте и поколении. Замысел — docs/design/imena.md.
// Случайность только через Rng: одно семя и одни запросы — одни имена. К партии пока не подключён: имена людей прототипа заданы в ROSTER.
import { NAMES_BASE, NAMES_TINT, NAMES_PEOPLE, NICKNAMES, type NameBag, type PeopleId } from "../data/names";
import { BALANCE as B } from "./balance";
import type { Rng } from "./rng";

// Группа: крестьянин марок (оттенок с долей names.tint, иначе основа); замок, палата и пришлые (основа); народ — свой мешок.
export type NameGroup = "peasant" | "castle" | PeopleId;
// place и generation — где и в каком поколении человек живёт: тёзок нет внутри одной такой пары.
// father, husband — имена отца и мужа, если известны: по ним различают тёзку. circle — имена совета и ближнего круга, куда человек входит.
export interface NameAsk { group: NameGroup; female: boolean; place?: string; generation?: number; father?: string; husband?: string; circle?: string[] }
// name — само имя; full — как человека зовут, чтобы не спутать (у тёзки — с отцом, мужем или прозвищем); by — чем различён; tint — имя из славянского оттенка.
export interface Named { name: string; full: string; by?: "отец" | "муж" | "прозвище"; tint: boolean }
// Книга имён: кто уже есть в каждом месте и поколении.
export type NameBook = Map<string, { names: Set<string>; full: Set<string> }>;
export const newNameBook = (): NameBook => new Map();

const low = (s: string) => s.toLowerCase();
// Склад имени: его начало и его окончание — две первые и две последние буквы.
export const sameStart = (a: string, b: string): boolean => low(a).slice(0, 2) === low(b).slice(0, 2);
export const sameEnd = (a: string, b: string): boolean => low(a).slice(-2) === low(b).slice(-2);
// В совете и ближнем круге — не больше двух имён одного склада: с одним началом и с одним окончанием счёт отдельный.
export const mouldOk = (names: string[]): boolean => names.every((n) => names.filter((x) => sameStart(x, n)).length <= 2 && names.filter((x) => sameEnd(x, n)).length <= 2);
export const fitsCircle = (name: string, circle: string[] = []): boolean => circle.filter((c) => sameStart(c, name)).length < 2 && circle.filter((c) => sameEnd(c, name)).length < 2;

// «Радимов», «Любошев», «Ратшин»: чей сын. Пусто — от такого имени по отцу не зовут (внешние имена туллов, лесные).
export function ofFather(name: string): string | null {
  if (/[жшчщц]$/.test(name)) return `${name}ев`;
  if (/[бвгдзклмнпрстфх]$/.test(name)) return `${name}ов`;
  if (/[йь]$/.test(name)) return `${name.slice(0, -1)}ев`;
  if (/[ая]$/.test(name)) return `${name.slice(0, -1)}ин`;
  if (/о$/.test(name)) return `${name.slice(0, -1)}ов`;
  return null;
}
// «Буданиха», «Радчиха»: жена или вдова по мужу — так зовут крестьянок марок.
export function byHusband(name: string): string {
  const stem = name.replace(/[аяоейь]$/, "");
  return `${stem.replace(/к$/, "ч").replace(/г$/, "ж")}иха`;
}
// Прозвище в нужном роде: прилагательное у женщины — «Косая», «Верхняя»; существительное на -а и -я годится всем; прочие — только мужчинам.
export function nickFor(nick: string, female: boolean): string | null {
  if (!female) return nick;
  if (/(ой|ый)$/.test(nick)) return `${nick.slice(0, -2)}ая`;
  if (/ий$/.test(nick)) return `${nick.slice(0, -2)}${/[гкхжшчщ]ий$/.test(nick) ? "ая" : "яя"}`;
  return /[ая]$/.test(nick) ? nick : null;
}

const bagOf = (bag: NameBag, female: boolean) => (female ? bag.f : bag.m);

// Имя человеку. Пока в мешке есть свободные имена, тёзок не бывает; мешок вычерпан — имя повторяется, и человека различают:
// замужнюю крестьянку — по мужу, остальных — по отцу, а если отец неизвестен или так уже зовут другого — прозвищем.
export function makeName(rng: Rng, book: NameBook, ask: NameAsk): Named {
  const key = `${ask.place ?? ""}|${ask.generation ?? 0}`;
  if (!book.has(key)) book.set(key, { names: new Set(), full: new Set() });
  const taken = book.get(key)!;
  const tintFirst = ask.group === "peasant" && rng.chance(B.names.tint);
  const bags = ask.group === "peasant" ? (tintFirst ? [NAMES_TINT, NAMES_BASE] : [NAMES_BASE, NAMES_TINT])
    : [ask.group === "castle" ? NAMES_BASE : NAMES_PEOPLE[ask.group]];
  const keep = (n: Named): Named => { taken.names.add(n.name); taken.full.add(n.full); return n; };
  for (const bag of bags) {
    const free = bagOf(bag, ask.female).filter((n) => !taken.names.has(n) && fitsCircle(n, ask.circle));
    if (free.length) { const name = rng.pick(free); return keep({ name, full: name, tint: bag === NAMES_TINT }); }
  }
  // тёзка: имя из первого мешка, в случайном порядке — пока не найдётся, чем различить
  const all = bagOf(bags[0], ask.female), fit = all.filter((n) => fitsCircle(n, ask.circle));
  const pool = fit.length ? [...fit] : [...all];
  const father = ask.father ? ofFather(ask.father) : null;
  while (pool.length) {
    const name = pool.splice(Math.floor(rng.next() * pool.length), 1)[0], tint = bags[0] === NAMES_TINT;
    const ways: Named[] = [];
    if (ask.group === "peasant" && ask.female && ask.husband) ways.push({ name, full: `${name} ${byHusband(ask.husband)}`, by: "муж", tint });
    if (father) ways.push({ name, full: `${name}, ${father}${ask.female ? "а дочь" : " сын"}`, by: "отец", tint });
    const way = ways.find((x) => !taken.full.has(x.full));
    if (way) return keep(way);
    const nicks = NICKNAMES.map((x) => nickFor(x, ask.female)).filter((x): x is string => !!x && !taken.full.has(`${name} ${x}`));
    if (nicks.length) return keep({ name, full: `${name} ${rng.pick(nicks)}`, by: "прозвище", tint });
  }
  throw new Error(`Мешок имён вычерпан: ${ask.group}, место «${ask.place ?? ""}», поколение ${ask.generation ?? 0}`);
}
