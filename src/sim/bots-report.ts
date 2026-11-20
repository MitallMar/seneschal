// Отчёт по ботам (задание — docs/design/boty.md, раздел 7): метрики одной партии, таблица по боту, сравнение пар по семенам попарно.
// Зовут tools/bots.ts, tools/economy.ts и тесты.
import { POSTS } from "../data/core";
import { SIDES, PAY } from "../data/economy";
import { BALANCE as B } from "./balance";
import { getRel, topAxis, type Outcome } from "./state";
import { zoneOf, patienceWord } from "./economy/zones";
import { authorityCap } from "./authority";
import { BOTS, bot, playBot, type Bot, type BotRun } from "./bots";
import { PRESETS } from "./presets";
import { mean } from "./util";
import { WORLD_STATES } from "../data/world";
import { stepOf } from "./order";

// Метрика партии: id, подпись для таблицы, сколько знаков после запятой, доля ли это (печатать процентами).
// diag — замер, а не исход партии: в вердикт пары не идёт.
export interface MetricDef { id: string; name: string; digits: number; pct?: boolean; group: "совет" | "хозяйство" | "авторитет" | "замеры" | "мир"; diag?: boolean }
export const METRICS: MetricDef[] = [
  { id: "lead", name: "решений по ведущей склонности", digits: 0, pct: true, group: "совет" },
  { id: "leadOwn", name: "…на своей должности", digits: 0, pct: true, group: "совет" },
  { id: "leadForeign", name: "…на чужой должности", digits: 0, pct: true, group: "совет" },
  { id: "disputes", name: "споров за партию", digits: 1, group: "совет" },
  { id: "peace", name: "…сошлись или договорились", digits: 1, group: "совет" },
  { id: "judged", name: "…рассудил главный", digits: 1, group: "совет" },
  { id: "forced", name: "…компромисс или продавил", digits: 1, group: "совет" },
  { id: "hostile", name: "…соперник настоял, саботаж, смолчал", digits: 1, group: "совет" },
  { id: "sabotage", name: "саботажей", digits: 2, group: "совет" },
  { id: "complaints", name: "жалоб за партию", digits: 2, group: "совет" },
  { id: "loyalty", name: "отношение совета к Сенешалю к концу", digits: 1, group: "совет" },
  { id: "enemies", name: "пар «враги» в совете к концу", digits: 2, group: "совет" },
  { id: "calm", name: "сезонов, когда совет спокоен", digits: 1, group: "совет" },
  { id: "vacant", name: "пустых должностей к концу", digits: 2, group: "совет" },
  { id: "closed", name: "уроков закрыто в срок (из лет партии)", digits: 2, group: "хозяйство" },
  { id: "closedAll", name: "все уроки закрыты", digits: 0, pct: true, group: "хозяйство" },
  { id: "paid", name: "мер внесено", digits: 1, group: "хозяйство" },
  { id: "carried", name: "недоимка на конец, мер", digits: 1, group: "хозяйство" },
  { id: "shortages", name: "сезонов с недодачей", digits: 2, group: "хозяйство" },
  { id: "patience", name: "терпение Герцога к концу", digits: 1, group: "хозяйство" },
  { id: "edge", name: "терпение на исходе", digits: 0, pct: true, group: "хозяйство" },
  { id: "trust", name: "среднее доверие сторон к концу", digits: 1, group: "хозяйство" },
  { id: "refuse", name: "сторон в «отказывают» к концу", digits: 2, group: "хозяйство" },
  { id: "eda", name: "еда к концу", digits: 1, group: "хозяйство" },
  { id: "serebro", name: "серебро к концу", digits: 1, group: "хозяйство" },
  { id: "order", name: "порядок к концу: сумма толчков от событий", digits: 1, group: "хозяйство" },
  { id: "orderLevel", name: "шкала порядка к концу (0–15)", digits: 1, group: "хозяйство" },
  { id: "fell", name: "партий с падением", digits: 0, pct: true, group: "хозяйство" },
  { id: "underSeasons", name: "сезонов под чужой рукой", digits: 2, group: "хозяйство" },
  { id: "crises", name: "кризисов сторон за партию", digits: 2, group: "хозяйство" },
  { id: "authority", name: "авторитет к концу", digits: 1, group: "авторитет" },
  { id: "atCap", name: "авторитет у потолка", digits: 0, pct: true, group: "авторитет" },
  { id: "weak", name: "авторитет ниже порога слабого слова", digits: 0, pct: true, group: "авторитет" },
  { id: "support", name: "опора за партию", digits: 1, group: "авторитет" },
  { id: "spent", name: "потрачено на перестановки и наказы", digits: 1, group: "авторитет" },
  { id: "earned", name: "добыто делами (суд, пир, приказ, подать)", digits: 1, group: "авторитет" },
  { id: "burned", name: "сгорело сверх потолка", digits: 1, group: "авторитет" },
  { id: "right", name: "авторитет от приказов против совета", digits: 2, group: "авторитет" },
  { id: "orderFit", name: "наказ был применим (у события есть вариант по его оси)", digits: 1, group: "замеры", diag: true },
  { id: "orderWorked", name: "…наказ поменял выбор", digits: 2, group: "замеры", diag: true },
  { id: "orderAlready", name: "…и без наказа выбрал бы так", digits: 1, group: "замеры", diag: true },
  { id: "orderDeaf", name: "…не услышан: послушания не хватило", digits: 2, group: "замеры", diag: true },
  { id: "orderWeak", name: "…услышан, но прибавки не хватило", digits: 2, group: "замеры", diag: true },
  { id: "autoPaid", name: "мер внесено автоплатой совета после жатвы", digits: 1, group: "замеры", diag: true },
  { id: "aspAt", name: "сезон, к которому известны стремления совета", digits: 1, group: "замеры", diag: true },
  { id: "year1", name: "урок закрыт в срок: год 1", digits: 0, pct: true, group: "замеры", diag: true },
  { id: "year2", name: "урок закрыт в срок: год 2", digits: 0, pct: true, group: "замеры", diag: true },
  { id: "year3", name: "урок закрыт в срок: год 3", digits: 0, pct: true, group: "замеры", diag: true },
  { id: "shortFood", name: "недодано еды за партию", digits: 2, group: "замеры", diag: true },
  { id: "shortSilver", name: "недодано серебра за партию", digits: 2, group: "замеры", diag: true },
  { id: "shortTrust", name: "доверия ушло из-за недодач", digits: 2, group: "замеры", diag: true },
  { id: "talkedOut", name: "людей вне совета, с кем говорил Сенешаль", digits: 2, group: "замеры", diag: true },
  { id: "linksKnown", name: "людей, чьи связи известны к концу", digits: 2, group: "замеры", diag: true },
  { id: "stepSmuta", name: "сезонов в «Смуте»", digits: 2, group: "замеры", diag: true },
  { id: "stepVolnitsa", name: "сезонов в «Вольнице»", digits: 2, group: "замеры", diag: true },
  { id: "stepTiho", name: "сезонов в «Тихо»", digits: 2, group: "замеры", diag: true },
  { id: "stepStrogost", name: "сезонов в «Строгости»", digits: 2, group: "замеры", diag: true },
  { id: "stepRuka", name: "сезонов при «Твёрдой руке»", digits: 2, group: "замеры", diag: true },
  { id: "guardSpent", name: "серебра ушло на затянутую стражу", digits: 2, group: "замеры", diag: true },
  { id: "fallAt", name: "сезон первого падения (0 — не падал)", digits: 1, group: "замеры", diag: true },
  { id: "whyPatience", name: "пал: терпение Герцога исчерпано", digits: 0, pct: true, group: "замеры", diag: true },
  { id: "whyLevy", name: "пал: внеочередной сбор не закрыт", digits: 0, pct: true, group: "замеры", diag: true },
  { id: "whyArrears", name: "пал: недоимка вместе с кризисом", digits: 0, pct: true, group: "замеры", diag: true },
  { id: "whyDouble", name: "пал: два кризиса сразу", digits: 0, pct: true, group: "замеры", diag: true },
  { id: "levies", name: "внеочередных сборов за партию", digits: 2, group: "замеры", diag: true },
  { id: "levyFailed", name: "…не закрыто", digits: 2, group: "замеры", diag: true },
  { id: "backOwn", name: "вернулся своими силами: путь земли", digits: 0, pct: true, group: "замеры", diag: true },
  { id: "backDvor", name: "барон не справился сам: путь двора", digits: 0, pct: true, group: "замеры", diag: true },
  { id: "backArmor", name: "вернулся, дождавшись леса", digits: 0, pct: true, group: "замеры", diag: true },
  { id: "stillUnder", name: "под чужой рукой к концу партии", digits: 0, pct: true, group: "замеры", diag: true },
  { id: "disgraces", name: "опал за партию", digits: 2, group: "замеры", diag: true },
  { id: "states", name: "состояний мира началось за партию", digits: 1, group: "мир", diag: true },
  { id: "bads", name: "…из них бед", digits: 1, group: "мир", diag: true },
  { id: "decrees", name: "указов за партию", digits: 2, group: "мир", diag: true },
  { id: "decreesDone", name: "…исполнено в срок", digits: 2, group: "мир", diag: true },
  { id: "decreesCouncil", name: "…из них хотя бы частью советом самим", digits: 2, group: "мир", diag: true },
  { id: "decreesFailed", name: "…не исполнено", digits: 2, group: "мир", diag: true },
  { id: "decreeLyudi", name: "мер по указам людьми", digits: 2, group: "мир", diag: true },
  { id: "decreeEda", name: "мер по указам едой", digits: 2, group: "мир", diag: true },
  { id: "decreeSerebro", name: "мер по указам серебром", digits: 2, group: "мир", diag: true },
  { id: "decreeTovary", name: "мер по указам товарами", digits: 2, group: "мир", diag: true },
  { id: "badYears", name: "плохих по погоде лет", digits: 2, group: "мир", diag: true },
  { id: "closedBad", name: "уроков закрыто в плохие годы", digits: 2, group: "мир", diag: true },
  { id: "closedGood", name: "уроков закрыто в прочие годы", digits: 2, group: "мир", diag: true },
  { id: "shortBad", name: "сезонов с недодачей в плохие годы", digits: 2, group: "мир", diag: true },
  { id: "shortGood", name: "сезонов с недодачей в прочие годы", digits: 2, group: "мир", diag: true },
];
export type Metrics = Record<string, number>;

