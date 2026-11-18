import type { Axis, PostId, Faction, Resource, Trait, Mark, AspirationDef, RosterEntry } from "./types";

export const AXES: Axis[] = ["dolg", "vygoda", "zabota", "derzost", "obychai"];

export const AXIS_NAMES: Record<Axis, string> = {
  dolg: "Долг",
  vygoda: "Выгода",
  zabota: "Забота",
  derzost: "Дерзость",
  obychai: "Обычай",
};

// Дательный падеж: «по Долгу», «к Обычаю»
export const AXIS_DAT: Record<Axis, string> = {
  dolg: "Долгу",
  vygoda: "Выгоде",
  zabota: "Заботе",
  derzost: "Дерзости",
  obychai: "Обычаю",
};

// Пары осей, которые дают трение между людьми
export const OPPOSED: [Axis, Axis][] = [
  ["zabota", "vygoda"],
  ["obychai", "derzost"],
  ["dolg", "derzost"],
];

// into — «годится в …»: куда ставят
export const POSTS: { id: PostId; name: string; into: string; sphere: string; axes: Axis[] }[] = [
  { id: "starosta", name: "Староста", into: "старосты", sphere: "деревни, поля, крестьяне", axes: ["zabota", "obychai"] },
  { id: "desyatnik", name: "Десятник", into: "десятники", sphere: "стража, дороги, караваны", axes: ["dolg", "derzost"] },
  { id: "klyuchnik", name: "Ключник", into: "ключники", sphere: "замок, припасы, челядь, стройка", axes: ["dolg", "vygoda"] },
  { id: "pisar", name: "Писарь-казначей", into: "писари", sphere: "деньги, торговля, бумаги, двор", axes: ["vygoda", "dolg"] },
  { id: "lesnichiy", name: "Лесничий", into: "лесничие", sphere: "опушка, лес, лесной народ", axes: ["obychai", "zabota"] },
];

export const FACTION_NAMES: Record<Faction, string> = {
  derevni: "Деревни",
  les: "Лес",
  kuptsy: "Купцы",
  zamok: "Люди замка",
  dvor: "Двор",
};

export const RESOURCE_NAMES: Record<Resource, string> = {
  kazna: "Казна",
  pripasy: "Припасы",
  poryadok: "Порядок",
};

export const TRAITS: Trait[] = [
  { id: "upryamy", name: "Упрямый", desc: "Плохо слушает чужие приказы", star: { dolg: 1 }, mods: { obedience: -2, grudge: 1.3 } },
  { id: "nabozhny", name: "Набожный", desc: "Чтит приметы и старые правила", star: { obychai: 3 }, mods: {} },
  { id: "skupoy", name: "Скупой", desc: "Считает каждую монету", star: { vygoda: 3, zabota: -1 }, mods: {} },
  { id: "goryachiy", name: "Горячий", desc: "Решает быстро и не всегда предсказуемо", star: { derzost: 3 }, mods: { random: 1.5, softness: -1 } },
  { id: "myagkiy", name: "Мягкий", desc: "Не любит ссор, ищет середину", star: { zabota: 2 }, mods: { softness: 2, grudge: 0.6 } },
  { id: "chestolyubivy", name: "Честолюбивый", desc: "Хочет большего и помнит, кто мешал", star: { derzost: 1, vygoda: 1 }, mods: { ambition: 2, grudge: 1.2 } },
  { id: "zlopamyatny", name: "Злопамятный", desc: "Обиды не забывает", star: {}, mods: { grudge: 1.8 }, hidden: true, revealedBy: "sabotage" },
  { id: "verny", name: "Верный", desc: "Предан Сенешалю", star: { dolg: 2 }, mods: { obedience: 2, loyalty: 3 } },
  { id: "khitry", name: "Хитрый", desc: "Своего добивается обходными путями", star: { vygoda: 2 }, mods: { softness: 1, random: 0.5, sly: 1 }, hidden: true, revealedBy: "bypass" },
  { id: "ostorozhny", name: "Осторожный", desc: "Семь раз отмерит", star: { derzost: -3, obychai: 1 }, mods: { random: -0.5 } },
];

