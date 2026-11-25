// Колода событий акта 1: формат карточки и первая пачка — 40 карточек (задача И28). Замысел — docs/design/koloda.md.
// Здесь только данные: движка событий ещё нет. Карточка — одна завязка со слотами; генератор подставит людей, место и время,
// а натура того, кто решает, двинет выбор. id — будущие ключи сохранений: не менять.
import type { PoleKey, Want, Hold, Channel, ThreadId } from "./types";

// ---------- словари колоды ----------
// Уровень — кто решает и кто видит (koncept-3.md, раздел 10).
export type CardLevel = "lichnoe" | "dolzhnostnoe" | "peresechenie" | "stol";
export const CARD_LEVELS: Record<CardLevel, string> = { lichnoe: "личное", dolzhnostnoe: "должностное", peresechenie: "пересечение", stol: "стол Сенешаля" };
// Вид: событие, эпизод дела (какого — поле delo), предание или весть.
export type CardKind = "sobytie" | "epizod" | "predanie" | "vest";
export const CARD_KINDS: Record<CardKind, string> = { sobytie: "событие", epizod: "эпизод дела", predanie: "предание", vest: "весть" };
// Дела Сенешаля (koncept-3.md, раздел 12, каталог).
export type DealId =
  | "doma_v_zamke" | "knigi_i_schyot" | "sud_i_skhod" | "arkhiv_i_predaniya" | "obezd_derevni" | "kromka" | "osmotr_rabot" | "mezha_i_pokosy"
  | "v_stavku" | "k_sosedyam" | "k_lesnym" | "v_vadelu" | "smotr_po_ledokhodu" | "osenniy_torg" | "vyezdnoy_sud";
export const DEALS: { id: DealId; name: string }[] = [
  { id: "doma_v_zamke", name: "Дома в замке" }, { id: "knigi_i_schyot", name: "Книги и счёт" }, { id: "sud_i_skhod", name: "Суд и сход" },
  { id: "arkhiv_i_predaniya", name: "Архив и предания" }, { id: "obezd_derevni", name: "Объезд деревни" }, { id: "kromka", name: "Кромка" },
  { id: "osmotr_rabot", name: "Осмотр работ" }, { id: "mezha_i_pokosy", name: "Межа и покосы" }, { id: "v_stavku", name: "В ставку" },
  { id: "k_sosedyam", name: "К соседям" }, { id: "k_lesnym", name: "К лесным" }, { id: "v_vadelu", name: "В Ваделу" },
  { id: "smotr_po_ledokhodu", name: "Смотр по ледоходу" }, { id: "osenniy_torg", name: "Осенний торг" }, { id: "vyezdnoy_sud", name: "Выездной суд" },
];
// Места владения первого акта (koncept-3.md, 3.1).
export type DeckPlace =
  | "zamok" | "nizhnyaya" | "verkhnyaya" | "pashnya" | "pokosy" | "vypas" | "melnitsa" | "perevoz" | "korchma" | "borti" | "delyanka" | "kromka" | "chasovnya" | "shakhta";
export const DECK_PLACES: { id: DeckPlace; name: string }[] = [
  { id: "zamok", name: "замок" }, { id: "nizhnyaya", name: "нижняя деревня у брода" }, { id: "verkhnyaya", name: "верхняя деревня у опушки" },
  { id: "pashnya", name: "пашня" }, { id: "pokosy", name: "покосы" }, { id: "vypas", name: "выпас" }, { id: "melnitsa", name: "мельница у залома" },
  { id: "perevoz", name: "перевоз" }, { id: "korchma", name: "корчма" }, { id: "borti", name: "борти" }, { id: "delyanka", name: "делянка" },
  { id: "kromka", name: "кромка" }, { id: "chasovnya", name: "часовня" }, { id: "shakhta", name: "старая шахта" },
];
// Где: место владения; «деревня» — любая из двух; «любое» — где угодно. За пределами владения — поле outside.
export type CardWhere = DeckPlace | "derevnya" | "lyuboe";
export const WHERE_ANY: Record<"derevnya" | "lyuboe", string> = { derevnya: "деревня — любая из двух", lyuboe: "любое место" };
export type Outside = "stavka" | "sosed" | "doroga";
export const OUTSIDE: Record<Outside, string> = { stavka: "ставка", sosed: "сосед", doroga: "дорога" };
// Когда: по дорожке года (koncept-3.md, 5.1) или в любой месяц.
export type CardWhen = "ledokhod" | "sev" | "mezhen" | "zhatva" | "torg" | "sanny_put" | "zima" | "lyuboy";
export const CARD_WHEN: Record<CardWhen, string> = {
  ledokhod: "ледоход", sev: "сев", mezhen: "межень", zhatva: "жатва", torg: "осенний торг", sanny_put: "санный путь", zima: "зима", lyuboy: "в любой месяц",
};
// Темы колоды акта 1 (koloda.md, раздел 2): первая пачка закрывает восемь из десяти.
export type CardTheme = "zemlya" | "dvory" | "kromka" | "khram" | "dengi" | "doroga" | "lyudi" | "sovet" | "metki" | "predaniya";
export const CARD_THEMES: Record<CardTheme, string> = {
  zemlya: "земля и межи", dvory: "дворы — уходят и приходят", kromka: "кромка и зверь", khram: "храм и обряд", dengi: "деньги, подать, долги",
  doroga: "дорога, перевоз, торг", lyudi: "люди и семьи", sovet: "совет и суд", metki: "метки", predaniya: "предания и вести",
};

// ---------- кому вариант по душе ----------
// Метка — полюс признака («poryadok+» — людям порядка), желание или удержка из словаря (src/data/portrait.ts) либо «основа»:
// вложить в долгое, а не в показное (cherty-dannye.md, раздел 9, «Крепкая основа»).
export type CardLike = PoleKey | Want | Hold | "osnova";
// Слова карточек → метки словаря (koloda.md, раздел 6; перевод принят автором 25.11.2026).
export type LikeWord =
  | "обычай" | "порядок" | "выгода" | "покой" | "новое" | "смелость" | "жёсткость" | "гордость" | "вера" | "осторожность" | "щедрость" | "свои" | "прямота"
  | "страх" | "забота" | "мир" | "правда" | "основа" | "смирение" | "мягкость" | "терпение" | "вспыльчивость" | "лукавство" | "любопытство" | "вольность"
  | "сомнение" | "честолюбие" | "близкие" | "место" | "верность";
