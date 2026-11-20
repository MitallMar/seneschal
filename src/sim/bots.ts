// Боты: привычки игрока (задача И3, задание — docs/design/boty.md). Без DOM и часов: работают в Node.
// Бот действует только функциями экрана и видит только то, что видит игрок. Исключения названы у привычки: place "true" (настоящая годность)
// и place "aspiration" (стремления бот знает заранее: за один сезон их не выспросить).
// Своя случайность бота — отдельный генератор; генератор мира бот не трогает.
import type { Axis, CourseId, PayId, PostId } from "../data/types";
import { AXES, POSTS } from "../data/core";
import { COURSES, SEASON_NAMES } from "../data/economy";
import { BALANCE as B } from "./balance";
import { Rng } from "./rng";
import { assign, setHead, giveOrder } from "./council/staff";
import { talk, nextTalk, persuade } from "./council/talk";
import { command, deskView, runSeason } from "./season";
import { holder, getRel, fitness, isStale, type World, type Person } from "./state";
import { relWord, fitWord } from "./council/know";
import { newPreset } from "./presets";
import { setCourse, setFloor, courseDef } from "./economy/doer";
import { payTax, payOptions, taxLeft } from "./economy/pay";
import { payDecree } from "./world/apply";
import { setGuard } from "./order";
import { seasonKind } from "./economy/zones";
import { forecastFork } from "./economy/view";
import { judge, feast, feastCost, feastsThisYear, authorityCap, complaintLeft, councilSteady, FEASTS } from "./authority";
import { PROBE, resetProbe, type Probe } from "./probe";

const WINTER = 3;

// Привычка: что бот делает до первого сезона и каждый сезон.
export interface Habit {
  head: "keep" | "best" | "worst" | "none";               // главный: как на старте, самый признанный, наименее признанный, никого
  place: "start" | "seen" | "aspiration" | "true" | "known";        // расстановка: как на старте, по видимой годности, по стремлениям, по настоящей годности
  course: "none" | "kopim" | "trial" | "flip";             // курс: нет, «Копим к подати» всегда, «Копим» в годы испытания, новый каждый сезон
  mandate: false | "course" | "weak" | "all" | "fixed";    // наказ: главному по оси курса; главному по его слабейшей оси; каждому против курса; главному по оси «Копим» без курса
  //                                        // наказ главному по оси курса
  dropRival: boolean;                                      // одного из пары соперников снять до первого сезона
  stale: "keep" | "authority" | "persuade";                // засидевшихся: не трогать, снять за авторитет, уговорить
  active: boolean;                                         // тратит личные дела каждый сезон
  judge: boolean; command: boolean; talk: boolean;
  talkFirst?: "aspiration";                                // свободное дело — сначала на тех, чьё стремление неизвестно
  feast: false | "rich" | "after" | "winter";             // пир: когда запас вдвое выше черты; после закрытого урока, если авторитет не у потолка; зимой из остатка
  pay: "council" | "master" | "early" | "silver" | "hands" | "ahead"; // hands — только руками осенью, без автоплаты; ahead — без автоплаты, платит заранее с весны
  guard?: number;   // стража: на сколько ступеней затянута (или распущена) с первого сезона
  //         // подать: совет сам; сам осенью и совет после жатвы; ещё и летом; только казной
  extra: PayId | null;                                     // чем добирает то, чего не хватит и после жатвы
  floors: "default" | "zero" | "double";
  random?: boolean;                                        // бот «Случайный»
  idleRng?: boolean;                                       // для теста: тянет свой генератор, но ничего не делает
}
// own — метрики, которые записывают само действие бота (цена наказа, пустая должность): в вердикт пары они не идут.
// versus — с кем ещё сравнить, кроме базы. Уровень 4 — перепроверки (boty.md, раздел 11).
export interface Bot {
  id: string; name: string; level: 1 | 2 | 3 | 4; habit: Habit; base?: string; asks?: string; preset?: string; needsRival?: boolean; own?: string[]; versus?: string[];
}

const IDLE: Habit = {
  head: "keep", place: "start", course: "none", mandate: false, dropRival: false, stale: "keep", active: false,
  judge: false, command: false, talk: false, feast: false, pay: "council", extra: null, floors: "default",
};
const LEFT: Habit = { ...IDLE, head: "best", course: "kopim" };
const MASTER: Habit = { ...IDLE, head: "best", place: "seen", course: "trial", active: true, judge: true, command: true, talk: true, pay: "master" };

