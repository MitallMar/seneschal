// Словарь поводов (задача И33; замысел — docs/design/svyazi.md, 11.1): что карточка колоды, строка «выше», отложенный исход
// и ступень нити могут спросить у состояния партии. Условие — пара «род, вопрос» и ссылки на словари; слова карточки остаются рядом.
// Движка событий ещё нет: здесь только данные. Опись состояния, к которой условия обращены, — svyazi.md, раздел 3.
import type { ThreadId, Want, Hold, PoleKey, Bias } from "./types";
import type { CardWhen, CardWhere, ForceId, ForceScaleId, DealId } from "./deck";

// ---------- девятнадцать родов (svyazi.md, 11.1) ----------
export type CondRod =
  | "vremya" | "mesto" | "dolzhnost" | "chelovek" | "nit" | "otnosheniya" | "bylo" | "schyot" | "dvor" | "derevnya" | "khozyaystvo" | "zheton" | "kromka" | "likho"
  | "sila" | "sosed" | "seneschal" | "ispytanie" | "mir";
export const COND_RODS: { id: CondRod; name: string; sprashivaet: string; primer: string }[] = [
  { id: "vremya", name: "время", sprashivaet: "месяц дорожки; срок или сезон (8.6)", primer: "«ледоход»" },
  { id: "mesto", name: "место", sprashivaet: "есть ли место, его ступень", primer: "«корчма без присмотра»" },
  { id: "dolzhnost", name: "должность", sprashivaet: "кто на должности; свободно ли место помощника", primer: "69" },
  { id: "chelovek", name: "человек", sprashivaet: "черта, происхождение, желание, возраст, здоровье у роли", primer: "124: «Прячет меченое дитя»" },
  { id: "nit", name: "нить", sprashivaet: "у роли нить на ступени, ветвь", primer: "76: «деньги», «соблазн»" },
  { id: "otnosheniya", name: "отношения", sprashivaet: "обида, родство, вражда между ролями", primer: "63" },
  { id: "bylo", name: "было раньше", sprashivaet: "в журнале есть запись: карточка с таким исходом, поступок", primer: "64: «ловчий без десятника взял людей»" },
  { id: "schyot", name: "счёт", sprashivaet: "сколько раз за срок", primer: "72: «в третий раз за год»" },
  { id: "dvor", name: "двор", sprashivaet: "собирается уйти; пуст; на льготе", primer: "116" },
  { id: "derevnya", name: "деревня", sprashivaet: "её слово", primer: "«ворчат»" },
  { id: "khozyaystvo", name: "хозяйство", sprashivaet: "хлеб и сено словом; нужда перед податью", primer: "117" },
  { id: "zheton", name: "жетон", sprashivaet: "лежит ли, близок ли срок, сорван ли", primer: "103: «люди к смотру»" },
  { id: "kromka", name: "кромка", sprashivaet: "натиск; укрытие деревни; зверь подходил", primer: "127" },
  { id: "likho", name: "лихо", sprashivaet: "ступень; гнездо", primer: "91, 104" },
  { id: "sila", name: "сила", sprashivaet: "ступень шкалы; есть ли сведение; что вскрылось", primer: "95, 108, 106" },
  { id: "sosed", name: "сосед", sprashivaet: "что у соседей: беда, пустые хутора, съезд", primer: "137, 139, 141" },
  { id: "seneschal", name: "Сенешаль", sprashivaet: "где он; кто за главного", primer: "75, 94" },
  { id: "ispytanie", name: "испытание", sprashivaet: "выполнено ли условие", primer: "143" },
  { id: "mir", name: "мир", sprashivaet: "беда года, весть, проезжий", primer: "102, 130" },
];

