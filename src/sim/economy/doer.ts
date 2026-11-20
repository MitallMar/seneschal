// Исполнитель и курс: как держатель должности ведёт свой поток (мастерство, опыт, настрой), почерк его склонностей, курс совета и нижние черты.
import type { Axis, CourseId, CourseDef, PostId } from "../../data/types";
import { AXES, POSTS, AXIS_NAMES } from "../../data/core";
import { HANDS, LEVERS } from "../../data/handwriting";
import type { Hand, Lever } from "../../data/handwriting";
import { COURSES } from "../../data/economy";
import { BALANCE as B } from "../balance";
import { councilSteady } from "../authority";
import { clamp, round2 } from "../util";
import { holder, fitness, isStale, topAxis, postName } from "../state";
import type { World, Person } from "../state";

export type How = "с огоньком" | "как велено" | "без огонька" | "должность пуста";
// mult — сила потока: мастерство × опыт × настрой; how — настрой; note — из чего сложилась сила, словами для ведомости.
// stale — засиделся: опыт мастерский и выше, почерк вдвое сильнее, курс его не зажигает.
export interface Doer { p?: Person; mult: number; how: How; note: string; mastery: number; exp: number; mood: number; stale?: boolean; hand: string }
// Мастерство: годность к должности, переведённая в множитель потока.
export function mastery(p: Person, post: PostId): { mult: number; word: "негоден" | "годен" | "прирождённый" } {
  const D = B.economy.doer, t = clamp((fitness(p, post) - D.masteryFrom) / Math.max(1, D.masteryTo - D.masteryFrom), 0, 1);
  const mult = round2(D.masteryMin + (D.masteryMax - D.masteryMin) * t);
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
  const made = (how: How, mood: number): Doer => ({ p, mult: round2(m.mult * x.mult * mood), how, note: `${m.word}, ${x.word}, ${how}`, mastery: m.mult, exp: x.mult, mood, stale, hand });
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

export const whoOf = (d: Doer, post: PostId) => (d.p ? `${postName(post).toLowerCase()} ${d.p.name}` : `${postName(post).toLowerCase()}: должность пуста`);

// Прибавка к весу варианта события: по склонностям курса совет решает мелкие дела чаще.
export function courseLean(w: World, axes: Axis[]): number {
  const c = courseDef(w);
  if (!c || !c.pro.length) return 0;
  const share = axes.filter((a) => c.pro.includes(a)).length / axes.length;
  return share * B.economy.course.lean * (w.eco.courseSeasons >= 1 ? B.economy.course.inertia : 1);
}

// Под чужой рукой курс задаёт барон (byBaron): Сенешалю остаётся склонять его разговором. Возвращает false, если курс сменить нельзя.
export function setCourse(w: World, id: CourseId | null, byBaron = false): boolean {
  const e = w.eco;
  if (w.fall.under && !byBaron) return false;
  if (e.course === id) return true;
  e.shaky = e.course !== null && e.courseSeasons < B.economy.course.shaky;
  e.course = id; e.courseSeasons = 0;
  const c = courseDef(w);
  const lines = [c ? `Курс на сезон: «${c.name}» — ${c.desc}.` : "Курса нет: хозяйство идёт как заведено."];
  if (e.shaky) lines.push("Курс сменили слишком быстро — шатание: несогласные исполняют без огонька.");
  w.log.push({ season: w.season, kind: "staff", title: byBaron ? "Курс барона" : "Курс", lines });
  return true;
}
export function setFloor(w: World, cat: "eda" | "serebro", v: number): void {
  w.eco.floor[cat] = round2(Math.max(0, Number(v) || 0));
}
