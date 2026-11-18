// Ядро симуляции характеров и совета. Без интерфейса — можно гонять в браузере и в Node.
import type { Axis, Star, PostId, Side, Effect, Trait, TraitMods, Deed, Mark, AspirationDef, GameEvent, EventOption } from "../data/types";
import { AXES, AXIS_NAMES, AXIS_DAT, OPPOSED, POSTS, TRAITS, LIFE_TRAITS, MARKS, ASPIRATIONS, ROSTER } from "../data/core";
import { RUMORS_AXIS, RUMORS_TRAIT } from "../data/rumors";
import { BACKSTORY, LEGACY } from "../data/backstory";
import { EVENTS } from "../data/events";
import { BALANCE as B } from "./balance";
import { Rng } from "./rng";
import { PROBE } from "./probe";
import { SIDES, VILLAGES } from "../data/economy";
import { councilSteady, councilFeud } from "./authority";
import { initAuthority, addAuthority, priceOf, authorityWeak, addComplaint, authoritySeason, type AuthState } from "./authority";
import { takeHands, invest } from "./economy";
import { initEconomy, economySeason, rollForecast, addLine, addTrust, belowFloor, courseLean, elderSaw, type Economy } from "./economy";

// Черта, приобретённая по ходу жизни. target — против кого она («Злопамятный к …»); known — знает ли о ней Сенешаль.
// У должностной черты post — на какой должности нажита, away — сколько сезонов человек уже не на этой должности.
export interface Gained { trait: Trait; target?: number; season: number; known: boolean; post?: PostId; away?: number }

// Молва: строка, которую Сенешаль знает о человеке сразу. О черте (trait) или о склонности (axis); wrong — молва неверная.
export interface Rumor { text: string; axis?: Axis; trait?: string; wrong: boolean }

// Что Сенешаль знает о человеке. Числа звезды игрок не видит никогда: только слова по известным осям.
export interface Knowledge {
  talks: number;               // сколько было разговоров
  trait: boolean;              // ключевая черта известна
  traitAsked: boolean;         // о черте уже говорили: скрытую разговор не открывает
  aspiration: boolean;         // стремление известно
  axes: boolean;               // склонности рассказал сам (третий разговор)
  seen: Record<Axis, number>;  // сколько решений по оси видели в деле
}

export interface Person {
  id: number;
  name: string;
  female: boolean;
  age: number;
  trait: Trait;             // ключевая черта, с рождения
  gained: Gained[];         // приобретённые черты; в предел B.traits.maxGained не входят должностные
  mark?: Mark;
  star: Star;
  startStar: Star;
  bio: string[];
  aspiration?: AspirationDef;
  loyalty: number;          // отношение к Сенешалю, -10..10
  post?: PostId;
  tenure: number;           // сезонов на текущей должности
  exp: number;              // опыт на текущей должности (сезоны, с потолком)
  know: Knowledge;          // что Сенешаль знает о человеке
  rumor?: Rumor;            // молва; нет — о человеке с начала известна черта
  recent: { season: number; axes: Axis[] }[]; // решения последних сезонов: из них складывается привычка
  order?: Axis;             // наказ Сенешаля
  persuade?: number;        // насколько Сенешаль уговорил его уйти с должности, 0..1
  agreed?: boolean;         // согласен уйти: снять можно без потери авторитета
  choices: Record<Axis, number>; // сколько раз выбирал вариант с этой осью
  decisions: number;
  matchedTop: number;       // сколько раз выбор совпал с ведущей осью
}

// Чем кончилось событие: никого не было, решил один, сошлись, рассудил главный, договорились, компромисс, продавил,
// соперник настоял, саботаж, враг смолчал, по приказу Сенешаля. bypass — проигравший сделал по-своему в обход.
export type Outcome = "empty" | "alone" | "agree" | "judge" | "deal" | "compromise" | "push" | "rival" | "sabotage" | "silent" | "ordered";

export interface LogEntry {
  season: number;
  kind: "event" | "season" | "staff" | "info";
  title: string;
  lines: string[];
  effects?: Partial<Record<Effect, number>>;
  tone?: "good" | "bad" | "mixed" | "neutral";
  weights?: string[];       // из чего сложился выбор: веса вариантов у каждого, кто решал («Взгляд дизайнера»)
  outcome?: Outcome;        // чем кончилось дело в совете: по нему считают отчёты ботов
  bypass?: boolean;         // проигравший спор сделал по-своему в обход
}

// Дело на столе Сенешаля: событие, которое придёт в этом сезоне. order — приказ: какой вариант исполнить.
export interface Desk { event: string; order?: string }

// Должность, занятая не по годности, и покровитель посаженного: сторона или человек замка. Снял — запись уходит.
export interface Legacy { post: PostId; how: string; side?: Side; person?: number }

export interface World {
  seed: string;
  rng: Rng;
  people: Person[];
  rel: Map<string, number>;
  posts: Record<PostId, number | null>;
  head: number | null;
  labOpen: boolean;
  season: number;
  factions: Record<Side, number>;          // доверие сторон; зоны — economy.ts
  resources: { poryadok: number };         // порядок пока копится числом (шкала строгости — задача И13)
  eco: Economy;                            // хозяйство и подать: запасы, курс, ведомость, урок
  auth: AuthState;                         // авторитет: ведомость, жалобы на столе, пиры
  desk: Desk | null;                       // дело на столе: событие будущего сезона, по которому Сенешаль может отдать приказ
  authority: number;
  deedsLeft: number;
  legacy: Legacy[];  // наследство прежних баронов: должности, занятые не по годности, и почему
  log: LogEntry[];
}

// Шкалы (не баланс): звезда 0..10, отношения и лояльность −10..10. На них рассчитаны экран и тексты.
export const STAR_MAX = 10, REL_MAX = 10;

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const round1 = (v: number) => Math.round(v * 10) / 10;
const relKey = (a: number, b: number) => (a < b ? `${a}|${b}` : `${b}|${a}`);

export function getRel(w: World, a: number, b: number): number {
  return w.rel.get(relKey(a, b)) ?? 0;
}
// Задать отношения двоих напрямую: для тестов и заготовок ситуаций в эмуляторе. Игра меняет отношения только через addRel.
export function setRel(w: World, a: number, b: number, v: number): void {
  w.rel.set(relKey(a, b), clamp(v, -REL_MAX, REL_MAX));
}
// Поправки черт человека: ключевая и приобретённые вместе. Черта с целью действует только против своей цели (vs).
type ModKey = Exclude<keyof TraitMods, "grudge" | "loyalty">;
function activeTraits(p: Person, vs?: Person): Trait[] {
  return [p.trait, ...p.gained.filter((g) => !g.trait.targeted || g.target === vs?.id).map((g) => g.trait)];
}
function mod(p: Person, key: ModKey, vs?: Person): number {
  return activeTraits(p, vs).reduce((s, t) => s + (t.mods[key] ?? 0), 0);
}
function grudge(p: Person, vs?: Person): number {
  return activeTraits(p, vs).reduce((s, t) => s * (t.mods.grudge ?? 1), 1);
}

function addRel(w: World, a: number, b: number, d: number) {
  const pa = w.people[a], pb = w.people[b];
  const g = d < 0 ? Math.max(grudge(pa, pb), grudge(pb, pa)) : 1;
  w.rel.set(relKey(a, b), clamp(getRel(w, a, b) + d * g, -REL_MAX, REL_MAX));
}

