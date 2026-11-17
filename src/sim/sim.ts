// Ядро симуляции характеров и совета. Без интерфейса — можно гонять в браузере и в Node.
import type { Axis, Star, PostId, Faction, Resource, Effect, Trait, Mark, AspirationDef, GameEvent, EventOption } from "../data/types";
import { AXES, AXIS_NAMES, AXIS_DAT, OPPOSED, POSTS, TRAITS, MARKS, ASPIRATIONS, ROSTER } from "../data/core";
import { BACKSTORY } from "../data/backstory";
import { EVENTS } from "../data/events";
import { CFG } from "./config";
import { Rng } from "./rng";

export interface Person {
  id: number;
  name: string;
  female: boolean;
  age: number;
  trait: Trait;
  mark?: Mark;
  star: Star;
  startStar: Star;
  bio: string[];
  aspiration?: AspirationDef;
  loyalty: number;          // отношение к Сенешалю, -10..10
  post?: PostId;
  tenure: number;           // сезонов на текущей должности
  exp: number;              // опыт на текущей должности (сезоны, с потолком)
  knowledge: number;        // насколько Сенешаль знает человека, 0..3
  order?: Axis;             // наказ Сенешаля
  choices: Record<Axis, number>; // сколько раз выбирал вариант с этой осью
  decisions: number;
  matchedTop: number;       // сколько раз выбор совпал с ведущей осью
}

export interface LogEntry {
  season: number;
  kind: "event" | "season" | "staff" | "info";
  title: string;
  lines: string[];
  effects?: Partial<Record<Effect, number>>;
  tone?: "good" | "bad" | "mixed" | "neutral";
}

