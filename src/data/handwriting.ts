// Почерк: как склонность человека меняет сферу его должности (замысел — docs/design/lyudi-i-ishody.md, 2.2). 25 клеток: каждая склонность на каждой должности.
// plus и minus — рычаги хозяйства со знаком и долей силы; что рычаг значит и сколько весит единица — src/sim/economy.ts (levers) и ручки economy.hand.
// Родная склонность должности — плюс сильнее минуса, чужая — минус не слабее плюса: это считает логика, здесь только направления.
import type { Axis, PostId } from "./types";

export type Lever =
  | "quitrent" | "quitrentSilver" | "harvest" | "hands" | "forestFood" | "forestGoods" | "duties" | "salary" | "spoil" | "upkeep" | "price" | "shortSoft"
  | "villages" | "opushka" | "zamok" | "kuptsy" | "les" | "dvor" | "order" | "silver" | "sellFood" | "loan" | "patience";
export const LEVERS: Lever[] = [
  "quitrent", "quitrentSilver", "harvest", "hands", "forestFood", "forestGoods", "duties", "salary", "spoil", "upkeep", "price", "shortSoft",
  "villages", "opushka", "zamok", "kuptsy", "les", "dvor", "order", "silver", "sellFood", "loan", "patience",
];
export type Pull = [Lever, number];
export interface Hand { post: PostId; axis: Axis; plus: Pull[]; minus: Pull[]; good: string; bad: string }

const h = (post: PostId, axis: Axis, good: string, plus: Pull[], bad: string, minus: Pull[]): Hand => ({ post, axis, plus, minus, good, bad });

export const HANDS: Hand[] = [
  // тиун
  h("starosta", "zabota", "доверие деревень растёт, недодача деревням мягче", [["villages", 1], ["shortSoft", -1]], "оброк меньше", [["quitrent", -1]]),
  h("starosta", "obychai", "обряды держатся: дары леса полнее, опушка доверяет", [["forestFood", 1], ["opushka", 1]], "урожай не растёт", [["harvest", -0.5]]),
  h("starosta", "dolg", "оброк собран сполна", [["quitrent", 1]], "деревни ворчат", [["villages", -1]]),
  h("starosta", "vygoda", "оброк серебром больше", [["quitrentSilver", 1]], "доверие деревень падает", [["villages", -1]]),
  h("starosta", "derzost", "распахивает новые поля: урожай больше", [["harvest", 1]], "руки уходят на расчистку", [["hands", -1]]),
  // десятник
  h("desyatnik", "dolg", "порядок растёт", [["order", 1]], "жалованье страже дороже", [["salary", 1]]),
  h("desyatnik", "derzost", "пошлины и караваны больше", [["duties", 1]], "стычки: порядок ниже, бывают раненые", [["order", -1], ["hands", -0.5]]),
  h("desyatnik", "zabota", "люди замка довольны", [["zamok", 1]], "порядок ниже", [["order", -1]]),
  h("desyatnik", "vygoda", "«дорожный сбор»: серебро в казну", [["silver", 1]], "купцы недовольны, порядок ниже", [["kuptsy", -1], ["order", -0.5]]),
  h("desyatnik", "obychai", "старые засеки и межи: лес доверяет", [["les", 1]], "старые льготы: пошлины меньше", [["duties", -1]]),
  // ключник
  h("klyuchnik", "dolg", "порча за зиму меньше", [["spoil", -1]], "челядь держат строго: люди замка ворчат", [["zamok", -1]]),
  h("klyuchnik", "vygoda", "излишек еды продаёт сам: серебро растёт", [["sellFood", 1]], "запас тоньше: недодача ближе", []),
  h("klyuchnik", "zabota", "прокорм щедрее: люди замка и деревни довольны", [["zamok", 1], ["villages", 0.5]], "еды уходит больше", [["upkeep", 1]]),
  h("klyuchnik", "derzost", "починка идёт быстро: люди замка довольны", [["zamok", 1]], "порча и несчастья на стройке", [["spoil", 1]]),
  h("klyuchnik", "obychai", "запас впрок по старым погребам: прокорм и порча меньше", [["upkeep", -0.5], ["spoil", -0.5]], "ничего не продаёт: товары идут дешевле", [["price", -1]]),
  // писарь
  h("pisar", "vygoda", "цена товаров и пошлины выше", [["price", 1], ["duties", 1]], "купцы доверяют меньше", [["kuptsy", -1]]),
  h("pisar", "dolg", "книги чисты: двор доволен", [["dvor", 1]], "торговля медленнее: цена ниже", [["price", -1]]),
  h("pisar", "derzost", "заём дешевле и больше", [["loan", 1]], "долги растут: серебро утекает на проценты", [["silver", -1]]),
  h("pisar", "zabota", "торгует мягко: купцы довольны", [["kuptsy", 1]], "цена ниже", [["price", -1]]),
  h("pisar", "obychai", "старые грамоты: Герцог терпеливее", [["patience", 1]], "новых сделок нет: пошлины ниже", [["duties", -1]]),
  // лесничий
  h("lesnichiy", "obychai", "лес доверяет, дары леса больше", [["les", 1], ["forestFood", 1]], "брёвен и шкур меньше", [["forestGoods", -1]]),
  h("lesnichiy", "zabota", "деревня у опушки довольна", [["opushka", 1]], "лес терпит браконьеров: его доверие падает", [["les", -1]]),
  h("lesnichiy", "dolg", "рощи стережёт строго: лес доверяет", [["les", 1]], "опушка недовольна", [["opushka", -1]]),
  h("lesnichiy", "vygoda", "товаров из леса больше", [["forestGoods", 1]], "лес доверяет меньше", [["les", -1]]),
  h("lesnichiy", "derzost", "ходит вглубь: товаров больше", [["forestGoods", 1]], "твари и раненые", [["hands", -0.5], ["les", -0.5]]),
];