export function relWord(v: number): string {
  if (v >= B.rel.ally) return "заодно";
  if (v >= B.rel.friendly) return "ладят";
  if (v > B.rel.rival) return "терпят";
  if (v > B.rel.enemy) return "соперники";
  return "враги";
}
export function loyaltyWord(v: number): string {
  if (v >= B.loyalty.devoted) return "предан";
  if (v >= B.loyalty.trusts) return "доверяет";
  if (v > B.loyalty.unhappy) return "служит";
  if (v > B.loyalty.bitter) return "недоволен";
  return "озлоблен";
}
export function expWord(p: Person): string {
  if (!p.post) return "—";
  if (p.exp >= B.exp.master) return "мастер";
  if (p.exp >= B.exp.settled) return "освоился";
  return "новичок";
}
export function isStale(p: Person): boolean {
  return !!p.post && p.tenure >= B.exp.staleFrom;
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
    .replace(/\{его\}/g, p.female ? "её" : "его")
    .replace(/\{ему\}/g, p.female ? "ей" : "ему");
}

function addStar(star: Star, shift: Partial<Star>, k = 1) {
  for (const a of AXES) if (shift[a]) star[a] += shift[a]! * k;
}
const noAxes = (): Record<Axis, number> => ({ dolg: 0, vygoda: 0, zabota: 0, derzost: 0, obychai: 0 });
// «к Остапу», «к Ведане»: дательный падеж имени для черты с целью
const dative = (name: string) => (name.endsWith("а") ? `${name.slice(0, -1)}е` : `${name}у`);
const lower = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);

// ---------- Генерация партии ----------

export function newWorld(seed: string, labOpen = false): World {
  const rng = new Rng(seed);
  const w: World = {
    seed, rng, people: [], rel: new Map(),
    posts: { starosta: null, desyatnik: null, klyuchnik: null, pisar: null, lesnichiy: null },
    head: null, labOpen, season: 1,
    factions: Object.fromEntries(SIDES.map((s) => [s, B.economy.start.trust])) as Record<Side, number>,
    resources: { poryadok: 0 }, eco: undefined as unknown as Economy, auth: initAuthority(), desk: null,
    authority: B.staff.authorityStart, deedsLeft: B.season.deeds, legacy: [], log: [],
  };

  // 1. Персонажи: авторская черта и метка, базовая звезда
  ROSTER.forEach((r, i) => {
    const star = {} as Star;
    for (const a of AXES) star[a] = B.star.base + rng.range(0, B.star.baseRandom);
    const trait = TRAITS.find((t) => t.id === r.trait)!;
    const mark = r.mark ? MARKS.find((m) => m.id === r.mark) : undefined;
    addStar(star, trait.star);
    if (mark) addStar(star, mark.star);
    w.people.push({
      id: i, name: r.name, female: r.female, age: r.age, trait, gained: [], mark, star, startStar: star,
      bio: [], loyalty: B.loyalty.start + (trait.mods.loyalty ?? 0) + rng.range(-B.loyalty.startSpread, B.loyalty.startSpread),
      tenure: 0, exp: 0, recent: [],
      know: { talks: 0, trait: false, traitAsked: false, aspiration: false, axes: false, seen: noAxes() },
      choices: noAxes(), decisions: 0, matchedTop: 0,
    });
  });

  // 2. Отношения по характеру — считаются после предыстории, а личные связи копятся сразу
  const personal = new Map<string, number>();

  // 3. Прогон предыстории
  for (const p of w.people) {
    const pool = rng.shuffle(BACKSTORY).slice(0, B.star.backstoryCount);
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
    for (const a of AXES) p.star[a] = clamp(B.star.center + (p.star[a] - mean) * B.star.spread, B.star.floor, STAR_MAX);
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
      let v = rng.range(-B.rel.startSpread, B.rel.startSpread);
      for (const [x, y] of OPPOSED) {
        const from = B.rel.opposedFrom;
        if ((a.star[x] >= from && b.star[y] >= from) || (a.star[y] >= from && b.star[x] >= from)) v -= B.rel.opposedPenalty;
      }
      if (topAxis(a.star) === topAxis(b.star)) v += B.rel.sameTop;
      v += personal.get(relKey(i, j)) ?? 0;
      w.rel.set(relKey(i, j), clamp(round1(v), -REL_MAX, REL_MAX));
    }
  }

  autoAssign(w, true);
  inherit(w);
  // Кто сидит на должности до потолка опыта, тот уже мастер: черта нажита до начала партии, Сенешаль о ней пока не знает.
  for (const p of w.people) {
    if (p.exp >= B.exp.master) {
      p.gained.push({ trait: LIFE_TRAITS.find((t) => t.id === "master_dela")!, season: 0, known: false, post: p.post });
    }
  }
  // Первая посадка — обучающая: о каждом известна одна вещь. О члене совета — молва или ключевая черта, об остальных — молва.
  for (const p of w.people) {
    if (p.post && !p.trait.hidden && rng.chance(B.know.startTraitChance)) { p.know.trait = true; p.know.traitAsked = true; }
    else p.rumor = makeRumor(w, p);
  }
  initEconomy(w);
  pickDesk(w);
  const legacy = w.legacy.map((l) => {
    const p = holder(w, l.post)!;
    return `Наследство прежних баронов: ${postName(l.post).toLowerCase()} ${p.name} посажен${p.female ? "а" : ""} ${l.how}, а не по годности. ${patronText(w, l)}`;
  });
  const lines = [
    `Совет достался от прежних баронов. Должности заняты давно — у людей есть стаж. ${legacy.length ? "По годности сидят не все." : "Все сидят по годности."}`,
    ...legacy,
    "О каждом известно что-то одно: молва или черта. Остальное откроют разговоры и дела.",
    `Герцог назначил испытание: урок ${w.eco.tax.lesson} мер в год, ${B.economy.tax.trialYears} года подряд. Сборщица приезжает осенью.`,
  ];
  w.log.push({ season: 0, kind: "info", title: `Новая партия, семя «${seed}»`, lines });
  return w;
}

// Молва о черте или о ведущей склонности; с шансом — неверная: тогда о чужой черте или о слабой склонности.
function makeRumor(w: World, p: Person): Rumor {
  const aboutTrait = w.rng.chance(B.know.rumorTraitChance);
  let wrong = w.rng.chance(B.know.rumorFalseChance);
  if (aboutTrait) {
    const id = wrong ? w.rng.pick(Object.keys(RUMORS_TRAIT).filter((x) => x !== p.trait.id)) : p.trait.id;
    return { text: gender(w.rng.pick(RUMORS_TRAIT[id]), p), trait: id, wrong };
  }
  const weak = AXES.filter((a) => p.star[a] < B.know.notable);
  if (!weak.length) wrong = false;
  const axis = wrong ? w.rng.pick(weak) : topAxis(p.star);
  return { text: gender(w.rng.pick(RUMORS_AXIS[axis]), p), axis, wrong };
}

// Годность к должности: насколько звезда совпадает с осями должности + метка
export function fitness(p: Person, post: PostId): number {
  const def = POSTS.find((x) => x.id === post)!;
  let f = def.axes.reduce((s, a) => s + p.star[a], 0) / def.axes.length;
  if (p.mark?.goodPost === post) f += B.exp.fitMarkGood;
  if (p.mark?.badPost === post) f -= B.exp.fitMarkBad;
  if (p.aspiration?.post === post) f += B.exp.fitAspiration;
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
    if (initial) { p.tenure = w.rng.int(B.staff.startTenureMin, B.staff.startTenureMax); p.exp = Math.min(p.tenure, B.exp.master); }
  }
  // главный — самый лояльный из совета
  const council = w.people.filter((p) => p.post);
  w.head = council.sort((a, b) => b.loyalty - a.loyalty)[0]?.id ?? null;
}

