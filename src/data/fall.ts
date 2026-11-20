// Кризисы сторон и падение «под чужой рукой» (задача И14, замысел — docs/design/hozyaystvo.md, разделы 9–10): тяжёлые события сторон,
// их выходы и шрамы, новый барон, его свита и внеочередной сбор. Правила — src/sim/fall/, числа — раздел fall в src/sim/balance.ts.
import type { Category, GameEvent, Side } from "./types";

// Стороны, у которых бывает кризис. Лес и двор отложены до И11б (решение автора 20.11.2026).
export const CRISIS_SIDES: Side[] = ["brod", "opushka", "kuptsy", "zamok"];

// Выход из кризиса: насколько тяжёл шрам и что выход значит сверх обычных последствий события.
// scar: light — шрам короче (ручка fall.scarLight). authority — что выход делает с авторитетом Сенешаля. dutyCut — пошлины год ниже.
export interface CrisisExit { scar: "light" | "full"; authority?: number; dutyCut?: boolean }
// Кризис стороны: событие решает совет (или приказ Сенешаля), как любое дело сезона. scar — шрам словами.
export interface CrisisDef { side: Side; scar: string; event: GameEvent; exits: Record<string, CrisisExit> }

const village = (side: "brod" | "opushka", name: string): CrisisDef => ({
  side, scar: "опустевшие дворы: меньше рук, урожая и оброка, пока дворы не заселят",
  event: {
    id: `krizis_${side}`, title: `Кризис: ${name} поднялась`, tags: [], posts: ["starosta", "desyatnik"], village: side,
    text: `${name} третий сезон не даёт ни рук, ни оброка. Теперь дворы снимаются с места, а у околицы стоят мужики с вилами.`,
    options: [
      { id: "ustupit", text: "Уступить: снять недоимки и снизить оброк", axes: ["zabota"], effects: { derevni: 6, kazna: -1.5 } },
      { id: "podavit", text: "Подавить силой", axes: ["dolg", "derzost"], effects: { derevni: -2, poryadok: 4, zamok: -1 }, hands: 1 },
      { id: "starosta", text: "Договориться через выборного старосту", axes: ["obychai"], effects: { derevni: 4 } },
    ],
  },
  exits: { ustupit: { scar: "light" }, podavit: { scar: "full" }, starosta: { scar: "light", authority: -1.5 } },
});

export const CRISES: CrisisDef[] = [
  village("brod", "Деревня у брода"),
  village("opushka", "Деревня у опушки"),
  {
    side: "kuptsy", scar: "купцы обходят баронство: пошлин и цены за товары меньше",
    event: {
      id: "krizis_kuptsy", title: "Кризис: купцы обходят баронство", tags: [], posts: ["pisar", "klyuchnik"],
      text: "Гильдия третий сезон не шлёт обозов. Теперь купцы проложили путь в обход: брод пуст, товары лежат на складе.",
      options: [
        { id: "dogovor", text: "Новый договор с гильдией: уступить в пошлинах", axes: ["vygoda"], effects: { kuptsy: 6 } },
        { id: "oboz", text: "Снарядить свой обоз в город", axes: ["derzost"], effects: { kuptsy: 2, kazna: -1 }, hands: 1, risky: true },
        { id: "sosed", text: "Найти других купцов через соседа", axes: ["obychai", "zabota"], effects: { kuptsy: 4, dvor: -1, kazna: -0.5 } },
      ],
    },
    exits: { dogovor: { scar: "light", dutyCut: true }, oboz: { scar: "full" }, sosed: { scar: "light" } },
  },
  {
    side: "zamok", scar: "пустые места в страже и челяди: рук меньше, новички без опыта",
    event: {
      id: "krizis_zamok", title: "Кризис: люди замка уходят со службы", tags: [], posts: ["desyatnik", "klyuchnik"],
      text: "Стража и челядь третий сезон работают спустя рукава. Теперь уходят целыми семьями: в воротах стоять некому.",
      options: [
        { id: "zhalovanye", text: "Поднять жалованье", axes: ["zabota", "vygoda"], effects: { zamok: 6, kazna: -2 } },
        { id: "slovo", text: "Говорить с людьми от имени Сенешаля", axes: ["dolg"], effects: { zamok: 4 } },
        { id: "nabor", text: "Набрать новых из деревень", axes: ["derzost"], effects: { zamok: 2, derevni: -2 } },
      ],
    },
    exits: { zhalovanye: { scar: "light" }, slovo: { scar: "light", authority: -1.5 }, nabor: { scar: "full" } },
  },
];
export const CRISIS_EVENTS: GameEvent[] = CRISES.map((c) => c.event);

// Внеочередной сбор: проситель выбил его при дворе. Закрывается теми же способами, что подать и указы; не закрыт к сроку — падение.
export const LEVY: { id: string; title: string; text: string; accepts: Category[] } = {
  id: "sbor", title: "Внеочередной сбор", accepts: ["serebro", "eda", "tovary"],
  text: "Проситель выбил при дворе внеочередной сбор с баронства: Герцог хочет видеть, что земля ещё платит. Не закрыть к сроку — баронство отдадут другому.",
};

// Новый барон. Первый — проситель: соседний род своего добился. Если проситель уже пал (опозорен) — человек двора.
export interface BaronEntry { id: string; name: string; female: boolean; age: number; who: string }
export const BARONS: BaronEntry[] = [
  { id: "prositel", name: "Ратша", female: false, age: 44, who: "проситель из соседнего рода" },
  { id: "dvor", name: "Доброгнева", female: true, age: 51, who: "человек двора" },
];

// Свита барона: пришлые, которых он ставит на должности. Черты — id из TRAITS.
export interface RetinueEntry { name: string; female: boolean; age: number; trait: string }
export const RETINUE: RetinueEntry[] = [
  { name: "Жирослав", female: false, age: 39, trait: "skupoy" },
  { name: "Малуша", female: true, age: 33, trait: "khitry" },
  { name: "Вышата", female: false, age: 47, trait: "upryamy" },
  { name: "Горислава", female: true, age: 42, trait: "chestolyubivy" },
  { name: "Путята", female: false, age: 29, trait: "goryachiy" },
  { name: "Звенислава", female: true, age: 55, trait: "ostorozhny" },
];

// Как барон пал: путь двора (подать и указы), путь земли (кризисы сторон), броня (лес выжил его сам), прыжок (остаток забрал конец акта).
export type FallPath = "dvor" | "zemlya";
export type BackHow = FallPath | "bronya";
export const BACK_NAMES: Record<BackHow, string> = {
  dvor: "Герцог снял его: не справился с податью",
  zemlya: "земля его не приняла: стороны отказали ему",
  bronya: "лес выжил его сам",
};
