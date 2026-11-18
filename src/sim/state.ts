// Состояние партии и чтение из него: типы World, Person и всего, что в них лежит (хозяйство, авторитет), шкалы и простые вопросы к состоянию.
// Правил здесь нет: совет, хозяйство и авторитет берут состояние отсюда и не тянут ради него друг друга.
import type { Axis, Star, PostId, Side, Village, Stock, Category, HandsFrom, CourseId, PayId, Effect, Trait, Mark, AspirationDef } from "../data/types";
import { AXES, POSTS } from "../data/core";
import { BALANCE as B } from "./balance";
import type { Rng } from "./rng";
import { clamp } from "./util";

// ---------- Люди и партия ----------

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

// ---------- Хозяйство ----------

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
// Зона стороны по доверию: слово и пороги — economy.ts.
export type Zone = "заодно" | "ладят" | "терпят" | "отказывают";

// ---------- Авторитет ----------

export type AuthKind = "support" | "tax" | "judge" | "complaint" | "feast" | "order" | "staff" | "burn";
export interface AuthLine { v: number; text: string; kind: AuthKind }
// Жалоба — дело на столе Сенешаля: from жалуется на on. Ждёт год; не разобрал — авторитет падает, жалоба уходит.
export interface Complaint { id: number; from: number; on: number; season: number }
export interface AuthState {
  cur: AuthLine[];                       // строки текущего сезона
  last: AuthLine[] | null;               // ведомость прошлого сезона
  lastSeason: number;
  feasts: number[];                      // в какие сезоны устраивали пиры и обычаи
  complaints: Complaint[];
  nextId: number;
  totals: Record<AuthKind, number>;      // за партию: сколько пришло и ушло по источникам
}

// ---------- Чтение ----------

export const relKey = (a: number, b: number) => (a < b ? `${a}|${b}` : `${b}|${a}`);

export function getRel(w: World, a: number, b: number): number {
  return w.rel.get(relKey(a, b)) ?? 0;
}
// Задать отношения двоих напрямую: для тестов и заготовок ситуаций в эмуляторе. Игра меняет отношения только через addRel.
export function setRel(w: World, a: number, b: number, v: number): void {
  w.rel.set(relKey(a, b), clamp(v, -REL_MAX, REL_MAX));
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

// Годность к должности: насколько звезда совпадает с осями должности + метка
export function fitness(p: Person, post: PostId): number {
  const def = POSTS.find((x) => x.id === post)!;
  let f = def.axes.reduce((s, a) => s + p.star[a], 0) / def.axes.length;
  if (p.mark?.goodPost === post) f += B.exp.fitMarkGood;
  if (p.mark?.badPost === post) f -= B.exp.fitMarkBad;
  if (p.aspiration?.post === post) f += B.exp.fitAspiration;
  return f;
}