// Наследство прежних баронов: одна-две должности заняты не по годности — по родству, по старшинству или по милости.
// Годный, которого обошли, остаётся в замке без должности; причина — строкой в биографии посаженного и в летописи старта.
function inherit(w: World) {
  const n = w.rng.int(B.staff.legacyMin, Math.max(B.staff.legacyMin, B.staff.legacyMax));
  const passed = new Set<number>();   // обойдённые: на другую должность их не сажают — там они могли бы оказаться и годнее
  for (const d of w.rng.shuffle(POSTS).slice(0, n)) {
    const free = w.people.filter((p) => !p.post && !passed.has(p.id)), prev = holder(w, d.id);
    if (!free.length || !prev) continue;
    const why = w.rng.pick(LEGACY);
    // по старшинству — самый старый из тех, кто без должности; по родству и по милости — кто придётся
    const next = why.id === "starshinstvo" ? free.reduce((a, b) => (b.age > a.age ? b : a)) : w.rng.pick(free);
    next.post = d.id; next.tenure = prev.tenure; next.exp = prev.exp;
    prev.post = undefined; prev.tenure = 0; prev.exp = 0;
    passed.add(prev.id);
    w.posts[d.id] = next.id;
    // покровитель: у родни — человек замка или деревня, у старшинства — люди замка, у милости — двор
    const l: Legacy = { post: d.id, how: why.how };
    if (why.id === "rodstvo" && w.rng.chance(B.staff.patronKin)) l.person = w.rng.pick(w.people.filter((p) => p.id !== next.id && p.id !== prev.id)).id;
    else l.side = why.id === "rodstvo" ? w.rng.pick(VILLAGES) : why.id === "starshinstvo" ? "zamok" : "dvor";
    next.bio.push(`${gender(why.text.replace("{post}", postName(d.id)), next)} ${patronText(w, l)}`);
    w.legacy.push(l);
  }
  if (w.legacy.length) w.head = w.people.filter((p) => p.post).reduce((a, b) => (b.loyalty > a.loyalty ? b : a)).id;
}

const PATRON_SIDE: Partial<Record<Side, string>> = { brod: "родня в деревне у брода", opushka: "родня в деревне у опушки", zamok: "старшие слуги замка", dvor: "двор Герцога" };
const patronName = (w: World, l: Legacy): string => (l.person != null ? `${w.people[l.person].name}, родня` : PATRON_SIDE[l.side!] ?? "прежние люди барона");
export const patronText = (w: World, l: Legacy): string => `За ${holder(w, l.post)?.female ? "неё" : "него"} ${l.side === "zamok" ? "стоят" : "стоит"} ${patronName(w, l)}.`;
// Покровитель посаженного прежним бароном, пока тот на должности.
export function patronOf(w: World, p: Person): Legacy | undefined {
  return p.post ? w.legacy.find((l) => l.post === p.post) : undefined;
}
// Сняли посаженного: покровитель обижен — падает доверие стороны или отношение человека к Сенешалю; по уговору — мягче.
function offendPatron(w: World, p: Person, post: PostId, agreed: boolean, lines: string[]) {
  const l = w.legacy.find((x) => x.post === post);
  if (!l) return;
  w.legacy = w.legacy.filter((x) => x !== l);
  const soft = agreed ? B.staff.patronAgreed : 1, how = agreed ? " Ушёл по уговору — обида мягче." : "";
  if (l.person != null) {
    const o = w.people[l.person], v = round1(B.staff.patronLoyalty * soft);
    if (!v) return;
    o.loyalty = clamp(o.loyalty - v, -REL_MAX, REL_MAX);
    lines.push(`За ${p.name} стоял${o.female ? "а" : ""} ${o.name}, родня: отношение к Сенешалю −${v}.${how}`);
  } else if (l.side) {
    const v = round1(B.staff.patronTrust * soft);
    if (!v) return;
    addTrust(w, l.side, -v);
    lines.push(`За ${p.name} стоял${l.side === "dvor" ? "" : l.side === "zamok" ? "и" : "а"} ${PATRON_SIDE[l.side]}: доверие −${v}.${how}`);
  }
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
  if (cost > 0 && authorityWeak(w)) why.push(`слово весит меньше: +${B.authority.weakExtra}`);
  return { cost: priceOf(w, cost), why: why.join("; ") || "бесплатно" };
}
function removeCost(p: Person): { cost: number; why: string } {
  if (!p.post || p.agreed) return { cost: 0, why: "" };
  const cost = B.staff.removeBase + Math.floor(p.tenure / B.staff.removePerSeasons);
  return { cost, why: `снять ${p.name} против воли (${p.tenure} сез. на месте) — ${cost}` };
}

// Возвращает false, если на перестановку не хватает авторитета: тогда ничего не меняется (остаётся медленный путь — уговорить).
export function assign(w: World, personId: number, post: PostId | null): boolean {
  const p = w.people[personId];
  if (post && w.posts[post] === personId) return true;
  const { cost, why } = assignCost(w, p, post);
  if (cost > w.authority) return false;
  addAuthority(w, -cost, `перестановка: ${why}`, "staff");
  const lines: string[] = [];
  if (post) {
    const prev = holder(w, post);
    if (prev) {
      prev.post = undefined; prev.tenure = 0; prev.exp = Math.floor(prev.exp * B.staff.removedExpKeep);
      offendPatron(w, prev, post, !!prev.agreed, lines);
      if (prev.agreed) lines.push(`${prev.name} оставил${prev.female ? "а" : ""} должность «${postName(post)}» по уговору, без обиды.`);
      else {
        prev.loyalty = clamp(prev.loyalty + (prev.aspiration?.post === post ? B.staff.removedDesiredLoyalty : B.staff.removedLoyalty), -REL_MAX, REL_MAX);
        lines.push(`${prev.name} снят${prev.female ? "а" : ""} с должности «${postName(post)}» и обижен${prev.female ? "а" : ""}.`);
      }
      prev.agreed = false; prev.persuade = 0;
    }
  }
  if (p.post) { w.posts[p.post] = null; offendPatron(w, p, p.post, !!p.agreed || p.aspiration?.post === post, lines); }
  if (p.post && !post && p.agreed) lines.push(`${p.name} оставил${p.female ? "а" : ""} должность по уговору, без обиды.`);
  p.post = post ?? undefined; p.tenure = 0; p.exp = 0; p.agreed = false; p.persuade = 0;
  if (post) {
    w.posts[post] = p.id;
    if (p.aspiration?.post === post) {
      p.loyalty = clamp(p.loyalty + B.staff.desiredLoyalty, -REL_MAX, REL_MAX);
      p.know.aspiration = true;
      lines.push(`${p.name} получил${p.female ? "а" : ""} желанную должность «${postName(post)}» — благодарен${p.female ? "на" : ""}.`);
    } else lines.push(`${p.name} теперь «${postName(post)}».`);
    // обойдённые, кто хотел эту должность
    for (const o of w.people) {
      if (o.id !== p.id && o.aspiration?.post === post) {
        addRel(w, o.id, p.id, B.staff.bypassedRel);
        o.know.aspiration = true;
        lines.push(`${o.name} сам${o.female ? "а" : ""} метил${o.female ? "а" : ""} на это место — отношения с ${p.name} хуже.`);
      }
    }
  }
  if (cost) lines.push(`Авторитет −${cost}.`);
  if (w.head === p.id && !post) w.head = null;
  w.log.push({ season: w.season, kind: "staff", title: "Перестановка", lines });
  return true;
}

