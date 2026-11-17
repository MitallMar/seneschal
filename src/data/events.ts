import type { GameEvent } from "./types";

// События, которые совет решает без Сенешаля. posts — какие сферы задеты.
// Если сферы две — держатели должностей могут разойтись во мнениях.
export const EVENTS: GameEvent[] = [
  // --- одна сфера ---
  {
    id: "nedoimka", title: "Недоимка", text: "Нижняя деревня не довезла зерно к сроку: град побил поле.", posts: ["starosta"],
    options: [
      { id: "prostit", text: "Простить в этот раз", axes: ["zabota"], effects: { derevni: 2, pripasy: -2 } },
      { id: "vzyskat", text: "Взыскать до последнего мешка", axes: ["dolg", "vygoda"], effects: { derevni: -2, pripasy: 2 } },
      { id: "otrabotka", text: "Заменить отработкой на мельнице", axes: ["obychai", "zabota"], effects: { derevni: 1, zamok: 1 } },
    ],
  },
  {
    id: "svadba", title: "Свадьба в деревне", text: "Просят пиво из замковых запасов на свадьбу сына мельника.", posts: ["klyuchnik"],
    options: [
      { id: "dat", text: "Выкатить бочку", axes: ["zabota", "obychai"], effects: { derevni: 2, pripasy: -1 } },
      { id: "prodat", text: "Продать бочку по сходной цене", axes: ["vygoda"], effects: { kazna: 1, derevni: -1 } },
      { id: "otkazat", text: "Отказать — запасы не для гулянок", axes: ["dolg"], effects: { derevni: -1 } },
    ],
  },
  {
    id: "brakonier", title: "Браконьер", text: "Пойман парень с оленем из заповедной рощи у опушки.", posts: ["lesnichiy"],
    options: [
      { id: "vernut_lesu", text: "Оставить тушу лесу и выпороть", axes: ["obychai", "dolg"], effects: { les: 2, derevni: -1 } },
      { id: "otpustit", text: "Отпустить с мясом — семья голодает", axes: ["zabota"], effects: { derevni: 1, les: -2 } },
      { id: "shtraf", text: "Взять штраф серебром", axes: ["vygoda"], effects: { kazna: 1, les: -1, derevni: -1 } },
    ],
  },
  {
    id: "poshlina", title: "Пошлина", text: "Купец из города просит снизить мостовую пошлину: обещает возить чаще.", posts: ["pisar"],
    options: [
      { id: "snizit", text: "Снизить — пусть ездят", axes: ["derzost", "vygoda"], effects: { kuptsy: 2, kazna: -1 }, risky: true },
      { id: "derzhat", text: "Держать прежнюю — так заведено", axes: ["obychai", "dolg"], effects: { kuptsy: -1, kazna: 1 } },
      { id: "torgovat", text: "Сторговаться на долю с товара", axes: ["vygoda"], effects: { kuptsy: 1, kazna: 1 }, risky: true },
    ],
  },
  {
    id: "drak_v_kabake", title: "Драка у корчмы", text: "Стражник избил сына старосты Верхней деревни. Говорят, было за что.", posts: ["desyatnik"],
    options: [
      { id: "nakazat", text: "Наказать своего при всех", axes: ["dolg", "zabota"], effects: { derevni: 2, zamok: -1 } },
      { id: "prikryt", text: "Прикрыть стражника", axes: ["derzost"], effects: { zamok: 1, derevni: -2 } },
      { id: "vyplata", text: "Откупиться перед семьёй", axes: ["vygoda", "zabota"], effects: { kazna: -1, derevni: 1 } },
    ],
  },
  {
    id: "remont_steny", title: "Трещина в стене", text: "Западная стена дала трещину. Камень есть, рук мало.", posts: ["klyuchnik"],
    options: [
      { id: "sobrat_lyudey", text: "Снять людей с полей на неделю", axes: ["dolg", "derzost"], effects: { zamok: 2, derevni: -1, pripasy: -1 } },
      { id: "nanyat", text: "Нанять каменщиков из города", axes: ["vygoda"], effects: { kazna: -2, zamok: 2 } },
      { id: "podperet", text: "Подпереть и ждать зимы", axes: ["obychai"], effects: { poryadok: -1 } },
    ],
  },
  {
    id: "znamenie", title: "Знамение", text: "У опушки нашли круг из мёртвых ворон. Деревня в страхе.", posts: ["lesnichiy"],
    options: [
      { id: "obryad", text: "Провести старый обряд с хлебом и солью", axes: ["obychai"], effects: { les: 2, derevni: 1, pripasy: -1 } },
      { id: "razvedat", text: "Пойти в лес и разведать самому", axes: ["derzost"], effects: { les: -1, poryadok: 1 }, risky: true },
      { id: "uspokoit", text: "Объявить, что это лиса, и не пугать людей", axes: ["zabota", "dolg"], effects: { derevni: 1, les: -1 } },
    ],
  },
  {
    id: "sborshchik_pismo", title: "Письмо сборщика", text: "Сборщик податей требует опись запасов к весне — с подробностями.", posts: ["pisar"],
    options: [
      { id: "chestno", text: "Дать честную опись", axes: ["dolg"], effects: { dvor: 2, pripasy: -1 } },
      { id: "priukrasit", text: "Занизить запасы в описи", axes: ["vygoda", "derzost"], effects: { pripasy: 1, dvor: -1 }, risky: true },
      { id: "tyanut", text: "Тянуть с ответом, ссылаясь на обычай", axes: ["obychai"], effects: { dvor: -1 } },
    ],
  },
  // --- две сферы ---
  {
    id: "plotina", title: "Плотина", text: "Половодье подмыло плотину у мельницы. Людей хватит на одно дело: плотина или дозоры на дороге.", posts: ["starosta", "desyatnik"],
    options: [
      { id: "plotina", text: "Все на плотину", axes: ["zabota", "obychai"], effects: { derevni: 2, poryadok: -1 } },
      { id: "dozory", text: "Все в дозоры — на дорогах неспокойно", axes: ["dolg", "derzost"], effects: { poryadok: 2, kuptsy: 1, derevni: -1 } },
      { id: "popolam", text: "Поделить людей пополам", axes: ["vygoda"], effects: { derevni: 1, poryadok: 1 } },
    ],
  },
  {
    id: "rubka", title: "Заказ на лес", text: "Купец хочет дубовый лес на корабли. Платит щедро, но рубить придётся у самой опушки.", posts: ["pisar", "lesnichiy"],
    options: [
      { id: "rubit", text: "Рубить — подати сами себя не заплатят", axes: ["vygoda", "derzost"], effects: { kazna: 3, les: -3 } },
      { id: "otkazat", text: "Отказать — у опушки не рубят", axes: ["obychai"], effects: { les: 2, kuptsy: -1 } },
      { id: "malo", text: "Срубить немного сухостоя", axes: ["dolg", "zabota"], effects: { kazna: 1, les: -1 } },
    ],
  },
  {
    id: "zerno_strazhe", title: "Хлеб для стражи", text: "Десятник требует хлеба для дозоров сверх положенного.", posts: ["desyatnik", "klyuchnik"],
    options: [
      { id: "dat", text: "Выдать из запасов", axes: ["dolg", "derzost"], effects: { pripasy: -2, poryadok: 2 } },
      { id: "otkazat", text: "Отказать — зима длинная", axes: ["vygoda", "obychai"], effects: { pripasy: 1, zamok: -1, poryadok: -1 } },
      { id: "s_dereven", text: "Взять с деревень за охрану", axes: ["vygoda"], effects: { derevni: -2, poryadok: 1 } },
    ],
  },
  {
    id: "beglye", title: "Беглые", text: "В деревню пришли беглые с соседских земель. Просятся остаться, но сосед их ищет.", posts: ["starosta", "pisar"],
    options: [
      { id: "prinyat", text: "Принять — руки нужны", axes: ["zabota", "derzost"], effects: { derevni: 2, dvor: -2 } },
      { id: "vydat", text: "Выдать соседу по закону", axes: ["dolg", "obychai"], effects: { dvor: 2, derevni: -1 } },
      { id: "prodat_soseda", text: "Выдать за выкуп", axes: ["vygoda"], effects: { kazna: 2, derevni: -2 } },
    ],
  },
  {
    id: "tropa", title: "Новая тропа", text: "Лесной народ просит закрыть старую дорогу через рощу на месяц: у них праздник.", posts: ["lesnichiy", "desyatnik"],
    options: [
      { id: "zakryt", text: "Закрыть и поставить знаки", axes: ["obychai", "zabota"], effects: { les: 3, kuptsy: -2 } },
      { id: "ne_zakryvat", text: "Дорога наша, не закрывать", axes: ["derzost", "dolg"], effects: { les: -3, kuptsy: 1 } },
      { id: "za_platu", text: "Закрыть, но взять плату дичью", axes: ["vygoda"], effects: { les: 1, pripasy: 1, kuptsy: -1 } },
    ],
  },
  {
    id: "yarmarka", title: "Ярмарка", text: "Можно устроить осеннюю ярмарку в замковом дворе. Деньги будут, суеты тоже.", posts: ["pisar", "klyuchnik"],
    options: [
      { id: "ustroit", text: "Устроить с размахом", axes: ["vygoda", "derzost"], effects: { kazna: 2, kuptsy: 2, poryadok: -1, pripasy: -1 }, risky: true },
      { id: "skromno", text: "Скромно, у ворот", axes: ["dolg", "obychai"], effects: { kazna: 1, kuptsy: 1 } },
      { id: "net", text: "Не устраивать — не до того", axes: ["zabota"], effects: { kuptsy: -1 } },
    ],
  },
  {
    id: "mor", title: "Падёж скота", text: "В Верхней деревне падёж коров. Знахарка говорит — от леса.", posts: ["starosta", "lesnichiy"],
    options: [
      { id: "zhech", text: "Сжечь туши и окурить дворы", axes: ["dolg", "derzost"], effects: { poryadok: 1, derevni: -1 } },
      { id: "dar_lesu", text: "Отнести дар лесу", axes: ["obychai"], effects: { les: 2, pripasy: -1 } },
      { id: "kupit", text: "Купить скот взамен в долг", axes: ["zabota", "vygoda"], effects: { derevni: 2, kazna: -2 } },
    ],
  },
  {
    id: "chelyad", title: "Ссора челяди", text: "Повар и конюхи не поделили каморку. Дело дошло до ножей.", posts: ["klyuchnik", "desyatnik"],
    options: [
      { id: "vygnat", text: "Выгнать зачинщика", axes: ["dolg", "derzost"], effects: { poryadok: 2, zamok: -1 } },
      { id: "pomirit", text: "Помирить и разделить каморку", axes: ["zabota"], effects: { zamok: 1 } },
      { id: "po_starine", text: "Рассудить по старшинству", axes: ["obychai", "dolg"], effects: { zamok: 1, poryadok: 1 } },
    ],
  },
  // --- приключенцы (после открытия лабиринта) ---
  {
    id: "prikl_pyut", title: "Приключенцы гуляют", text: "Отряд перед спуском третий день пьёт в корчме и задирает местных.", posts: ["desyatnik", "starosta"], adventurers: true,
    options: [
      { id: "vydvorit", text: "Выдворить из деревни силой", axes: ["derzost", "dolg"], effects: { derevni: 1, poryadok: 1, kazna: -1 }, risky: true },
      { id: "terpet", text: "Терпеть — они платят серебром", axes: ["vygoda"], effects: { kazna: 2, derevni: -2 } },
      { id: "dogovoritsya", text: "Договориться с их вожаком", axes: ["zabota", "obychai"], effects: { derevni: 1 } },
    ],
  },
  {
    id: "prikl_ranenye", title: "Раненые снизу", text: "Отряд вернулся с двумя тяжелоранеными и требует лекаря и кров.", posts: ["klyuchnik", "lesnichiy"], adventurers: true,
    options: [
      { id: "prinyat", text: "Принять в замок", axes: ["zabota", "dolg"], effects: { pripasy: -1, zamok: -1 } },
      { id: "za_platu", text: "Лечить за долю добычи", axes: ["vygoda"], effects: { kazna: 2 } },
      { id: "otkazat", text: "Отказать — неизвестно, что они принесли снизу", axes: ["obychai", "derzost"], effects: { poryadok: 1 }, risky: true },
    ],
  },
  {
    id: "prikl_veshch", title: "Странная вещь", text: "Приключенцы продают в деревне чёрный камень из лабиринта. Собаки на него воют.", posts: ["pisar", "lesnichiy"], adventurers: true,
    options: [
      { id: "kupit", text: "Купить для замка", axes: ["vygoda", "derzost"], effects: { kazna: -1, les: -2 }, risky: true },
      { id: "zapretit", text: "Запретить торговлю такими вещами", axes: ["obychai", "dolg"], effects: { les: 2, kuptsy: -1 } },
      { id: "poshlina", text: "Обложить пошлиной", axes: ["vygoda", "dolg"], effects: { kazna: 1 } },
    ],
  },
  {
    id: "prikl_tvar", title: "Увязалась тварь", text: "За отрядом снизу кто-то пришёл: ночью задрали овец у Нижней деревни.", posts: ["desyatnik", "lesnichiy"], adventurers: true,
    options: [
      { id: "oblava", text: "Облава всей стражей", axes: ["derzost", "dolg"], effects: { poryadok: 2, les: -1 }, risky: true },
      { id: "prikl_platyat", text: "Заставить отряд самому её выследить", axes: ["dolg", "vygoda"], effects: { poryadok: 1 } },
      { id: "les_razberetsya", text: "Ждать — лес сам разберётся с чужаком", axes: ["obychai"], effects: { derevni: -2, les: 1 } },
    ],
  },
];
