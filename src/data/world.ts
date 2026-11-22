// Данные генератора мира (задача И11а, замысел — docs/design/koncept-2.md, «Генератор событий мира»): метки и состояния верхнего слоя.
// Правила — src/sim/world/gen.ts (рассказчик, погода, отголоски) и src/sim/world/apply.ts (указы и последствия в партии), числа — раздел world в src/sim/balance.ts.
// Состояние — не карточка, а полоса на годы: пока длится, сдвигает хозяйство (shift), шлёт вниз отголоски с задержкой (echoes)
// и меняет веса событий совета по меткам (tags — чаще, mutes — реже). Сдвиги и размеры указов умножаются на силу состояния и ручки.
// post — ответственная должность: недород — тиун, набор и постой — десятник, поборы двора и указ серебром — писарь, нехватка еды — ключник, беды леса — лесничий.
import type { WorldTag, WorldLayer, WorldStateDef } from "./types";

export const WORLD_TAGS: WorldTag[] = ["voyna", "golod", "torg", "vera", "les"];
export const WORLD_TAG_NAMES: Record<WorldTag, string> = { voyna: "война", golod: "голод", torg: "торг", vera: "вера", les: "лес" };
export const WORLD_LAYERS: WorldLayer[] = ["mir", "baronstvo", "mesto"];
export const WORLD_LAYER_NAMES: Record<WorldLayer, string> = { mir: "Мир и герцогство", baronstvo: "Баронство", mesto: "Место" };