const PEACE: Outcome[] = ["agree", "deal"], FORCED: Outcome[] = ["compromise", "push"], HOSTILE: Outcome[] = ["rival", "sabotage", "silent"];
const share = (a: number, b: number) => (b ? a / b : 0);
const sd = (xs: number[]) => { const m = mean(xs); return xs.length > 1 ? Math.sqrt(xs.reduce((s, v) => s + (v - m) ** 2, 0) / (xs.length - 1)) : 0; };

export function metricsOf(run: BotRun): Metrics {
  const { w } = run, council = w.people.filter((p) => p.post), t = w.eco.tax, a = w.auth.totals;
  // «своя» должность — та, для которой ведущая склонность человека на старте родная
  let own = 0, ownAll = 0, foreign = 0, foreignAll = 0;
  for (const p of council) {
    const native = POSTS.find((d) => d.id === p.post)!.native.includes(topAxis(p.startStar));
    if (native) { own += p.matchedTop; ownAll += p.decisions; } else { foreign += p.matchedTop; foreignAll += p.decisions; }
  }
  const out = (list: Outcome[]) => w.log.filter((e) => e.outcome && list.includes(e.outcome)).length;
  let enemies = 0;
  for (const p of council) for (const q of council) if (p.id < q.id && getRel(w, p.id, q.id) <= B.rel.enemy) enemies++;
  const years = t.history.length;
  // мир: указы и чем закрыты; плохие по погоде годы — урожай ниже порога «скудный год»
  // внеочередной сбор лежит среди указов, но считается отдельно: это не давление мира, а цена недоимки
  const g = w.world, every = [...g.past, ...g.decrees], all = every.filter((d) => !d.levy), past = g.past.filter((d) => !d.levy), levies = every.filter((d) => d.levy);
  const f = w.fall, first = f.falls[0], why = (text: string) => (first?.why.startsWith(text) ? 1 : 0);
  const under = f.falls.reduce((s, x) => s + ((x.back ?? w.season - 1) - x.season), 0);
  const byCat = (cat: string) => all.reduce((s, d) => s + PAY.filter((p) => p.what === cat).reduce((x, p) => x + (d.by[p.id] ?? 0), 0), 0);
  const bad = g.harvests.map((h) => h < B.world.weather.poor);
  const inYears = (isBad: boolean, f: (y: number) => number) => bad.reduce((s, b, y) => s + (b === isBad ? f(y) : 0), 0);
  const inStep = (id: string) => w.order.history.filter((l) => stepOf(l).id === id).length;
  const started = w.log.filter((e) => e.title === "Вести").flatMap((e) => e.lines);
  return {
    lead: share(own + foreign, ownAll + foreignAll), leadOwn: share(own, ownAll), leadForeign: share(foreign, foreignAll),
    leadOwnN: ownAll, leadForeignN: foreignAll, leadOwnHit: own, leadForeignHit: foreign,
    disputes: out([...PEACE, "judge", ...FORCED, ...HOSTILE]), peace: out(PEACE), judged: out(["judge"]), forced: out(FORCED), hostile: out(HOSTILE),
    sabotage: out(["sabotage"]), complaints: w.auth.nextId - 1, loyalty: mean(council.map((p) => p.loyalty)), enemies, calm: run.calm,
    vacant: POSTS.length - council.length,
    closed: t.history.filter((y) => y.closed).length, closedAll: years > 0 && t.history.every((y) => y.closed) ? 1 : 0,
    paid: t.history.reduce((s, y) => s + y.paid, 0), carried: t.carried, shortages: w.eco.shortages, patience: t.patience,
    edge: patienceWord(t.patience) === "на исходе" ? 1 : 0, trust: mean(SIDES.map((s) => w.factions[s])),
    refuse: SIDES.filter((s) => zoneOf(w, s) === "отказывают").length, eda: w.eco.stock.eda, serebro: w.eco.stock.serebro, order: w.resources.poryadok,
    authority: w.authority, atCap: w.authority >= authorityCap(w) ? 1 : 0, weak: w.authority < B.authority.weakBelow ? 1 : 0,
    orderFit: run.probe.order.fit, orderWorked: run.probe.order.worked, orderAlready: run.probe.order.already,
    orderDeaf: run.probe.order.deaf, orderWeak: run.probe.order.weak, autoPaid: run.probe.autoPaid, aspAt: run.aspAt,
    year1: t.history[0]?.closed ? 1 : 0, year2: t.history[1]?.closed ? 1 : 0, year3: t.history[2]?.closed ? 1 : 0,
    shortFood: run.probe.short.food, shortSilver: run.probe.short.silver, shortTrust: run.probe.short.trust,
    states: WORLD_STATES.reduce((s, d) => s + started.filter((l) => l.startsWith(`${d.name}.`)).length, 0),
    bads: WORLD_STATES.filter((d) => d.cost > 0).reduce((s, d) => s + started.filter((l) => l.startsWith(`${d.name}.`)).length, 0),
    talkedOut: w.people.filter((p) => !p.post && p.know.talks > 0).length, linksKnown: w.people.filter((p) => p.know.links).length,
    orderLevel: w.order.level, guardSpent: w.order.spent,
    stepSmuta: inStep("smuta"), stepVolnitsa: inStep("volnitsa"), stepTiho: inStep("tiho"), stepStrogost: inStep("strogost"), stepRuka: inStep("ruka"),
    decrees: all.length, decreesDone: past.filter((d) => d.closed !== "не закрыт").length,
    decreesCouncil: past.filter((d) => d.closed === "закрыт советом").length, decreesFailed: past.filter((d) => d.closed === "не закрыт").length,
    fell: first ? 1 : 0, underSeasons: under, crises: f.crises.length, fallAt: first?.season ?? 0,
    whyPatience: why("терпение"), whyLevy: why("внеочередной"), whyArrears: why("недоимка"), whyDouble: why("два кризиса"),
    levies: levies.length, levyFailed: levies.filter((d) => d.closed === "не закрыт").length,
    backOwn: f.falls.some((x) => x.how === "zemlya") ? 1 : 0, backDvor: f.falls.some((x) => x.how === "dvor") ? 1 : 0, backArmor: f.falls.some((x) => x.how === "bronya") ? 1 : 0,
    stillUnder: f.under ? 1 : 0, disgraces: w.log.filter((e) => e.title === "Против барона" && e.lines.some((l) => l.startsWith("⚠"))).length,
    decreeLyudi: byCat("lyudi"), decreeEda: byCat("eda"), decreeSerebro: byCat("serebro"), decreeTovary: byCat("tovary"),
    badYears: bad.filter(Boolean).length,
    closedBad: inYears(true, (y) => (t.history[y]?.closed ? 1 : 0)), closedGood: inYears(false, (y) => (t.history[y]?.closed ? 1 : 0)),
    shortBad: inYears(true, (y) => run.shortByYear[y] ?? 0), shortGood: inYears(false, (y) => run.shortByYear[y] ?? 0),
    support: a.support, spent: -a.staff, earned: a.judge + a.feast + a.order + a.tax + a.complaint, burned: -a.burn, right: a.order,
  };
}

