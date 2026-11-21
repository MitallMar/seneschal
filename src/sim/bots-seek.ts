// Бот-искатель (задача И3б, задание — docs/design/boty.md, раздел 23): ищет среди привычек игрока стратегии, которые заметно лучше
// привычных ботов или ведут к необычным исходам. Стратегия — та же привычка (Habit), что у обычных ботов: искатель действует теми же
// функциями экрана. Перебор — «Хозяин» с одной и с двумя изменёнными привычками; случайные — привычка из всего пространства;
// сборка по шагам — от «Хозяина» по одной привычке за шаг, пока цель растёт (так находятся сочетания из трёх и четырёх привычек).
// Отбор идёт на малом числе партий, подтверждение — на других семенах: иначе лучшая из сотен была бы просто самой удачливой.
import { COURSES } from "../data/economy";
import { BALANCE as B } from "./balance";
import { Rng } from "./rng";
import { mean } from "./util";
import { BOTS, MASTER_HABIT, bot, type Bot, type Habit } from "./bots";
import { botStats, pairStats, METRICS, type BotStats, type PairDiff } from "./bots-report";

// ---------- пространство стратегий ----------

type Options = { [K in keyof Habit]?: Habit[K][] };
// Что искатель может выбрать по каждой привычке. Нет в списке — берётся как у «Хозяина» (active: искатель всегда играет руками).
// place "true" (настоящая годность) в поиск не идёт: это замер, игроку недоступный.
export const SPACE: Options = {
  head: ["best", "keep", "worst", "none", "senior"],
  place: ["seen", "start", "aspiration", "known"],
  course: ["trial", "none", "flip", ...COURSES.map((c) => c.id)],
  mandate: [false, "course", "weak", "all", "fixed"],
  dropRival: [false, true],
  stale: ["keep", "authority", "persuade"],
  judge: [true, false], command: [true, false], talk: [true, false],
  talkFirst: [undefined, "aspiration"],
  feast: [false, "rich", "after", "winter"],
  pay: ["master", "council", "early", "silver", "hands", "ahead"],
  guard: [undefined, -2, -1, 1, 2, 4],
  extra: [null, "zaem", "rekruty_opushka", "rekruty_brod", "sverh_brod", "volnye", "sbor_kuptsy"],
  floors: ["default", "zero", "double"],
  under: [undefined, "stir", "hinder"],
};
const FIELDS = Object.keys(SPACE) as (keyof Habit)[];

const WORDS: Record<string, Record<string, string>> = {
  head: { best: "главный — самый признанный", keep: "главный как на старте", worst: "главный — кого хуже всех признают", none: "главного нет", senior: "главный — дольше всех на должности" },
  place: { seen: "расставляет по видимой годности", start: "расстановку не трогает", aspiration: "расставляет по стремлениям", known: "расставляет по стремлениям, открытым разговором" },
  mandate: { false: "без наказа", course: "наказ главному по курсу", weak: "наказ главному по слабейшей склонности", all: "наказ каждому против курса", fixed: "наказ главному по Выгоде" },
  dropRival: { true: "одного из соперников снимает до первого сезона", false: "соперников не трогает" },
  stale: { keep: "засидевшихся не трогает", authority: "засидевшихся снимает за авторитет", persuade: "засидевшихся уговаривает уйти" },
  judge: { true: "жалобы судит", false: "жалобы не судит" }, command: { true: "приказывает", false: "не приказывает" }, talk: { true: "говорит с людьми", false: "ни с кем не говорит" },
  talkFirst: { aspiration: "сначала выспрашивает стремления", undefined: "говорит по порядку" },
  feast: { false: "без пиров", rich: "пир, когда запас вдвое выше черты", after: "пир после закрытого урока", winter: "пир зимой из остатка" },
  pay: { master: "платит сам осенью", council: "подать оставляет совету", early: "платит досрочно, летом", silver: "платит только казной", hands: "без автоплаты, руками осенью", ahead: "без автоплаты, заранее с весны" },
  extra: { null: "недостающее не добирает", zaem: "добирает займом у купцов", rekruty_opushka: "добирает рекрутами с опушки", rekruty_brod: "добирает рекрутами с брода",
    sverh_brod: "добирает зерном сверх оброка с брода", volnye: "добирает вольными из корчмы", sbor_kuptsy: "добирает особым сбором с купцов" },
  floors: { default: "нижние черты как есть", zero: "нижние черты нулевые", double: "нижние черты вдвое выше" },
  under: { stir: "под чужой рукой раскачивает стороны", hinder: "под чужой рукой не платит подать барона", undefined: "под чужой рукой ждёт" },
};
function word(field: keyof Habit, v: unknown): string {
  if (field === "course") return v === "trial" ? "«Копим» в годы испытания" : v === "none" ? "без курса" : v === "flip" ? "курс меняет каждый сезон" : `курс «${COURSES.find((c) => c.id === v)!.name}» всю партию`;
  if (field === "guard") return v === undefined ? "стражу не трогает" : (v as number) > 0 ? `стража затянута на ${v}` : `стража распущена на ${-(v as number)}`;
  return WORDS[field][String(v)];
}
// Чем стратегия отличается от «Хозяина» — по привычкам, словами.
export const parts = (h: Habit): string[] => FIELDS.filter((f) => h[f] !== MASTER_HABIT[f]).map((f) => word(f, h[f]));
export function describe(h: Habit): string {
  return parts(h).join("; ") || "как «Хозяин»";
}