export const WORLD_STATES: WorldStateDef[] = [
  // --- беды: стоят бюджета давления ---
  {
    id: "voyna_yug", name: "Война на юге", text: "Герцог увяз в войне на южной границе: полки уходят, дороги пустеют.", end: "На юге заключили мир: полки идут домой.",
    post: "pisar",
    tags: ["voyna"], mutes: ["torg"], seasons: [8, 12], weight: 3, cost: 5, shift: { duty: 0.8, lesson: 1.5 },
    echoes: [
      { post: "desyatnik", delay: [1, 3], text: "Гонец привёз указ о наборе.", decree: { id: "nabor", title: "Указ о наборе", text: "Герцог требует людей в полки.", accepts: ["lyudi"], measures: 2, term: 2 } },
      { post: "desyatnik", delay: [4, 7], text: "Полк идёт на юг через баронство.", decree: { id: "postoy", title: "Постой войска", text: "Полк встаёт на постой: кормить его велено барону.", accepts: ["eda", "serebro"], measures: 2, term: 1 } },
      { post: "starosta", delay: [3, 6], text: "К броду вышли беженцы с юга: делятся последним.", effects: { derevni: -1, pripasy: -1 }, village: "brod",
        free: { text: "С беженцами к броду пришли лихие люди: при вольнице их некому остановить.", effects: { derevni: -2, pripasy: -1, poryadok: -1 } } },
    ],
  },
  {
    id: "myatezh", name: "Мятеж соседнего барона", text: "Сосед за рекой поднял знамя против Герцога: на тракте неспокойно.", end: "Мятеж за рекой подавлен.",
    post: "pisar",
    tags: ["voyna"], seasons: [4, 6], weight: 3, cost: 3, shift: { duty: 0.9, lesson: 0.5 },
    echoes: [
      { post: "desyatnik", delay: [1, 2], text: "Герцог собирает ополчение против мятежника.", decree: { id: "opolchenie", title: "Ополчение против мятежника", text: "Герцог требует ополченцев на сезон-другой.", accepts: ["lyudi"], measures: 1, term: 2 } },
      { post: "desyatnik", delay: [2, 4], text: "Через земли прошла шайка дезертиров: в деревнях недосчитались добра.", effects: { poryadok: -1, derevni: -1 },
        strict: { text: "Шайку дезертиров дозор перехватил на тракте: добро вернули хозяевам.", effects: { poryadok: 1, derevni: 1 } } },
    ],
  },
  {
    id: "neurozhay", name: "Неурожай в герцогстве", text: "По всему герцогству недород: хлеб дорожает, столица просит зерна.", end: "Недород в герцогстве позади.",
    post: "starosta",
    tags: ["golod"], seasons: [4, 5], weight: 4, cost: 4, shift: { harvest: 0.75 },
    echoes: [
      { post: "klyuchnik", delay: [1, 3], text: "Двор разослал указ: зерно для столицы.", decree: { id: "zerno", title: "Зерно для столицы", text: "Герцог требует зерна для столицы сверх урока.", accepts: ["eda"], measures: 1.5, term: 2 } },
      { delay: [2, 4], text: "Нищие с пустых земель дошли до деревни у опушки: подаяние из своих закромов.", effects: { derevni: -1 }, village: "opushka" },
    ],
  },
  {
    id: "mor", name: "Мор в герцогстве", text: "По городам идёт мор: ворота запирают, торг встал.", end: "Мор отступил: ворота городов открыты.",
    post: "pisar",
    tags: ["golod", "vera"], mutes: ["torg"], seasons: [3, 5], weight: 2, cost: 4, shift: { duty: 0.7, price: 0.85 },
    echoes: [
      { delay: [1, 2], text: "Двор требует серебра на заставы и лекарей.", decree: { id: "zastavy", title: "Сбор на заставы", text: "Герцог требует серебра на карантинные заставы.", accepts: ["serebro", "tovary"], measures: 1.5, term: 2 } },
      { delay: [2, 4], text: "Обоз с тракта завернули у заставы: купцы в убытке.", effects: { kuptsy: -1 },
        strict: { text: "Заставы стоят крепко, но обозы идут под охраной стражи: купцы это оценили.", effects: { kuptsy: 1 } } },
    ],
  },
  {
    id: "padezh", name: "Падёж скота по округе", text: "По округе падёж: пахать не на чем, мясо в цене.", end: "Падёж сошёл на нет.",
    post: "starosta",
    tags: ["golod"], seasons: [2, 4], weight: 3, cost: 2, shift: { harvest: 0.88 },
    echoes: [{ post: "klyuchnik", delay: [1, 2], text: "Падёж дошёл до здешних выпасов.", effects: { derevni: -1, pripasy: -1 } }],
  },
  {
    id: "tvari", name: "Лес неспокоен", text: "С севера идут твари: лесной народ уходит вглубь, тропы закрыты.", end: "Лес утих: тропы снова открыты.",
    post: "lesnichiy",
    tags: ["les"], seasons: [3, 6], weight: 3, cost: 3, shift: { forest: 0.6 },
    echoes: [
      { delay: [1, 3], text: "Твари вышли к выпасу у опушки.", effects: { les: -1, pripasy: -1 }, village: "opushka" },
      { delay: [3, 5], text: "Охотники не вернулись из леса: в деревне у опушки ропот.", effects: { derevni: -1, poryadok: -1 }, village: "opushka",
        strict: { text: "Дозор вывел охотников из леса: в деревне у опушки благодарят стражу.", effects: { derevni: 1 } } },
    ],
  },
  {
    id: "raskol", name: "Спор о вере", text: "В столице спорят о вере: проповедники ходят по деревням и мутят народ.", end: "Собор решил спор о вере.",
    post: "starosta",
    tags: ["vera"], seasons: [4, 8], weight: 2, cost: 2,
    echoes: [
      { delay: [1, 3], text: "Проповедник назвал обряды опушки ересью.", effects: { derevni: -1, les: -1 }, village: "opushka" },
      { delay: [3, 6], text: "Двор собирает на новый храм.", decree: { id: "hram", title: "Сбор на храм", text: "Герцог требует даров на новый храм.", accepts: ["serebro", "tovary"], measures: 1, term: 2 } },
    ],
  },
  {
    id: "poshlina_gertsoga", name: "Новая пошлина Герцога", text: "Герцог обложил тракт новой пошлиной: купцы ищут обходные пути.", end: "Пошлину на тракте отменили.",
    post: "pisar",
    tags: ["torg"], seasons: [4, 8], weight: 3, cost: 2, shift: { price: 0.8, duty: 0.85 },
    echoes: [{ delay: [1, 3], text: "Купцы пожаловались на поборы и свернули обоз.", effects: { kuptsy: -1 },
      free: { text: "Купцы пошли в обход застав лесными тропами: мимо казны, зато охотно.", effects: { kuptsy: 1, kazna: -1 } } }],
  },
  // --- блага: бюджета не стоят ---
  {
    id: "yarmarka_god", name: "Ярмарочный год", text: "В городе большая ярмарка: купцы едут со всех сторон и берут всё.", end: "Ярмарочный год кончился.",
    post: "pisar",
    tags: ["torg"], seasons: [4, 4], weight: 3, cost: 0, shift: { price: 1.25, duty: 1.2 },
    echoes: [{ delay: [1, 2], text: "Проезжие купцы хвалят здешний торг.", effects: { kuptsy: 1 },
      strict: { text: "Проезжие купцы хвалят безопасный тракт: твёрдая рука им по душе.", effects: { kuptsy: 2 } },
      free: { text: "На ярмарочном тракте шалят: проезжих купцов пощипали.", effects: { kuptsy: -1, poryadok: -1 } } }],
  },
  {
    id: "dobryy_god", name: "Добрые годы", text: "Тёплые вёсны и тихие осени: по всему герцогству закрома полны.", end: "Добрые годы позади.",
    post: "starosta",
    tags: [], mutes: ["golod"], seasons: [4, 6], weight: 3, cost: 0, shift: { harvest: 1.15 },
  },
  {
    id: "svadba_gertsoga", name: "Свадьба в доме Герцога", text: "Герцог женит наследника: двор щедр и ждёт даров.", end: "Свадебные торжества кончились.",
    post: "pisar",
    tags: ["vera", "torg"], seasons: [2, 3], weight: 2, cost: 0, shift: { lesson: -1 },
    echoes: [{ delay: [1, 1], text: "Двор ждёт даров к свадьбе.", decree: { id: "dary", title: "Дары к свадьбе", text: "К свадьбе наследника ждут даров от каждого барона.", accepts: ["tovary", "serebro"], measures: 1, term: 2 } }],
  },
  {
    id: "palomniki", name: "Паломники идут к святыне", text: "Через баронство потянулись паломники к святыне за лесом.", end: "Паломников стало меньше.",
    post: "lesnichiy",
    tags: ["vera"], seasons: [3, 5], weight: 2, cost: 0, shift: { duty: 1.15 },
    echoes: [{ delay: [1, 3], text: "Паломники оставили дары у священной рощи.", effects: { les: 1, derevni: 1 }, village: "opushka" }],
  },
  {
    id: "tihiy_les", name: "Тихий лес", text: "Лес щедр и спокоен: лесной народ выходит к меже с дарами.", end: "Лес снова держится настороже.",
    post: "lesnichiy",
    tags: ["les"], seasons: [3, 5], weight: 2, cost: 0, shift: { forest: 1.25 },
    echoes: [{ delay: [1, 2], text: "Лесной народ оставил мёд и шкуры на меже.", effects: { les: 1 } }],
  },
];

// Погода года словами: по множителю урожая. Пороги — ручки world.weather.
export const WEATHER_WORDS = { bad: "недород", poor: "скудный год", plain: "обычный год", good: "урожайный год" } as const;
// Редкий тяжёлый год: имя и весть. Урожай — ручки world.weather.heavyMin и heavyMax.
export const HEAVY_YEARS = [
  { id: "zasuha", name: "засуха", text: "Засуха: с весны ни дождя, поля горят — урожай будет вдвое хуже обычного." },
  { id: "gradoboy", name: "градобой", text: "Градобой: всходы побило, пересевать поздно — урожай будет вдвое хуже обычного." },
];