const o = (id: string, name: string, asks: string, habit: Partial<Habit>, more: Partial<Bot> = {}): Bot => ({ id, name, level: 2, base: "left", asks, habit: { ...LEFT, ...habit }, ...more });
const x = (id: string, name: string, asks: string, habit: Partial<Habit>, own?: string[]): Bot => ({ id, name, level: 3, base: "master", asks, habit: { ...MASTER, ...habit }, own });
const y = (id: string, name: string, asks: string, habit: Partial<Habit>, more: Partial<Bot> = {}): Bot => ({ ...x(id, name, asks, habit), level: 4, ...more });
// счёт авторитета: цена действия и то, что из неё прямо следует
const BILL = ["spent", "burned", "authority", "atCap", "weak"];

export const BOTS: Bot[] = [
  { id: "idle", name: "Ничего не трогает", level: 1, habit: IDLE },
  { id: "left", name: "Оставил порядок", level: 2, habit: LEFT },
  o("О1", "главный — кого хуже всех признают", "работает ли правило «главный работает, только если его признают»", { head: "worst" }),
  o("О2", "главного нет", "держится ли совет без старшего", { head: "none" }),
  o("О3", "одного из соперников снял до отъезда", "сколько стоит оставить ссору дома и сколько — пустая должность", { dropRival: true }, { needsRival: true, own: ["vacant", ...BILL] }),
  o("О4", "расставил по стремлениям", "кто лучше ведёт дела без присмотра: годные или довольные", { place: "aspiration" }, { own: BILL }),
  o("О5", "наказ главному по оси курса", "держится ли наказ, когда Сенешаля нет", { mandate: "course" }, { own: BILL }),
  o("О6", "без курса", "тянет ли курс мелкие дела без хозяина", { course: "none" }),
  { id: "master", name: "Хозяин", level: 3, base: "idle", asks: "сколько вообще даёт игра руками", habit: MASTER },
  x("Х1", "главного не назначает", "цена опоры совета", { head: "none" }),
  x("Х2", "расставляет по стремлениям", "огонёк от желанной должности против годности", { place: "aspiration" }),
  x("Х3", "расставляет по настоящей годности", "цена незнания людей", { place: "true" }),
  x("Х4", "засидевшихся снимает за авторитет", "воровство и «по-своему» против цены перестановки", { stale: "authority" }),
  x("Х5", "засидевшихся снимает уговором", "окупается ли медленный путь", { stale: "persuade" }),
  x("Х6", "наказ главному по оси курса", "меняет ли наказ что-нибудь, кроме счёта авторитета", { mandate: "course" }, BILL),
  x("Х7", "никогда не приказывает", "риск приказа и доля «оказался прав»", { command: false }),
  x("Х8", "жалобы не судит", "цена брошенной жалобы против потраченного дела", { judge: false }),
  x("Х9", "пир, когда запас вдвое больше нижней черты", "превращение хозяйства в авторитет", { feast: "rich" }),
  x("Х10", "не говорит ни с кем", "лояльность от разговоров сама по себе", { talk: false }),
  x("Х11", "недостающее — рекрутами с деревни у опушки", "есть ли смысл выбирать, кто платит", { extra: "rekruty_opushka" }),
  x("Х12", "платит досрочно, летом", "бонус досрочной платы против риска остаться без запаса", { pay: "early" }),
  x("Х13", "недостающее — займом у купцов", "долг купцам против недоимки", { extra: "zaem" }),
  x("Х14", "платит только казной", "цена недоимки для авторитета и терпения Герцога", { pay: "silver" }),
  x("Х15", "меняет курс каждый сезон", "шатание: насколько оно портит исполнение", { course: "flip" }),
  x("Х16", "нижние черты нулевые", "черта как страховка: недодачи против невнесённых мер", { floors: "zero" }),
  { id: "random", name: "Случайный", level: 3, habit: { ...IDLE, random: true } },
  // ---------- перепроверки (boty.md, раздел 11) ----------
  o("О5б", "наказ главному по его слабейшей склонности", "пуст ли наказ, когда он не дублирует курс", { mandate: "weak" }, { own: BILL, level: 4 }),
  o("О5в", "наказ каждому против курса", "слышит ли совет наказ, идущий против курса", { mandate: "all" }, { own: BILL, level: 4 }),
  o("О5г", "наказ главному по Выгоде, курса нет", "что даёт наказ сам по себе, без курса", { mandate: "fixed", course: "none" }, { own: BILL, level: 4, base: "О6" }),
  y("Х6б", "наказ главному по его слабейшей склонности", "пуст ли наказ, когда он не дублирует курс", { mandate: "weak" }, { own: BILL }),
  y("Х6в", "наказ каждому против курса", "слышит ли совет наказ, идущий против курса", { mandate: "all" }, { own: BILL }),
  y("Х2б", "по стремлениям, открытым разговором", "что дают разговоры через стремления и сколько стоит не знать заранее", { place: "known" }, { versus: ["Х2"] }),
  y("Х2в", "то же, разговоры сначала о стремлениях", "окупается ли выспрашивать стремления в первую очередь", { place: "known", talkFirst: "aspiration" }, { versus: ["Х2"] }),
  y("Х17", "без автоплаты: платит только руками осенью", "сколько игрок теряет из-за порядка «ход → жатва → сборщица»", { pay: "hands" }),
  y("Х17б", "без автоплаты: платит заранее, с весны", "можно ли жить с нынешним порядком, если платить заранее", { pay: "ahead" }),
  y("Х9б", "пир после закрытого урока, если авторитет не у потолка", "ловушка ли пиры или глупость бота", { feast: "after" }),
  y("Х9в", "пир зимой из остатка сверх черты", "ловушка ли пиры или глупость бота", { feast: "winter" }),
  y("Х16б", "нижние черты вдвое выше", "третья точка для нижних черт: ноль, умолчание, вдвое", { floors: "double" }),
  y("Х18", "держит твёрдую руку: стража затянута до предела", "сколько стоит строгий край и что он даёт", { guard: 4 }),
  y("Х18б", "держит строгость: стража затянута на одну ступень", "окупается ли умеренная строгость", { guard: 1 }),
  y("Х19", "распустил стражу", "сколько стоит вольный край и что он даёт", { guard: -2 }),
  { id: "Н0", name: "«Наследство»: ничего не трогает", level: 4, habit: IDLE, preset: "nasledstvo" },
  { id: "Н1", name: "«Наследство»: Хозяин", level: 4, base: "Н0", asks: "что даёт игра руками, когда старт плохой", habit: MASTER, preset: "nasledstvo" },
  { id: "Н3", name: "«Наследство»: по настоящей годности", level: 4, base: "Н1", asks: "цена незнания людей при плохом старте", habit: { ...MASTER, place: "true" }, preset: "nasledstvo" },
  { id: "Н10", name: "«Наследство»: не говорит ни с кем", level: 4, base: "Н1", asks: "окупаются ли разговоры при плохом старте", habit: { ...MASTER, talk: false }, preset: "nasledstvo" },
];
export const bot = (id: string): Bot => {
  const b = BOTS.find((q) => q.id === id);
  if (!b) throw new Error(`Нет бота ${id}`);
  return b;
};