export interface Candidate { id: string; habit: Habit; kind: "одна привычка" | "две привычки" | "случайная" | "сборка" }
const set = (h: Habit, f: keyof Habit, v: unknown): Habit => ({ ...h, [f]: v });

// Перебор: «Хозяин» с одной изменённой привычкой и со всеми парами изменений в разных привычках.
export function enumerated(pairs = true): Candidate[] {
  const singles = FIELDS.flatMap((f) => (SPACE[f] as unknown[]).filter((v) => v !== MASTER_HABIT[f]).map((v) => ({ f, v })));
  const out: Candidate[] = singles.map((s, i) => ({ id: `П${i + 1}`, habit: set(MASTER_HABIT, s.f, s.v), kind: "одна привычка" }));
  if (!pairs) return out;
  for (let i = 0; i < singles.length; i++) {
    for (let j = i + 1; j < singles.length; j++) {
      if (singles[i].f === singles[j].f) continue;
      out.push({ id: `П${i + 1}+${j + 1}`, habit: set(set(MASTER_HABIT, singles[i].f, singles[i].v), singles[j].f, singles[j].v), kind: "две привычки" });
    }
  }
  return out;
}
// Случайная стратегия: по каждой привычке — любой вариант из пространства, своим генератором.
export function randomHabit(rng: Rng): Habit {
  let h = MASTER_HABIT;
  for (const f of FIELDS) h = set(h, f, rng.pick(SPACE[f] as unknown[]));
  return h;
}
export function randoms(seed: string, n: number): Candidate[] {
  const rng = new Rng(`${seed}|искатель`);
  return Array.from({ length: n }, (_, i) => ({ id: `С${i + 1}`, habit: randomHabit(rng), kind: "случайная" as const }));
}

// ---------- поиск ----------

// Цель поиска: метрика партии и что считать «лучше».
export interface Goal { id: string; name: string; better: 1 | -1 }
export const GOALS: Goal[] = [
  { id: "paid", name: "внесено подати, мер", better: 1 },
  { id: "closedAll", name: "все уроки закрыты", better: 1 },
  { id: "fell", name: "партий с падением", better: -1 },
  { id: "authority", name: "авторитет к концу", better: 1 },
];
// По чему судят о необычном исходе: состояние совета и сторон — не сам счёт подати.
// Шкалы порядка здесь нет: её двигает сам приказ страже, и «затянул — стало строже» находкой не было бы.
export const ODD = ["enemies", "hostile", "judged", "sabotage", "calm", "complaints", "loyalty", "vacant", "trust", "refuse", "authority", "crises", "shortages"];