export interface World {
  seed: string;
  rng: Rng;
  people: Person[];
  rel: Map<string, number>;
  posts: Record<PostId, number | null>;
  head: number | null;
  labOpen: boolean;
  season: number;
  factions: Record<Faction, number>;
  resources: Record<Resource, number>;
  authority: number;
  deedsLeft: number;
  log: LogEntry[];
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const round1 = (v: number) => Math.round(v * 10) / 10;
const relKey = (a: number, b: number) => (a < b ? `${a}|${b}` : `${b}|${a}`);

export function getRel(w: World, a: number, b: number): number {
  return w.rel.get(relKey(a, b)) ?? 0;
}
function addRel(w: World, a: number, b: number, d: number) {
  const pa = w.people[a], pb = w.people[b];
  const g = d < 0 ? Math.max(pa.trait.mods.grudge ?? 1, pb.trait.mods.grudge ?? 1) : 1;
  w.rel.set(relKey(a, b), clamp(getRel(w, a, b) + d * g, -10, 10));
}

export function relWord(v: number): string {
  if (v >= 6) return "заодно";
  if (v >= 2) return "ладят";
  if (v > -2) return "терпят";
  if (v > -6) return "соперники";
  return "враги";
}
export function loyaltyWord(v: number): string {
  if (v >= 6) return "предан";
  if (v >= 2) return "доверяет";
  if (v > -2) return "служит";
  if (v > -6) return "недоволен";
  return "озлоблен";
}
export function expWord(p: Person): string {
  if (!p.post) return "—";
  if (p.exp >= CFG.expMaster) return "мастер";
  if (p.exp >= CFG.expSettled) return "освоился";
  return "новичок";
}
export function isStale(p: Person): boolean {
  return !!p.post && p.tenure >= CFG.staleFrom;
}
export function topAxis(star: Star): Axis {
  return AXES.reduce((best, a) => (star[a] > star[best] ? a : best), AXES[0]);
}
export function postName(id: PostId): string {
  return POSTS.find((p) => p.id === id)!.name;
}
export function holder(w: World, post: PostId): Person | undefined {
  const id = w.posts[post];
  return id == null ? undefined : w.people[id];
}

function gender(text: string, p: Person, other?: Person): string {
  return text
    .replace(/\{name\}/g, p.name)
    .replace(/\{other\}/g, other ? other.name : "соседом")
    .replace(/\{oа\}/g, other?.female ? "а" : "")
    .replace(/\{а\}/g, p.female ? "а" : "")
    .replace(/\{ся\}|\{ась\}/g, p.female ? "ась" : "ся")
    .replace(/\{он\}/g, p.female ? "она" : "он")
    .replace(/\{его\}/g, p.female ? "её" : "его");
}

function addStar(star: Star, shift: Partial<Star>, k = 1) {
  for (const a of AXES) if (shift[a]) star[a] += shift[a]! * k;
}
function clampStar(star: Star) {
  for (const a of AXES) star[a] = clamp(star[a], 0, 10);
}

// ---------- Генерация партии ----------

export function newWorld(seed: string, labOpen = false): World {
  const rng = new Rng(seed);
  const w: World = {
    seed, rng, people: [], rel: new Map(),
    posts: { starosta: null, desyatnik: null, klyuchnik: null, pisar: null, lesnichiy: null },
    head: null, labOpen, season: 1,
    factions: { derevni: 0, les: 0, kuptsy: 0, zamok: 0, dvor: 0 },
    resources: { kazna: 0, pripasy: 0, poryadok: 0 },
    authority: CFG.authorityStart, deedsLeft: CFG.personalDeeds, log: [],
  };

  // 1. Персонажи: авторская черта и метка, базовая звезда
  ROSTER.forEach((r, i) => {
    const star = {} as Star;
    for (const a of AXES) star[a] = CFG.starBase + rng.range(0, CFG.starBaseRandom);
    const trait = TRAITS.find((t) => t.id === r.trait)!;
    const mark = r.mark ? MARKS.find((m) => m.id === r.mark) : undefined;
    addStar(star, trait.star);
    if (mark) addStar(star, mark.star);
    w.people.push({
      id: i, name: r.name, female: r.female, age: r.age, trait, mark, star, startStar: star,
      bio: [], loyalty: 2 + (trait.mods.loyalty ?? 0) + rng.range(-2, 2),
      tenure: 0, exp: 0, knowledge: 0,
      choices: { dolg: 0, vygoda: 0, zabota: 0, derzost: 0, obychai: 0 }, decisions: 0, matchedTop: 0,
    });
  });

  // 2. Отношения по характеру — считаются после предыстории, а личные связи копятся сразу
  const personal = new Map<string, number>();

  // 3. Прогон предыстории
  for (const p of w.people) {
    const pool = rng.shuffle(BACKSTORY).slice(0, CFG.backstoryCount);
    const aspirations: string[] = [];
    for (const ev of pool) {
      let other: Person | undefined;
      if (ev.link !== undefined) {
        other = rng.pick(w.people.filter((o) => o.id !== p.id));
        const k = relKey(p.id, other.id);
        personal.set(k, (personal.get(k) ?? 0) + ev.link);
      }
      addStar(p.star, ev.shift);
      p.bio.push(gender(ev.text, p, other));
      if (ev.aspiration) aspirations.push(ev.aspiration);
    }
    // Нормализация: важны относительные склонности, а не сумма событий
    const mean = AXES.reduce((t, a) => t + p.star[a], 0) / AXES.length;
    for (const a of AXES) p.star[a] = clamp(5 + (p.star[a] - mean) * CFG.starSpread, 0.5, 10);
    const bounds = ROSTER[p.id].bounds;
    if (bounds) for (const a of AXES) if (bounds[a]) p.star[a] = clamp(p.star[a], bounds[a]![0], bounds[a]![1]);
    for (const a of AXES) p.star[a] = round1(p.star[a]);
    p.startStar = { ...p.star };

    // Стремление: последнее родившееся в предыстории, иначе — по ведущей оси
    let aspId = aspirations.length ? aspirations[aspirations.length - 1] : undefined;
    if (!aspId) {
      const byAxis: Record<Axis, string[]> = {
        zabota: ["post_starosta", "nadel"], dolg: ["post_desyatnik", "post_klyuchnik"],
        vygoda: ["post_pisar", "gorod"], derzost: ["labirint", "post_desyatnik"], obychai: ["post_lesnichiy", "pokoy"],
      };
      aspId = rng.pick(byAxis[topAxis(p.star)]);
    }
    p.aspiration = ASPIRATIONS.find((a) => a.id === aspId);
  }

  for (let i = 0; i < w.people.length; i++) {
    for (let j = i + 1; j < w.people.length; j++) {
      const a = w.people[i], b = w.people[j];
      let v = rng.range(-1, 1);
      for (const [x, y] of OPPOSED) {
        if ((a.star[x] >= 7 && b.star[y] >= 7) || (a.star[y] >= 7 && b.star[x] >= 7)) v -= 2;
      }
      if (topAxis(a.star) === topAxis(b.star)) v += 2;
      v += personal.get(relKey(i, j)) ?? 0;
      w.rel.set(relKey(i, j), clamp(round1(v), -10, 10));
    }
  }

  autoAssign(w, true);
  w.log.push({ season: 0, kind: "info", title: `Новая партия, семя «${seed}»`, lines: ["Совет расставлен по годности. Должности заняты давно — у людей есть стаж."] });
  return w;
}

// Годность к должности: насколько звезда совпадает с осями должности + метка
export function fitness(p: Person, post: PostId): number {
  const def = POSTS.find((x) => x.id === post)!;
  let f = def.axes.reduce((s, a) => s + p.star[a], 0) / def.axes.length;
  if (p.mark?.goodPost === post) f += 2;
  if (p.mark?.badPost === post) f -= 3;
  if (p.aspiration?.post === post) f += 1;
  return f;
}

export function autoAssign(w: World, initial = false) {
  for (const k of Object.keys(w.posts) as PostId[]) w.posts[k] = null;
  for (const p of w.people) { p.post = undefined; p.tenure = 0; p.exp = 0; }
  const pairs: { p: Person; post: PostId; f: number }[] = [];
  for (const p of w.people) for (const d of POSTS) pairs.push({ p, post: d.id, f: fitness(p, d.id) });
  pairs.sort((a, b) => b.f - a.f);
  for (const { p, post } of pairs) {
    if (w.posts[post] != null || p.post) continue;
    w.posts[post] = p.id;
    p.post = post;
    if (initial) { p.tenure = w.rng.int(2, 14); p.exp = Math.min(p.tenure, CFG.expMaster); }
  }
  // главный — самый лояльный из совета
  const council = w.people.filter((p) => p.post);
  w.head = council.sort((a, b) => b.loyalty - a.loyalty)[0]?.id ?? null;
}

// ---------- Перестановки ----------

export function assignCost(w: World, p: Person, post: PostId | null): { cost: number; why: string } {
  const current = post ? holder(w, post) : undefined;
  let cost = 0;
  const why: string[] = [];
  // снимаем того, кто сейчас на должности
  if (current && current.id !== p.id) {
    const c = removeCost(current);
    cost += c.cost;
    if (c.cost) why.push(c.why);
  }
  // снимаем самого p с его должности, если переводим против воли
  if (p.post && p.post !== post) {
    const wants = post && p.aspiration?.post === post;
    if (!wants) {
      const c = removeCost(p);
      cost += c.cost;
      if (c.cost) why.push(c.why);
    }
  }
  return { cost, why: why.join("; ") || "бесплатно" };
}
function removeCost(p: Person): { cost: number; why: string } {
  if (!p.post) return { cost: 0, why: "" };
  const cost = CFG.removeBase + Math.floor(p.tenure / CFG.removePerSeasons);
  return { cost, why: `снять ${p.name} против воли (${p.tenure} сез. на месте) — ${cost}` };
}

export function assign(w: World, personId: number, post: PostId | null) {
  const p = w.people[personId];
  if (post && w.posts[post] === personId) return;
  const { cost } = assignCost(w, p, post);
  w.authority = round1(w.authority - cost);
  const lines: string[] = [];
  if (post) {
    const prev = holder(w, post);
    if (prev) {
      prev.post = undefined; prev.tenure = 0; prev.exp = Math.floor(prev.exp / 2);
      prev.loyalty = clamp(prev.loyalty - (prev.aspiration?.post === post ? 3 : 1.5), -10, 10);
      lines.push(`${prev.name} снят${prev.female ? "а" : ""} с должности «${postName(post)}» и обижен${prev.female ? "а" : ""}.`);
    }
  }
  if (p.post) { w.posts[p.post] = null; }
  p.post = post ?? undefined; p.tenure = 0; p.exp = 0;
  if (post) {
    w.posts[post] = p.id;
    if (p.aspiration?.post === post) {
      p.loyalty = clamp(p.loyalty + 2, -10, 10);
      lines.push(`${p.name} получил${p.female ? "а" : ""} желанную должность «${postName(post)}» — благодарен${p.female ? "на" : ""}.`);
    } else lines.push(`${p.name} теперь «${postName(post)}».`);
    // обойдённые, кто хотел эту должность
    for (const o of w.people) {
      if (o.id !== p.id && o.aspiration?.post === post) {
        addRel(w, o.id, p.id, -1.5);
        lines.push(`${o.name} сам${o.female ? "а" : ""} метил${o.female ? "а" : ""} на это место — отношения с ${p.name} хуже.`);
      }
    }
  }
  if (cost) lines.push(`Авторитет −${cost}.`);
  if (w.head === p.id && !post) w.head = null;
  w.log.push({ season: w.season, kind: "staff", title: "Перестановка", lines });
}

export function setHead(w: World, id: number | null) {
  w.head = id;
  if (id != null) w.log.push({ season: w.season, kind: "staff", title: "Главный на время отлучки", lines: [`За главного — ${w.people[id].name}.`] });
}

export function talk(w: World, id: number): boolean {
  if (w.deedsLeft <= 0) return false;
  const p = w.people[id];
  w.deedsLeft--;
  p.knowledge = Math.min(3, p.knowledge + 1);
  p.loyalty = clamp(p.loyalty + 0.5, -10, 10);
  w.log.push({ season: w.season, kind: "info", title: "Разговор", lines: [`Сенешаль говорил с ${p.name}. Теперь он лучше понимает этого человека.`] });
  return true;
}

export function giveOrder(w: World, id: number, axis: Axis | null) {
  const p = w.people[id];
  if (axis && !p.order) w.authority = round1(w.authority - 1);
  p.order = axis ?? undefined;
  if (axis) w.log.push({ season: w.season, kind: "staff", title: "Наказ", lines: [`${p.name}: «действуй по ${AXIS_DAT[axis]}». Авторитет −1.`] });
}

// ---------- Решения ----------

interface Scored { opt: EventOption; score: number; base: number; why: string }

function scoreOptions(w: World, p: Person, ev: GameEvent, noisy = true): Scored[] {
  const stale = isStale(p);
  return ev.options.map((opt) => {
    let base = opt.axes.reduce((s, a) => s + p.star[a], 0) / opt.axes.length;
    const parts: string[] = [];
    const lead = opt.axes.reduce((b, a) => (p.star[a] > p.star[b] ? a : b), opt.axes[0]);
    parts.push(`по ${AXIS_DAT[lead]}`);
    if (p.order && opt.axes.includes(p.order)) {
      const obey = Math.max(0, p.loyalty + 2 + (p.trait.mods.obedience ?? 0) - (stale ? 3 : 0));
      const bonus = obey * CFG.orderWeight;
      if (bonus > 0.3) { base += bonus; parts.push("по наказу"); }
    }
    if (stale && opt.axes.includes("vygoda") && p.star.vygoda >= 6) { base += 1; parts.push("в свою пользу"); }
    if (opt.risky && p.trait.id === "ostorozhny") base -= 1;
    const noise = noisy ? w.rng.gauss() * (CFG.noise + (p.trait.mods.random ?? 0)) : 0;
    return { opt, score: base + noise, base, why: parts.join(", ") };
  });
}

function decide(w: World, p: Person, ev: GameEvent): Scored & { surprise: boolean } {
  const scored = scoreOptions(w, p, ev);
  const best = scored.reduce((a, b) => (b.score > a.score ? b : a));
  const expected = scored.reduce((a, b) => (b.base > a.base ? b : a));
  return { ...best, surprise: best.opt.id !== expected.opt.id };
}

function competence(p: Person): number {
  let c = p.exp >= CFG.expMaster ? CFG.competence.master : p.exp >= CFG.expSettled ? CFG.competence.settled : CFG.competence.novice;
  if (p.post && p.mark?.goodPost === p.post) c += CFG.markGood;
  if (p.post && p.mark?.badPost === p.post) c += CFG.markBad;
  return clamp(c, 0.2, 1.2);
}

function applyEffects(w: World, opt: EventOption, mult: number, doer: Person | undefined, lines: string[]): Partial<Record<Effect, number>> {
  let k = mult;
  if (doer) k *= competence(doer);
  let failed = false;
  if (opt.risky && doer) {
    const pSuccess = 0.3 + 0.55 * competence(doer);
    if (!w.rng.chance(pSuccess)) failed = true;
  }
  const out: Partial<Record<Effect, number>> = {};
  for (const [key, v] of Object.entries(opt.effects) as [Effect, number][]) {
    let val = v * k;
    if (failed && val > 0) val = -val * 0.5;
    val = round1(val);
    out[key] = val;
    if (key in w.factions) w.factions[key as Faction] = round1(w.factions[key as Faction] + val);
    else w.resources[key as Resource] = round1(w.resources[key as Resource] + val);
  }
  if (failed) lines.push(`Рискованное дело провалилось — не хватило опыта (${doer ? expWord(doer) : "?"}).`);
  return out;
}

function recordChoice(p: Person, opt: EventOption) {
  const top = topAxis(p.star);
  p.decisions++;
  if (opt.axes.includes(top)) p.matchedTop++;
  for (const a of opt.axes) {
    p.choices[a]++;
    p.star[a] = round1(clamp(p.star[a] + CFG.driftChosen, 0, 10));
  }
}

function toneOf(eff: Partial<Record<Effect, number>>): LogEntry["tone"] {
  const vals = Object.values(eff);
  const pos = vals.filter((v) => v! > 0).length, neg = vals.filter((v) => v! < 0).length;
  return pos && !neg ? "good" : neg && !pos ? "bad" : pos && neg ? "mixed" : "neutral";
}

function runEvent(w: World, ev: GameEvent) {
  const holders = ev.posts.map((post) => holder(w, post)).filter((x): x is Person => !!x);
  const lines: string[] = [ev.text];
  let effects: Partial<Record<Effect, number>> = {};

  if (holders.length === 0) {
    lines.push("Должности пусты — делом никто не занялся.");
    w.resources.poryadok -= 1;
    effects = { poryadok: -1 };
  } else if (holders.length === 1) {
    const p = holders[0];
    const d = decide(w, p, ev);
    lines.push(`${p.name} (${postName(p.post!)}): «${d.opt.text}» — ${d.why}${d.surprise ? ", неожиданно для себя" : ""}.`);
    if (ev.posts.length === 2) lines.push(`Вторая должность пуста — ${p.name} решал${p.female ? "а" : ""} в одиночку.`);
    recordChoice(p, d.opt);
    effects = applyEffects(w, d.opt, 1, p, lines);
  } else {
    effects = council(w, ev, holders[0], holders[1], lines);
  }
  const title = `${ev.title}${ev.adventurers ? " ⚔" : ""}`;
  w.log.push({ season: w.season, kind: "event", title, lines, effects, tone: toneOf(effects) });
}

function council(w: World, ev: GameEvent, a: Person, b: Person, lines: string[]): Partial<Record<Effect, number>> {
  const da = decide(w, a, ev), db = decide(w, b, ev);
  const r = getRel(w, a.id, b.id);
  const word = relWord(r);
  lines.push(`${a.name} (${postName(a.post!)}) хочет «${da.opt.text}» — ${da.why}.`);
  lines.push(`${b.name} (${postName(b.post!)}) хочет «${db.opt.text}» — ${db.why}.`);

  if (da.opt.id === db.opt.id) {
    const mult = r >= 2 ? CFG.synergy : 1;
    lines.push(mult > 1 ? `Сошлись сразу, и раз они ${word}, вышло лучше обычного.` : `Сошлись во мнении.`);
    recordChoice(a, da.opt); recordChoice(b, db.opt);
    addRel(w, a.id, b.id, 0.5);
    const doer = a.exp >= b.exp ? a : b;
    return applyEffects(w, da.opt, mult, doer, lines);
  }

  // Главный, если он третий, может рассудить
  const head = w.head != null ? w.people[w.head] : undefined;
  if (head && head.id !== a.id && head.id !== b.id) {
    const ra = getRel(w, head.id, a.id), rb = getRel(w, head.id, b.id);
    if (ra >= -1 && rb >= -1) {
      const sa = scoreOptions(w, head, ev, false).find((s) => s.opt.id === da.opt.id)!.base;
      const sb = scoreOptions(w, head, ev, false).find((s) => s.opt.id === db.opt.id)!.base;
      const [win, lose, opt] = sa >= sb ? [a, b, da.opt] : [b, a, db.opt];
      lines.push(`Спорили (${word}). Рассудил главный, ${head.name}: делать как хочет ${win.name}.`);
      addRel(w, head.id, lose.id, -0.5);
      recordChoice(win, opt);
      return applyEffects(w, opt, 1, win, lines);
    }
    lines.push(`Главного, ${head.name}, не признали — у него с кем-то из них плохие отношения.`);
  }

  const soft = (a.trait.mods.softness ?? 0) + (b.trait.mods.softness ?? 0);
  // кто сильнее в споре: главный, затем стаж и дерзость
  const power = (p: Person) => (w.head === p.id ? 5 : 0) + p.tenure / 4 + p.star.derzost / 3 + w.rng.range(0, 2);
  const [win, lose, wd] = power(a) >= power(b) ? [a, b, da] : [b, a, db];
  const ld = win === a ? db : da;

  if (r >= 2) {
    // ладят — договариваются о лучшем для обоих
    const both = scoreOptions(w, a, ev, false).map((s, i) => ({ opt: s.opt, v: s.base + scoreOptions(w, b, ev, false)[i].base }));
    const opt = both.reduce((x, y) => (y.v > x.v ? y : x)).opt;
    lines.push(`Они ${word} — договорились: «${opt.text}».`);
    recordChoice(a, opt); recordChoice(b, opt);
    addRel(w, a.id, b.id, 0.3);
    return applyEffects(w, opt, 1, win, lines);
  }
  if (r > -2) {
    // терпят — компромисс или кто-то продавил
    if (w.rng.chance(0.4 + soft * 0.1)) {
      lines.push(`Они ${word} друг друга — сделали наполовину, как хотел ${win.name}, но вполсилы.`);
      recordChoice(win, wd.opt);
      return applyEffects(w, wd.opt, CFG.compromise, win, lines);
    }
    lines.push(`Они ${word} друг друга. ${win.name} продавил${win.female ? "а" : ""} своё; ${lose.name} затаил${lose.female ? "а" : ""} обиду.`);
    addRel(w, a.id, b.id, -0.7);
    recordChoice(win, wd.opt);
    return applyEffects(w, wd.opt, 1, win, lines);
  }
  if (r > -6) {
    lines.push(`Они соперники. ${win.name} настоял${win.female ? "а" : ""} на своём, ${lose.name} не простит.`);
    addRel(w, a.id, b.id, -1);
    recordChoice(win, wd.opt);
    if (lose.loyalty < 3 || w.rng.chance(0.4)) lines.push(`📜 Жалоба: ${lose.name} ждёт Сенешаля с жалобой на ${win.name}.`);
    return applyEffects(w, wd.opt, 1, win, lines);
  }
  // враги
  if (w.rng.chance(0.55)) {
    lines.push(`Они враги. ${win.name} сделал${win.female ? "а" : ""} по-своему, а ${lose.name} мешал${lose.female ? "а" : ""} назло: «${ld.opt.text}» — вот чего ${lose.female ? "она" : "он"} хотел${lose.female ? "а" : ""}. Саботаж.`);
    addRel(w, a.id, b.id, -1);
    recordChoice(win, wd.opt);
    const eff = applyEffects(w, wd.opt, CFG.sabotage, win, lines);
    w.resources.poryadok = round1(w.resources.poryadok - 1);
    eff.poryadok = round1((eff.poryadok ?? 0) - 1);
    lines.push(`📜 Жалобы с обеих сторон ждут Сенешаля.`);
    return eff;
  }
  lines.push(`Они враги, но ${lose.name} на этот раз смолчал${lose.female ? "а" : ""}. ${win.name} сделал${win.female ? "а" : ""} по-своему.`);
  addRel(w, a.id, b.id, -0.5);
  recordChoice(win, wd.opt);
  return applyEffects(w, wd.opt, 1, win, lines);
}

// ---------- Сезон ----------

export function forecast(w: World, p: Person): string {
  // Что видит игрок: точность зависит от того, насколько он знает человека
  if (p.knowledge === 0) return "пока непонятно, как поступит";
  const top = topAxis(p.star);
  if (p.knowledge === 1) return `кажется, тянется к ${AXIS_DAT[top]}`;
  return `скорее всего, будет действовать по ${AXIS_DAT[top]}`;
}

export function runSeason(w: World) {
  const pool = EVENTS.filter((e) => !e.adventurers || w.labOpen);
  const evs = w.rng.shuffle(pool).slice(0, CFG.eventsPerSeason);
  for (const ev of evs) runEvent(w, ev);
  upkeep(w);
  w.season++;
  w.deedsLeft = CFG.personalDeeds;
}

export function runEvents(w: World, n: number) {
  const pool = EVENTS.filter((e) => !e.adventurers || w.labOpen);
  for (let i = 0; i < n; i++) runEvent(w, w.rng.pick(pool));
}

function upkeep(w: World) {
  const lines: string[] = [];
  // старые обиды и симпатии понемногу сглаживаются
  for (const [k, v] of w.rel) w.rel.set(k, round1(v * CFG.relFade));
  for (const p of w.people) {
    if (p.post) {
      p.tenure++;
      p.exp = Math.min(p.exp + 1, CFG.expMaster);
      if (p.tenure === CFG.expSettled) lines.push(`${p.name} освоил${p.female ? "ась" : "ся"} на должности.`);
      if (p.tenure === CFG.expMaster) lines.push(`${p.name} — теперь мастер своего дела.`);
      if (p.tenure === CFG.staleFrom) lines.push(`${p.name} засидел${p.female ? "ась" : "ся"} на месте: оброс своими людьми и делает всё больше по-своему.`);
      if (isStale(p) && p.star.vygoda >= 6 && w.rng.chance(0.25)) {
        w.resources.kazna = round1(w.resources.kazna - 0.5);
        lines.push(`Из казны что-то утекает — следы ведут к людям ${p.name}.`);
      }
    }
    const asp = p.aspiration?.post;
    if (asp) {
      if (p.post === asp) p.loyalty += CFG.loyaltyDesiredPost;
      else if (p.post) p.loyalty += CFG.loyaltyWrongPost * (1 + (p.trait.mods.ambition ?? 0) * 0.25) * (isStale(p) ? 1.5 : 1);
      else if (w.posts[asp] != null) {
        p.loyalty += CFG.loyaltyBlocked;
        const h = holder(w, asp)!;
        if (isStale(h)) addRel(w, p.id, h.id, -0.3);
      }
    }
    p.loyalty = round1(clamp(p.loyalty, -10, 10));
    if (p.loyalty <= -6 && w.rng.chance(0.15)) lines.push(`⚠ ${p.name} озлоблен${p.female ? "а" : ""} и подумывает уйти.`);
  }
  w.log.push({ season: w.season, kind: "season", title: `Итог сезона ${w.season}`, lines: lines.length ? lines : ["Ничего особенного."] });
}

// Сводка: читается ли персонаж как личность
export function consistency(p: Person): number {
  return p.decisions ? Math.round((p.matchedTop / p.decisions) * 100) : 0;
}