export const LIKE_WORDS: { word: LikeWord; says: string; likes: CardLike[] }[] = [
  { word: "обычай", says: "по душе чтящим обычай", likes: ["lyubopytstvo-"] },
  { word: "порядок", says: "порядок", likes: ["poryadok+"] },
  { word: "выгода", says: "выгода", likes: ["dengi"] },
  { word: "покой", says: "покой", likes: ["pokoy"] },
  { word: "новое", says: "новое", likes: ["novoe"] },
  { word: "смелость", says: "смелость", likes: ["smelost+"] },
  { word: "жёсткость", says: "жёсткость", likes: ["zhestkost+"] },
  { word: "гордость", says: "гордость", likes: ["gordost+"] },
  { word: "вера", says: "по душе набожным; вера", likes: ["vera+"] },
  { word: "осторожность", says: "по душе осторожным", likes: ["smelost-"] },
  { word: "щедрость", says: "по душе щедрым", likes: ["shchedrost+"] },
  { word: "свои", says: "по душе тем, кто держится своих; кто своих не сдаёт", likes: ["privyazannost+"] },
  { word: "прямота", says: "по душе держащим слово; прямым и честным", likes: ["chestnost+"] },
  { word: "страх", says: "по душе боящимся", likes: ["strakh"] },
  { word: "забота", says: "забота; где вариант стоит серебра, добра или дохода, в карточке рядом стоит «щедрость»", likes: ["zhestkost-"] },
  { word: "мир", says: "мир: мягкие легче уступают, смиренным не нужна победа в споре", likes: ["zhestkost-", "gordost-"] },
  { word: "правда", says: "по правде", likes: ["chestnost+", "sovest"] },
  { word: "основа", says: "основа: вложить в долгое — дворы, сруб, запас, порядок в книгах, — а не в показное", likes: ["osnova"] },
  { word: "смирение", says: "по душе смиренным", likes: ["gordost-"] },
  { word: "мягкость", says: "по душе мягким", likes: ["zhestkost-"] },
  { word: "терпение", says: "по душе терпеливым", likes: ["terpenie+"] },
  { word: "вспыльчивость", says: "по душе вспыльчивым", likes: ["terpenie-"] },
  { word: "лукавство", says: "по душе лукавым", likes: ["chestnost-"] },
  { word: "любопытство", says: "по душе любопытным", likes: ["lyubopytstvo+"] },
  { word: "вольность", says: "по душе вольным", likes: ["poryadok-"] },
  { word: "сомнение", says: "по душе сомневающимся", likes: ["vera-"] },
  { word: "честолюбие", says: "по душе честолюбивым", likes: ["chestolyubie+"] },
  { word: "близкие", says: "близкие", likes: ["blizkie"] },
  { word: "место", says: "место", likes: ["mesto"] },
  { word: "верность", says: "верность — верность Сенешалю", likes: ["vernost"] },
];

// ---------- карточка ----------
// Роль. slot — имя слота, как в завязке: «{староста}»; без слота — участник, которого генератор не подставляет.
// trait, want, thread — условие на роль: черта из мешка, желание, нить и её ступень.
export interface CardRole { slot?: string; text?: string; trait?: string; want?: Want; thread?: { nit: ThreadId; step?: string } }
// Исход варианта. text — исход словами карточки; пусто, если карточка исхода не называет. Серебро — в условных единицах: −1 — трата, −2 — большая трата, +1 — приход (сколько это монет, покажут прогоны с движком).
// Хлеб и сено — словами. Дворы — сколько пришло или ушло. Слово Сенешаля: +1 — крепнет, −1 — слабеет, «zalog» — дано под залог.
// Отношения: кто (слот в скобках или группа словами) и в какую сторону. Лихо: +1 — растёт, −1 — падает (likho.md, раздел 3).
export interface CardOutcome {
  text: string;
  serebro?: number;
  khleb?: string;
  seno?: string;
  dvory?: number;
  slovo?: 1 | -1 | "zalog";
  otnosheniya?: { kto: string; v: 1 | -1 }[];
  likho?: 1 | -1;
  nit?: { nit: ThreadId; step?: string };   // вариант открывает или двигает нить
  trait?: string;                          // вариант даёт черту из мешка
  delo?: DealId;                           // вариант — отдельное дело Сенешаля
  zheton?: string;                         // жетон обязательства на дорожке года
}
// Вариант. words — слова карточки «кому по душе», likes — они же метками словаря (собирает v()).
export interface CardVariant { text: string; words: LikeWord[]; likes: CardLike[]; outcome: CardOutcome }
// След: канал из словаря (CHANNELS) и текст. Каналов несколько — видно по любому из них.
export interface CardTrace { gde: Channel[]; text: string }
// Дальше: на карточку этой пачки (card), на нить словаря (nit) или на карточку, которой ещё нет (budet — её название).
export interface CardNext { text: string; card?: string; nit?: ThreadId; budet?: string }
export interface DeckCard {
  n: number;                 // номер в koloda.md
  id: string;
  name: string;
  theme: CardTheme;
  level?: CardLevel;         // у предания уровня нет: решает тот, до кого дошла молва
  rises?: CardLevel | "molva"; // «→»: куда карточка поднимается; у предания — уходит в молву
  kind: CardKind;
  delo?: DealId;             // у эпизода — какого дела
  tags?: ("sled" | "beda")[];
  thread?: { nit: ThreadId; step?: string; start?: boolean; esli?: string }; // ступень или начало нити; esli — при каком условии
  where: CardWhere[];
  outside?: Outside;         // место за пределами владения
  whereNote?: string;        // как место названо в карточке
  when: CardWhen;
  whenNote?: string;
  who: CardRole[];
  oneOf?: { slots: string[]; trait: string }; // черта — у одного из этих слотов
  povod?: string;
  intro: string;
  decides?: string;          // чьи это варианты, если не того, кому карточка выпала по уровню
  variants: CardVariant[];
  traces: CardTrace[];
  vyshe?: string;
  dalshe: CardNext[];
  source: { how: "kak_est" | "perenos"; from?: string; texts: number[] };
}

const likesOf = (words: LikeWord[]): CardLike[] => [...new Set(words.flatMap((x) => LIKE_WORDS.find((q) => q.word === x)!.likes))];
// Вариант: текст, слова «кому по душе», исход словами и его поля.
const v = (text: string, words: LikeWord[], outcome: string, fields: Omit<CardOutcome, "text"> = {}): CardVariant => ({
  text, words, likes: likesOf(words), outcome: { text: outcome, ...fields },
});
const slot = (name: string, extra: Omit<CardRole, "slot"> = {}): CardRole => ({ slot: name, ...extra });
const who = (text: string): CardRole => ({ text });
const tr = (gde: Channel | Channel[], text: string): CardTrace => ({ gde: Array.isArray(gde) ? gde : [gde], text });
const asIs = (...texts: number[]): DeckCard["source"] => ({ how: "kak_est", texts });
const moved = (from: string, ...texts: number[]): DeckCard["source"] => ({ how: "perenos", from, texts });
const up = (kto: string): { kto: string; v: 1 } => ({ kto, v: 1 });
const down = (kto: string): { kto: string; v: -1 } => ({ kto, v: -1 });

