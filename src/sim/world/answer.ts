// Ответ совета на беду (задача И21): у каждого состояния мира, отголоска и указа есть ответственная должность.
// Сила её держателя (мастерство × опыт × настрой, как в потоках) смягчает или усиливает потерю; пустая должность — хуже всего.
// Почерк держателя даёт способ ответа (src/data/answers.ts): у каждого способа своя польза и своя цена.
import type { PostId, AnswerKind, Answer } from "../../data/types";
import { ANSWERS } from "../../data/answers";
import { BALANCE as B } from "../balance";
import { clamp, round2 } from "../util";
import { holder, postName } from "../state";
import type { World, Person } from "../state";
import { doer, handsOf } from "../economy/doer";
import { worldMods, type Soften } from "./gen";

// Во сколько раз держатель должности меняет потерю: сильный — меньше единицы, слабый — больше; word — как он справился.
export interface Stand { k: number; p?: Person; word: "смягчил" | "не помог" | "усугубил" | "должность пуста"; text: string }
export function standOf(w: World, post: PostId): Stand {
  const A = B.world.answer, p = holder(w, post), name = postName(post).toLowerCase();
  if (!p) return { k: A.max, word: "должность пуста", text: `${name}: должность пуста — беда бьёт в полную силу и сверх того` };
  const k = round2(clamp(1 - (doer(w, post).mult - 1) * A.gain, A.min, A.max));
  const word = k < 1 ? "смягчил" : k > 1 ? "усугубил" : "не помог";
  const how = { "смягчил": `смягчил${p.female ? "а" : ""}`, "усугубил": `усугубил${p.female ? "а" : ""}`, "не помог": "ни смягчить, ни испортить" }[word];
  return { k, p, word, text: `${name} ${p.name} — ${how}` };
}

// Способ ответа: есть ли он у держателя должности по его почерку. weight — сила: ведущая склонность в полную, оттенок слабее.
export interface Way { answer: Answer; p: Person; weight: number }
export function wayOf(w: World, kind: AnswerKind): Way | undefined {
  const answer = ANSWERS.find((a) => a.kind === kind)!, p = holder(w, answer.post);
  const hand = p ? handsOf(p, answer.post).find((h) => h.hand.axis === answer.axis) : undefined;
  return p && hand ? { answer, p, weight: Math.min(1, hand.weight) } : undefined;
}
// Доля потери при способе: ручка share в полную силу способа, ближе к единице — у оттенка.
export const wayShare = (way: Way | undefined, share: number): number => (way ? 1 - (1 - share) * way.weight : 1);
// Способы человека на его должности — для карточки: что он делает с бедой и чем за это платит.
export function waysOf(p: Person): { answer: Answer; shade: boolean }[] {
  if (!p.post) return [];
  return handsOf(p, p.post).flatMap((h, i) => ANSWERS.filter((a) => a.post === p.post && a.axis === h.hand.axis).map((answer) => ({ answer, shade: i > 0 })));
}

// Ответ совета целиком — для потоков хозяйства: сила ответственного по каждому состоянию, способы ключника и лесничего, тиун на погоде.
export function softenOf(w: World): Soften {
  const A = B.world.answer, harvest = wayShare(wayOf(w, "harvest"), A.harvest), forest = wayShare(wayOf(w, "forest"), A.forest);
  return {
    state: (d, key) => standOf(w, d.post).k * (key === "harvest" ? harvest : key === "forest" ? forest : 1),
    weather: standOf(w, "starosta").k * harvest,
  };
}
// Что мир делает с хозяйством этой партии: с ответом совета.
export const worldModsFor = (w: World) => worldMods(w.world.sim, softenOf(w));