// ---------- вопросы рода ----------
// Закрытый список: движок читает условие по паре «род, вопрос». Новый вопрос сначала дописывается сюда.
export const COND_CHTO = {
  vremya: {
    mesyatsy: "выпадает и в эти месяцы дорожки года",
    god: "год акта: не раньше такого-то или ровно такой",
    chasto: "как часто: каждый год, раз в год, раз в акт",
    strada: "идёт страда: сев, покос, жатва — руки заняты",
    prazdnik: "праздник, свадьба, поминки — люди в сборе",
  },
  mesto: {
    est: "место есть",
    stupen: "ступень места: брошено, запущено, исправно, крепко",
    prismotr: "место под присмотром: освещено делом Сенешаля, при нём свой человек или страж",
    rabota: "на месте идёт или ждёт работа",
    master: "при месте есть мастер или ведущий",
  },
  dolzhnost: {
    zanyata: "должность занята",
    pomoshchnik: "место помощника свободно",
    novyy: "на должности или при марке новый человек",
    dostup: "у роли доступ к казне, кладовой, книгам или людям",
    mesto_svobodno: "место, на которое роль метит, свободно или шатается",
  },
  chelovek: {
    cherta: "у роли черта",
    proiskhozhdenie: "происхождение роли",
    zhelanie: "желание роли",
    priznak: "полюс признака у роли",
    pristrastie: "пристрастие доклада у роли",
    vozrast: "возраст роли",
    zdorovye: "здоровье роли: рана, хворь, слёг",
    semya: "семья роли: вдова, женат, дети, дочь на выданье, схоронил своих",
    metka: "у роли метка",
    dostatok: "достаток роли: нужда, деньги в руках",
    umenie: "умение или прежняя служба роли",
  },
  nit: {
    na_stupeni: "у роли нить на ступени или ветви",
    idyot: "у роли идёт нить, ступень любая",
    derzhatel: "у нити есть держатель или знающий",
  },
  otnosheniya: {
    obida: "обида роли на другую роль или на Сенешаля",
    dobro: "роль помнит добро или услугу",
    rodstvo: "родство или свойство между ролями",
    vrazhda: "вражда между ролями или дворами",
    vernost: "верность роли Сенешалю: крепка или слаба",
    blizost: "близость роли к Сенешалю или к другой роли",
  },
  bylo: {
    kartochka: "выпадала карточка, с таким-то исходом",
    postupok: "в журнале есть поступок роли",
    sobytie: "в журнале есть событие без карточки: беда, похороны, рождение, работа на месте",
    ne_soshlis: "участники этой карточки не сошлись",
    nakazan: "роль наказана, спрошена или напугана — или нет",
    uznali: "о деле роли узнали: свидетель, огласка, жалоба",
  },
  schyot: {
    raz: "сколько раз за срок",
    dolgo: "сколько времени длится: декады, месяцы на ступени",
  },
  dvor: {
    sobiraetsya_uyti: "двор собирается уйти",
    pust: "есть пустой двор или изба",
    na_lgote: "двор на льготе",
    ushyol: "двор ушёл",
    dolg: "на дворе долг или ссуда",
    nuzhda: "двору нужно: земля, лес, изба, семена",
  },
  derevnya: {
    slovo: "слово деревни: держатся, ворчат, собираются уйти, уходят",
    skhod: "деревня на сходе или шепчется об одном",
  },
  khozyaystvo: {
    khleb: "хлеб словом: хватит, впритык, не хватит",
    seno: "сено словом: хватит, впритык, не хватит",
    nuzhda_pered_podatyu: "нужда перед податью",
    nedostacha: "недостача в ведомости, кладовой или подати",
    dobro: "добро к торгу: мёд, шкуры, лесное добро",
    ruki: "рук хватает или нет",
    dolgi: "у людей марки долги",
    urozhay: "год добрый или худой: урожай, доход",
  },
  zheton: {
    lezhit: "жетон лежит на дорожке",
    srok_blizko: "срок жетона близок",
    sorvan: "жетон сорван",
  },
  kromka: {
    natisk: "натиск кромки",
    ukrytie: "укрытие деревни: тын, острог, вышка",
    zver: "зверь подходил, стоит у деревни или перешёл лёд",
  },
  likho: {
    stupen: "ступень лиха: тихо, шалят, воруют, лихие люди",
    gnezdo: "есть гнездо лиха",
    litso: "есть лицо лиха: скупщик, вожак, их люди",
  },
  sila: {
    stupen: "ступень шкалы силы",
    svedenie: "у силы есть сведение о марке",
    vskrylos: "вскрылось: недоимка, излишек, ложь в отписке, доля у лиха",
    na_roli: "на роли — человек силы или сама сила",
    khod: "сила сделала ход",
    dolg: "у силы долг перед маркой или у марки перед ней",
  },
  sosed: {
    beda: "у соседей беда",
    pustye_khutora: "у соседа пустые хутора или дворы",
    sezd: "съезд союза",
    spor: "спор с соседями: межа, покос, вира",
    prosba: "сосед просит: рук, хлеба, людей, подписи",
  },
  seneschal: {
    gde: "где Сенешаль: место, дело или отъезд",
    za_glavnogo: "Сенешаль в отъезде, за главного оставлена роль",
    tayna: "у Сенешаля есть тайна",
    slovo: "слово Сенешаля: дано, сдержано, не сдержано",
    milost: "милость Сенешаля: позвал к столу, отметил, принял",
    reshenie: "решение Сенешаля: наказ, право, суд, отказ, защита",
  },
  ispytanie: {
    uslovie: "условие испытания выполнено или нет: дворы, острог, храм и жрец, смотр, подать",
  },
  mir: {
    beda: "беда года: худое лето, голод за рекой, пожар, волчья зима",
    vest: "весть или слух из округи",
    proezzhiy: "в марке проезжий: скупщик, маг, вербовщик, обоз, гонец",
    pogoda: "погода: первый лёд, половодье, оттепель, мороз",
    ukaz: "указ или обычай округи",
    sluchay: "случай: удача, находка, встреча",
  },
} as const satisfies Record<CondRod, Record<string, string>>;
export type CondChto<R extends CondRod> = keyof (typeof COND_CHTO)[R] & string;