export interface BotStats { bot: Bot; n: number; mean: Metrics; sd: Metrics; runs: Metrics[] }
const seedName = (i: number) => `бот-${i + 1}`;
// Сто партий одного бота: средние по метрикам и разброс по семенам. Доли по ведущей склонности считаются по всем решениям разом.
export function botStats(b: Bot, seeds = B.bots.seeds, seasons = B.bots.seasons, lab = false): BotStats {
  const runs = Array.from({ length: seeds }, (_, i) => playBot(seedName(i), b, seasons, lab));
  const ms = runs.map(metricsOf), ids = Object.keys(ms[0] ?? {});
  const m = Object.fromEntries(ids.map((id) => [id, mean(ms.map((x) => x[id]))]));
  const sum = (id: string) => ms.reduce((s, x) => s + x[id], 0);
  m.leadOwn = share(sum("leadOwnHit"), sum("leadOwnN"));
  m.leadForeign = share(sum("leadForeignHit"), sum("leadForeignN"));
  m.lead = share(sum("leadOwnHit") + sum("leadForeignHit"), sum("leadOwnN") + sum("leadForeignN"));
  const out: BotStats = { bot: b, n: seeds, mean: m, sd: Object.fromEntries(ids.map((id) => [id, sd(ms.map((x) => x[id]))])), runs: ms };
  out.mean.applicable = runs.filter((r) => r.applicable).length;
  return out;
}