export interface Finding {
  cand: Candidate; text: string;
  goal?: Goal;                           // находка «лучше»: по какой цели
  odd?: { id: string; value: number; lo: number; hi: number };   // находка «необычно»: метрика и края привычных ботов
  screen: number;                        // разница с «Хозяином» при отборе (для необычных — значение метрики)
  diff: number; se: number; z: number;   // то же на семенах подтверждения
  confirmed: boolean;
  costs: PairDiff[];                     // что при этом заметно изменилось в остальном
  steps?: { text: string; value: number }[];   // сборка по шагам: какую привычку добавили и что стало с целью (на семенах отбора)
}
export interface SeekReport {
  candidates: number; byKind: Record<Candidate["kind"], number>; screen: number; confirm: number; seasons: number;
  better: Finding[]; odd: Finding[];
  built: Finding[];                                      // сборка по шагам: по одной на цель
  levers: { text: string; diff: number; z: number }[];   // одна привычка: что сильнее всего двигает внесённую подать
  repeats: { text: string; n: number }[];                // какие привычки повторяются в подтверждённых находках «лучше» (перебор, без случайных)
  usual: Record<string, { lo: number; hi: number }>;
}
export interface SeekOpts { seed?: string; random?: number; pairs?: boolean; screen?: number; confirm?: number; top?: number; depth?: number; climb?: number; seasons?: number; progress?: (done: number, all: number) => void }

const asBot = (c: Candidate): Bot => ({ id: c.id, name: describe(c.habit), level: 4, base: "master", habit: c.habit });
const paired = (a: BotStats, b: BotStats, id: string) => {
  const d = a.runs.map((x, i) => x[id] - b.runs[i][id]), m = mean(d);
  const se = Math.sqrt(d.reduce((s, v) => s + (v - m) ** 2, 0) / Math.max(1, d.length - 1) / Math.max(1, d.length));
  return { diff: m, se, z: se > 0 ? m / se : 0 };
};

// Привычные боты уровней 1–3: края их средних по метрикам необычного — всё, что между ними, необычным не считается.
function usualRange(seeds: number, seasons: number): SeekReport["usual"] {
  const stats = BOTS.filter((b) => b.level <= 3 && !b.habit.random).map((b) => botStats(b, seeds, seasons));
  return Object.fromEntries(ODD.map((id) => [id, { lo: Math.min(...stats.map((s) => s.mean[id])), hi: Math.max(...stats.map((s) => s.mean[id])) }]));
}