// ---------- что видит бот ----------

const council = (w: World): Person[] => w.people.filter((p) => p.post);
const REL_RANK: Record<string, number> = { "заодно": 2, "ладят": 1, "терпят": 0, "соперники": -1, "враги": -2 };
const FIT_RANK: Record<string, number> = { "подходит": 2, "не знаю": 1, "сомнительно": 0 };
// Насколько человека признают в совете: по словам отношений, которые видны в таблице.
const recognised = (w: World, p: Person) => council(w).reduce((s, q) => (q.id === p.id ? s : s + REL_RANK[relWord(getRel(w, p.id, q.id))]), 0);
const seenFit = (p: Person, post: PostId) => FIT_RANK[fitWord(p, post)];
// Пара соперников или врагов в совете: худшая по слову, при равенстве — первая по списку.
export function rivals(w: World): [Person, Person] | undefined {
  let worst: [Person, Person] | undefined, rank = 0;
  for (const a of council(w)) {
    for (const b of council(w)) {
      const r = REL_RANK[relWord(getRel(w, a.id, b.id))];
      if (a.id < b.id && r < rank) { worst = [a, b]; rank = r; }
    }
  }
  return worst;
}
// Кем заменить на должности: человек без должности, лучший по видимой годности.
function spare(w: World, post: PostId): Person | undefined {
  const free = w.people.filter((p) => !p.post);
  return free.length ? free.reduce((a, b) => (seenFit(b, post) > seenFit(a, post) ? b : a)) : undefined;
}

