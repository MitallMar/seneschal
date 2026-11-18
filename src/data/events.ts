import type { GameEvent } from "./types";

// События, которые совет решает без Сенешаля. posts — какие сферы задеты.
// Если сферы две — держатели должностей могут разойтись во мнениях.
export const EVENTS: GameEvent[] = [
  // --- одна сфера ---
  {
    id: "nedoimka", title: "Недоимка", text: "Нижняя деревня не довезла зерно к сроку: град побил поле.", posts: ["starosta"],
    options: [
      { id: "prostit", text: "Простить в этот раз", axes: ["zabota"], effects: { derevni: 2, pripasy: -2 } },
      { id: "vzyskat", text: "Взыскать до последнего мешка", axes: ["dolg"], effects: { derevni: -2, pripasy: 2 } },
      { id: "otrabotka", text: "Заменить отработкой на мельнице", axes: ["obychai", "zabota"], effects: { zamok: 1, derevni: 1, dvor: -1 } },
    ],
  },
  {
    id: "svadba", title: "Свадьба в деревне", text: "Просят пиво из замковых запасов на свадьбу сына мельника.", posts: ["klyuchnik"],
    options: [
      { id: "dat", text: "Выкатить бочку", axes: ["zabota"], effects: { derevni: 2, pripasy: -1 } },
      { id: "prodat", text: "Продать бочку по сходной цене", axes: ["vygoda"], effects: { kazna: 1, derevni: -1 } },
      { id: "otkazat", text: "Отказать — запасы не для гулянок", axes: ["dolg"], effects: { derevni: -1 } },
    ],
  },
  {
    id: "brakonier", title: "Браконьер", text: "Пойман парень с оленем из заповедной рощи у опушки.", posts: ["lesnichiy"],
    options: [
      { id: "vernut_lesu", text: "Оставить тушу лесу и выпороть", axes: ["obychai"], effects: { les: 1, derevni: -1 } },
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
      { id: "nakazat", text: "Наказать своего при всех", axes: ["dolg"], effects: { derevni: 2, zamok: -1 } },
      { id: "prikryt", text: "Прикрыть стражника", axes: ["derzost"], effects: { zamok: 1, derevni: -2 } },
      { id: "vyplata", text: "Откупиться перед семьёй", axes: ["zabota"], effects: { kazna: -1, derevni: 1 } },
    ],
  },
  {
    id: "remont_steny", title: "Трещина в стене", text: "Западная стена дала трещину. Камень есть, рук мало.", posts: ["klyuchnik"],
    options: [
      { id: "sobrat_lyudey", text: "Снять людей с полей на неделю", axes: ["dolg", "derzost"], effects: { zamok: 2, derevni: -1, pripasy: -1 } },
      { id: "nanyat", text: "Нанять каменщиков из города", axes: ["vygoda"], effects: { kazna: -2, zamok: 2 } },
      { id: "podperet", text: "Подпереть и ждать зимы", axes: ["obychai"], effects: { pripasy: 1, poryadok: -1 } },
    ],
  },
  {
    id: "znamenie", title: "Знамение", text: "У опушки нашли круг из мёртвых ворон. Деревня в страхе.", posts: ["lesnichiy"],
    options: [
      { id: "obryad", text: "Провести старый обряд с хлебом и солью", axes: ["obychai"], effects: { derevni: 2, pripasy: -1 } },
      { id: "razvedat", text: "Пойти в лес и разведать самому", axes: ["derzost"], effects: { les: -1, poryadok: 1 }, risky: true },
      { id: "uspokoit", text: "Объявить, что это лиса, и не пугать людей", axes: ["zabota"], effects: { derevni: 1, les: -1 } },
    ],
  },
  {
    id: "sborshchik_pismo", title: "Письмо сборщика", text: "Сборщик податей требует опись запасов к весне — с подробностями.", posts: ["pisar"],
    options: [
      { id: "chestno", text: "Дать честную опись", axes: ["dolg"], effects: { dvor: 2, pripasy: -1 } },
      { id: "priukrasit", text: "Занизить запасы в описи", axes: ["vygoda", "derzost"], effects: { pripasy: 1, dvor: -1 }, risky: true },
      { id: "tyanut", text: "Тянуть с ответом, ссылаясь на обычай", axes: ["obychai"], effects: { kazna: 1, dvor: -1 } },
    ],
  },
  {
    id: "mezha", title: "Спор о меже", text: "Две семьи в Нижней деревне не поделили полосу у ручья. Дошло до кольев.", posts: ["starosta"],
    options: [
      { id: "po_kamnyam", text: "Рассудить по старым межевым камням, как деды клали", axes: ["obychai"], effects: { derevni: 1, dvor: -1 } },
      { id: "po_knige", text: "Перемерить по писцовой книге", axes: ["dolg"], effects: { dvor: 1, derevni: -1 } },
      { id: "porovnu", text: "Поделить спорную полосу поровну", axes: ["zabota"], effects: { derevni: 1, poryadok: -1 } },
    ],
  },
  {
    id: "pokos", title: "Покос", text: "Сенокос совпал с замковой барщиной: погода стоит три дня, не больше.", posts: ["starosta"],
    options: [
      { id: "otpustit", text: "Отпустить людей на свой покос", axes: ["zabota"], effects: { derevni: 2, zamok: -1 } },
      { id: "barshchina", text: "Барщина прежде всего", axes: ["dolg"], effects: { pripasy: 2, derevni: -2 } },
      { id: "kak_zavedeno", text: "Как заведено: день себе, день замку", axes: ["obychai"], effects: { derevni: 1, zamok: -1 } },
    ],
  },
  {
    id: "dozor_spit", title: "Спящий дозорный", text: "Дозорного нашли спящим на северной башне. Третью ночь он стоял без смены.", posts: ["desyatnik"],
    options: [
      { id: "vysech", text: "Высечь по уставу", axes: ["dolg"], effects: { poryadok: 2, zamok: -1 } },
      { id: "na_opushku", text: "Послать его одного в ночной дозор на опушку", axes: ["derzost"], effects: { poryadok: 1, les: -1 }, risky: true },
      { id: "prostit", text: "Простить и дать выспаться", axes: ["zabota"], effects: { zamok: 1, poryadok: -1 } },
    ],
  },
  {
    id: "razboyniki", title: "Разбойники на тракте", text: "На тракте за бродом грабят обозы. Стоянку их видели в овраге.", posts: ["desyatnik"],
    options: [
      { id: "udarit", text: "Ударить по стоянке ночью", axes: ["derzost"], effects: { poryadok: 2, kuptsy: 1, zamok: -1 }, risky: true },
      { id: "dozory", text: "Усилить дозоры у брода и ждать", axes: ["dolg"], effects: { poryadok: 1, kuptsy: -1 } },
      { id: "plata", text: "Провожать обозы за плату", axes: ["vygoda"], effects: { kazna: 1, kuptsy: -1 } },
    ],
  },
  {
    id: "krysy", title: "Крысы в амбаре", text: "В дальнем амбаре крысы попортили зерно. Сколько — пока никто не считал.", posts: ["klyuchnik"],
    options: [
      { id: "perebrat", text: "Перебрать зерно всей челядью", axes: ["dolg"], effects: { pripasy: 1, zamok: -1 } },
      { id: "sbyt", text: "Сбыть подпорченное купцам, пока не видно", axes: ["vygoda"], effects: { kazna: 1, kuptsy: -1 }, risky: true },
      { id: "razdat", text: "Раздать подпорченное бедным дворам на корм скоту", axes: ["zabota"], effects: { derevni: 1, pripasy: -1 } },
    ],
  },
  {
    id: "tyoploe", title: "Зима и челядь", text: "Морозы пришли рано. Челядь просит тёплое из замковых кладовых.", posts: ["klyuchnik"],
    options: [
      { id: "vydat", text: "Выдать всем, кто просит", axes: ["zabota"], effects: { zamok: 2, pripasy: -1 } },
      { id: "v_schyot", text: "Выдать в счёт жалованья", axes: ["vygoda"], effects: { kazna: 1, zamok: -1 } },
      { id: "po_sluzhbe", text: "Выдать тем, кто на службе под открытым небом", axes: ["dolg"], effects: { poryadok: 1, zamok: -1 } },
    ],
  },
  {
    id: "zayom", title: "Заём", text: "Городской меняла предлагает заём под будущий урожай.", posts: ["pisar"],
    options: [
      { id: "vzyat", text: "Взять и пустить в торг", axes: ["derzost", "vygoda"], effects: { kazna: 2, dvor: -1 }, risky: true },
      { id: "otkazat", text: "Отказать: долги замку не к лицу", axes: ["dolg"], effects: { dvor: 1, kuptsy: -1 } },
      { id: "nemnogo", text: "Взять немного, под запись и залог", axes: ["vygoda"], effects: { kazna: 1, kuptsy: 1, derevni: -1 } },
    ],
  },
  {
    id: "moneta", title: "Порченая монета", text: "В мостовом сборе нашлись обрезанные монеты. Кто их привёз, известно.", posts: ["pisar"],
    options: [
      { id: "donesti", text: "Донести ко двору, как велит закон", axes: ["dolg"], effects: { dvor: 2, kuptsy: -1 } },
      { id: "sbyt", text: "Сбыть их проезжим, пока не хватились", axes: ["derzost"], effects: { kazna: 1, kuptsy: -2 }, risky: true },
      { id: "vzyskat", text: "Тихо взыскать убыток с того купца", axes: ["vygoda"], effects: { kazna: 1, dvor: -1 } },
    ],
  },
  {
    id: "volki", title: "Волки у выпаса", text: "Волки вторую неделю ходят к деревенскому выпасу. Пастухи просят облаву.", posts: ["lesnichiy"],
    options: [
      { id: "ne_trogat", text: "Не трогать: волк берёт своё, так было всегда", axes: ["obychai"], effects: { les: 1, derevni: -2 } },
      { id: "pastukhi", text: "Поставить ночных сторожей из замковых", axes: ["zabota"], effects: { derevni: 1, zamok: -1 } },
      { id: "oblava", text: "Устроить облаву", axes: ["derzost"], effects: { derevni: 1, les: -2 }, risky: true },
    ],
  },
  {
    id: "dar_opushki", title: "Дар опушки", text: "Лесной народ оставил на меже корзины с грибами и мёдом. По обычаю в ответ кладут хлеб — вдвое.", posts: ["lesnichiy"],
    options: [
      { id: "otvetit", text: "Ответить хлебом, как положено", axes: ["obychai"], effects: { les: 1, pripasy: -1 } },
      { id: "razdat", text: "Раздать дар деревенским, ответ отложить", axes: ["zabota"], effects: { derevni: 1, les: -1 } },
      { id: "prodat", text: "Продать мёд в городе", axes: ["vygoda"], effects: { kazna: 1, les: -2 } },
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
      { id: "otkazat", text: "Отказать — у опушки не рубят", axes: ["obychai"], effects: { les: 1, kuptsy: -1 } },
      { id: "malo", text: "Срубить немного сухостоя", axes: ["zabota"], effects: { kazna: 1, les: -1 } },
    ],
  },
  {
    id: "zerno_strazhe", title: "Хлеб для стражи", text: "Десятник требует хлеба для дозоров сверх положенного.", posts: ["desyatnik", "klyuchnik"],
    options: [
      { id: "dat", text: "Выдать из запасов", axes: ["dolg", "derzost"], effects: { pripasy: -2, poryadok: 2 } },
      { id: "otkazat", text: "Отказать — зима длинная", axes: ["vygoda"], effects: { pripasy: 1, zamok: -1, poryadok: -1 } },
      { id: "s_dereven", text: "Взять с деревень за охрану", axes: ["derzost"], effects: { derevni: -2, poryadok: 1 } },
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
      { id: "zakryt", text: "Закрыть и поставить знаки", axes: ["obychai", "zabota"], effects: { les: 2, kuptsy: -2 } },
      { id: "ne_zakryvat", text: "Дорога наша, не закрывать", axes: ["derzost", "dolg"], effects: { les: -3, kuptsy: 1 } },
      { id: "za_platu", text: "Закрыть, но взять плату дичью", axes: ["vygoda"], effects: { les: 1, pripasy: 1, kuptsy: -1 } },
    ],
  },
  {
    id: "yarmarka", title: "Ярмарка", text: "Можно устроить осеннюю ярмарку в замковом дворе. Деньги будут, суеты тоже.", posts: ["pisar", "klyuchnik"],
    options: [
      { id: "ustroit", text: "Устроить с размахом", axes: ["vygoda", "derzost"], effects: { kazna: 2, kuptsy: 2, poryadok: -1, pripasy: -1 }, risky: true },
      { id: "skromno", text: "Скромно, у ворот", axes: ["dolg"], effects: { kazna: 1, kuptsy: 1 } },
      { id: "net", text: "Не устраивать — не до того", axes: ["zabota"], effects: { kuptsy: -1 } },
    ],
  },
  {
    id: "mor", title: "Падёж скота", text: "В Верхней деревне падёж коров. Знахарка говорит — от леса.", posts: ["starosta", "lesnichiy"],
    options: [
      { id: "zhech", text: "Сжечь туши и окурить дворы", axes: ["dolg"], effects: { poryadok: 1, derevni: -1 } },
      { id: "dar_lesu", text: "Отнести дар лесу", axes: ["obychai"], effects: { les: 1, pripasy: -1 } },
      { id: "kupit", text: "Купить скот взамен в долг", axes: ["zabota"], effects: { derevni: 2, kazna: -2 } },
    ],
  },
  {
    id: "chelyad", title: "Ссора челяди", text: "Повар и конюхи не поделили каморку. Дело дошло до ножей.", posts: ["klyuchnik", "desyatnik"],
    options: [
      { id: "vygnat", text: "Выгнать зачинщика", axes: ["dolg", "derzost"], effects: { poryadok: 2, zamok: -1 } },
      { id: "pomirit", text: "Помирить и разделить каморку", axes: ["zabota"], effects: { zamok: 1 } },
      { id: "po_starine", text: "Рассудить по старшинству", axes: ["obychai"], effects: { poryadok: 2, zamok: -1 } },
    ],
  },
  // --- приключенцы (после открытия лабиринта) ---
  {
    id: "prikl_pyut", title: "Приключенцы гуляют", text: "Отряд перед спуском третий день пьёт в корчме и задирает местных.", posts: ["desyatnik", "starosta"], adventurers: true,
    options: [
      { id: "vydvorit", text: "Выдворить из деревни силой", axes: ["derzost", "dolg"], effects: { derevni: 1, poryadok: 1, kazna: -1 }, risky: true },
      { id: "terpet", text: "Терпеть — они платят серебром", axes: ["vygoda"], effects: { kazna: 2, derevni: -2 } },
      { id: "dogovoritsya", text: "Договориться с их вожаком", axes: ["zabota", "obychai"], effects: { derevni: 2, poryadok: -1 } },
    ],
  },
  {
    id: "prikl_ranenye", title: "Раненые снизу", text: "Отряд вернулся с двумя тяжелоранеными и требует лекаря и кров.", posts: ["klyuchnik", "lesnichiy"], adventurers: true,
    options: [
      { id: "prinyat", text: "Принять в замок", axes: ["zabota", "dolg"], effects: { pripasy: -1, zamok: -1 } },
      { id: "za_platu", text: "Лечить за долю добычи", axes: ["vygoda"], effects: { kazna: 2 } },
      { id: "otkazat", text: "Отказать — неизвестно, что они принесли снизу", axes: ["obychai"], effects: { poryadok: 1 }, risky: true },
    ],
  },
  {
    id: "prikl_veshch", title: "Странная вещь", text: "Приключенцы продают в деревне чёрный камень из лабиринта. Собаки на него воют.", posts: ["pisar", "lesnichiy"], adventurers: true,
    options: [
      { id: "kupit", text: "Купить для замка", axes: ["vygoda", "derzost"], effects: { kazna: -1, les: -2 }, risky: true },
      { id: "zapretit", text: "Запретить торговлю такими вещами", axes: ["obychai", "zabota"], effects: { les: 1, kuptsy: -1 } },
      { id: "poshlina", text: "Обложить пошлиной", axes: ["vygoda", "dolg"], effects: { kazna: 1 } },
    ],
  },
  {
    id: "prikl_tvar", title: "Увязалась тварь", text: "За отрядом снизу кто-то пришёл: ночью задрали овец у Нижней деревни.", posts: ["desyatnik", "lesnichiy"], adventurers: true,
    options: [
      { id: "oblava", text: "Облава всей стражей", axes: ["derzost", "dolg"], effects: { poryadok: 2, les: -1 }, risky: true },
      { id: "prikl_platyat", text: "Заставить отряд самому её выследить", axes: ["dolg"], effects: { poryadok: 1 } },
      { id: "les_razberetsya", text: "Ждать — лес сам разберётся с чужаком", axes: ["obychai"], effects: { derevni: -2, les: 1 } },
    ],
  },
];
