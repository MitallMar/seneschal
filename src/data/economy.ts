// Данные хозяйства (задача И12, замысел — docs/design/hozyaystvo.md): стороны, категории, курсы, старосты деревень, способы платить подать.
// Правила — src/sim/economy.ts, числа — раздел economy в src/sim/balance.ts.
import type { Side, Village, Category, Stock, HandsFrom, CourseDef, ElderEntry, PayDef } from "./types";

export const SIDES: Side[] = ["brod", "opushka", "les", "kuptsy", "zamok", "dvor"];
export const VILLAGES: Village[] = ["brod", "opushka"];

export const SIDE_NAMES: Record<Side, string> = {
  brod: "Деревня у брода",
  opushka: "Деревня у опушки",
  les: "Лес",
  kuptsy: "Купцы",
  zamok: "Люди замка",
  dvor: "Двор",
};
// Что сторона даёт хозяйству — подсказка на экране.
export const SIDE_GIVES: Record<Side, string> = {
  brod: "урожай, больше оброка серебром и товарами, руки, рекруты",
  opushka: "урожай, оброк, руки, рекруты; держит обряды — без неё дары леса вдвое меньше",
  les: "дары леса (еда летом), товары; откажет — потравы и твари",
  kuptsy: "пошлины, покупают товары, дают в долг",
  zamok: "руки челяди и стражи",
  dvor: "ничего вещественного: от двора зависит, как быстро Герцог теряет терпение",
};

export const CATEGORIES: Category[] = ["lyudi", "eda", "tovary", "serebro"];
export const STOCKS: Stock[] = ["eda", "tovary", "serebro"];
export const CATEGORY_NAMES: Record<Category, string> = { lyudi: "Люди", eda: "Еда", tovary: "Товары", serebro: "Серебро" };
// Единица для игрока: «3 руки», «2 воза».
export const CATEGORY_UNIT: Record<Category, string> = { lyudi: "рук", eda: "сезонов прокорма", tovary: "возов", serebro: "кошелей" };
export const HANDS_FROM: HandsFrom[] = ["brod", "opushka", "zamok"];

export const SEASON_NAMES = ["весна", "лето", "осень", "зима"];

export const COURSES: CourseDef[] = [
  { id: "kopim", name: "Копим к подати", desc: "оброк с деревень больше, совет тратит меньше; деревни ворчат", pro: ["vygoda", "dolg"], contra: ["zabota"] },
  { id: "polegche", name: "Людям полегче", desc: "оброк меньше, доверие деревень растёт", pro: ["zabota"], contra: ["vygoda", "dolg"] },
  { id: "dorogi", name: "Порядок на дорогах", desc: "пошлины растут, жалованье страже дороже, порядка больше", pro: ["dolg", "derzost"], contra: ["vygoda"] },
  { id: "les", name: "Бережём лес", desc: "даров леса больше, брёвен на продажу нет, лес доверяет", pro: ["obychai"], contra: ["derzost", "vygoda"] },
  { id: "stroimsya", name: "Строимся", desc: "рука с полей уходит на стройку и починку: еда портится меньше, люди замка довольны, деревни — нет", pro: [], contra: ["zabota"] },
  { id: "torguem", name: "Торгуем", desc: "товары продаются дороже, продают и излишек еды сверх нижней черты", pro: ["vygoda", "derzost"], contra: ["obychai"] },
];

// Выборные старосты деревень: лица сторон. Их отношения с тиуном сдвигают доверие деревни.
export const ELDERS: ElderEntry[] = [
  { side: "brod", name: "Гостята", female: false, age: 47, trait: "skupoy" },
  { side: "opushka", name: "Досада", female: true, age: 63, trait: "nabozhny" },
];

// Способы закрыть долю подати: «чем» и «с кого». Курсы и пределы — ручки economy.rate и economy.pay.
export const PAY: PayDef[] = [
  { id: "serebro", name: "Серебром из казны", what: "serebro", from: "казна", hurts: "казне" },
  { id: "sbor_kuptsy", name: "Особый сбор с купцов", what: "serebro", from: "купцы", hurts: "купцам: доверие падает, пошлины год ниже", side: "kuptsy" },
  { id: "zaem", name: "Заём у купцов", what: "serebro", from: "купцы, в долг", hurts: "будущей казне: вернуть с лихвой через год", side: "kuptsy" },
  { id: "eda", name: "Зерном из амбара", what: "eda", from: "амбар", hurts: "амбару перед зимой" },
  { id: "sverh_brod", name: "Зерном сверх оброка: деревня у брода", what: "eda", from: "деревня у брода", hurts: "деревне у брода: доверие падает", side: "brod" },
  { id: "sverh_opushka", name: "Зерном сверх оброка: деревня у опушки", what: "eda", from: "деревня у опушки", hurts: "деревне у опушки: доверие падает", side: "opushka" },
  { id: "rekruty_brod", name: "Рекрутами: деревня у брода", what: "lyudi", from: "деревня у брода", hurts: "деревне у брода: доверие падает, год меньше рук", side: "brod" },
  { id: "rekruty_opushka", name: "Рекрутами: деревня у опушки", what: "lyudi", from: "деревня у опушки", hurts: "деревне у опушки: доверие падает, год меньше рук", side: "opushka" },
  { id: "rekruty_zamok", name: "Рекрутами: люди замка", what: "lyudi", from: "стража и челядь", hurts: "порядку и людям замка, год меньше рук", side: "zamok" },
  { id: "volnye", name: "Вольными и бродягами из корчмы", what: "lyudi", from: "корчма", hurts: "терпению Герцога: двор берёт сброд неохотно; порядок даже растёт" },
  { id: "tovary", name: "Товарами со склада", what: "tovary", from: "склад", hurts: "никому, кроме упущенной продажи" },
];