// Черты, которые человек приобретает по ходу жизни (правила и пороги — sim.ts, раздел «Черты в течение жизни», и balance.ts, раздел traits).
// Привычка: по одной черте на ось, lean тянет решения к этой оси. Перелом: star — резкий сдвиг звезды в момент перелома.
export const LIFE_TRAITS: Trait[] = [
  { id: "sluzhaka", name: "Служака", desc: "Привык делать как положено", source: "habit", axis: "dolg", star: {}, lean: { dolg: 1 }, mods: { obedience: 1 } },
  { id: "prizhimisty", name: "Прижимистый", desc: "Привык во всём искать выгоду", source: "habit", axis: "vygoda", star: {}, lean: { vygoda: 1 }, mods: {} },
  { id: "serdobolny", name: "Сердобольный", desc: "Привык жалеть людей", source: "habit", axis: "zabota", star: {}, lean: { zabota: 1 }, mods: { softness: 1 } },
  { id: "riskovy", name: "Рисковый", desc: "Привык идти напролом", source: "habit", axis: "derzost", star: {}, lean: { derzost: 1 }, mods: { random: 0.5 } },
  { id: "starover", name: "Чтит старину", desc: "Привык держаться старых правил", source: "habit", axis: "obychai", star: {}, lean: { obychai: 1 }, mods: { random: -0.3 } },
  { id: "master_dela", name: "Мастер своего дела", desc: "Дошёл до потолка опыта: дело спорится, ошибок меньше", source: "post", star: {}, mods: { skill: 0.1, random: -0.3 } },
  { id: "obros_svyazyami", name: "Оброс связями", desc: "Засиделся: свои люди повсюду, в споре его трудно сдвинуть, наказы слушает хуже", source: "post", star: {}, mods: { clout: 2, obedience: -1 } },
  { id: "ustal_ot_sluzhby", name: "Устал от службы", desc: "Слишком долго на должности, которой не хотел: тянет лямку", source: "post", star: {}, mods: { skill: -0.1, softness: 1 } },
  { id: "zlopamyatny_k", name: "Злопамятный к", desc: "Помнит саботаж и не уступит этому человеку", source: "rel", targeted: true, star: {}, mods: { grudge: 1.8, softness: -2 } },
  { id: "ozhestochilsya", name: "Ожесточился", desc: "Перелом: жалости стало меньше, спорит жёстче", source: "break", star: { zabota: -3, derzost: 2 }, mods: { softness: -1, grudge: 1.3 } },
  { id: "stal_nabozhen", name: "Стал набожен", desc: "Перелом: ищет опору в старых правилах", source: "break", star: { obychai: 3, derzost: -1 }, mods: { random: -0.3 } },
];

export const MARKS: Mark[] = [
  { id: "slyshit_les", name: "Слышит лес", desc: "Чует настроение леса, но лабиринт её пугает", star: { obychai: 2 }, goodPost: "lesnichiy" },
  { id: "tyanet_vniz", name: "Тянет вниз", desc: "Незаменим у лабиринта, лес его не терпит", star: { derzost: 2 }, badPost: "lesnichiy" },
  { id: "ne_mozhet_lgat", name: "Не может солгать", desc: "Ему верят все, но хитрить через него нельзя", star: { dolg: 2, vygoda: -1 }, goodPost: "pisar" },
  { id: "tyazhelaya_ruka", name: "Тяжёлая рука", desc: "Сила сверх меры — пугает и своих", star: { derzost: 1 }, goodPost: "desyatnik", badPost: "starosta" },
];

export const ASPIRATIONS: AspirationDef[] = [
  { id: "post_starosta", text: "хочет быть старостой", post: "starosta" },
  { id: "post_desyatnik", text: "хочет командовать стражей", post: "desyatnik" },
  { id: "post_klyuchnik", text: "хочет держать ключи замка", post: "klyuchnik" },
  { id: "post_pisar", text: "хочет вести книги и казну", post: "pisar" },
  { id: "post_lesnichiy", text: "хочет быть лесничим", post: "lesnichiy" },
  { id: "nadel", text: "хочет свой надел земли" },
  { id: "gorod", text: "мечтает уехать в город" },
  { id: "labirint", text: "хочет спуститься в лабиринт" },
  { id: "pokoy", text: "хочет покоя и чтобы его не трогали" },
];

// Ключевые персонажи хозяйства: черта и метка — авторские, звезда прогоняется в границах.
export const ROSTER: RosterEntry[] = [
  { name: "Остап", female: false, age: 52, trait: "upryamy", mark: "tyazhelaya_ruka" },
  { name: "Ведана", female: true, age: 61, trait: "nabozhny", mark: "slyshit_les", bounds: { obychai: [5, 10] } },
  { name: "Радим", female: false, age: 34, trait: "chestolyubivy" },
  { name: "Милица", female: true, age: 45, trait: "skupoy" },
  { name: "Тихон", female: false, age: 58, trait: "myagkiy" },
  { name: "Злата", female: true, age: 27, trait: "goryachiy", mark: "tyanet_vniz" },
  { name: "Неждан", female: false, age: 40, trait: "khitry" },
  { name: "Любава", female: true, age: 38, trait: "verny" },
  { name: "Ярема", female: false, age: 23, trait: "zlopamyatny", mark: "ne_mozhet_lgat" },
  { name: "Всеслава", female: true, age: 49, trait: "ostorozhny" },
];
