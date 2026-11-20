// Кризисы и падение: чтение из состояния и шаг брони. Зависит только от состояния партии и баланса — поэтому его зовут и хозяйство, и совет,
// и авторитет, не таща друг друга. Правила — crisis.ts (кризисы, внеочередной сбор) и under.ts (падение, барон, возвращение).
import type { PostId, Side } from "../../data/types";
import type { FallPath } from "../../data/fall";
import { BALANCE as B } from "../balance";
import { round2 } from "../util";
import type { World, Person, FallState, Under, Crisis } from "../state";

export function initFall(): FallState {
  return { refuse: {}, queue: [], crises: [], levyAt: 0, levyFailed: false, under: null, falls: [], disgrace: 0 };
}

export const underHand = (w: World): Under | null => w.fall.under;
// Опала: Сенешаль отстранён от совета — личных дел нет.
export const disgraced = (w: World): boolean => w.season <= w.fall.disgrace;

// Шрам стороны, который ещё держится.
export const scarOf = (w: World, side: Side): Crisis | undefined => w.fall.crises.find((c) => c.side === side && w.season < c.scarUntil);
// Множитель потока стороны от шрама: единица, если шрама нет.
export const scarMult = (w: World, side: Side): number => (scarOf(w, side) ? B.fall.scarMult : 1);
// Идёт ли кризис: ждёт своего сезона или его шрам ещё не зажил.
export const crisisNow = (w: World): boolean => w.fall.queue.length > 0 || w.fall.crises.some((c) => w.season < c.scarUntil);

// Двор барона ест: еда и серебро за сезон, пока Сенешаль под чужой рукой.
export const courtEats = (w: World): { eda: number; serebro: number } =>
  (w.fall.under ? { eda: B.fall.courtFood, serebro: B.fall.courtSilver } : { eda: 0, serebro: 0 });

// Путь падения барона: шаг снимает часть брони.
export function baronStep(w: World, path: FallPath, v: number): void {
  const u = w.fall.under;
  if (!u || v <= 0) return;
  u.armor = round2(u.armor - v);
  u.steps[path] = round2(u.steps[path] + v);
}

// Почему перестановку сделать нельзя: человек барона неприкосновенен, остальное — только с согласия барона в этом сезоне.
export function staffBlock(w: World, p: Person, post: PostId | null): string | undefined {
  const u = w.fall.under;
  if (!u) return undefined;
  const holderId = post ? w.posts[post] : null;
  if (u.retinue.includes(p.id) && p.post) return `${p.name} — человек барона: с должности не снять`;
  if (holderId != null && u.retinue.includes(holderId)) return "должность занята человеком барона";
  if (u.consent !== w.season) return "под чужой рукой перестановки — только с согласия барона";
  return undefined;
}