export interface PairDiff { id: string; diff: number; se: number; z: number; luck: number; own?: boolean }
// runs — партии варианта по семенам: по ним отчёт сравнивает варианты между собой попарно.
export interface PairStats { base: Bot; variant: Bot; n: number; diffs: PairDiff[]; verdict: "пустое" | "слабо" | "расходится"; top: PairDiff[]; runs: Metrics[] }
// Пара: разница «партия к партии» на одних семенах. z — разница в стандартных ошибках; luck — разброс базы по семенам.
// Ни одна метрика не дотянула до B.bots.weak ошибок — решение пустое; до B.bots.strong — расходится слабо.
export function pairStats(base: BotStats, variant: BotStats, only?: boolean[]): PairStats {
  const idx = base.runs.map((_, i) => i).filter((i) => !only || only[i]);
  const diffs = METRICS.map((def) => {
    const d = idx.map((i) => variant.runs[i][def.id] - base.runs[i][def.id]);
    const diff = mean(d), se = sd(d) / Math.sqrt(Math.max(1, d.length));
    const z = se > 0 ? diff / se : diff === 0 ? 0 : Infinity;
    return { id: def.id, diff, se, z, luck: sd(idx.map((i) => base.runs[i][def.id])), own: (variant.bot.own ?? []).includes(def.id) || !!def.diag };
  });
  const own = variant.bot.own ?? [];
  const counts = (d: PairDiff) => !own.includes(d.id) && !METRICS.find((m) => m.id === d.id)!.diag;
  const max = Math.max(0, ...diffs.filter(counts).map((d) => Math.abs(d.z)));
  const verdict = max < B.bots.weak ? "пустое" : max < B.bots.strong ? "слабо" : "расходится";
  // разошедшиеся метрики — по силе: разница в долях разброса базы по семенам
  const force = (d: PairDiff) => (d.luck > 0 ? Math.abs(d.diff) / d.luck : Math.abs(d.diff));
  const top = diffs.filter((d) => Math.abs(d.z) >= B.bots.weak).sort((x, y) => force(y) - force(x));
  return { base: base.bot, variant: variant.bot, n: idx.length, diffs, verdict, top, runs: variant.runs };
}