export function setHead(w: World, id: number | null) {
  w.head = id;
  if (id != null) w.log.push({ season: w.season, kind: "staff", title: "Главный на время отлучки", lines: [`За главного — ${w.people[id].name}.`] });
}

// Разговор — личное дело. Открывает по порядку: стремление → склонности словами → черты (ключевую и нажитые, кроме скрытых).
// Скрытный о главном в себе молчит, и личное дело на это не уходит: «молчит» он говорит в разговоре о склонностях.
type Topic = "черты" | "стремление" | "склонности";
const untold = (p: Person) => p.gained.filter((g) => !g.known && !g.trait.hidden);
function restTalk(p: Person): Exclude<Topic, "черты"> | null {
  if (!p.know.aspiration) return "стремление";
  return p.know.axes ? null : "склонности";
}
// Порядок тем: стремление → склонности → черты. Склонности раньше черт: по ним Сенешаль судит о годности, а с неё начинаются перестановки.
export function nextTalk(p: Person): Topic | null {
  return restTalk(p) ?? (!p.know.traitAsked || untold(p).length ? "черты" : null);
}
export function talk(w: World, id: number): boolean {
  const p = w.people[id];
  const topic = nextTalk(p);
  if (w.deedsLeft <= 0 || !topic) return false;
  w.deedsLeft--;
  p.know.talks++;
  p.loyalty = clamp(p.loyalty + B.staff.talkLoyalty, -REL_MAX, REL_MAX);
  const lines = [`Сенешаль говорил с ${p.name}.`], silent = `О главном в себе ${p.female ? "она" : "он"} молчит: такую черту выдаст только поступок.`;
  if (topic === "черты") {
    if (!p.know.trait && !p.trait.hidden) {
      p.know.trait = true;
      lines.push(`Ключевая черта: «${p.trait.name}» — ${lower(p.trait.desc)}.`);
    } else if (!p.know.trait && !p.know.traitAsked) lines.push(silent);
    p.know.traitAsked = true;
    for (const g of untold(p)) {
      g.known = true;
      lines.push(`Нажитая черта: «${traitLabel(w, g)}» — ${lower(g.trait.desc)}.`);
    }
  }
  if (topic === "стремление") {
    p.know.aspiration = true;
    lines.push(`Стремление: ${p.aspiration ? p.aspiration.text : "ничего особенного не хочет"}.`);
  } else if (topic === "склонности") {
    p.know.axes = true;
    lines.push(`Склонности: ${AXES.map((x) => `${AXIS_NAMES[x]} — ${axisWord(p.star[x])}`).join(", ")}.`);
    // скрытный: о чертах спрашивать нечего, и отдельного личного дела на «молчит» не уходит
    if (p.trait.hidden && !p.know.trait && !p.know.traitAsked && !untold(p).length) { p.know.traitAsked = true; lines.push(silent); }
  }
  w.log.push({ season: w.season, kind: "info", title: "Разговор", lines });
  return true;
}

// Медленный путь вместо авторитета: уговорить держателя должности уйти самому — личное дело, одно или два.
// Чем лучше он относится к Сенешалю и чем послушнее, тем быстрее; кто недоволен — не уговорить.
export function persuadeStep(p: Person): number {
  const A = B.authority;
  return clamp(A.persuadeBase + p.loyalty * A.persuadeLoyalty + mod(p, "obedience") * A.persuadeObedience, 0, 1);
}
export function persuade(w: World, id: number): boolean {
  const p = w.people[id];
  if (!p.post || p.agreed || w.deedsLeft <= 0) return false;
  w.deedsLeft--;
  const step = persuadeStep(p), f = p.female;
  p.persuade = round1((p.persuade ?? 0) + step);
  const lines = [`Сенешаль говорил с ${p.name} о том, чтобы оставить должность «${postName(p.post)}».`];
  if (p.persuade >= 1) { p.agreed = true; lines.push(`${p.name} согласил${f ? "ась" : "ся"} уйти сам${f ? "а" : ""}: снять можно без потери авторитета и без обиды.`); }
  else if (step <= 0) lines.push(`${p.name} и слушать не стал${f ? "а" : ""}: так ${f ? "её" : "его"} не уговорить.`);
  else lines.push(`${p.name} пока не согласен${f ? "на" : ""}, но задумал${f ? "ась" : "ся"}: нужен ещё разговор.`);
  w.log.push({ season: w.season, kind: "info", title: "Уговор", lines });
  return true;
}

// Цена нового наказа сейчас (сменить и снять — бесплатно).
export const orderCost = (w: World): number => priceOf(w, B.staff.orderCost);
// Возвращает false, если на новый наказ не хватает авторитета.
export function giveOrder(w: World, id: number, axis: Axis | null): boolean {
  const p = w.people[id], cost = axis && !p.order ? orderCost(w) : 0;
  if (cost > w.authority) return false;
  addAuthority(w, -cost, `наказ: ${p.name}`, "staff");
  p.order = axis ?? undefined;
  if (axis) w.log.push({ season: w.season, kind: "staff", title: "Наказ", lines: [`${p.name}: «действуй по ${AXIS_DAT[axis]}».${cost ? ` Авторитет −${cost}.` : ""}`] });
  return true;
}

// ---------- Решения ----------

// bonus — прибавка наказа в этом весе (ноль, если наказа нет или его не послушали); heard — наказ к варианту подходил
interface Scored { opt: EventOption; score: number; base: number; why: string; bonus: number; heard: boolean }

