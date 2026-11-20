// Способы ответа на беду (задача И21, замысел — docs/design/lyudi-i-ishody.md, раздел 7): почерк ответственной должности.
// У сильной склонности держателя — свой способ встретить беду или указ, и у каждого способа есть цена. Правила — src/sim/world/answer.ts,
// числа — ручки world.answer. Игрок видит способ, только когда склонность человека ему известна, — как почерк в И17.
import type { Answer } from "./types";

export const ANSWERS: Answer[] = [
  { post: "starosta", axis: "zabota", kind: "villages", name: "Деревни не обирает", good: "беды бьют по доверию деревень вдвое слабее", price: "кормит пострадавших из амбара" },
  { post: "desyatnik", axis: "dolg", kind: "castleRecruits", name: "Набор стражей", good: "указ о людях совет закрывает стражей и челядью, а не деревенскими", price: "порядок и люди замка" },
  { post: "pisar", axis: "vygoda", kind: "decreeSize", name: "Откуп у двора", good: "выторговывает указ поменьше", price: "двор недоволен торгом" },
  { post: "pisar", axis: "obychai", kind: "decreeTerm", name: "По старым грамотам", good: "находит в грамотах отсрочку: у указа сезон сверху", price: "двор ворчит на крючкотворство" },
  { post: "klyuchnik", axis: "obychai", kind: "harvest", name: "Запас впрок", good: "недород бьёт по амбару слабее", price: "закупает впрок за серебро" },
  { post: "lesnichiy", axis: "obychai", kind: "forest", name: "Обряды у межи", good: "беды леса мягче", price: "дары лесу из амбара" },
];