// Слова состояния, по которым условие сверяется с описью (koncept-3.md, 3.1–3.3; likho.md; sily.md, 16).
export const STATE_WORDS = {
  mesto: ["брошено", "запущено", "исправно", "крепко"],
  derevnya: ["держатся", "ворчат", "собираются уйти", "уходят"],
  zapas: ["хватит", "впритык", "не хватит"],
  likho: ["тихо", "шалят", "воруют", "лихие люди"],
  doverie: ["косятся", "терпят", "ладят", "заодно"],
  ispytanie: ["дворы", "острог", "храм и жрец", "смотр", "подать"],
} as const;

// ---------- условие ----------
// rol — слот карточки, о ком условие; k — вторая роль (отношения: обида rol на k). net — отрицание: «нет», «не».
// Ссылки на словари: нить и ступень, черта, желание, удержка, полюс признака, происхождение, пристрастие, место, сила и ступени её шкалы,
// карточка, жетон, дело, месяцы дорожки. slovo — слово состояния, как в документах («ворчат», «впритык», «лихие люди»);
// ot — «и выше» по шкале: слово или ступень — нижняя граница. text — слова карточки или каталога, если условие вынуто из завязки или требует оговорки.
export interface CondArgs {
  rol?: string;
  k?: string;
  net?: true;
  nit?: ThreadId;
  step?: string;
  vetv?: string;
  trait?: string;
  want?: Want;
  hold?: Hold;
  pole?: PoleKey;
  origin?: string;
  bias?: Bias;
  mesto?: CardWhere;
  sila?: ForceId;
  scale?: ForceScaleId;
  steps?: string[];
  hod?: number;
  card?: string;
  zheton?: string;
  delo?: DealId;
  mesyatsy?: CardWhen[];
  n?: number;
  slovo?: string;
  ot?: true;
  text?: string;
}
export type Cond = { [R in CondRod]: { rod: R; chto: CondChto<R> } & CondArgs }[CondRod];
// «Любое из»: у повода условия идут подряд и нужны все; группа «или» — отдельной записью.
export interface CondAny { ili: Cond[] }
export type Usl = Cond | CondAny;

const mk = <R extends CondRod>(rod: R) => (chto: CondChto<R>, args: CondArgs = {}): Cond => ({ rod, chto, ...args }) as Cond;
// Сборка условия: u.nit("na_stupeni", { rol: "писарь", nit: "dengi", step: "соблазн" }).
export const u = {
  vremya: mk("vremya"), mesto: mk("mesto"), dolzhnost: mk("dolzhnost"), chelovek: mk("chelovek"), nit: mk("nit"), otnosheniya: mk("otnosheniya"),
  bylo: mk("bylo"), schyot: mk("schyot"), dvor: mk("dvor"), derevnya: mk("derevnya"), khozyaystvo: mk("khozyaystvo"), zheton: mk("zheton"),
  kromka: mk("kromka"), likho: mk("likho"), sila: mk("sila"), sosed: mk("sosed"), seneschal: mk("seneschal"), ispytanie: mk("ispytanie"), mir: mk("mir"),
  ili: (...list: Cond[]): CondAny => ({ ili: list }),
};
// Частые условия короче: нить роли на ступени; ступени шкалы силы — сила берётся по шкале.
// Чья шкала: расположение и подозрение — палаты, напор и вес — Ратши.
export const SCALE_FORCE: Record<ForceScaleId, ForceId> = { raspolozhenie: "svetlost", podozrenie: "svetlost", napor: "ratsha", ves: "ratsha" };
export const naNiti = (rol: string | undefined, nit: ThreadId, step?: string, vetv?: string): Cond =>
  u.nit("na_stupeni", { ...(rol ? { rol } : {}), nit, ...(step ? { step } : {}), ...(vetv ? { vetv } : {}) });
export const shkala = (scale: ForceScaleId, ...steps: string[]): Cond => u.sila("stupen", { sila: SCALE_FORCE[scale], scale, steps });
// Все простые условия записи: группы «или» развёрнуты.
export const flatConds = (list: Usl[]): Cond[] => list.flatMap((x) => ("ili" in x ? x.ili : [x]));