// Вариант уводит еду или серебро под нижнюю черту: совет такого сам не делает.
function underFloor(w: World, opt: EventOption): boolean {
  return belowFloor(w, "eda", opt.effects.pripasy ?? 0) || belowFloor(w, "serebro", opt.effects.kazna ?? 0);
}
// mine — человек выбирает для себя: варианты под нижней чертой отпадают (засидевшийся черту не чтит); иначе оцениваются все варианты события.
function scoreOptions(w: World, p: Person, ev: GameEvent, noisy = true, mine = false): Scored[] {
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
let trace: string[] = [];
let outcome: Outcome = "alone";
let bypassed = false;

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

function decide(w: World, p: Person, ev: GameEvent): Scored & { surprise: boolean } {
  const scored = scoreOptions(w, p, ev, true, true);
  const best = scored.reduce((a, b) => (b.score > a.score ? b : a));
  const expected = scored.reduce((a, b) => (b.base > a.base ? b : a));
  probeOrder(scored, best);
  const row = (s: Scored) => `${s.opt.id === best.opt.id ? "→ " : ""}«${s.opt.text}» ${round1(s.score)} (без случая ${round1(s.base)}; ${s.why})`;
  trace.push(`${p.name}: ${scored.map(row).join(" · ")}`);
  if (scored.length < ev.options.length) trace.push(`${p.name}: под нижней чертой, не рассматривал${p.female ? "а" : ""} — ${ev.options.length - scored.length}`);
  return { ...best, surprise: best.opt.id !== expected.opt.id };
}

function competence(p: Person): number {
  let c = p.exp >= B.exp.master ? B.exp.masterSkill : p.exp >= B.exp.settled ? B.exp.settledSkill : B.exp.novice;
  if (p.post && p.mark?.goodPost === p.post) c += B.exp.markGood;
  if (p.post && p.mark?.badPost === p.post) c += B.exp.markBad;
  c += mod(p, "skill");
  return clamp(c, B.exp.skillMin, B.exp.skillMax);
}

// Последствия варианта. Доверие сторон: derevni — обеим деревням или той, что названа в событии. kazna и pripasy — запасы серебра и еды
// со строкой в ведомости; ниже нуля запас не опускается, в запись идёт то, что вышло на деле.
// plus — доля пользы: множитель только к плюсам и к отдаче вложения. Саботаж срывает дело, а цена (минусы, руки) платится целиком.
function applyEffects(w: World, ev: GameEvent, opt: EventOption, mult: number, doer: Person | undefined, lines: string[], plus = 1): Partial<Record<Effect, number>> {
  let k = mult;
  if (doer) k *= competence(doer);
  if (opt.careful) k *= B.exp.carefulGain;
  let failed = false;
  if (opt.risky && doer) {
    const pSuccess = B.exp.riskBase + B.exp.riskSkill * competence(doer);
    if (!w.rng.chance(pSuccess)) failed = true;
  }
  // смелый вариант: при удаче выигрыш больше, цена та же
  const gain = opt.risky && !failed ? B.exp.boldGain : 1;
  const out: Partial<Record<Effect, number>> = {};
  for (const [key, v] of Object.entries(opt.effects) as [Effect, number][]) {
    let val = v * k * (v > 0 ? gain * plus : 1);
    if (failed && val > 0) val = -val * B.exp.failBackfire;
    val = round1(val);
    out[key] = val;
    const who = doer ? `${postName(doer.post!).toLowerCase()} ${doer.name}` : undefined;
    if (key === "poryadok") w.resources.poryadok = round1(w.resources.poryadok + val);
    else if (key === "kazna" || key === "pripasy") {
      const cat = key === "kazna" ? "serebro" : "eda";
      const under = belowFloor(w, cat, val) ? "по-своему: ниже нижней черты" : undefined;
      out[key] = addLine(w, { cat, v: val, text: `событие «${ev.title}»: ${lower(opt.text)}`, who, how: under });
      if (out[key] !== val) lines.push(`${cat === "eda" ? "Амбар" : "Казна"} не бездонны: взять удалось только ${-out[key]!}.`);
      if (under) lines.push(`Нижняя черта нарушена: ${doer?.name ?? "совет"} распорядил${doer?.female ? "ась" : "ся"} запасом по-своему.`);
    } else if (key === "derevni") for (const v of ev.village ? [ev.village] : VILLAGES) addTrust(w, v, val * B.economy.trust.event);
    else addTrust(w, key, val * B.economy.trust.event);
  }
  if (opt.hands) takeHands(w, opt.hands);
  if (opt.later && !failed) invest(w, ev, opt.later, k * gain * plus, lines);
  if (opt.later && failed) lines.push("Вложение пропало: отдачи не будет.");
  if (failed) lines.push(`Рискованное дело провалилось — не хватило опыта (${doer ? expWord(doer) : "?"}).`);
  return out;
}

// Решение состоялось: счётчики, дрейф звезды, запись для привычки и наблюдение — Сенешаль видел человека в деле.
function recordChoice(w: World, p: Person, opt: EventOption, lines: string[]) {
  const top = topAxis(p.star);
  p.decisions++;
  if (opt.axes.includes(top)) p.matchedTop++;
  p.recent.push({ season: w.season, axes: [...opt.axes] });
  if (p.post === "starosta") elderSaw(w, p, opt.axes);
  for (const a of opt.axes) {
    p.choices[a]++;
    p.star[a] = round1(clamp(p.star[a] + B.star.drift, 0, STAR_MAX));
    const was = axisKnown(p, a);
    p.know.seen[a]++;
    if (!was && axisKnown(p, a)) lines.push(`👁 Насмотрелись в деле: ${p.name}, ${AXIS_NAMES[a]} — ${axisWord(p.star[a])}.`);
  }
}

// Поступок выдаёт скрытую черту: ключевую и приобретённую.
function reveal(w: World, p: Person, deed: Deed, lines: string[]) {
  if (!p.know.trait && p.trait.hidden && p.trait.revealedBy === deed) {
    p.know.trait = true;
    p.know.traitAsked = true;
    lines.push(`👁 Поступок выдал черту: ${p.name} — «${p.trait.name}», ${lower(p.trait.desc)}.`);
  }
  for (const g of p.gained) {
    if (g.known || g.trait.revealedBy !== deed) continue;
    g.known = true;
    lines.push(`👁 Поступок выдал черту: ${p.name} — «${traitLabel(w, g)}», ${lower(g.trait.desc)}.`);
  }
}

// Обход: хитрый проиграл спор, для вида согласился, а сделал по-своему. Возвращает последствия, если обход случился.
function bypass(w: World, ev: GameEvent, win: Person, lose: Person, opt: EventOption, lines: string[]): Partial<Record<Effect, number>> | undefined {
  if (mod(lose, "sly", win) <= 0 || !w.rng.chance(B.traits.bypassChance)) return undefined;
  const f = lose.female;
  bypassed = true;
  lines.push(`Но ${lose.name} только для вида согласил${f ? "ась" : "ся"}, а сделал${f ? "а" : ""} по-своему, в обход: «${opt.text}».`);
  reveal(w, lose, "bypass", lines);
  addRel(w, win.id, lose.id, B.traits.bypassRel);
  recordChoice(w, lose, opt, lines);
  return applyEffects(w, ev, opt, B.traits.bypass, lose, lines);
}

function toneOf(eff: Partial<Record<Effect, number>>): LogEntry["tone"] {
  const vals = Object.values(eff);
  const pos = vals.filter((v) => v! > 0).length, neg = vals.filter((v) => v! < 0).length;
  return pos && !neg ? "good" : neg && !pos ? "bad" : pos && neg ? "mixed" : "neutral";
}

// Одно событие: решают держатели задетых должностей. Запись уходит в летопись; возвращается она же.
export function runEvent(w: World, ev: GameEvent): LogEntry {
  const holders = ev.posts.map((post) => holder(w, post)).filter((x): x is Person => !!x);
  const lines: string[] = [ev.text];
  let effects: Partial<Record<Effect, number>> = {};
  trace = []; bypassed = false;
  outcome = holders.length === 0 ? "empty" : "alone";

  if (holders.length === 0) {
    lines.push("Должности пусты — делом никто не занялся.");
    w.resources.poryadok -= B.council.emptyOrder;
    effects = { poryadok: -B.council.emptyOrder };
  } else if (holders.length === 1) {
    const p = holders[0];
    const d = decide(w, p, ev);
    lines.push(`${p.name} (${postName(p.post!)}): «${d.opt.text}» — ${d.why}${d.surprise ? ", неожиданно для себя" : ""}.`);
    if (ev.posts.length === 2) lines.push(`Вторая должность пуста — ${p.name} решал${p.female ? "а" : ""} в одиночку.`);
    recordChoice(w, p, d.opt, lines);
    effects = applyEffects(w, ev, d.opt, 1, p, lines);
  } else {
    effects = council(w, ev, holders[0], holders[1], lines);
  }
  const title = `${ev.title}${ev.adventurers ? " ⚔" : ""}`;
  const entry: LogEntry = { season: w.season, kind: "event", title, lines, effects, tone: toneOf(effects), weights: trace, outcome, ...(bypassed ? { bypass: true } : {}) };
  w.log.push(entry);
  return entry;
}

function council(w: World, ev: GameEvent, a: Person, b: Person, lines: string[]): Partial<Record<Effect, number>> {
  // слаженность совета: при признанном главном и без вражды дела двух сфер идут сильнее, при открытой вражде — слабее
  const co = councilFeud(w) ? B.council.feud : councilSteady(w).ok ? B.council.cohesion : 1;
  if (co !== 1) lines.push(co > 1 ? "Совет слажен: дело двух сфер спорится." : "В совете вражда: дело двух сфер идёт хуже.");
  const da = decide(w, a, ev), db = decide(w, b, ev);
  const r = getRel(w, a.id, b.id);
  const word = relWord(r);
  lines.push(`${a.name} (${postName(a.post!)}) хочет «${da.opt.text}» — ${da.why}.`);
  lines.push(`${b.name} (${postName(b.post!)}) хочет «${db.opt.text}» — ${db.why}.`);

  if (da.opt.id === db.opt.id) {
    const mult = r >= B.rel.friendly ? B.council.synergy : 1;
    outcome = "agree";
    lines.push(mult > 1 ? `Сошлись сразу, и раз они ${word}, вышло лучше обычного.` : `Сошлись во мнении.`);
    recordChoice(w, a, da.opt, lines); recordChoice(w, b, db.opt, lines);
    addRel(w, a.id, b.id, B.council.agreeRel);
    const doer = a.exp >= b.exp ? a : b;
    return applyEffects(w, ev, da.opt, mult * co, doer, lines);
  }

  // Главный, если он третий, может рассудить
  const head = w.head != null ? w.people[w.head] : undefined;
  if (head && head.id !== a.id && head.id !== b.id) {
    const ra = getRel(w, head.id, a.id), rb = getRel(w, head.id, b.id);
    if (ra >= B.council.headMinRel && rb >= B.council.headMinRel) {
      const sa = scoreOptions(w, head, ev, false).find((s) => s.opt.id === da.opt.id)!.base;
      const sb = scoreOptions(w, head, ev, false).find((s) => s.opt.id === db.opt.id)!.base;
      const [win, lose, opt] = sa >= sb ? [a, b, da.opt] : [b, a, db.opt];
      outcome = "judge";
      lines.push(`Спорили (${word}). Рассудил главный, ${head.name}: делать как хочет ${win.name}.`);
      addRel(w, head.id, lose.id, B.council.headJudgeRel);
      recordChoice(w, win, opt, lines);
      return applyEffects(w, ev, opt, co, head.post ? head : win, lines);   // решение берёт главный: в силу идёт его опыт
    }
    lines.push(`Главного, ${head.name}, не признали — у него с кем-то из них плохие отношения.`);
  }

  const soft = mod(a, "softness", b) + mod(b, "softness", a);
  // кто сильнее в споре: главный, затем стаж и дерзость
  const power = (p: Person) => (w.head === p.id ? B.council.powerHead : 0) + p.tenure / B.council.powerTenureDiv
    + p.star.derzost / B.council.powerDerzostDiv + mod(p, "clout") + w.rng.range(0, B.council.powerRandom);
  const [win, lose, wd] = power(a) >= power(b) ? [a, b, da] : [b, a, db];
  const ld = win === a ? db : da;

  if (r >= B.rel.friendly) {
    // ладят — договариваются о лучшем для обоих
    const all = scoreOptions(w, a, ev, false).map((s, i) => ({ opt: s.opt, v: s.base + scoreOptions(w, b, ev, false)[i].base }));
    const kept = all.filter((x) => !underFloor(w, x.opt));
    const both = kept.length ? kept : all;
    const opt = both.reduce((x, y) => (y.v > x.v ? y : x)).opt;
    outcome = "deal";
    lines.push(`Они ${word} — договорились: «${opt.text}».`);
    recordChoice(w, a, opt, lines); recordChoice(w, b, opt, lines);
    addRel(w, a.id, b.id, B.council.dealRel);
    return applyEffects(w, ev, opt, B.council.dealGain * co, win, lines);
  }
  if (r > B.rel.rival) {
    // терпят — компромисс или кто-то продавил
    if (w.rng.chance(B.council.compromiseChance + soft * B.council.softness)) {
      outcome = "compromise";
      lines.push(`Они ${word} друг друга — сделали наполовину, как хотел ${win.name}, но вполсилы.`);
      recordChoice(w, win, wd.opt, lines);
      return applyEffects(w, ev, wd.opt, B.council.compromise * co, win, lines);
    }
    outcome = "push";
    lines.push(`Они ${word} друг друга. ${win.name} продавил${win.female ? "а" : ""} своё; ${lose.name} затаил${lose.female ? "а" : ""} обиду.`);
    addRel(w, a.id, b.id, B.council.pushRel);
    const around = bypass(w, ev, win, lose, ld.opt, lines);
    if (around) return around;
    recordChoice(w, win, wd.opt, lines);
    return applyEffects(w, ev, wd.opt, co, win, lines);
  }
  if (r > B.rel.enemy) {
    outcome = "rival";
    lines.push(`Они соперники. ${win.name} настоял${win.female ? "а" : ""} на своём, ${lose.name} не простит.`);
    addRel(w, a.id, b.id, B.council.rivalRel);
    const around = bypass(w, ev, win, lose, ld.opt, lines);
    if (around) return around;
    recordChoice(w, win, wd.opt, lines);
    if (lose.loyalty < B.council.complaintLoyalty || w.rng.chance(B.council.complaintChance)) {
      lines.push(`📜 Жалоба: ${lose.name} ждёт Сенешаля с жалобой на ${win.name}.`);
      addComplaint(w, lose.id, win.id);
    }
    return applyEffects(w, ev, wd.opt, B.council.rivalGain * co, win, lines);
  }
  // враги
  if (w.rng.chance(B.council.sabotageChance)) {
    outcome = "sabotage";
    lines.push(`Они враги. ${win.name} сделал${win.female ? "а" : ""} по-своему, а ${lose.name} мешал${lose.female ? "а" : ""} назло: «${ld.opt.text}» — вот чего ${lose.female ? "она" : "он"} хотел${lose.female ? "а" : ""}. Саботаж.`);
    addRel(w, a.id, b.id, B.council.sabotageRel);
    reveal(w, lose, "sabotage", lines);
    gainTrait(w, win, "zlopamyatny_k", lines, lose.id);
    recordChoice(w, win, wd.opt, lines);
    const eff = applyEffects(w, ev, wd.opt, 1, win, lines, B.council.sabotage * co);
    w.resources.poryadok = round1(w.resources.poryadok - B.council.sabotageOrder);
    eff.poryadok = round1((eff.poryadok ?? 0) - B.council.sabotageOrder);
    lines.push(`📜 Жалобы с обеих сторон ждут Сенешаля.`);
    addComplaint(w, lose.id, win.id); addComplaint(w, win.id, lose.id);
    return eff;
  }
  outcome = "silent";
  lines.push(`Они враги, но ${lose.name} на этот раз смолчал${lose.female ? "а" : ""}. ${win.name} сделал${win.female ? "а" : ""} по-своему.`);
  addRel(w, a.id, b.id, B.council.silentRel);
  recordChoice(w, win, wd.opt, lines);
  return applyEffects(w, ev, wd.opt, B.council.rivalGain * co, win, lines);
}

// ---------- Сезон ----------

// Прогноз словами — только из того, что Сенешаль знает: самая сильная из известных склонностей.
export function forecast(p: Person): string {
  const known = AXES.filter((a) => axisKnown(p, a));
  if (!known.length) return "пока непонятно, как поступит";
  const best = known.reduce((x, a) => (p.star[a] > p.star[x] ? a : x), known[0]);
  if (p.star[best] < B.know.strong) return "сильных склонностей пока не видно";
  return `скорее всего, будет действовать по ${AXIS_DAT[best]}`;
}

const eventPool = (w: World) => EVENTS.filter((e) => !e.adventurers || w.labOpen);
// Дело на столе: одно из событий будущего сезона Сенешаль видит заранее.
function pickDesk(w: World) {
  w.desk = { event: w.rng.pick(eventPool(w)).id };
}
// Что лежит на столе: событие, советник (держатель первой задетой должности, какая занята) и его мнение — что бы он выбрал сам.
export function deskView(w: World): { ev: GameEvent; advisor?: Person; opinion?: EventOption; order?: EventOption } | undefined {
  const ev = w.desk ? eventPool(w).find((e) => e.id === w.desk!.event) : undefined;
  if (!ev) return undefined;
  const advisor = ev.posts.map((post) => holder(w, post)).find((x): x is Person => !!x);
  const opinion = advisor ? scoreOptions(w, advisor, ev, false, true).reduce((a, b) => (b.base > a.base ? b : a)).opt : undefined;
  return { ev, advisor, opinion, order: ev.options.find((o) => o.id === w.desk!.order) };
}
// Приказ при Сенешале дома — личное дело: по делу на столе исполнить этот вариант. Отменить нельзя.
export function command(w: World, optionId: string): boolean {
  const d = deskView(w);
  if (!d || d.order || w.deedsLeft <= 0 || !d.ev.options.some((o) => o.id === optionId)) return false;
  w.deedsLeft--;
  w.desk!.order = optionId;
  const opt = d.ev.options.find((o) => o.id === optionId)!;
  const against = d.opinion && d.opinion.id !== opt.id ? ` ${d.advisor!.name} советует иначе: «${d.opinion.text}».` : "";
  w.log.push({ season: w.season, kind: "staff", title: "Приказ", lines: [`По делу «${d.ev.title}» Сенешаль приказал: «${opt.text}».${against}`] });
  return true;
}
// Дело по приказу: исполняет советник. Приказ против его мнения — ответственность Сенешаля: вышло хорошо — авторитет и уважение, плохо — потеря.
function runOrdered(w: World, ev: GameEvent, opt: EventOption): LogEntry {
  const d = deskView(w)!, p = d.advisor, A = B.authority;
  const against = !!d.opinion && d.opinion.id !== opt.id;
  const lines = [ev.text, `Сенешаль приказал: «${opt.text}».`];
  let mult = 1;
  if (p && against) {
    lines.push(`${p.name} (${postName(p.post!)}) советовал${p.female ? "а" : ""} иначе: «${d.opinion!.text}».`);
    if (p.loyalty < B.loyalty.trusts) { mult = B.economy.doer.dull; lines.push(`Исполняет без огонька: и не согласен${p.female ? "на" : ""}, и Сенешалю не слишком верит.`); }
  } else if (p) lines.push(`${p.name} (${postName(p.post!)}) того же мнения.`);
  else lines.push("Должности пусты — исполнять пришлось кому попало.");
  const effects = applyEffects(w, ev, opt, p ? mult : B.economy.doer.empty, p, lines);
  const sum = Object.values(effects).reduce((s, v) => s + v!, 0);
  if (p && against && sum > 0) {
    addAuthority(w, A.rightGain, `оказался прав: «${ev.title}» против мнения ${p.name}`, "order");
    p.loyalty = round1(clamp(p.loyalty + A.rightLoyalty, -REL_MAX, REL_MAX));
    lines.push(`Вышло хорошо: Сенешаль оказался прав. ${p.name} это запомнит. Авторитет +${A.rightGain}.`);
  } else if (p && against && sum < 0) {
    addAuthority(w, -A.rightLoss, `приказ обернулся плохо: «${ev.title}» против мнения ${p.name}`, "order");
    lines.push(`Вышло плохо, а ${p.name} предупреждал${p.female ? "а" : ""}. Авторитет −${A.rightLoss}.`);
  }
  const entry: LogEntry = { season: w.season, kind: "event", title: `${ev.title} — по приказу`, lines, effects, tone: toneOf(effects), outcome: "ordered" };
  w.log.push(entry);
  return entry;
}

export function runSeason(w: World) {
  const pool = eventPool(w);
  const desk = deskView(w);
  const rest = w.rng.shuffle(pool.filter((e) => e !== desk?.ev)).slice(0, B.season.events - (desk ? 1 : 0));
  if (desk?.order) runOrdered(w, desk.ev, desk.order);
  else if (desk) runEvent(w, desk.ev);
  for (const ev of rest) runEvent(w, ev);
  upkeep(w);
  w.season++;
  w.deedsLeft = B.season.deeds;
  rollForecast(w);
  pickDesk(w);
}

export function runEvents(w: World, n: number) {
  const pool = EVENTS.filter((e) => !e.adventurers || w.labOpen);
  for (let i = 0; i < n; i++) runEvent(w, w.rng.pick(pool));
}

function upkeep(w: World) {
  const lines: string[] = [];
  // старые обиды и симпатии понемногу сглаживаются
  for (const [k, v] of w.rel) w.rel.set(k, round1(v * B.rel.fade));
  for (const p of w.people) {
    if (p.post) {
      p.tenure++;
      p.exp = Math.min(p.exp + 1, B.exp.master);
      if (p.tenure === B.exp.settled) lines.push(`${p.name} освоил${p.female ? "ась" : "ся"} на должности.`);
      if (p.tenure === B.exp.staleFrom) lines.push(`${p.name} засидел${p.female ? "ась" : "ся"} на месте: оброс своими людьми и делает всё больше по-своему.`);
      if (isStale(p) && p.star.vygoda >= B.decide.staleGreedFrom && w.rng.chance(B.season.theftChance)) {
        // вороватый, который сам ведёт счёт серебру (писарь), прячет строку: пропажа видна только как «счёт не сходится»
        const hidden = p.post === "pisar";
        addLine(w, { cat: "serebro", v: -B.season.theft, text: "утекло из казны", who: `${postName(p.post).toLowerCase()} ${p.name}`, how: "по-своему", hidden });
        lines.push(hidden ? "Счёт серебра не сходится: чего-то недостаёт, а в книгах чисто." : `Из казны что-то утекает — следы ведут к людям ${p.name}.`);
      }
    }
    lifeTraits(w, p, lines);
    const asp = p.aspiration?.post;
    if (asp) {
      if (p.post === asp) p.loyalty += B.loyalty.desiredPost;
      else if (p.post) p.loyalty += B.loyalty.wrongPost * (1 + mod(p, "ambition") * B.loyalty.ambition) * (isStale(p) ? B.loyalty.staleWrong : 1);
      else if (w.posts[asp] != null) {
        p.loyalty += B.loyalty.blocked;
        const h = holder(w, asp)!;
        if (isStale(h)) addRel(w, p.id, h.id, B.loyalty.blockedStaleRel);
      }
    }
    p.loyalty = round1(clamp(p.loyalty, -REL_MAX, REL_MAX));
    if (p.loyalty <= B.loyalty.bitter && w.rng.chance(B.loyalty.leaveChance)) lines.push(`⚠ ${p.name} озлоблен${p.female ? "а" : ""} и подумывает уйти.`);
  }
  economySeason(w, lines);
  authoritySeason(w, lines);
  w.log.push({ season: w.season, kind: "season", title: `Итог сезона ${w.season}`, lines: lines.length ? lines : ["Ничего особенного."] });
}

// Сводка: читается ли персонаж как личность
export function consistency(p: Person): number {
  return p.decisions ? Math.round((p.matchedTop / p.decisions) * 100) : 0;
}

// ---------- Знание о людях ----------
// Всё, что экран показывает игроку о человеке, идёт через эти функции: числа звезды наружу не выходят.

export function axisWord(v: number): string {
  return v >= B.know.strong ? "сильно" : v >= B.know.notable ? "заметно" : "слабо";
}
// Ось известна: рассказал сам (третий разговор) или насмотрелись в деле.
export function axisKnown(p: Person, a: Axis): boolean {
  return p.know.axes || p.know.seen[a] >= B.know.seenToKnow;
}
export function traitLabel(w: World, g: { trait: Trait; target?: number }): string {
  return g.trait.targeted && g.target != null ? `${g.trait.name} ${dative(w.people[g.target].name)}` : g.trait.name;
}
// Молва проверяется, когда становится известно то, о чём она: черта или склонность.
export function rumorCheck(p: Person): "" | "подтвердилась" | "не подтвердилась" {
  const r = p.rumor;
  if (!r) return "";
  if (r.trait) return !p.know.trait ? "" : r.trait === p.trait.id ? "подтвердилась" : "не подтвердилась";
  if (!r.axis || !axisKnown(p, r.axis)) return "";
  return p.star[r.axis] >= B.know.notable ? "подтвердилась" : "не подтвердилась";
}
// Годность словом — по тому, что известно: известные оси должности, метка (видна всегда), известное стремление.
export function fitWord(p: Person, post: PostId): "подходит" | "сомнительно" | "не знаю" {
  const def = POSTS.find((x) => x.id === post)!;
  const known = def.axes.filter((a) => axisKnown(p, a));
  const good = p.mark?.goodPost === post, bad = p.mark?.badPost === post;
  if (!known.length && !good && !bad) return "не знаю";
  let f = known.length ? known.reduce((s, a) => s + p.star[a], 0) / known.length : B.star.center;
  if (good) f += B.exp.fitMarkGood;
  if (bad) f -= B.exp.fitMarkBad;
  if (p.know.aspiration && p.aspiration?.post === post) f += B.exp.fitAspiration;
  return f >= B.know.fitGood ? "подходит" : "сомнительно";
}
// Мнение главного о человеке: куда бы он его поставил. С пристрастием: друга похвалит, соперника очернит.
export function headOpinion(w: World, p: Person): { head: Person; text: string; bias: number } | undefined {
  const head = w.head != null ? w.people[w.head] : undefined;
  if (!head || head.id === p.id) return undefined;
  const bias = round1(getRel(w, head.id, p.id) * B.know.opinionBias);
  const best = POSTS.reduce((x, d) => (fitness(p, d.id) > fitness(p, x.id) ? d : x), POSTS[0]);
  const text = fitness(p, best.id) + bias >= B.know.fitGood ? `годится в ${best.into}` : "ни на одну должность не годится";
  return { head, text, bias };
}

// ---------- Черты в течение жизни ----------

// Человек приобретает черту: не больше B.traits.maxGained сверх ключевой, одна и та же (с той же целью) — один раз.
// Должностные черты (source "post") в предел не входят: они про место, а не про человека, и уходят вслед за должностью (dropPostTraits).
// Запись идёт в летопись (lines) и в биографию; сдвиг звезды черты применяется сразу.
// Сенешаль о новой черте знает: она нажита у него на глазах. Скрытую (hidden) выдаст только поступок, как ключевую.
export function gainTrait(w: World, p: Person, traitId: string, lines: string[], target?: number): boolean {
  const trait = LIFE_TRAITS.find((t) => t.id === traitId);
  if (!trait) throw new Error(`Нет приобретаемой черты ${traitId}`);
  const onPost = trait.source === "post";
  const had = p.gained.find((g) => g.trait.id === traitId && g.target === target);
  // та же должностная черта, нажитая уже на новом месте, пока старая не снята: она переходит на новую должность
  if (had && onPost) { had.post = p.post; had.away = 0; }
  if (had) return false;
  if (!onPost && p.gained.filter((g) => g.trait.source !== "post").length >= B.traits.maxGained) return false;
  p.gained.push({ trait, target, season: w.season, known: !trait.hidden, ...(onPost ? { post: p.post } : {}) });
  addStar(p.star, trait.star);
  for (const a of AXES) p.star[a] = round1(clamp(p.star[a], 0, STAR_MAX));
  const label = traitLabel(w, { trait, target });
  lines.push(`✦ Новая черта: ${p.name} — «${label}». ${trait.desc}.`);
  p.bio.push(`На службе у Сенешаля (сезон ${w.season}) нажил${p.female ? "а" : ""} черту «${label}»: ${lower(trait.desc)}.`);
  return true;
}

// Перелом: резкий сдвиг звезды и новая черта («Ожесточился», «Стал набожен»). Заготовка: событий-поводов пока нет, зовут её тесты и будущие сцены.
export function breakdown(w: World, id: number, traitId: string, why: string): boolean {
  const p = w.people[id];
  const lines = [why];
  if (LIFE_TRAITS.find((t) => t.id === traitId)?.source !== "break") throw new Error(`Черта ${traitId} — не перелом`);
  if (!gainTrait(w, p, traitId, lines)) return false;
  w.log.push({ season: w.season, kind: "info", title: `Перелом: ${p.name}`, lines });
  return true;
}

// Должностная черта держится на должности: ушёл — через B.traits.postTraitLag сезонов она снимается, вернулся раньше — остаётся.
function dropPostTraits(w: World, p: Person, lines: string[]) {
  p.gained = p.gained.filter((g) => {
    if (g.trait.source !== "post") return true;
    g.away = g.post === p.post ? 0 : (g.away ?? 0) + 1;
    if (g.away < B.traits.postTraitLag) return true;
    lines.push(`✧ Черта ушла: ${p.name} больше не «${g.trait.name}» — должность оставлена.`);
    p.bio.push(`Оставив должность (сезон ${w.season}), утратил${p.female ? "а" : ""} черту «${g.trait.name}».`);
    return false;
  });
}

// Раз в сезон: должностные черты уходят вслед за должностью, появляются черты из привычки и из должности.
function lifeTraits(w: World, p: Person, lines: string[]) {
  dropPostTraits(w, p, lines);
  p.recent = p.recent.filter((r) => r.season > w.season - B.traits.habitSeasons);
  const n = p.recent.length;
  if (n >= B.traits.habitMinDecisions) {
    for (const t of LIFE_TRAITS) {
      if (t.source !== "habit" || !t.axis) continue;
      if (p.recent.filter((r) => r.axes.includes(t.axis!)).length / n >= B.traits.habitShare) gainTrait(w, p, t.id, lines);
    }
  }
  if (!p.post) return;
  if (p.exp >= B.exp.master) gainTrait(w, p, "master_dela", lines);
  if (isStale(p)) gainTrait(w, p, "obros_svyazyami", lines);
  const asp = p.aspiration?.post;
  if (asp && asp !== p.post && p.tenure >= B.traits.tiredFrom) gainTrait(w, p, "ustal_ot_sluzhby", lines);
}