export interface BotsReport { seeds: number; seasons: number; lab: boolean; stats: BotStats[]; pairs: PairStats[]; presets: PairStats[] }
// Весь отчёт: боты выбранных уровней, пары к базе (и к ботам из versus), заготовки ситуаций против обычной партии.
// onlyPair — один бот по id или одна заготовка («заготовка:pisar»).
export function botsReport(seeds = B.bots.seeds, seasons = B.bots.seasons, lab = false, levels: number[] = [1, 2, 3, 4], onlyPair?: string): BotsReport {
  const need = new Set<string>(["idle"]), onePreset = onlyPair?.startsWith("заготовка:") ? onlyPair.split(":")[1] : undefined;
  for (const b of BOTS) {
    if (!levels.includes(b.level) || (onlyPair && b.id !== onlyPair)) continue;
    for (const id of [b.id, b.base, ...(b.versus ?? [])]) if (id) need.add(id);
  }
  // перепроверки сравнивают свои замеры с ботами прежних уровней
  if (levels.includes(4) && !onlyPair) for (const id of ["left", "master", "О5", "О6", "Х2", "Х6", "Х12", "Х16"]) need.add(id);
  // база базы тоже нужна: пара считается к ней
  for (const id of [...need]) { const base = bot(id).base; if (base && !onlyPair) need.add(base); }
  const stats = BOTS.filter((b) => need.has(b.id)).map((b) => botStats(b, seeds, seasons, lab));
  const of = (id: string) => stats.find((s) => s.bot.id === id)!;
  const pairs: PairStats[] = [];
  for (const s of stats) {
    const only = s.bot.needsRival ? Array.from({ length: seeds }, (_, i) => playBot(seedName(i), s.bot, 0, lab).applicable) : undefined;
    for (const base of [s.bot.base, ...(s.bot.versus ?? [])]) if (base && need.has(base)) pairs.push(pairStats(of(base), s, only));
  }
  const wanted = PRESETS.filter((p) => (onlyPair ? p.id === onePreset : levels.includes(1)));
  const presets = wanted.map((p) => {
    const b: Bot = { ...bot("idle"), id: `заготовка:${p.id}`, name: `заготовка «${p.name}»`, preset: p.id, base: "idle" };
    return pairStats(of("idle"), botStats(b, seeds, seasons, lab));
  });
  return { seeds, seasons, lab, stats, pairs, presets };
}