// ---------- подготовка: до первого сезона и раз в год ----------

function place(w: World, how: Habit["place"]) {
  if (how === "seen") {
    for (const d of POSTS) {
      const h = holder(w, d.id), cand = spare(w, d.id);
      if (cand && (!h || seenFit(cand, d.id) > seenFit(h, d.id))) assign(w, cand.id, d.id);
    }
  } else if (how === "aspiration" || how === "known") {
    // known — только стремления, открытые разговором или делом; остальных — по видимой годности
    const wants = (p: Person, post: PostId) => p.aspiration?.post === post && (how === "aspiration" || p.know.aspiration);
    for (const d of POSTS) {
      const h = holder(w, d.id);
      if (h && wants(h, d.id)) continue;
      const want = w.people.find((p) => wants(p, d.id)), cand = spare(w, d.id);
      if (want) assign(w, want.id, d.id);
      else if (how === "known" && cand && (!h || seenFit(cand, d.id) > seenFit(h, d.id))) assign(w, cand.id, d.id);
    }
  } else if (how === "true") {
    const pairs = w.people.flatMap((p) => POSTS.map((d) => ({ p, post: d.id, f: fitness(p, d.id) }))).sort((a, b) => b.f - a.f);
    const taken = new Set<PostId>(), busy = new Set<number>();
    for (const { p, post } of pairs) {
      if (taken.has(post) || busy.has(p.id)) continue;
      taken.add(post); busy.add(p.id);
      if (p.post !== post) assign(w, p.id, post);
    }
  }
  // перестановка могла оставить должность пустой: на неё — лучший из свободных по видимой годности
  if (how !== "start") for (const d of POSTS) { const next = spare(w, d.id); if (!holder(w, d.id) && next) assign(w, next.id, d.id); }
}
function chooseHead(w: World, how: Habit["head"]) {
  const c = council(w);
  if (how === "keep" || !c.length) return;
  if (how === "none") { if (w.head != null) setHead(w, null); return; }
  const pick = c.reduce((a, b) => {
    const ra = recognised(w, a), rb = recognised(w, b);
    return (how === "best" ? rb > ra : rb < ra) ? b : a;
  });
  if (w.head !== pick.id) setHead(w, pick.id);
}
function chooseCourse(w: World, how: Habit["course"], n: number) {
  const trial = w.eco.tax.year <= B.economy.tax.trialYears;
  const want: CourseId | null = how === "kopim" || (how === "trial" && trial) ? "kopim" : how === "flip" ? COURSES[n % COURSES.length].id : null;
  if (w.eco.course !== want) setCourse(w, want);
}
// Наказ. course — главному по первой склонности курса (курса нет — наказа нет); fixed — главному по первой склонности «Копим к подати», хотя курса нет;
// weak — главному по его слабейшей склонности (бот знает настоящую звезду: это замер, а не привычка игрока);
// all — каждому в совете по склонности, противной курсу; на кого авторитета не хватило — пропускает.
function mandate(w: World, how: Habit["mandate"]) {
  const head = w.head != null ? w.people[w.head] : undefined, course = courseDef(w);
  const give = (p: Person | undefined, axis: Axis | undefined) => { if (p && axis && p.order !== axis) giveOrder(w, p.id, axis); };
  if (how === "course") give(head, course?.pro[0]);
  else if (how === "fixed") give(head, COURSES.find((c) => c.id === "kopim")!.pro[0]);
  else if (how === "weak" && head) give(head, AXES.reduce((a, x) => (head.star[x] < head.star[a] ? x : a)));
  else if (how === "all") for (const p of council(w)) give(p, course?.contra[0]);
}

// ---------- сезон ----------