export const DECK: DeckCard[] = [
  // ---------- земля и межи ----------
  {
    n: 1, id: "mezha_do_sukhoy_beryozy", name: "Межа «до сухой берёзы»", theme: "zemlya", level: "peresechenie", rises: "stol", kind: "epizod", delo: "mezha_i_pokosy",
    where: ["pokosy"], when: "mezhen",
    who: [slot("староста"), who("староста соседа"), slot("старожил")],
    intro: "Межу ведут «до сухой берёзы», а берёзу сломала гроза. На её месте пень, и сосед говорит, что пень не тот.",
    variants: [
      v("Поверить старожилу", ["обычай"], "старики довольны, сосед в обиде", { otnosheniya: [up("старожилы"), down("сосед")] }),
      v("Звать межевщика из ставки и идти по книге", ["порядок"], "серебро и месяц ожидания, покос стоит", { serebro: -1, seno: "покос стоит месяц" }),
      v("Разделить спорное пополам", ["мир"], "ворчат обе деревни", { otnosheniya: [down("своя деревня"), down("деревня соседа")] }),
      v("Уступить соседу ради добрососедства", ["смирение", "покой"], "сена меньше, деревня считает, что её не защитили", { seno: "сена меньше", otnosheniya: [up("сосед"), down("своя деревня")] }),
    ],
    traces: [tr("vid", "староста вернулся с покоса злой"), tr("molva", "в корчме смеются про пень")],
    vyshe: "Старосты не сошлись, или сосед — Ратша.",
    dalshe: [{ text: "через год спорят снова — карточка «Межевой камень»; поставили камень — закрыто", budet: "Межевой камень" }],
    source: asIs(15),
  },
  {
    n: 2, id: "kosyat_pod_ruku", name: "Косят «под руку»", theme: "zemlya", level: "stol", kind: "epizod", delo: "mezha_i_pokosy",
    where: ["pokosy"], whereNote: "пустой клин у межи", when: "mezhen",
    who: [slot("сосед"), who("его косцы"), slot("писарь")],
    intro: "Люди {сосед} без письма палаты скосили клин владения, что стоял пустым. Говорят: «под руку, пока у вас рук нет».",
    variants: [
      v("Идти с книгой и читать статью", ["порядок"], "сено вернут натрое, как решит выездной суд", { seno: "сено вернут натрое — по решению выездного суда" }),
      v("Забрать сено силой с десятником", ["смелость", "жёсткость"], "сено своё, ссора с соседом и жалоба воеводе", { seno: "сено своё", otnosheniya: [down("{сосед}")] }),
      v("Сдать клин соседу в наём на год", ["выгода"], "серебро, но клин «привыкает» к чужим косам", { serebro: 1 }),
      v("Промолчать", ["покой"], "сено ушло, деревня видит слабость", { seno: "сено ушло", otnosheniya: [down("своя деревня")] }),
    ],
    traces: [tr("mesto", "свежие стога на чужой стороне межи"), tr("vedomost", "недостача сена")],
    dalshe: [{ text: "«Клин привык к чужим косам» — через год сосед говорит «так было всегда»", budet: "Клин привык к чужим косам" }],
    source: asIs(49, 50, 55),
  },
  {
    n: 3, id: "klin_za_pud_myoda", name: "Клин за пуд мёда", theme: "zemlya", level: "stol", kind: "epizod", delo: "sud_i_skhod",
    where: ["pokosy", "borti"], when: "lyuboy",
    who: [slot("старожил", { text: "из соседней деревни" }), slot("староста")],
    intro: "Соседи двадцать лет косят клин по устному уговору с покойным бароном, за пуд мёда в год. Уговора на письме нет. Мёда в последние годы тоже не было.",
    variants: [
      v("Признать уговор и записать", ["прямота"], "слово Сенешаля крепнет, клин потерян", { slovo: 1, seno: "клин потерян" }),
      v("Не признавать", ["порядок"], "клин вернулся, у соседей обида", { seno: "клин вернулся", otnosheniya: [down("соседи")] }),
      v("Признать, но требовать мёд за прошлые годы", ["выгода"], "соседи платят неохотно или уходят с клина сами", { otnosheniya: [down("соседи")] }),
    ],
    traces: [tr("vedomost", "мёд в описи борти"), tr("molva", "старожил рассказывает «как было при бароне»")],
    dalshe: [],
    source: asIs(50),
  },
  {
    n: 4, id: "pomol_ispolu_na_zalome", name: "Помол исполу на заломе", theme: "zemlya", level: "peresechenie", kind: "sobytie",
    where: ["melnitsa"], when: "zhatva", whenNote: "после жатвы",
    who: [slot("мельник"), who("соседняя деревня"), slot("староста")],
    intro: "Мельница стоит на межевом заломе и мелет исполу, по старому ряду. Теперь соседи говорят, что межа идёт по левому берегу, и мельница — их наполовину.",
    variants: [
      v("Держаться ряда", ["порядок"], "помол идёт, спор тлеет"),
      v("Перемерить межу", ["новое"], "серебро, а исход может оказаться не в пользу владения", { serebro: -1 }),
      v("Откупить их половину", ["выгода", "покой", "основа"], "серебра много, мельница целиком своя", { serebro: -2 }),
    ],
    traces: [tr("zhaloba", "мельник придерживает чужой помол"), tr("mesto", "очередь у мельницы")],
    vyshe: "Мельник не мелет соседям — те идут жаловаться.",
    dalshe: [],
    source: asIs(55),
  },
  {
    n: 5, id: "dopakhat_polosu_vdovy", name: "Допахать полосу вдовы", theme: "zemlya", level: "dolzhnostnoe", rises: "stol", kind: "sobytie",
    where: ["pashnya"], when: "sev",
    who: [slot("вдова", { text: "ушла из деревни" }), slot("сосед по полосе"), slot("староста")],
    intro: "Вдова ушла к родне до весны. Сосед просит её полосу «допахать, пока не вернётся».",
    variants: [
      v("Отдать на год за долю зерна вдове", ["забота"], "полоса не пустует", { khleb: "доля зерна — вдове" }),
      v("Отдать соседу без условий", ["выгода"], "вдова вернётся — спор"),
      v("Держать пустой", ["порядок"], "полоса зарастает", { khleb: "полоса не сеяна" }),
    ],
    traces: [],
    dalshe: [{ text: "вдова вернулась — «Чья полоса» (стол)", budet: "Чья полоса" }],
    source: asIs(46),
  },
  // ---------- дворы — уходят и приходят ----------
  {
    n: 6, id: "chuzhie_v_izbe", name: "Чужие в избе", theme: "dvory", level: "stol", kind: "sobytie",
    where: ["derevnya"], when: "ledokhod",
    who: [slot("хозяин", { text: "вернулся" }), slot("пришлые"), slot("староста")],
    intro: "Хозяин ушёл на зиму на заработки, вернулся — а в его избе живут пришлые. Староста поселил их «до решения».",
    variants: [
      v("Вернуть избу хозяину, пришлым дать место на выселке", ["порядок", "основа"], "руки и серебро на сруб", { serebro: -1 }),
      v("Оставить пришлых, хозяину дать льготу на новый двор", ["забота", "щедрость"], "хозяин в обиде, но остаётся", { otnosheniya: [down("{хозяин}")] }),
      v("Выселить пришлых", ["правда"], "двор пришлых уходит из владения", { dvory: -1 }),
    ],
    traces: [tr("mesto", "две семьи под одной крышей"), tr("molva", "ссора у колодца")],
    dalshe: [{ text: "староста помнит, кто его поправил" }],
    source: asIs(46),
  },
  {
    n: 7, id: "ushyol_do_vesny", name: "«Ушёл до весны»", theme: "dvory", level: "dolzhnostnoe", kind: "sobytie",
    where: ["zamok"], whereNote: "писарская: в карточке вместо места названа роль — {писарь}", when: "sanny_put",
    who: [slot("беглые", { text: "двор, что уходит" }), slot("писарь")],
    intro: "Двор уходит на зиму к родне за реку и просит записать его не «ушёл», а «ушёл до весны»: тогда земля останется за ним.",
    decides: "писарь",
    variants: [
      v("Записать «до весны»", ["забота"], "двор, может, вернётся, а может, и нет"),
      v("Записать «ушёл»", ["порядок"], "землю можно отдать пришлым", { dvory: -1 }),
      v("Уговорить остаться: семена в долг до сева", ["основа"], "серебро и хлеб; двор остаётся", { serebro: -1, khleb: "семена в долг до сева" }),
    ],
    traces: [tr("mesto", "пустой двор с заколоченной дверью")],
    dalshe: [{ text: "весной — «Вернулись или нет»", budet: "Вернулись или нет" }],
    source: asIs(53),
  },
  {
    n: 8, id: "vtorye_synovya_bez_otpuska", name: "Вторые сыновья без отпуска", theme: "dvory", level: "stol", kind: "sobytie",
    where: ["zamok"], whereNote: "ворота замка", when: "sev",
    who: [slot("вторые сыновья", { text: "трое, из соседнего домена" }), who("посыльный от их владетеля")],
    intro: "Трое вторых сыновей из тесного домена просятся на пустые дворы. Отпуска у них нет: владетель требует выдать их или заплатить выход.",
    variants: [
      v("Принять, они вольные", ["смелость"], "три двора, ссора с соседом", { dvory: 3, otnosheniya: [down("сосед")] }),
      v("Принять и заплатить выход", ["порядок", "мир", "основа"], "три двора за серебро", { dvory: 3, serebro: -1 }),
      v("Выдать", ["покой"], "соседу услуга, слава владения как места, куда приходят, падает", { otnosheniya: [up("сосед")] }),
    ],
    traces: [tr("molva", "молва о том, где принимают")],
    dalshe: [],
    source: moved("из храмового владения", 72),
  },
  {
    n: 9, id: "poselenets_ukhodit_do_sroka", name: "Поселенец уходит до срока", theme: "dvory", level: "dolzhnostnoe", kind: "sobytie",
    where: ["derevnya"], when: "zhatva", whenNote: "после жатвы",
    who: [slot("поселенец"), slot("староста")],
    intro: "Поселенец, взятый на льготу, уходит до срока. По ряду он должен вернуть корову и семена, изба остаётся владению.",
    variants: [
      v("Взыскать по ряду", ["порядок"], "корова вернулась, а в округе говорят, что здесь строго", { dvory: -1 }),
      v("Отпустить с коровой", ["забота", "щедрость"], "добрая слава, убыток", { dvory: -1 }),
      v("Узнать, почему уходит", ["любопытство", "терпение"], "время старосты; может открыться нить"),
    ],
    traces: [tr("mesto", "свободная изба")],
    dalshe: [],
    source: asIs(56),
  },
  {
    n: 10, id: "pustye_marki_prodayut_grafam", name: "«Пустые марки продают графам»", theme: "dvory", level: "stol", kind: "sobytie",
    where: ["nizhnyaya", "verkhnyaya"], whereNote: "обе деревни", when: "lyuboy",
    who: [slot("корчмарь", { text: "или обозник — разносчик слуха" }), who("деревни")],
    intro: "По корчмам говорят, что воевода продаёт пустые марки графам. Люди уходят, не дожидаясь графа.",
    variants: [
      v("Выйти на сход и дать слово, что марку не продадут", ["смелость", "прямота"], "слово Сенешаля под залог", { slovo: "zalog", zheton: "обещание деревням" }),
      v("Ехать в ставку за грамотой", ["порядок"], "дело «В ставку»; месяц без Сенешаля", { delo: "v_stavku" }),
      v("Найти, кто пустил слух", ["любопытство", "лукавство"], "свои уши; может, Ратша"),
    ],
    traces: [tr("mesto", "две семьи собирают возы")],
    dalshe: [{ text: "если слово дано — жетон «обещание деревням» на дорожке" }],
    source: asIs(53, 73),
  },
  {
    n: 11, id: "dobro_broshennykh_dvorov", name: "Добро брошенных дворов", theme: "dvory", level: "peresechenie", kind: "sobytie",
    where: ["chasovnya", "derevnya"], when: "ledokhod",
    who: [slot("жрец"), who("вернувшаяся родня"), slot("староста")],
    intro: "Жрец взял себе добро брошенных дворов — наковальню и борону. Родня вернулась и требует назад.",
    variants: [
      v("Вернуть родне", ["правда"], "жрец в обиде", { otnosheniya: [down("{жрец}")], likho: -1 }),
      v("Оставить храму", ["вера"], "родня ропщет", { otnosheniya: [down("вернувшаяся родня")], likho: 1 }),
      v("Выкупить для деревни", ["основа"], "серебро; наковальня общая", { serebro: -1 }),
    ],
    traces: [],
    dalshe: [],
    source: asIs(46),
  },
  {
    n: 12, id: "vy_ukhodite_my_sadimsya", name: "«Вы уходите — мы садимся»", theme: "dvory", level: "stol", kind: "sobytie",
    where: ["derevnya"], whereNote: "пустые дворы", when: "ledokhod",
    who: [who("туллы с того берега"), slot("староста"), who("соседи по дворам")],
    intro: "Туллы с того берега сели в два пустых двора: «вы уходите — мы садимся». Люди косятся.",
    variants: [
      v("Принять и записать", ["любопытство"], "дворы не пустуют; соседи ворчат, туллы держат слово", { dvory: 2, otnosheniya: [down("соседи по дворам"), up("туллы")] }),
      v("Выселить", ["свои"], "дворы пусты, туллы в обиде", { otnosheniya: [down("туллы")] }),
      v("Принять на год, с условием", ["порядок"], "спор отложен", { dvory: 2 }),
    ],
    traces: [tr("mesto", "тулльи козы объедают плетни")],
    dalshe: [{ text: "тулльи козы объедают плетни (№ 46) — следующая карточка", budet: "Тулльи козы" }],
    source: asIs(53, 46),
  },
  // ---------- кромка и зверь ----------
  {
    n: 13, id: "sledy_na_ldu", name: "Следы на льду", theme: "kromka", level: "dolzhnostnoe", kind: "sobytie", tags: ["sled"],
    where: ["kromka"], whereNote: "кромка, река", when: "sanny_put", whenNote: "первый лёд",
    who: [slot("видевший", { text: "ребёнок или баба" }), slot("десятник"), slot("ловчий")],
    intro: "На льду у того берега следы идут и возвращаются: зверь пробует лёд. Видевший сказал бабам, а не десятнику.",
    decides: "тот, до кого дошло",
    variants: [
      v("Удвоить дозор на берегу", ["порядок"], "люди и сено", { seno: "сено дозору" }),
      v("Ловчему идти по следу", ["смелость"], "можно найти лёжку, можно потерять человека"),
      v("Не поднимать шума", ["покой"], "если зверь перейдёт, спросят, кто знал"),
    ],
    traces: [tr(["ushi", "prisutstvie"], "до Сенешаля доходит, только если в деревне есть свои уши или он сам там был")],
    dalshe: [{ text: "«Зверь перешёл лёд» (беда, стол)", budet: "Зверь перешёл лёд" }],
    source: asIs(74),
  },
  {
    n: 14, id: "ushastaya_na_vyshku", name: "«Ушастая» на вышку", theme: "kromka", level: "lichnoe", rises: "dolzhnostnoe", kind: "sobytie",
    where: ["derevnya"], when: "zima",
    who: [slot("меченая", { text: "девушка, что слышит зверя" }), slot("ловчий"), who("её мать")],
    intro: "Девушку с меткой дразнят «ушастой». Ловчий хочет посадить её на вышку: она слышит зверя раньше собак.",
    variants: [
      v("Нанять за плату", ["смелость", "новое"], "ранняя весть о звере, мать против", { serebro: -1, otnosheniya: [down("её мать")] }),
      v("Не брать", ["осторожность", "вера"], "девушку дразнят дальше"),
      v("Брать только с матерью и при свидетелях", ["порядок"], "дороже", { serebro: -2 }),
    ],
    traces: [],
    dalshe: [{ text: "нить «метка» — смотр, гильдия, Вадела", nit: "metka" }],
    source: asIs(74),
  },
  {
    n: 15, id: "chya_golova", name: "Чья голова", theme: "kromka", level: "peresechenie", kind: "sobytie",
    where: ["kromka"], when: "zima",
    who: [who("тулл"), slot("ловчий"), slot("писарь")],
    intro: "Тулл нашёл дохлого зверя с болтом ловчего. Кому головные — нашедшему или стрелку?",
    variants: [
      v("Стрелку", ["порядок"], "тулл больше не скажет, где лёжка", { otnosheniya: [down("тулл")] }),
      v("Нашедшему", ["щедрость"], "ловчий в обиде", { otnosheniya: [down("{ловчий}")] }),
      v("Пополам", ["мир"], "оба ворчат", { otnosheniya: [down("тулл"), down("{ловчий}")] }),
    ],
    traces: [tr("molva", "ловчий хвастает в корчме или молчит")],
    dalshe: [],
    source: asIs(76, 74),
  },
  {
    n: 16, id: "ukho_snova", name: "Ухо снова", theme: "kromka", level: "dolzhnostnoe", kind: "sobytie", thread: { nit: "dengi", step: "первая кража" },
    where: ["zamok"], whereNote: "писарская", when: "zima",
    who: [slot("мужик", { text: "из деревни" }), slot("писарь"), slot("десятник")],
    oneOf: { slots: ["мужик", "писарь", "десятник"], trait: "nechist_na_ruku" },
    povod: "Нить «деньги» у писаря или десятника на ступени «первая кража».",
    intro: "За одну голову зверя заплачено дважды: у головы урезано ухо. Кто-то принёс её снова.",
    variants: [
      v("Разобраться тихо", ["осторожность", "терпение"], "может открыться, что писарь знал"),
      v("Выпороть мужика при всех", ["жёсткость"], "урок, но писарь остаётся в тени", { otnosheniya: [down("{мужик}")] }),
      v("Списать на недогляд", ["покой"], "нить идёт дальше", { nit: { nit: "dengi", step: "привычка" } }),
    ],
    traces: [tr("vedomost", "головных больше, чем убитых зверей")],
    dalshe: [],
    source: asIs(76),
  },
  {
    n: 17, id: "staya_idyot_na_derevnyu", name: "Стая идёт на деревню", theme: "kromka", level: "stol", kind: "sobytie", tags: ["beda"],
    where: ["verkhnyaya"], when: "zima",
    who: [slot("десятник"), slot("староста_верх")],
    intro: "Стая идёт на верхнюю деревню. Если десятник уведёт людей, замок останется без стражи; не уведёт — деревня одна.",
    variants: [
      v("Вести людей в деревню", ["смелость"], "замок открыт на ночь"),
      v("Собрать деревню за тын замка", ["порядок"], "скот и дворы под зверем"),
      v("Звать бывалых", ["осторожность"], "серебро вперёд, их слово — их цена", { serebro: -1 }),
    ],
    traces: [tr("mesto", "после набега уходят дворы")],
    dalshe: [],
    source: moved("с острожка Крайний", 75),
  },
  {
    n: 18, id: "sheptat_lesu", name: "«Шептать лесу»", theme: "kromka", level: "peresechenie", kind: "sobytie",
    where: ["verkhnyaya", "chasovnya"], when: "lyuboy",
    who: [who("бабы деревни"), slot("жрец")],
    intro: "Бабы стали всерьёз «шептать лесу» у кромки. Жрец запрещает. В деревне ссора.",
    variants: [
      v("Поддержать жреца", ["вера"], "бабы шепчут тайком"),
      v("Не мешать", ["покой"], "жрец в обиде, лесные могут услышать", { otnosheniya: [down("{жрец}")] }),
      v("Звать ловчего рассудить, что лес любит", ["новое"], "спорно"),
    ],
    traces: [tr("mesto", "ленточки на кустах у кромки")],
    dalshe: [],
    source: asIs(78),
  },
  {
    n: 19, id: "pyan_v_dozore", name: "Пьян в дозоре", theme: "kromka", level: "dolzhnostnoe", kind: "sobytie", thread: { nit: "pyanstvo" },
    where: ["zamok"], whereNote: "стена замка", when: "zima",
    who: [slot("стражник", { trait: "charka" }), slot("десятник")],
    intro: "Стражник пьян в дозоре и говорит: «лютый мороз, грелся». Мороза не было.",
    variants: [
      v("Наказать при всех", ["порядок"], "стражник в обиде", { otnosheniya: [down("{стражник}")], likho: -1 }),
      v("Прикрыть", ["свои"], "нить идёт дальше", { nit: { nit: "pyanstvo" }, likho: 1 }),
      v("Отправить к жрецу", ["вера"], "стражник кается или нет"),
    ],
    traces: [],
    vyshe: "Если в ту ночь что-то случилось.",
    dalshe: [],
    source: moved("с острожка Крайний", 77),
  },
  // ---------- храм и обряд ----------
  {
    n: 20, id: "pokhoronit_po_staromu", name: "Похоронить по-старому", theme: "khram", level: "stol", kind: "sobytie",
    where: ["chasovnya"], whereNote: "часовня, кладбище", when: "lyuboy",
    who: [slot("семья", { text: "семья покойного" }), slot("жрец"), slot("сосед", { text: "доносчик" })],
    intro: "Семья тайно положила покойника в землю, а не сожгла, как велит указ. Сосед донёс. Палата берёт пеню.",
    variants: [
      v("Заплатить пеню за семью", ["забота", "щедрость"], "серебро", { serebro: -1 }),
      v("Взыскать пеню с семьи", ["порядок"], "семья обеднела, сосед доволен", { otnosheniya: [down("{семья}"), up("{сосед}")] }),
      v("Замять", ["покой"], "палата узнает позже, и пени больше", { serebro: -2 }),
    ],
    traces: [tr("mesto", "свежая могила у старого кладбища")],
    dalshe: [],
    source: asIs(1, 37, 43),
  },
  {
    n: 21, id: "melnichikha_pri_kotoroy_bog_otvechaet", name: "Мельничиха, при которой бог отвечает", theme: "khram", level: "peresechenie", kind: "sobytie",
    where: ["melnitsa"], when: "lyuboy",
    who: [slot("мельничиха"), slot("мельник"), slot("жрец")],
    intro: "Говорят, при мельничихе бог отвечает чаще. К ней тайком ходят молиться. Жрец хочет приписать её к часовне, муж против.",
    variants: [
      v("На стороне жреца", ["вера"], "мельник в обиде, помол медленнее", { otnosheniya: [down("{мельник}")], khleb: "помол медленнее" }),
      v("На стороне мужа", ["порядок"], "жрец пишет в храм", { otnosheniya: [down("{жрец}")] }),
      v("Пусть молятся при мельнице, а жрец приходит туда", ["новое"], "обоим не по нраву", { otnosheniya: [down("{мельник}"), down("{жрец}")] }),
    ],
    traces: [tr("mesto", "тропа к мельнице после вечерни")],
    dalshe: [],
    source: moved("из Бродов", 33),
  },
  {
    n: 22, id: "knigi_po_slukhu", name: "Книги «по слуху»", theme: "khram", level: "dolzhnostnoe", kind: "sobytie",
    where: ["chasovnya"], when: "lyuboy",
    who: [slot("служка"), slot("писарь")],
    intro: "Годами приход стоял без жреца, книги вёл служка — «по слуху и без лет». Теперь в межах и годах путаница.",
    variants: [
      v("Писарю переписать набело", ["порядок", "основа"], "месяц работы"),
      v("Оставить как есть", ["покой"], "спор о меже найдёт опору в путанице"),
      v("Сверить со старожилами", ["обычай", "терпение"], "время, но заодно предания"),
    ],
    traces: [],
    dalshe: [{ text: "находка в архиве — старая межа или старый долг" }],
    source: asIs(41),
  },
  {
    n: 23, id: "desyatyy_snop", name: "Десятый сноп", theme: "khram", level: "stol", kind: "sobytie",
    thread: { nit: "dengi", esli: "если ключник «Нечист на руку» — это ступень его нити" },
    where: ["chasovnya"], when: "zhatva",
    who: [slot("ключник"), slot("жрец")],
    intro: "Ключник увёз десятый сноп вместе с долей владения. Жрец стыдит Сенешаля при людях на сходе.",
    variants: [
      v("Вернуть сноп и извиниться при людях", ["прямота"], "слово Сенешаля крепнет, ключник в обиде", { slovo: 1, otnosheniya: [down("{ключник}")], khleb: "десятый сноп — храму" }),
      v("Вернуть тихо", ["мир"], "на сходе осталось как было", { khleb: "десятый сноп — храму" }),
      v("Стоять на своём", ["гордость"], "жрец пишет в храм, деревни смотрят", { otnosheniya: [down("{жрец}")] }),
    ],
    traces: [],
    dalshe: [],
    source: moved("управитель барона", 41),
  },
  {
    n: 24, id: "gde_zhech_myortvykh", name: "Где жечь мёртвых", theme: "khram", level: "peresechenie", kind: "sobytie",
    where: ["kromka", "derevnya"], when: "zima",
    who: [who("бабы"), slot("жрец"), slot("ловчий")],
    intro: "Бабы говорят, что звери перешли лёд из-за дыма кострища, ушедшего за реку. Спорят, где и при каком ветре жечь мёртвых.",
    variants: [
      v("Перенести кострище", ["вера", "осторожность"], "верят приметам и боятся зверя; труд и спор"),
      v("Оставить", ["порядок"], "бабы боятся"),
      v("Жечь по ветру, как скажет ловчий", ["новое"], "бабы спокойнее, если ловчему верят; жрец недоволен, что обряд решает ловчий", { otnosheniya: [down("{жрец}")] }),
    ],
    traces: [],
    dalshe: [],
    source: asIs(78),
  },
  // ---------- деньги, подать, долги ----------
  {
    n: 25, id: "drova_v_dolg", name: "Дрова в долг", theme: "dengi", level: "dolzhnostnoe", kind: "sobytie", thread: { nit: "dolg", start: true },
    where: ["derevnya"], when: "sanny_put",
    who: [slot("староста"), slot("вдова", { text: "или бедный двор" }), who("заимодавец")],
    intro: "После худого лета двор взял дрова в долг под поруку старосты до жатвы, с ростом. Отдать нечем.",
    decides: "староста",
    variants: [
      v("Платить за двор самому", ["забота", "щедрость"], "у старосты нить «долг»", { nit: { nit: "dolg", step: "занял" }, trait: "v_dolgakh", likho: 1 }),
      v("Отказаться от поруки", ["порядок"], "двор уходит", { dvory: -1, likho: 1 }),
      v("Идти к Сенешалю", ["осторожность", "верность"], "выше, на стол"),
    ],
    traces: [],
    vyshe: "Староста идёт к Сенешалю.",
    dalshe: [{ text: "нить «долг» — koloda.md, раздел 4", nit: "dolg" }],
    source: moved("из Тальмиры", 1),
  },
  {
    n: 26, id: "dve_knigi_skupshchika", name: "Две книги скупщика", theme: "dengi", level: "dolzhnostnoe", kind: "sobytie", tags: ["sled"],
    where: ["korchma"], whereNote: "корчма, торг", when: "torg",
    who: [who("скупщик добра — мёда и шкур"), slot("ключник")],
    intro: "Скупщик держит две книги и показывает ту, «что для мытников». Ключник сказал «так» и ушёл.",
    decides: "ключник",
    variants: [
      v("Разоблачить", ["порядок"], "скупщик больше не берёт добро", { likho: -1 }),
      v("Взять с него за молчание", ["выгода", "лукавство"], "нить «посулы»", { nit: { nit: "posuly" }, serebro: 1, likho: 1 }),
      v("Промолчать", ["покой"], "скупщик торгует по двум книгам дальше, мыто недобирают", { likho: 1 }),
    ],
    traces: [tr("vedomost", "цена мёда на торгу выше, чем в книге ключника")],
    dalshe: [],
    source: moved("из Жердей", 60),
  },
  {
    n: 27, id: "seno_palaty", name: "Сено палаты", theme: "dengi", level: "stol", kind: "sobytie",
    where: ["zamok"], whereNote: "ведомость", when: "zima",
    who: [slot("ключник"), slot("писарь")],
    intro: "Доля палаты лежит сеном в стогах. Продать некому, вывезти не на чем.",
    variants: [
      v("Везти в ставку своими возами", ["порядок"], "люди и кони на месяц"),
      v("Продать соседу", ["выгода"], "палата может не признать", { serebro: 1, seno: "сено палаты продано соседу" }),
      v("Отдать сеном на коней воеводы в счёт смотра", ["новое"], "надо договориться", { seno: "сено — на коней воеводы" }),
    ],
    traces: [],
    dalshe: [{ text: "жетон «долг палате» на дорожке" }],
    source: asIs(50),
  },
  {
    n: 28, id: "plata_s_vdovyey_telezhki", name: "Плата с вдовьей тележки", theme: "dengi", level: "dolzhnostnoe", kind: "sobytie",
    where: ["perevoz"], when: "mezhen",
    who: [slot("перевозчик"), slot("вдова")],
    intro: "Перевозчик берёт «с колёс», и с вдовьей тележки тоже. Другой перевозчик отдаёт ей свои медяки.",
    decides: "тот, до кого дошло",
    variants: [
      v("Велеть брать по ряду", ["порядок"], "со всех одинаково; кому платить нечем, ищут обход по льду (карточка 29)"),
      v("Освободить вдов", ["забота", "щедрость"], "убыток перевоза", { serebro: -1 }),
      v("Пусть решает перевозчик", ["вольность", "покой"], "дальше решает натура перевозчика"),
    ],
    traces: [tr("molva", "молва про доброго перевозчика или про злого")],
    dalshe: [{ text: "кому платить нечем, ищут обход по льду", card: "utonul_v_obkhod" }],
    source: moved("с Зыбки", 53),
  },
  {
    n: 29, id: "utonul_v_obkhod", name: "Утонул в обход", theme: "dengi", level: "stol", kind: "sobytie",
    where: ["perevoz"], when: "sanny_put", whenNote: "первый лёд",
    who: [slot("вдова", { text: "вдова обозника с детьми" }), who("хозяин воза"), slot("перевозчик")],
    intro: "Обозник поехал в обход перевоза по льду и утонул с чужим возом. Вдове кормить детей нечем, все винят плату за перевоз.",
    variants: [
      v("Помочь вдове из казны", ["забота", "щедрость"], "серебро", { serebro: -1 }),
      v("Заставить хозяина воза", ["правда"], "хозяин возит ей соль, как в лоре", { otnosheniya: [down("хозяин воза")] }),
      v("Снизить плату на зиму", ["мир"], "убыток перевоза", { serebro: -1 }),
    ],
    traces: [],
    dalshe: [],
    source: moved("с Девятой заставы", 64, 66),
  },
  // ---------- люди и семьи ----------
  {
    n: 30, id: "sol_po_vadelinskoy_tsene", name: "Соль по ваделинской цене", theme: "lyudi", level: "lichnoe", kind: "sobytie",
    where: ["lyuboe"], when: "sanny_put",
    who: [slot("жених", { text: "помощник советника" }), who("будущий тесть")],
    intro: "Будущий тесть ставит условием свадьбы соль по ваделинской цене. У жениха столько нет.",
    decides: "жених",
    variants: [
      v("Просить у советника", ["свои"], "советник даст в долг услуги — близость растёт, откажет — обида"),
      v("Занять", ["вспыльчивость", "близкие"], "начало нити «долг»", { nit: { nit: "dolg", step: "занял" }, trait: "v_dolgakh", likho: 1 }),
      v("Ждать год", ["терпение"], "свадьба через год, если тесть не отдаст дочь другому"),
    ],
    traces: [],
    vyshe: "Просьба к Сенешалю — личная просьба (koncept-3.md, 8.1).",
    dalshe: [{ text: "свадьба — Сенешаль посаженный отец", nit: "svadba" }],
    source: asIs(56),
  },
  {
    n: 31, id: "pridanoe_nazad", name: "Приданое назад", theme: "lyudi", level: "stol", kind: "epizod", delo: "sud_i_skhod",
    where: ["lyuboe"], when: "lyuboy",
    who: [who("род невесты"), slot("вдовец")],
    intro: "Невеста умерла бездетной. Её род требует назад приданое и прабабкины серьги.",
    variants: [
      v("По ряду — вернуть всё", ["порядок"], "род невесты доволен, вдовец беднеет и в обиде", { otnosheniya: [up("род невесты"), down("{вдовец}")] }),
      v("По обычаю — серьги вернуть, остальное нет", ["обычай"], "обе стороны ворчат, но спор закрыт"),
      v("Поделить", ["мир"], "обе стороны в обиде вполовину", { otnosheniya: [down("род невесты"), down("{вдовец}")] }),
    ],
    traces: [],
    dalshe: [],
    source: asIs(44),
  },
  {
    n: 32, id: "mechenyy_zhenikh", name: "Меченый жених", theme: "lyudi", level: "lichnoe", kind: "sobytie",
    where: ["derevnya"], when: "sanny_put",
    who: [slot("рыбак"), slot("меченый", { text: "жених" })],
    intro: "Рыбак отказывает меченому жениху: «у детей будут кошачьи глаза».",
    decides: "жених",
    variants: [
      v("Сватать снова, со сватами и подарками", ["щедрость", "терпение"], "серебро жениха; рыбак смягчился — нить «свадьба», ступень «сватовство»; нет — отказ при людях, обида", { nit: { nit: "svadba", step: "сватовство" } }),
      v("Увезти невесту тайком", ["смелость", "вспыльчивость"], "нить «любовь» — побег; у рыбака обида роду, может начаться «месть»", { nit: { nit: "lyubov", step: "побег" }, otnosheniya: [down("{рыбак}")] }),
      v("Отступиться", ["смирение", "покой"], "невесту отдают другому, у жениха обида на деревню — может начаться «уйти»"),
      v("Просить Сенешаля замолвить слово", ["верность"], "выше, на стол"),
    ],
    traces: [],
    vyshe: "Жених просит Сенешаля замолвить слово. Слово Сенешаля за меченого видят все меченые и все, кто их боится.",
    dalshe: [{ text: "нить «метка»", nit: "metka" }],
    source: asIs(37),
  },
  {
    n: 33, id: "otets_zovyot_k_torgu", name: "Отец зовёт к торгу", theme: "lyudi", level: "lichnoe", kind: "sobytie",
    where: ["zamok"], when: "torg", whenNote: "перед осенним торгом",
    who: [slot("помощник писаря"), who("его отец — лавочник в Ваделе")],
    intro: "Отец зовёт сына назад в лавку к осеннему торгу: брату одному тяжело.",
    decides: "помощник писаря",
    variants: [
      v("Уехать", ["свои", "близкие"], "писарь без помощника, нить «уйти»", { nit: { nit: "uyti" } }),
      v("Остаться", ["честолюбие", "место"], "отец в обиде, брату тяжело"),
      v("Просить отпуск на месяц", ["близкие", "место"], "месяц писарь один; помощник вернётся — или останется у отца"),
    ],
    traces: [],
    vyshe: "Просит Сенешаля отпустить — это и есть выбор игрока.",
    dalshe: [],
    source: asIs(56),
  },
  {
    n: 34, id: "povitukha_ne_doedet", name: "Повитуха не доедет", theme: "lyudi", level: "lichnoe", kind: "sobytie", tags: ["beda"],
    where: ["derevnya"], when: "ledokhod",
    who: [slot("роженица"), who("туллья-повитуха"), slot("муж")],
    intro: "Повитуха из ставки не доедет по льду. Роды принимает туллья.",
    decides: "муж",
    variants: [
      v("Пустить туллью", ["любопытство", "смелость"], "обошлось — доверие к туллам растёт, беда — винят туллов"),
      v("Ждать повитуху", ["обычай", "страх"], "роды без помощи, опасно для роженицы и ребёнка (zdorovye.md)"),
      v("Звать знахарку", ["вера"], "своя, деревенская, но жрец косится"),
    ],
    traces: [],
    dalshe: [{ text: "доверие к туллам в деревне растёт или падает" }],
    source: asIs(52),
  },
  {
    n: 35, id: "smotr_metki", name: "Смотр метки", theme: "lyudi", level: "lichnoe", kind: "sobytie", thread: { nit: "metka", start: true },
    where: ["derevnya"], when: "zima", whenNote: "перед смотром метки",
    who: [slot("мать"), slot("отец"), who("ребёнок")],
    intro: "Мать боится нести ребёнка на смотр метки: думает, храм заберёт. Отец помнит, что за чуткого на гильдейском дворе платят.",
    variants: [
      v("Нести", ["порядок", "выгода"], "ребёнок в книге меток, может уйти на гильдейский двор за плату; мать в страхе"),
      v("Прятать", ["близкие", "лукавство"], "черта «Прячет меченое дитя», нить «метка»", { nit: { nit: "metka", step: "прячут" }, trait: "pryachet_mechenoe" }),
      v("Спросить жреца", ["вера"], "решение уходит к жрецу: книга рождений у храма, укрыть потом уже не выйдет"),
    ],
    traces: [tr("molva", "ребёнка не видно на улице"), tr("ushi", "соседка косится")],
    dalshe: [],
    source: asIs(57, 52),
  },
  // ---------- совет и суд ----------
  {
    n: 36, id: "izba_starika", name: "Изба старика", theme: "sovet", level: "stol", kind: "epizod", delo: "sud_i_skhod",
    where: ["derevnya"], whereNote: "хутор", when: "lyuboy",
    who: [slot("сосед"), slot("старик")],
    intro: "Сосед обвиняет одинокого старика в колдовстве. Хочет его избу и огород у своей межи.",
    variants: [
      v("Разобрать", ["правда", "терпение"], "время; правда может выйти наружу"),
      v("Выселить старика", ["страх"], "изба соседу", { otnosheniya: [up("{сосед}")] }),
      v("Взять старика под защиту", ["мягкость", "смелость"], "слово Сенешаля; сосед в обиде", { slovo: "zalog", otnosheniya: [down("{сосед}")] }),
    ],
    traces: [tr("mesto", "у старика побиты окна")],
    dalshe: [],
    source: asIs(31),
  },
  {
    n: 37, id: "meshki_s_melnitsy", name: "Мешки с мельницы", theme: "sovet", level: "dolzhnostnoe", kind: "sobytie",
    where: ["melnitsa"], when: "zhatva", whenNote: "после жатвы",
    who: [slot("мельник"), slot("меченый", { text: "видит во тьме" }), slot("помощник ключника", { trait: "nechist_na_ruku" }), slot("ключник")],
    intro: "С мельницы ночами таскают мешки. Мельник берёт в сторожа меченого, что видит во тьме. Меченый видит вора — и вор свой: помощник ключника.",
    decides: "мельник",
    variants: [
      v("Поймать с поличным: ещё ночь в засаде, со свидетелями", ["порядок", "терпение"], "вора судят при людях, лихо падает; ключник в обиде за своего человека", { likho: -1, otnosheniya: [down("{ключник}")] }),
      v("Сказать ключнику с глазу на глаз", ["осторожность", "мягкость"], "ключник решает сам: накажет тихо или прикроет — тогда нить «деньги» идёт дальше"),
      v("Взять с вора мукой за молчание", ["выгода", "лукавство"], "мельник сам в доле, мешки пропадают дальше, лихо растёт", { likho: 1, khleb: "мельник берёт мукой" }),
      v("Промолчать: слово меченого против человека ключника", ["страх"], "меченому не верят, мешки пропадают дальше, лихо растёт", { likho: 1 }),
    ],
    traces: [tr("vedomost", "помол не сходится"), tr("molva", "мельник взял в сторожа меченого")],
    dalshe: [{ text: "вор прикрыт — ступень нити «деньги» у помощника ключника", nit: "dengi" }],
    source: moved("из Ольховки", 31),
  },
  {
    n: 38, id: "gramota_kotoroy_nikto_ne_chital", name: "Грамота, которой никто не читал", theme: "sovet", level: "stol", kind: "epizod", delo: "sud_i_skhod",
    where: ["lyuboe"], when: "lyuboy",
    who: [slot("челобитчики"), slot("писарь")],
    intro: "Челобитчики ссылаются на грамоту. Её за три медяка написал площадной писец у моста.",
    variants: [
      v("Прочитать и разоблачить", ["порядок"], "челобитчики посрамлены, в другой раз площадной грамоте не поверят"),
      v("Принять, если в ней правда", ["правда"], "спор решён по делу, палата может придраться к грамоте"),
      v("Отослать в палату", ["осторожность", "покой"], "решать будет палата, долго; деревни видят, что своего суда марка не держит"),
    ],
    traces: [],
    dalshe: [],
    source: moved("из Ваделы", 66),
  },
  // ---------- предания и вести ----------
  {
    n: 39, id: "srok_vyshel", name: "Срок вышел", theme: "predaniya", rises: "molva", kind: "predanie",
    where: ["nizhnyaya", "verkhnyaya"], whereNote: "деревни", when: "lyuboy",
    who: [slot("старожил")],
    vyshe: "Молва дошла до Сенешаля, или люди начали собирать возы.",
    intro: "Старики помнят «обещание»: лес сто лет не тронется. Срок вышел.",
    decides: "тот, до кого дошло",
    variants: [
      v("Развеять", ["сомнение"], "время и слово", { slovo: "zalog" }),
      v("Подтвердить у лесных", ["любопытство"], "дело «К лесным»", { delo: "k_lesnym" }),
      v("Промолчать", ["покой"], "люди готовы уходить"),
    ],
    traces: [],
    dalshe: [],
    source: asIs(51),
  },
  {
    n: 40, id: "sosed_ushyol_perezhdat", name: "Сосед ушёл «переждать»", theme: "predaniya", level: "stol", kind: "vest",
    where: [], outside: "sosed", whereNote: "соседняя марка", when: "zima",
    who: [slot("сосед", { text: "владетель" }), slot("староста соседа")],
    intro: "Сосед ушёл «переждать», оставив марку на старосту и скрыв, что его нет. Через год палата напишет её выморочной.",
    variants: [
      v("Промолчать", ["выгода", "лукавство"], "соседская марка опустеет, её люди придут к вам"),
      v("Написать в палату", ["порядок"], "сосед станет врагом", { otnosheniya: [down("{сосед}")] }),
      v("Помочь старосте держать марку", ["щедрость"], "время и люди; союзник", { otnosheniya: [up("{староста соседа}")] }),
    ],
    traces: [],
    dalshe: [],
    source: asIs(53),
  },
];

export const cardById = (id: string): DeckCard => {
  const c = DECK.find((x) => x.id === id);
  if (!c) throw new Error(`В колоде нет карточки ${id}`);
  return c;
};
