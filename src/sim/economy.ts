// Хозяйство и подать (задача И12, замысел — docs/design/hozyaystvo.md). Без интерфейса: работает в браузере и в Node.
// Сезон совета (sim.ts) зовёт отсюда economySeason; экран и боты — setCourse, setFloor, payTax и функции «что видно».
// Порядок как шкала строгости, кризисы сторон и падение — задачи И13 и И14: здесь их нет.
import type { Axis, Star, Side, Village, Stock, Category, HandsFrom, CourseId, CourseDef, PayId, PayDef, PostId, Trait, Effect, GameEvent, Later } from "../data/types";
import { AXES, OPPOSED, TRAITS } from "../data/core";
import { HANDS, LEVERS, type Hand, type Lever } from "../data/handwriting";
import { POSTS, AXIS_NAMES } from "../data/core";
import { SIDES, VILLAGES, SIDE_NAMES, CATEGORY_NAMES, COURSES, ELDERS, PAY, HANDS_FROM, STOCKS, SEASON_NAMES } from "../data/economy";
import { BALANCE as B } from "./balance";
import { addAuthority, councilSteady } from "./authority";
import { PROBE } from "./probe";
import { holder, fitness, isStale, topAxis, postName, STAR_MAX, REL_MAX, type World, type Person } from "./sim";

// Строка ведомости: что пришло или ушло, от какой стороны, кто отвечал и как исполнял. hidden — строку спрятал тот, кто ведёт счёт.
export interface LedgerLine { cat: Category; v: number; text: string; side?: Side; who?: string; how?: string; hidden?: boolean }
export interface Ledger { season: number; before: Record<Stock, number>; after: Record<Stock, number>; lines: LedgerLine[] }
export interface Elder { side: Village; name: string; female: boolean; age: number; trait: Trait; star: Star; rel: number[] }
export interface TaxYear { year: number; due: number; paid: number; closed: boolean; early: boolean; by: Partial<Record<PayId, number>> }
export interface Tax {
  year: number;                 // который год подати (с единицы)
  lesson: number;               // урок этого года без недоимки
  carried: number;              // недоимка прошлого года с надбавкой
  due: number;                  // всего к осени: урок и недоимка
  paid: number;
  early: boolean;               // закрыт до осени
  by: Partial<Record<PayId, number>>; // чем и с кого платили в этом году, в мерах
  patience: number;             // терпение Герцога, 0..10
  history: TaxYear[];
}
// Вложение: последствия, которые придут в сезоне due. village — если событие было про одну деревню.
export interface Pending { due: number; effects: Partial<Record<Effect, number>>; text: string; village?: Village }