function removeStale(w: World, how: Habit["stale"]) {
  for (const p of council(w).filter(isStale)) {
    const post = p.post!, next = spare(w, post);
    if (!next) continue;
    if (how === "persuade" && !p.agreed) { persuade(w, p.id); if (!p.agreed) continue; }
    assign(w, next.id, post);
  }
}
// Личные дела по порядку базы: суд по жалобе, что скоро уйдёт; приказ, если советник советует против курса; пир; разговор с тем, о ком известно меньше всех.
function deeds(w: World, h: Habit) {
  if (h.judge) for (const c of [...w.auth.complaints]) if (complaintLeft(w, c) <= B.bots.judgeLeft) judge(w, c.id);
  const course = courseDef(w), d = deskView(w);
  if (h.command && course?.pro.length && d?.opinion && !d.order) {
    const share = (axes: Axis[]) => axes.filter((a) => course.pro.includes(a)).length / axes.length;
    const best = d.ev.options.reduce((a, b) => (share(b.axes) > share(a.axes) ? b : a));
    if (share(d.opinion.axes) === 0 && share(best.axes) > 0) command(w, best.id);
  }
  const spareFor = (q: typeof FEASTS[number]) => w.eco.stock[q.pay] - w.eco.floor[q.pay] >= feastCost(q.id);
  if (h.feast === "rich") {
    const f = FEASTS.find((q) => w.eco.stock[q.pay] > Math.max(w.eco.floor[q.pay], B.economy.flow.upkeep) * B.bots.feastOver);
    if (f) feast(w, f.id);
  } else if (h.feast === "after" && taxLeft(w) <= 0 && w.authority <= authorityCap() - B.bots.feastOver && feastsThisYear(w) === 0) {
    const f = FEASTS.find(spareFor);
    if (f) feast(w, f.id);
  } else if (h.feast === "winter" && seasonKind(w.season) === WINTER && feastsThisYear(w) === 0) {
    const f = FEASTS.find(spareFor);
    if (f) feast(w, f.id);
  }
  while (h.talk && w.deedsLeft > 0) {
    const open = w.people.filter((p) => nextTalk(p));
    if (!open.length) break;
    // сначала о стремлениях: совет вперёд, и того, с кем уже говорили, — до конца
    const dark = h.talkFirst ? open.filter((p) => !p.know.aspiration) : [];
    const who = dark.length
      ? dark.reduce((a, b) => (!!b.post !== !!a.post ? (b.post ? b : a) : b.know.talks > a.know.talks ? b : a))
      : open.reduce((a, b) => (b.know.talks < a.know.talks || (b.know.talks === a.know.talks && !!b.post && !a.post) ? b : a));
    if (!talk(w, who.id)) break;
  }
}
// Казна, амбар и товары — не ниже нижних черт.
function payAbove(w: World, goods = true) {
  const e = w.eco, R = B.economy.rate;
  payTax(w, "serebro", (e.stock.serebro - e.floor.serebro) / R.serebro);
  payTax(w, "eda", (e.stock.eda - e.floor.eda) / R.eda);
  if (goods) payTax(w, "tovary", e.stock.tovary / R.tovary);
}
// Указ бот-плательщик закрывает тем же порядком, что подать, в последний сезон срока: запасом не ниже нижних черт и своим добавочным способом.
// Чего указ не берёт (людей — запасом), остаётся совету.
function decrees(w: World, h: Habit) {
  const e = w.eco, R = B.economy.rate;
  for (const d of w.world.decrees.filter((x) => x.until <= w.season)) {
    payDecree(w, d.id, "serebro", (e.stock.serebro - e.floor.serebro) / R.serebro);
    payDecree(w, d.id, "eda", (e.stock.eda - e.floor.eda) / R.eda);
    payDecree(w, d.id, "tovary", e.stock.tovary / R.tovary);
    if (h.extra) payDecree(w, d.id, h.extra, d.due);
  }
}
function pay(w: World, h: Habit) {
  const kind = seasonKind(w.season), autumn = kind === 2;
  if (h.pay === "council") return;
  if (h.pay === "silver") { if (autumn) payTax(w, "serebro", (w.eco.stock.serebro - w.eco.floor.serebro) / B.economy.rate.serebro); return; }
  if (h.pay === "hands") { if (autumn) payAbove(w); return; }
  if (h.pay === "ahead") { if (kind !== WINTER) payAbove(w); return; } // зимой урок ещё прошлогодний: новый объявят только к весне
  decrees(w, h);
  if (autumn || (h.pay === "early" && kind === 1)) payAbove(w);
  if (!autumn || !h.extra) return;
  // чего не хватит и после жатвы — по прогнозу счетоводов (нижний край вилки): его видит игрок
  const fork = forecastFork(w), lo = (cat: "eda" | "serebro") => Math.max(0, fork.find((f) => f.cat === cat)!.lo - w.eco.floor[cat]);
  const later = lo("eda") / B.economy.rate.eda + lo("serebro") / B.economy.rate.serebro;
  payTax(w, h.extra, taxLeft(w) - later);
}