// Исходы дел совета: сколько раз за партию и что они оставляют в запасах и доверии сторон (boty.md, 11.4).
// size — сумма модулей последствий в запасах и доверии на одно дело; stock и trust — суммы со знаком; none — доля дел, не тронувших ни запасов, ни доверия.
export interface OutcomeRow { outcome: Outcome; perParty: number; size: number; stock: number; trust: number; order: number; none: number }
const STOCK_KEYS = ["kazna", "pripasy"], OUTCOMES: Outcome[] = ["alone", "agree", "deal", "judge", "compromise", "push", "rival", "sabotage", "silent", "ordered", "empty"];
export function outcomeStats(b: Bot, seeds = B.bots.seeds, seasons = B.bots.seasons): OutcomeRow[] {
  const acc = new Map<Outcome, { n: number; size: number; stock: number; trust: number; order: number; none: number }>();
  for (let i = 0; i < seeds; i++) {
    for (const e of playBot(seedName(i), b, seasons).w.log) {
      if (!e.outcome) continue;
      const row = acc.get(e.outcome) ?? { n: 0, size: 0, stock: 0, trust: 0, order: 0, none: 0 };
      let size = 0;
      for (const [key, v] of Object.entries(e.effects ?? {})) {
        if (key === "poryadok") { row.order += v; continue; }
        size += Math.abs(v);
        if (STOCK_KEYS.includes(key)) row.stock += v; else row.trust += v;
      }
      row.n++; row.size += size;
      if (!size) row.none++;
      acc.set(e.outcome, row);
    }
  }
  return OUTCOMES.filter((o) => acc.has(o)).map((o) => {
    const r = acc.get(o)!;
    return { outcome: o, perParty: r.n / seeds, size: r.size / r.n, stock: r.stock / r.n, trust: r.trust / r.n, order: r.order / r.n, none: r.none / r.n };
  });
}