export interface Economy {
  stock: Record<Stock, number>;
  floor: { eda: number; serebro: number };  // нижние черты: совет ниже сам не тратит
  feedFirst: "zamok" | "derevni";           // очередь недодачи: кого кормим первым
  course: CourseId | null;
  courseSeasons: number;                    // сколько сезонов курс уже продержался
  shaky: boolean;                           // шатание: курс сменили слишком быстро
  sown: number;                             // доля поля, засеянная весной
  recruits: { from: HandsFrom; hands: number; until: number }[];
  dutyCutUntil: number;                     // до какого сезона пошлины ниже после особого сбора
  debts: { due: number; sum: number }[];    // займы у купцов: в каком сезоне вернуть и сколько
  autoPay: boolean;                         // осенью остаток урока закрывает совет: серебром, потом зерном, не ниже черт
  tax: Tax;
  elders: Elder[];
  last: Ledger | null;                      // ведомость прошлого сезона
  cur: LedgerLine[];                        // строки текущего сезона: события совета и плата подати до его конца
  shortages: number;                        // в скольких сезонах за партию срабатывала недодача
  fc: Record<Stock, number>;                // куда ошибся счетовод в прогнозе этого сезона, −1..1
  pending: Pending[];                       // вложения совета: отдача придёт позже
  zoneWas: Partial<Record<Side, Zone>>;     // зоны сторон на конец прошлого сезона: смена зоны идёт в летопись
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100;
const floor1 = (v: number) => Math.floor(v * 10 + 1e-9) / 10;
export const seasonKind = (season: number) => (season - 1) % 4;   // 0 весна, 1 лето, 2 осень, 3 зима
const AUTUMN = 2, WINTER = 3, SUMMER = 1, SPRING = 0;

// ---------- Стороны и зоны ----------

export type Zone = "заодно" | "ладят" | "терпят" | "отказывают";
export function zoneWord(v: number): Zone {
  const T = B.economy.trust;
  return v >= T.ally ? "заодно" : v >= T.friendly ? "ладят" : v > T.refuse ? "терпят" : "отказывают";
}
export const zoneOf = (w: World, side: Side): Zone => zoneWord(w.factions[side]);
export function zoneMult(w: World, side: Side): number {
  const Z = B.economy.zone, z = zoneOf(w, side);
  return z === "заодно" ? Z.ally : z === "ладят" ? Z.friendly : z === "терпят" ? Z.tolerate : Z.refuse;
}
export function addTrust(w: World, side: Side, d: number): number {
  const max = B.economy.trust.max, was = w.factions[side];
  w.factions[side] = r1(clamp(was + d, -max, max));
  return r1(w.factions[side] - was);
}
export function patienceWord(v: number): "благоволит" | "ждёт" | "недоволен" | "на исходе" {
  const T = B.economy.tax;
  return v >= T.favor ? "благоволит" : v >= T.waits ? "ждёт" : v >= T.displeased ? "недоволен" : "на исходе";
}

// ---------- Начало партии ----------

export function initEconomy(w: World): Economy {
  const S = B.economy.start;
  const elders: Elder[] = ELDERS.map((e) => {
    const trait = TRAITS.find((t) => t.id === e.trait)!;
    const star = {} as Star;
    for (const a of AXES) star[a] = B.star.base + w.rng.range(0, B.star.baseRandom) + (trait.star[a] ?? 0);
    const mean = AXES.reduce((t, a) => t + star[a], 0) / AXES.length;
    for (const a of AXES) star[a] = r1(clamp(B.star.center + (star[a] - mean) * B.star.spread, B.star.floor, STAR_MAX));
    // отношения старосты с каждым, кто может стать тиуном: как у людей хозяйства на старте — трение осей и общая ведущая ось
    const rel = w.people.map((p) => {
      let v = w.rng.range(-B.rel.startSpread, B.rel.startSpread);
      for (const [x, y] of OPPOSED) {
        const from = B.rel.opposedFrom;
        if ((star[x] >= from && p.star[y] >= from) || (star[y] >= from && p.star[x] >= from)) v -= B.rel.opposedPenalty;
      }
      if (topAxis(star) === topAxis(p.star)) v += B.rel.sameTop;
      return r1(v);
    });
    return { side: e.side, name: e.name, female: e.female, age: e.age, trait, star, rel };
  });
  const eco: Economy = {
    stock: { eda: S.eda, tovary: S.tovary, serebro: S.serebro },
    floor: { eda: S.floorEda, serebro: S.floorSerebro }, feedFirst: "zamok",
    course: null, courseSeasons: 0, shaky: false, sown: 1, recruits: [], dutyCutUntil: 0, debts: [], autoPay: true,
    tax: { year: 0, lesson: 0, carried: 0, due: 0, paid: 0, early: false, by: {}, patience: S.patience, history: [] },
    elders, last: null, cur: [], shortages: 0, fc: { eda: 0, tovary: 0, serebro: 0 }, zoneWas: {}, pending: [],
  };
  for (const s of SIDES) eco.zoneWas[s] = zoneWord(w.factions[s]);
  w.eco = eco;
  newTaxYear(w);
  rollForecast(w);
  return eco;
}

// ---------- Исполнитель и курс ----------

export type How = "с огоньком" | "как велено" | "без огонька" | "должность пуста";
// mult — сила потока: мастерство × опыт × настрой; how — настрой; note — из чего сложилась сила, словами для ведомости.
// stale — засиделся: опыт мастерский и выше, почерк вдвое сильнее, курс его не зажигает.
export interface Doer { p?: Person; mult: number; how: How; note: string; mastery: number; exp: number; mood: number; stale?: boolean; hand: string }
// Мастерство: годность к должности, переведённая в множитель потока.
export function mastery(p: Person, post: PostId): { mult: number; word: "негоден" | "годен" | "прирождённый" } {
  const D = B.economy.doer, t = clamp((fitness(p, post) - D.masteryFrom) / Math.max(1, D.masteryTo - D.masteryFrom), 0, 1);
  const mult = r2(D.masteryMin + (D.masteryMax - D.masteryMin) * t);
  const third = (D.masteryMax - D.masteryMin) / 3;
  return { mult, word: mult < D.masteryMin + third ? "негоден" : mult > D.masteryMax - third ? "прирождённый" : "годен" };
}
function expOf(p: Person): { mult: number; word: string } {
  const D = B.economy.doer;
  if (isStale(p)) return { mult: D.expStale, word: "засиделся" };
  return p.exp >= B.exp.master ? { mult: D.expMaster, word: "мастер" } : p.exp >= B.exp.settled ? { mult: D.expSettled, word: "освоился" } : { mult: D.expNovice, word: "новичок" };
}
export const courseDef = (w: World): CourseDef | undefined => COURSES.find((c) => c.id === w.eco.course);
// Сила курса: доля, на которую он сдвигает потоки; со второго сезона подряд — сильнее.
export function courseStrength(w: World, id: CourseId): number {
  if (w.eco.course !== id) return 0;
  return B.economy.course.effect * (w.eco.courseSeasons >= 1 ? B.economy.course.inertia : 1);
}
// Как держатель должности исполняет своё: доводы «за» — доверяет Сенешалю, должность желанная, курс по душе; «против» — недоволен, курс не по душе.
export function doer(w: World, post: PostId): Doer {
  const D = B.economy.doer, p = holder(w, post);
  if (!p) return { mult: D.empty, how: "должность пуста", note: "должность пуста", mastery: 1, exp: 1, mood: D.empty, hand: "" };
  const m = mastery(p, post), x = expOf(p), mine = handsOf(p, post).map((q) => AXIS_NAMES[q.hand.axis]);
  // почерк в ведомость не идёт: он выдал бы склонности, которых Сенешаль ещё не знает
  const hand = mine.length ? `почерк${isStale(p) ? " вдвое сильнее" : ""} — ${mine.join(", с оттенком: ")}` : "";
  const stale = isStale(p);
  const made = (how: How, mood: number): Doer => ({ p, mult: r2(m.mult * x.mult * mood), how, note: `${m.word}, ${x.word}, ${how}`, mastery: m.mult, exp: x.mult, mood, stale, hand });
  let score = 0;
  if (p.loyalty >= B.loyalty.trusts) score++;
  if (p.loyalty <= B.loyalty.unhappy) score--;
  if (p.aspiration?.post === post) score++;
  const c = courseDef(w), top = topAxis(p.star);
  if (c?.pro.includes(top) && !stale) score++;   // засидевшегося курс не зажигает: он ведёт дело по-своему
  if (c?.contra.includes(top)) score -= w.eco.shaky ? 2 : 1;
  // главный: признан всеми и вражды нет — довод «за» каждому в совете; главного нет, его не признают или в совете вражда — довод «против»
  score += councilSteady(w).ok ? D.headFor : -D.headAgainst;
  if (score >= D.fireFrom) return made("с огоньком", D.fire);
  if (score <= D.dullFrom) return made("без огонька", D.dull);
  return made("как велено", D.plain);
}
// ---------- Почерк: склонности исполнителя меняют его сферу ----------

// Почерк человека на должности: ведущая склонность, если она сильная, — в полную силу; вторая, если тоже сильная, — оттенком.
export function handsOf(p: Person, post: PostId): { hand: Hand; weight: number }[] {
  const strong = AXES.filter((a) => p.star[a] >= B.know.strong).sort((a, b) => p.star[b] - p.star[a]).slice(0, 2);
  const stale = isStale(p) ? B.economy.hand.stale : 1;   // засидевшийся ведёт сферу по-своему: и плюс, и минус почерка вдвое сильнее
  return strong.map((axis, i) => ({ hand: HANDS.find((x) => x.post === post && x.axis === axis)!, weight: (i ? B.economy.hand.second : 1) * stale }));
}
// Все рычаги хозяйства от почерков совета: сумма по должностям. Родная склонность — плюс сильнее минуса, чужая — минус не слабее плюса.
export function levers(w: World): Record<Lever, number> {
  const H = B.economy.hand, out = Object.fromEntries(LEVERS.map((l) => [l, 0])) as Record<Lever, number>;
  for (const d of POSTS) {
    const p = holder(w, d.id);
    if (!p) continue;
    for (const { hand, weight } of handsOf(p, d.id)) {
      const native = d.native.includes(hand.axis);
      for (const [lever, v] of hand.plus) out[lever] += v * weight * (native ? H.nativePlus : 1);
      for (const [lever, v] of hand.minus) out[lever] += v * weight * (native ? H.nativeMinus : H.foreignMinus);
    }
  }
  return out;
}
// Почерк словами — для карточки человека: что его склонность даёт сфере и чем за это платят.
export function handText(p: Person): { axis: Axis; text: string; shade: boolean }[] {
  if (!p.post) return [];
  return handsOf(p, p.post).map(({ hand }, i) => ({ axis: hand.axis, shade: i > 0, text: `${hand.good}; ${hand.bad}` }));
}

const whoOf = (d: Doer, post: PostId) => (d.p ? `${postName(post).toLowerCase()} ${d.p.name}` : `${postName(post).toLowerCase()}: должность пуста`);

// Прибавка к весу варианта события: по склонностям курса совет решает мелкие дела чаще.
export function courseLean(w: World, axes: Axis[]): number {
  const c = courseDef(w);
  if (!c || !c.pro.length) return 0;
  const share = axes.filter((a) => c.pro.includes(a)).length / axes.length;
  return share * B.economy.course.lean * (w.eco.courseSeasons >= 1 ? B.economy.course.inertia : 1);
}

export function setCourse(w: World, id: CourseId | null): void {
  const e = w.eco;
  if (e.course === id) return;
  e.shaky = e.course !== null && e.courseSeasons < B.economy.course.shaky;
  e.course = id; e.courseSeasons = 0;
  const c = courseDef(w);
  const lines = [c ? `Курс на сезон: «${c.name}» — ${c.desc}.` : "Курса нет: хозяйство идёт как заведено."];
  if (e.shaky) lines.push("Курс сменили слишком быстро — шатание: несогласные исполняют без огонька.");
  w.log.push({ season: w.season, kind: "staff", title: "Курс", lines });
}
export function setFloor(w: World, cat: "eda" | "serebro", v: number): void {
  w.eco.floor[cat] = r2(Math.max(0, Number(v) || 0));
}

// ---------- Люди: ёмкость на сезон ----------

export function handsNow(w: World): Record<HandsFrom, number> {
  const out = {} as Record<HandsFrom, number>;
  for (const f of HANDS_FROM) {
    const away = w.eco.recruits.filter((r) => r.from === f && w.season < r.until).reduce((s, r) => s + r.hands, 0);
    out[f] = r1(Math.max(0, B.economy.hands[f] * zoneMult(w, f) - away));
  }
  return out;
}
// Куда идут руки в этот сезон: поле берёт своё первым (зимой стоит), курс «Строимся» снимает руки с поля.
export function fieldHands(w: World): { total: number; field: number; free: number; build: number } {
  // почерк: расчистка новых полей и раненые в стычках отнимают руки
  const lost = Math.min(0, levers(w).hands) * B.economy.hand.hands;
  const h = handsNow(w), total = r1(Math.max(0, HANDS_FROM.reduce((s, f) => s + h[f], 0) + lost));
  if (seasonKind(w.season) === WINTER) return { total, field: 0, free: total, build: 0 };
  const build = w.eco.course === "stroimsya" ? Math.min(total, B.economy.course.buildHands) : 0;
  const field = r1(Math.min(B.economy.hands.field, total - build));
  return { total, field, free: r1(total - field), build };
}

// ---------- План сезона: потоки без случайности ----------

interface Short { side: Side; cat: Stock; v: number; what: string }
interface Plan { lines: LedgerLine[]; short: Short[]; stock: Record<Stock, number>; sown: number; harvest: number }

// Все обычные потоки сезона по состоянию на сейчас. Запасы не трогает: считает на копии.
// По этому же плану строится прогноз, поэтому случайного здесь нет (воровство и события совета идут мимо плана).
export function planSeason(w: World): Plan {
  const E = B.economy, F = E.flow, e = w.eco, kind = seasonKind(w.season);
  const stock = { ...e.stock }, lines: LedgerLine[] = [], short: Short[] = [];
  const add = (cat: Stock, v: number, text: string, extra: Partial<LedgerLine> = {}) => {
    const val = r2(v);
    stock[cat] = r2(stock[cat] + val);
    lines.push({ cat, v: val, text, ...extra });
  };
  // обязательный расход: не хватило — недодали, и сторона обижена
  const spend = (cat: Stock, v: number, text: string, side: Side, extra: Partial<LedgerLine> = {}) => {
    const need = r2(v), got = Math.min(need, stock[cat]);
    if (need <= 0) return;
    if (got > 0) add(cat, -got, text, { side, ...extra });
    if (need - got > 0) short.push({ side, cat, v: r2(need - got), what: text });
  };
  const tiun = doer(w, "starosta"), pisar = doer(w, "pisar"), les = doer(w, "lesnichiy"), klyuch = doer(w, "klyuchnik");
  const hands = fieldHands(w), fieldShare = clamp(hands.field / E.hands.field, 0, 1);
  // почерки совета: множитель потока по рычагу (не ниже нуля)
  const L = levers(w), by = (lever: Lever) => Math.max(0, 1 + L[lever] * E.hand.flow);
  const sown = kind === SPRING ? fieldShare : e.sown;

  // товары, что лежали на складе, уходят купцам
  const seasonPrice = [E.year.priceSpring, E.year.priceSummer, E.year.priceAutumn, E.year.priceWinter][kind];
  const price = F.scale * F.price * seasonPrice * zoneMult(w, "kuptsy") * pisar.mult * (1 + courseStrength(w, "torguem")) * by("price");
  if (stock.tovary > 0) {
    const sold = stock.tovary, how = pisar.note;
    if (price > 0) {
      add("tovary", -sold, "продано купцам", { side: "kuptsy", who: whoOf(pisar, "pisar"), how });
      add("serebro", sold * price, `за товары, ${r2(price)} за воз`, { side: "kuptsy", who: whoOf(pisar, "pisar"), how });
    } else lines.push({ cat: "tovary", v: 0, text: "купцы отказывают: товары лежат на складе", side: "kuptsy" });
  }
  // пошлины
  const seasonDuty = [E.year.dutySpring, E.year.dutySummer, E.year.dutyAutumn, E.year.dutyWinter][kind];
  const levy = w.season < e.dutyCutUntil ? E.pay.levyDuty : 1;
  const duties = F.scale * F.duties * seasonDuty * zoneMult(w, "kuptsy") * pisar.mult * (1 + courseStrength(w, "dorogi")) * levy * by("duties");
  const dutyText = `пошлины${levy < 1 ? " (ниже после особого сбора)" : ""}`;
  if (duties > 0) add("serebro", duties, dutyText, { side: "kuptsy", who: whoOf(pisar, "pisar"), how: pisar.note });
  else lines.push({ cat: "serebro", v: 0, text: "пошлин нет: купцы отказывают", side: "kuptsy" });
  // лес
  const zl = zoneMult(w, "les");
  if (e.course === "les") lines.push({ cat: "tovary", v: 0, text: "брёвен нет: бережём лес", side: "les" });
  else if (zl > 0) add("tovary", F.scale * F.forestGoods * zl * les.mult * by("forestGoods"), "шкуры, мёд, брёвна из леса", { side: "les", who: whoOf(les, "lesnichiy"), how: les.note });
  if (kind === SUMMER && zl > 0) {
    const rites = zoneOf(w, "opushka") === "отказывают" ? E.zone.noRites : 1;
    const gifts = F.scale * F.forestFood * zl * les.mult * (1 + courseStrength(w, "les")) * rites * by("forestFood");
    add("eda", gifts, `дары леса${rites < 1 ? " (обрядов нет: деревня у опушки отказывает)" : ""}`, { side: "les", who: whoOf(les, "lesnichiy"), how: les.note });
  }
  // осень: урожай и оброк
  let harvest = 0;
  if (kind === AUTUMN) {
    const quit = 1 + courseStrength(w, "kopim") - courseStrength(w, "polegche"), how = tiun.note;
    for (const v of VILLAGES) {
      const z = zoneMult(w, v), who = whoOf(tiun, "starosta"), share = v === "brod" ? F.brodShare : 1 - F.brodShare;
      if (z <= 0) { lines.push({ cat: "eda", v: 0, text: "ни урожая, ни оброка: деревня отказывает", side: v }); continue; }
      const crop = F.scale * (F.harvest / VILLAGES.length) * z * tiun.mult * sown * fieldShare * by("harvest");
      harvest += crop;
      const field = sown < 1 || fieldShare < 1 ? ` (посеяно ${Math.round(sown * 100)}%, сжато ${Math.round(fieldShare * 100)}%)` : "";
      add("eda", crop, `урожай${field}`, { side: v, who, how: tiun.note });
      add("serebro", F.scale * F.quitrentSilver * share * z * tiun.mult * quit * by("quitrent") * by("quitrentSilver"), "оброк серебром", { side: v, who, how });
      add("tovary", F.scale * F.quitrentGoods * share * z * tiun.mult * quit * by("quitrent"), "оброк товарами", { side: v, who, how });
    }
  }
  // расходы: долги, жалованье, прокорм
  const debt = e.debts.filter((d) => d.due <= w.season).reduce((s, d) => s + d.sum, 0);
  if (debt > 0) spend("serebro", debt, "возврат займа с лихвой", "kuptsy");
  // почерк: «дорожный сбор» десятника и проценты по долгам писаря
  const purse = L.silver * E.hand.silver;
  if (purse > 0) add("serebro", purse, "дорожный сбор", { side: "kuptsy" });
  if (purse < 0) add("serebro", -Math.min(stock.serebro, -purse), "проценты по старым долгам");
  spend("serebro", F.salary * (1 + courseStrength(w, "dorogi")) * by("salary"), "жалованье страже и челяди", "zamok");
  const upkeep = (kind === WINTER ? F.upkeepWinter : F.upkeep) * by("upkeep");
  const feed: [Side, number, string][] = [["zamok", upkeep * F.castleShare, "прокорм замка"]];
  for (const v of VILLAGES) feed.push([v, (upkeep * (1 - F.castleShare)) / VILLAGES.length, "прокорм работников на барщине"]);
  if (e.feedFirst === "derevni") feed.push(feed.shift()!);
  for (const [side, v, text] of feed) spend("eda", v, text, side);
  if (zoneOf(w, "les") === "отказывают") spend("eda", E.zone.lesHarm, "потравы и твари из леса", "les");
  if (kind === WINTER && stock.eda > 0) {
    const spoil = stock.eda * F.spoil * (1 - courseStrength(w, "stroimsya")) * by("spoil") / klyuch.mult;
    add("eda", -Math.min(stock.eda, spoil), "испорчено за зиму", { who: whoOf(klyuch, "klyuchnik"), how: klyuch.note });
  }
  // курс «Торгуем»: излишек еды сверх нижней черты тоже уходит купцам
  const spare = stock.eda - e.floor.eda - F.upkeepWinter;
  if (e.course === "torguem" && spare > 0 && zoneMult(w, "kuptsy") > 0) {
    add("eda", -spare, "излишек продан купцам", { side: "kuptsy", who: whoOf(pisar, "pisar"), how: pisar.note });
    add("serebro", spare * F.foodPrice * zoneMult(w, "kuptsy") * pisar.mult, "за излишек еды", { side: "kuptsy", who: whoOf(pisar, "pisar"), how: pisar.note });
  }
  // почерк ключника по Выгоде: часть излишка еды сверх черты и зимнего прокорма продаёт сам
  const extra = (stock.eda - e.floor.eda - F.upkeepWinter) * clamp(L.sellFood * E.hand.sell, 0, 1);
  if (extra > 0 && zoneMult(w, "kuptsy") > 0) {
    add("eda", -extra, "излишек продан ключником", { side: "kuptsy", who: whoOf(klyuch, "klyuchnik"), how: klyuch.note });
    add("serebro", extra * F.foodPrice * zoneMult(w, "kuptsy"), "за излишек еды", { side: "kuptsy", who: whoOf(klyuch, "klyuchnik"), how: klyuch.note });
  }
  return { lines, short, stock, sown, harvest: r2(harvest) };
}

// ---------- Строки вне плана: события совета, воровство, плата подати ----------

// Запас меняется, строка идёт в ведомость текущего сезона. Ниже нуля запас не опускается: возвращается то, что вышло на деле.
export function addLine(w: World, line: LedgerLine): number {
  if (line.cat === "lyudi") { w.eco.cur.push(line); return line.v; }
  const was = w.eco.stock[line.cat];
  w.eco.stock[line.cat] = r2(Math.max(0, was + line.v));
  const v = r2(w.eco.stock[line.cat] - was);
  w.eco.cur.push({ ...line, v });
  return v;
}
// Расход события уводит запас под нижнюю черту? Совет такого сам не делает (засидевшийся — делает, по-своему).
export function belowFloor(w: World, cat: "eda" | "serebro", v: number): boolean {
  return v < 0 && r2(w.eco.stock[cat] + v) < w.eco.floor[cat];
}

// ---------- Вложения совета ----------

// Вариант события занял руки людей замка на этот сезон.
export function takeHands(w: World, hands: number): void {
  w.eco.recruits.push({ from: "zamok", hands, until: w.season + 1 });
  w.eco.cur.push({ cat: "lyudi", v: -hands, text: "руки заняты делом совета", side: "zamok" });
}
// Вложение: отдача (с тем же множителем умения и исхода, что у самого дела) придёт через later.seasons сезонов.
export function invest(w: World, ev: GameEvent, later: Later, k: number, lines: string[]): void {
  const effects = Object.fromEntries(Object.entries(later.effects).map(([key, v]) => [key, r1(v * k)])) as Pending["effects"];
  w.eco.pending.push({ due: w.season + later.seasons, effects, text: `${later.text} (дело «${ev.title}»)`, village: ev.village });
  lines.push(`Вложение: отдача через ${later.seasons} сез. — ${later.text}.`);
}
// Отдача вложений, срок которых подошёл: запасы — строкой в ведомость, доверие и порядок — сразу.
function settle(w: World, lines: string[]): void {
  const due = w.eco.pending.filter((x) => x.due <= w.season);
  w.eco.pending = w.eco.pending.filter((x) => x.due > w.season);
  for (const x of due) {
    for (const [key, v] of Object.entries(x.effects) as [Effect, number][]) {
      if (key === "poryadok") w.resources.poryadok = r1(w.resources.poryadok + v);
      else if (key === "kazna" || key === "pripasy") addLine(w, { cat: key === "kazna" ? "serebro" : "eda", v, text: `отдача вложения: ${x.text}` });
      else if (key === "derevni") for (const v2 of x.village ? [x.village] : VILLAGES) addTrust(w, v2, v * B.economy.trust.event);
      else addTrust(w, key, v * B.economy.trust.event);
    }
    lines.push(`🌱 Вложение дало отдачу: ${x.text}.`);
  }
}

// ---------- Подать ----------

export function lessonOf(year: number): number {
  return year <= B.economy.tax.trialYears ? B.economy.tax.trial : B.economy.tax.normal;
}
function newTaxYear(w: World): string {
  const t = w.eco.tax;
  t.year++;
  t.lesson = lessonOf(t.year);
  t.due = r1(t.lesson + t.carried);
  t.paid = 0; t.early = false; t.by = {};
  const trial = t.year <= B.economy.tax.trialYears ? " (испытание)" : "";
  return `Герцог объявил урок на год${trial}: ${t.lesson} мер${t.carried ? ` и недоимка ${t.carried}` : ""} — к осени ${t.due}.`;
}
export const taxLeft = (w: World): number => r1(Math.max(0, w.eco.tax.due - w.eco.tax.paid));

// Почерк писаря по Дерзости: заём больше и лихва меньше во столько раз.
const loanEase = (w: World): number => Math.max(1, 1 + levers(w).loan * B.economy.hand.flow * 2);

export interface PayOption { def: PayDef; rate: number; max: number; blocked?: string }
// Чем и с кого можно закрыть остаток урока прямо сейчас: курс (единиц за меру) и предел в мерах.
export function payOptions(w: World): PayOption[] {
  const E = B.economy, e = w.eco, left = taxLeft(w), hands = handsNow(w);
  const used = (id: PayId) => e.tax.by[id] ?? 0;
  return PAY.map((def) => {
    let rate = E.rate[def.what === "lyudi" ? "lyudi" : def.what], max = 0, blocked: string | undefined;
    const refuses = def.side && zoneOf(w, def.side) === "отказывают";
    if (def.id === "serebro" || def.id === "eda" || def.id === "tovary") max = e.stock[def.what as Stock] / rate;
    else if (def.id === "sbor_kuptsy") max = E.pay.levyCap - used(def.id);
    else if (def.id === "zaem") {
      max = E.pay.loanCap * loanEase(w) - e.debts.reduce((s, d) => s + d.sum, 0) / (1 + E.pay.loanInterest);
      if (zoneMult(w, "kuptsy") < E.zone.friendly) blocked = "в долг дают только тем, с кем ладят";
    } else if (def.id === "sverh_brod" || def.id === "sverh_opushka") max = E.pay.extraCap - used(def.id);
    else if (def.id === "volnye") { rate = E.rate.volnye; max = E.pay.vagrantCap - used(def.id); }
    else max = hands[def.side as HandsFrom] / rate;
    if (refuses) blocked = `${SIDE_NAMES[def.side!].toLowerCase()}: отказывают`;
    max = blocked ? 0 : floor1(clamp(max, 0, left));
    return { def, rate, max, blocked };
  });
}

// Закрыть часть урока: measures мер способом id. Возвращает, сколько мер ушло на деле.
export function payTax(w: World, id: PayId, measures: number, lines?: string[]): number {
  const E = B.economy, e = w.eco, t = e.tax;
  const opt = payOptions(w).find((o) => o.def.id === id)!;
  const m = floor1(Math.min(Number(measures) || 0, opt.max));
  if (m <= 0) return 0;
  const units = r2(m * opt.rate), def = opt.def, out: string[] = [];
  const toTax = `в подать, ${m} мер`;
  if (id === "serebro" || id === "eda" || id === "tovary") addLine(w, { cat: def.what, v: -units, text: toTax, side: "dvor" });
  else if (id === "sbor_kuptsy") {
    addTrust(w, "kuptsy", -E.pay.levyTrust * m);
    e.dutyCutUntil = w.season + SEASON_NAMES.length;
    addLine(w, { cat: "serebro", v: 0, text: `особый сбор с купцов — ${toTax}`, side: "kuptsy" });
  } else if (id === "zaem") {
    const back = r2(units * (1 + E.pay.loanInterest / loanEase(w)));
    e.debts.push({ due: w.season + E.pay.loanTerm, sum: back });
    addLine(w, { cat: "serebro", v: 0, text: `заём у купцов — ${toTax}; вернуть ${back}`, side: "kuptsy" });
  } else if (id === "sverh_brod" || id === "sverh_opushka") {
    addTrust(w, def.side!, -E.pay.extraTrust * m);
    addLine(w, { cat: "eda", v: 0, text: `зерно сверх оброка — ${toTax}`, side: def.side });
  } else if (id === "volnye") {
    w.resources.poryadok = r1(w.resources.poryadok + E.pay.vagrantOrder * m);
    t.patience = r2(clamp(t.patience - E.pay.vagrantPatience * m, 0, STAR_MAX));
    addLine(w, { cat: "lyudi", v: 0, text: `вольные и бродяги из корчмы — ${toTax}` });
  } else {
    const from = def.side as HandsFrom;
    e.recruits.push({ from, hands: units, until: w.season + E.pay.recruitSeasons });
    if (from === "zamok") {
      addTrust(w, "zamok", -E.pay.castleTrust * units);
      w.resources.poryadok = r1(w.resources.poryadok - E.pay.castleOrder * units);
    } else addTrust(w, from, -E.pay.recruitTrust * units);
    addLine(w, { cat: "lyudi", v: -units, text: `рекруты на год — ${toTax}`, side: from });
  }
  t.paid = r1(t.paid + m);
  t.by[id] = r1((t.by[id] ?? 0) + m);
  out.push(`${def.name}: ${m} мер (${units} ${CATEGORY_NAMES[def.what].toLowerCase()}). Больно ${def.hurts}.`);
  if (taxLeft(w) <= 0) {
    t.early = seasonKind(w.season) < AUTUMN;
    out.push(t.early ? "Урок закрыт досрочно." : "Урок закрыт.");
  } else out.push(`Осталось ${taxLeft(w)} мер из ${t.due}.`);
  if (lines) lines.push(...out);
  else w.log.push({ season: w.season, kind: "staff", title: "Подать", lines: out });
  return m;
}

// Плательщик по умолчанию: остаток урока закрывает серебром из казны, потом зерном из амбара — не ниже нижних черт.
export function autoPayTax(w: World, lines: string[]): number {
  const e = w.eco, E = B.economy;
  let paid = 0;
  paid += payTax(w, "serebro", (e.stock.serebro - e.floor.serebro) / E.rate.serebro, lines);
  paid += payTax(w, "eda", (e.stock.eda - e.floor.eda) / E.rate.eda, lines);
  return r1(paid);
}

// Осень: сборщица считает урок. Закрыт — терпение растёт; нет — недоимка с надбавкой уходит на следующий год.
function collect(w: World, lines: string[]): void {
  const T = B.economy.tax, t = w.eco.tax, left = taxLeft(w);
  if (left > 0 && w.eco.autoPay) {
    const sub: string[] = [];
    const auto = autoPayTax(w, sub);
    PROBE.autoPaid += auto;
    if (auto) lines.push(`Совет сам закрывает урок, не трогая нижних черт. ${sub.filter((x) => !x.startsWith("Осталось") && !x.startsWith("Урок")).join(" ")}`);
  }
  const rest = taxLeft(w), closed = rest <= 0;
  if (closed) {
    t.carried = 0;
    t.patience = r2(clamp(t.patience + (t.early ? T.early : T.onTime), 0, STAR_MAX));
    lines.push(`📜 Сборщица податей приняла урок${t.early ? " — внесён досрочно" : ""}: ${t.paid} мер из ${t.due}. Герцог ${patienceWord(t.patience)}.`);
    addAuthority(w, t.early ? B.authority.taxEarly : B.authority.taxOnTime, t.early ? "подать закрыта досрочно" : "подать закрыта в срок", "tax");
  } else {
    t.carried = r1(rest * (1 + T.arrears));
    addAuthority(w, -B.authority.taxArrears, "недоимка: слово Герцогу не сдержано", "tax");
    const loss = T.arrearsPatience * Math.max(0, 1 + T.dvor * (1 - zoneMult(w, "dvor")));
    t.patience = r2(clamp(t.patience - loss, 0, STAR_MAX));
    lines.push(`📜 Сборщица податей уехала с недобором: внесено ${t.paid} мер из ${t.due}. Недоимка ${rest} с надбавкой — ${t.carried} — ляжет на следующий год.`);
    lines.push(`${patienceWord(t.patience) === "на исходе" ? "⚠ Терпение Герцога на исходе." : `Герцог ${patienceWord(t.patience)}.`}`);
  }
  t.history.push({ year: t.year, due: t.due, paid: t.paid, closed, early: closed && t.early, by: { ...t.by } });
}

// ---------- Сезон ----------

// Староста деревни видел решение тиуна: по его ведущей склонности — отношения лучше, против неё — хуже.
export function elderSaw(w: World, tiun: Person, axes: Axis[]): void {
  for (const el of w.eco.elders) {
    const top = topAxis(el.star);
    const against = OPPOSED.some(([x, y]) => (x === top && axes.includes(y)) || (y === top && axes.includes(x)));
    const d = axes.includes(top) ? B.economy.trust.elderStep : against ? -B.economy.trust.elderStep : 0;
    el.rel[tiun.id] = r1(clamp(el.rel[tiun.id] + d, -REL_MAX, REL_MAX));
  }
}

// Конец сезона: потоки, недодача, осенью сборщица, зимой новый урок. Заметное пишет в lines — итог сезона в летописи.
export function economySeason(w: World, lines: string[]): void {
  const E = B.economy, e = w.eco, kind = seasonKind(w.season);
  const before = e.last ? { ...e.last.after } : { eda: E.start.eda, tovary: E.start.tovary, serebro: E.start.serebro };
  settle(w, lines);
  const hands = fieldHands(w), plan = planSeason(w);
  e.stock = plan.stock;
  e.sown = plan.sown;
  e.cur.push({ cat: "lyudi", v: 0, text: `всего ${hands.total}: в поле ${hands.field} из ${E.hands.field}${hands.build ? `, на стройке ${hands.build}` : ""}, свободно ${r1(hands.free - hands.build)}` });
  e.cur.push(...plan.lines);
  if (kind === SPRING && plan.sown < 1) lines.push(`Посевная: рук в поле хватило на ${Math.round(plan.sown * 100)}% поля — урожай осенью будет меньше.`);
  if (kind === AUTUMN) lines.push(`Жатва: в амбар легло ${plan.harvest} еды.`);
  // недодача: сторона обижена
  if (plan.short.length) e.shortages++;
  if (plan.short.length) PROBE.short.seasons++;
  const L = levers(w), H = E.hand;
  for (const s of plan.short) {
    PROBE.short[s.cat === "eda" ? "food" : "silver"] += s.v;
    // почерк тиуна по Заботе: недодача деревням мягче
    const soft = s.side === "brod" || s.side === "opushka" ? Math.max(0, 1 + L.shortSoft * H.flow * 2) : 1;
    PROBE.short.trust += -addTrust(w, s.side, -E.trust.short * s.v * soft);
    let note = `⚠ Недодача: ${s.what} — не хватило ${s.v} (${CATEGORY_NAMES[s.cat].toLowerCase()}). ${SIDE_NAMES[s.side]}: доверие падает.`;
    if (s.cat === "serebro" && s.side === "zamok") {
      w.resources.poryadok = r1(w.resources.poryadok - E.trust.shortOrder * s.v);
      PROBE.short.order += E.trust.shortOrder * s.v;
      note += " Стража расходится — порядка меньше.";
    }
    if (s.side === "kuptsy") { addTrust(w, "kuptsy", -E.pay.loanDefault * s.v); note += " Долг не вернули — купцы этого не простят."; }
    lines.push(note);
    e.cur.push({ cat: s.cat, v: 0, text: `недодано ${s.v}: ${s.what}`, side: s.side });
  }
  e.debts = e.debts.filter((d) => d.due > w.season);
  e.recruits = e.recruits.filter((r) => r.until > w.season + 1);
  if (kind === AUTUMN) collect(w, lines);
  // курс и старосты двигают доверие сторон
  const ct = E.course.trust;
  if (e.course === "kopim") for (const v of VILLAGES) addTrust(w, v, -ct);
  if (e.course === "polegche") for (const v of VILLAGES) addTrust(w, v, ct);
  if (e.course === "les") addTrust(w, "les", ct);
  if (e.course === "torguem") addTrust(w, "kuptsy", ct);
  if (e.course === "stroimsya") { addTrust(w, "zamok", ct); for (const v of VILLAGES) addTrust(w, v, -ct); }
  if (e.course === "dorogi") w.resources.poryadok = r1(w.resources.poryadok + E.course.order);
  // почерки совета двигают доверие сторон, порядок и терпение Герцога
  for (const v of VILLAGES) addTrust(w, v, (L.villages + (v === "opushka" ? L.opushka : 0)) * H.trust);
  for (const side of ["zamok", "kuptsy", "les", "dvor"] as const) addTrust(w, side, L[side] * H.trust);
  w.resources.poryadok = r1(w.resources.poryadok + L.order * H.order);
  e.tax.patience = r2(clamp(e.tax.patience + L.patience * H.patience, 0, STAR_MAX));
  const tiun = holder(w, "starosta");
  if (tiun) for (const el of e.elders) addTrust(w, el.side, el.rel[tiun.id] * E.trust.elder);
  for (const s of SIDES) {
    w.factions[s] = r1(w.factions[s] * E.trust.fade);
    const now = zoneOf(w, s);
    if (e.zoneWas[s] !== now) lines.push(`${SIDE_NAMES[s]}: теперь «${now}» (было «${e.zoneWas[s]}»).`);
    e.zoneWas[s] = now;
  }
  e.last = { season: w.season, before, after: { ...e.stock }, lines: e.cur };
  e.cur = [];
  if (e.course) e.courseSeasons++;
  if (e.courseSeasons >= E.course.shaky) e.shaky = false;
  if (kind === WINTER) lines.push(`📜 ${newTaxYear(w)}`);
}
// Раз в сезон счетовод ошибается в свою сторону: вызывается, когда сезон уже сменился.
export function rollForecast(w: World): void {
  for (const c of STOCKS) w.eco.fc[c] = r2(w.rng.range(-1, 1));
}

// ---------- Что видит игрок ----------

export interface Fork { cat: Stock; lo: number; hi: number; word: "с запасом" | "впритык" | "не хватит" | "пусто"; counter?: Person }
const COUNTER: Record<Stock, PostId> = { eda: "klyuchnik", tovary: "pisar", serebro: "pisar" };
// Прогноз на конец сезона — вилкой: чем хуже счетовод (ключник — еда, писарь — серебро и товары), тем шире и тем дальше середина от правды.
export function forecastFork(w: World): Fork[] {
  const K = B.economy.fork, plan = planSeason(w);
  return STOCKS.map((cat) => {
    const counter = holder(w, COUNTER[cat]);
    const bad = counter ? clamp(1 - fitness(counter, COUNTER[cat]) / STAR_MAX, 0, 1) : K.empty;
    const half = K.min + K.wide * bad, mid = plan.stock[cat] + w.eco.fc[cat] * K.skew * half;
    const lo = r1(Math.max(0, mid - half)), hi = r1(Math.max(0, mid + half));
    const floor = cat === "tovary" ? 0 : w.eco.floor[cat];
    const word = hi <= 0 ? "пусто" : hi < floor ? "не хватит" : lo > floor ? "с запасом" : "впритык";
    return { cat, lo, hi, word, counter };
  });
}
// Строки ведомости по категории. Спрятанные строки игрок не видит: о них говорит только «счёт не сходится».
export function ledgerOf(l: Ledger, cat: Category, all = false): { lines: LedgerLine[]; mismatch: boolean } {
  const mine = l.lines.filter((x) => x.cat === cat);
  return { lines: mine.filter((x) => all || !x.hidden), mismatch: mine.some((x) => x.hidden) };
}
// Отношения старосты деревни с нынешним тиуном; тиуна нет — undefined.
export function elderRel(w: World, el: Elder): number | undefined {
  const tiun = holder(w, "starosta");
  return tiun ? el.rel[tiun.id] : undefined;
}