function setup(w: World, h: Habit) {
  if (h.floors === "zero") { setFloor(w, "eda", 0); setFloor(w, "serebro", 0); }
  if (h.floors === "double") { setFloor(w, "eda", w.eco.floor.eda + w.eco.floor.eda); setFloor(w, "serebro", w.eco.floor.serebro + w.eco.floor.serebro); }
  if (h.pay === "silver" || h.pay === "hands" || h.pay === "ahead") w.eco.autoPay = false;
  if (h.guard) setGuard(w, h.guard);
  place(w, h.place);
  const pair = h.dropRival ? rivals(w) : undefined;
  if (pair) { const out = pair[0].tenure <= pair[1].tenure ? pair[0] : pair[1]; assign(w, out.id, null); }
  chooseHead(w, h.head);
  chooseCourse(w, h.course, 0);
  if (h.mandate) mandate(w, h.mandate);
}
function turn(w: World, h: Habit, n: number) {
  chooseCourse(w, h.course, n);
  if (h.mandate) mandate(w, h.mandate);
  if (!h.active) return;
  if (n > 0 && seasonKind(w.season) === 0) { place(w, h.place); chooseHead(w, h.head); }
  if (h.stale !== "keep") removeStale(w, h.stale);
  deeds(w, h);
  pay(w, h);
}

// Бот «Случайный»: на каждое действие — случайный выбор из доступного, своим генератором.
function randomTurn(w: World, rng: Rng) {
  const anyone = () => rng.pick(w.people).id, post = () => rng.pick(POSTS).id;
  const acts: (() => void)[] = [
    () => { talk(w, anyone()); },
    () => { assign(w, anyone(), rng.chance(B.exp.riskBase) ? null : post()); },
    () => { const c = council(w); if (c.length) setHead(w, rng.pick(c).id); },
    () => { giveOrder(w, anyone(), rng.pick(AXES)); },
    () => { const d = deskView(w); if (d) command(w, rng.pick(d.ev.options).id); },
    () => { if (w.auth.complaints.length) judge(w, rng.pick(w.auth.complaints).id); },
    () => { feast(w, rng.pick(FEASTS).id); },
    () => { setCourse(w, rng.chance(B.exp.riskBase) ? null : rng.pick(COURSES).id); },
    () => { const opt = rng.pick(payOptions(w)); payTax(w, opt.def.id, rng.range(0, opt.max)); },
    () => { setFloor(w, rng.pick(["eda", "serebro"] as const), rng.int(0, B.economy.hands.field)); },
    () => { const c = council(w); if (c.length) persuade(w, rng.pick(c).id); },
    () => { w.eco.feedFirst = rng.pick(["zamok", "derevni"] as const); },
  ];
  for (let i = rng.int(0, B.bots.randomActs); i > 0; i--) rng.pick(acts)();
}

// probe — счётчики зонда за партию; aspAt — к какому сезону известны стремления всего совета (не узнал — сезонов партии плюс один).
// shortByYear — в скольких сезонах каждого года была недодача: отчёт сверяет их с погодой года.
export interface BotRun { w: World; calm: number; applicable: boolean; seasons: number; probe: Probe; aspAt: number; shortByYear: number[] }
// Одна партия бота. applicable — годится ли партия для пары (О3 играется только там, где в совете есть соперники).
export function playBot(seed: string, b: Bot, seasons = B.bots.seasons, lab = false): BotRun {
  resetProbe();
  const w = newPreset(seed, b.preset ?? null, lab), rng = new Rng(`${seed}|бот`), h = b.habit;
  const applicable = !b.needsRival || !!rivals(w);
  setup(w, h);
  let calm = 0, aspAt = seasons + 1;
  const shortByYear: number[] = [];
  for (let n = 0; n < seasons; n++) {
    if (h.random) randomTurn(w, rng);
    else { if (h.idleRng) rng.range(0, 1); turn(w, h, n); }
    if (aspAt > seasons && council(w).every((p) => p.know.aspiration)) aspAt = n + 1;
    const year = Math.floor(n / SEASON_NAMES.length), short = w.eco.shortages;
    runSeason(w);
    shortByYear[year] = (shortByYear[year] ?? 0) + (w.eco.shortages - short);
    if (councilSteady(w).ok) calm++;
  }
  return { w, calm, applicable, seasons, probe: structuredClone(PROBE), aspAt, shortByYear };
}