export function seek(opts: SeekOpts = {}): SeekReport {
  const S = B.bots, seasons = opts.seasons ?? S.seasons, nScreen = opts.screen ?? S.seekScreen, nConfirm = opts.confirm ?? S.seekConfirm, top = opts.top ?? S.seekTop;
  const cands = [...enumerated(opts.pairs ?? true), ...randoms(opts.seed ?? "искатель", opts.random ?? S.seekRandom)];
  const master = botStats(bot("master"), nScreen, seasons), usual = usualRange(nScreen, seasons);
  // отбор: каждая стратегия на первых nScreen семенах, попарно с «Хозяином»
  const screened = cands.map((cand, i) => { opts.progress?.(i, cands.length); return { cand, st: botStats(asBot(cand), nScreen, seasons) }; });
  // подтверждение — на следующих семенах, которых не видели ни отбор, ни сборка
  const skip = Math.max(nScreen, opts.climb ?? S.seekClimb);
  const masterC = botStats(bot("master"), nConfirm, seasons, false, skip);
  const confirmed = new Map<string, BotStats>();
  const again = (c: Candidate) => { if (!confirmed.has(c.id)) confirmed.set(c.id, botStats(asBot(c), nConfirm, seasons, false, skip)); return confirmed.get(c.id)!; };
  const costsOf = (st: BotStats) => pairStats(masterC, st).top.filter((d) => !METRICS.find((m) => m.id === d.id)!.diag).slice(0, 5);

  const better: Finding[] = [];
  for (const goal of GOALS) {
    // при равной разнице (редкий исход на малом числе партий даёт много ничьих) — у кого больше закрытых уроков
    const ranked = screened.map((x) => ({ ...x, p: paired(x.st, master, goal.id) })).filter((x) => x.p.diff * goal.better > 0)
      .sort((a, b) => b.p.z * goal.better - a.p.z * goal.better || b.st.mean.closedAll - a.st.mean.closedAll).slice(0, top);
    for (const x of ranked) {
      const st = again(x.cand), p = paired(st, masterC, goal.id);
      better.push({ cand: x.cand, text: describe(x.cand.habit), goal, screen: x.p.diff, ...p, confirmed: p.z * goal.better >= S.strong, costs: costsOf(st).filter((d) => d.id !== goal.id) });
    }
  }
  // сборка по шагам: от «Хозяина» каждый раз добавляется та одна привычка, что сильнее всего двигает цель; ничего не двигает — стоп
  const built: Finding[] = [];
  const singles = enumerated(false), depth = opts.depth ?? S.seekDepth, nClimb = opts.climb ?? S.seekClimb;
  const masterB = botStats(bot("master"), nClimb, seasons);
  for (const goal of GOALS) {
    let h = MASTER_HABIT, best = masterB.mean[goal.id] * goal.better, tie = masterB.mean.closedAll;
    const steps: { text: string; value: number }[] = [], used = new Set<keyof Habit>();
    while (steps.length < depth) {
      let pick: { f: keyof Habit; h: Habit; v: number; tie: number } | undefined;
      for (const s of singles) {
        const f = FIELDS.find((x) => s.habit[x] !== MASTER_HABIT[x])!;
        if (used.has(f)) continue;
        const next = set(h, f, s.habit[f]), st = botStats({ id: "сборка", name: "сборка", level: 4, habit: next }, nClimb, seasons);
        const v = st.mean[goal.id] * goal.better, t = st.mean.closedAll;
        if (v > (pick?.v ?? best) || (v === (pick?.v ?? best) && t > (pick?.tie ?? tie))) pick = { f, h: next, v, tie: t };
      }
      if (!pick) break;
      h = pick.h; best = pick.v; tie = pick.tie; used.add(pick.f);
      steps.push({ text: word(pick.f, h[pick.f]), value: pick.v * goal.better });
    }
    if (!steps.length) continue;
    const cand: Candidate = { id: `Сб-${goal.id}`, habit: h, kind: "сборка" }, st = again(cand), p = paired(st, masterC, goal.id);
    built.push({ cand, text: describe(h), goal, screen: best * goal.better - masterB.mean[goal.id], ...p, confirmed: p.z * goal.better >= S.strong, costs: costsOf(st).filter((d) => d.id !== goal.id), steps });
  }
  // необычное: метрика далеко за краями привычных ботов, а партия не проиграна
  const odd: Finding[] = [];
  const far = (id: string, v: number) => { const r = usual[id], w = Math.max(r.hi - r.lo, 1e-9) * S.seekOdd; return v > r.hi + w ? v - r.hi - w : v < r.lo - w ? r.lo - w - v : 0; };
  for (const id of ODD) {
    const ranked = screened.filter((x) => far(id, x.st.mean[id]) > 0 && x.st.mean.paid >= master.mean.paid - S.seekKeep)
      .sort((a, b) => far(id, b.st.mean[id]) / (usual[id].hi - usual[id].lo + 1e-9) - far(id, a.st.mean[id]) / (usual[id].hi - usual[id].lo + 1e-9)).slice(0, Math.max(1, Math.ceil(top / 3)));
    for (const x of ranked) {
      // не проигрывает: подати не меньше (с допуском) и падает не чаще «Хозяина»
      const st = again(x.cand), p = paired(st, masterC, "paid"), value = st.mean[id], fell = paired(st, masterC, "fell");
      odd.push({
        cand: x.cand, text: describe(x.cand.habit), odd: { id, value, lo: usual[id].lo, hi: usual[id].hi }, screen: x.st.mean[id], ...p,
        confirmed: far(id, value) > 0 && p.diff >= -S.seekKeep && fell.z < S.weak, costs: costsOf(st),
      });
    }
  }
  const levers = screened.filter((x) => x.cand.kind === "одна привычка").map((x) => ({ text: describe(x.cand.habit), ...paired(x.st, master, "paid") }))
    .sort((a, b) => Math.abs(b.z) - Math.abs(a.z)).map(({ text, diff, z }) => ({ text, diff, z }));
  const found = [...new Map(better.filter((f) => f.confirmed && f.cand.kind !== "случайная").map((f) => [f.cand.id, f.cand])).values()];
  const count = new Map<string, number>();
  for (const c of found) for (const t of parts(c.habit)) count.set(t, (count.get(t) ?? 0) + 1);
  const repeats = [...count].map(([text, n]) => ({ text, n })).filter((x) => x.n > 1).sort((a, b) => b.n - a.n);
  const byKind = { "одна привычка": 0, "две привычки": 0, "случайная": 0, "сборка": built.length };
  for (const c of cands) byKind[c.kind]++;
  return { candidates: cands.length, byKind, screen: nScreen, confirm: nConfirm, seasons, better, odd, built, levers, repeats, usual };
}
