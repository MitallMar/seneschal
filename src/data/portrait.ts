// Словарь черт Концепта 3 и правило по умолчанию «признак → поля» (задача И27а). Замысел — docs/design/cherty-dannye.md, разделы 1–2.
// Здесь только данные: слова для экрана и таблицы, по строке на полюс признака. Расчёт портрета — src/sim/portrait.ts. id не менять: под ними будут сохранения.
import type { Sign, Vis, Want, Hold, Approach, MemKey, Bias, Channel, LinkGroup, PoleKey, ThreadId, ThreadHow, HolderRole } from "./types";

export interface Word<T extends string> { id: T; name: string; desc: string }
const w = <T extends string>(id: T, name: string, desc: string): Word<T> => ({ id, name, desc });

export const VIS_NAMES: Record<Vis, string> = { yavnaya: "явная", so_vremenem: "со временем", skrytaya: "скрытая" };

// ---------- 1.2. Весы: желания и удержки ----------
export const WANTS: Word<Want>[] = [
  w("dengi", "деньги", "серебро, добро, доля"),
  w("pochet", "почёт", "честь, место за столом, доброе имя"),
  w("pokoy", "покой", "без хлопот, без перемен"),
  w("blizkie", "близкие", "семья, родня, свои люди — и защитить их"),
  w("mesto", "место", "должность, положение, власть"),
  w("chistaya_sovest", "чистая совесть", "поступить по-доброму, искупить вину"),
  w("novoe", "новое", "дорога, невиданное, книги, новое дело"),
];
export const HOLDS: Word<Hold>[] = [
  w("sovest", "совесть", "«так нельзя»"),
  w("strakh", "страх", "страх попасться и страх беды"),
  w("vernost", "верность", "верность Сенешалю: растёт от его поступков и близости, черты её только крепят или ослабляют"),
  w("pravilo", "правило", "держаться наказа, устава, обычая"),
];

// ---------- 1.3. Подход ----------
export const APPROACHES: Word<Approach>[] = [
  w("pochtit", "почтить", "признать при людях, спросить совета, позвать к столу"),
  w("zashchita", "защитить", "взять под руку, заступиться, поручиться, доброе слово"),
  w("dar", "дар и угощение", "подарить; принять его хлеб и подарок"),
  w("vygoda", "выгода", "доля, плата, счёт"),
  w("vyzov", "вызов", "доверить опасное, «а сможешь?»"),
  w("obychay", "обычай", "жрец, клятва, «как деды»"),
  w("dovod", "довод", "факт, книга, расчёт"),
  w("novoe_delo", "новое дело", "рассказ, поручение, которого не было, книга, дорога"),
  w("sila", "сила", "приказ, угроза, давление"),
  w("prosba", "просьба", "попросить, пожаловаться, разжалобить"),
  w("cherez_blizkikh", "через близких", "помочь его родне, похлопотать за его людей"),
  w("dolzhnost", "должность", "место, почесть, обещание повышения"),
  w("ostavit", "оставить в покое", "не дёргать, не проверять"),
  w("s_glazu_na_glaz", "с глазу на глаз", "прямой разговор без свидетелей"),
  w("kryuchok", "крючок", "тайна, долг, вина, о которых знает Сенешаль"),
  w("vremya", "время", "дать срок; пообещать и сдержать"),
  w("stydit", "пристыдить", "укорить при людях"),
  w("zastolye", "разговор и застолье", "посидеть, выпить, поговорить по душам"),
  w("delo", "дело", "показать делом, дать работу без лишних слов"),
  w("ustav", "устав", "по бирке, по грамоте, по правилу"),
  w("volya", "воля", "дать права в рамке и не связывать"),
];

// ---------- 1.4. Память ----------
// Три числа памяти: плюс и минус словами.
export type MemScale = "obida" | "srok" | "dobro";
export const MEM_SCALES: { id: MemScale; name: string; plus: string; minus: string }[] = [
  { id: "obida", name: "обида", plus: "копит быстрее", minus: "копит медленнее" },
  { id: "srok", name: "держит", plus: "помнит дольше", minus: "быстро отходит" },
  { id: "dobro", name: "добро", plus: "помнит", minus: "забывает" },
];
export const MEM_KEYS: Word<MemKey>[] = [
  w("unizhenie", "унижение", "унижение при людях, отказ от его хлеба"),
  w("dolg", "долг", "долг — до гроша"),
  w("proval", "провал", "провал, в котором его подставили"),
  w("obida_svoim", "обиду своим", "обиду, нанесённую его близким"),
  w("grekh", "грех", "грех — свой и чужой"),
  w("pomekha", "кто мешал", "кто мешал подняться выше"),
  w("slovo", "нарушенное слово", "нарушенное ему слово"),
  w("nakazanie", "наказание", "порку, штраф, разжалование"),
  w("starina", "сломанный обычай", "новшество против старины"),
  w("milost", "милость другому", "милость другому — место у стола, награду — как обиду себе"),
  w("zasluga", "непризнанную заслугу", "непризнанную заслугу"),
];

// ---------- 1.5. Голос: пристрастие доклада ----------
export const BIASES: Word<Bias>[] = [
  w("bez", "без пристрастия", "докладу можно верить на слово"),
  w("sgushchaet", "сгущает", "опасность и убыток больше, чем есть"),
  w("preumenshaet", "преуменьшает", "«обойдётся»: беду и плохую весть смягчает"),
  w("priukrashivaet", "приукрашивает", "своё дело — лучше, чем есть; весть — с прибавкой"),
  w("pryachet", "прячет", "недомолвки: неудобная строка не доходит"),
  w("vygorazhivaet", "выгораживает", "своих или слабых не называет, вину смягчает"),
  w("chernit", "чернит", "соперника и неприятных ему — хуже, чем есть"),
  w("znameniya", "видит знамения", "беды и удачи объясняет приметами, видит знаки там, где их нет"),
];

// ---------- 1.6. Нити (id предварительные; proposed — предложены для каталога нитей, ещё не приняты) ----------
export const THREADS: (Word<ThreadId> & { proposed?: boolean })[] = [
  w("dengi", "деньги", "соблазн → первая кража → привычка → разоблачение"),
  w("dolg", "долг", "занял → срок → на крючке → развязка"),
  w("azart", "азарт", "кости и споры → проигрыш → долг"),
  w("pyanstvo", "пьянство", "чарка → запой → провал в деле"),
  w("lyubov", "любовь", "встречи → подарки и просьбы → ревность, скандал, побег или свадьба"),
  w("krov", "ребёнок на стороне", "мать просит → растёт → узнают"),
  w("proshloe", "прошлое", "беглое, разбойное или «лучшие дни»: ищут или зовут → узнали → выдать, укрыть, признать"),
  w("soglyadatay", "соглядатай", "пишет в палату или чужому владетелю: найти → выгнать, перекупить, кормить ложью"),
  w("posuly", "посулы", "межи и тяжбы — в пользу дающих → жалобы → суд"),
  w("mest", "месть", "обида → ждёт часа → кровь или мировая"),
  w("khvor", "хворь", "скрывает болезнь → слёг в разгар дела"),
  w("nedosmotr", "недосмотр", "место при нём ветшает"),
  w("metka", "метка", "меченое дитя или своя метка: смотр → выдать или укрыть"),
  w("podsidet", "подсидеть", "метит на чужое место → копает → занял или опозорился"),
  w("uyti", "уйти", "со службы или из марки"),
  w("nadel", "надел", "копит → просит землю → получил или ушёл"),
  w("svadba", "свадьба", "приданое → сватовство → свадьба"),
  w("gramota", "грамота", "учится → помогает писарю → помощник писаря"),
  w("propavshiy", "пропавший", "вести о пропавшем → найти, похоронить или уйти искать"),
  w("svoy_dvor", "свой двор", "рубит сруб → новый двор в деревне"),
  w("obet", "обет", "зарок → паломничество, вклад в храм; нарушение — тягость"),
  w("draka", "драка", "стычка → жалоба или рана → мировая или кровник"),
  w("sabotazh", "тихий саботаж", "продавили на совете → сделал по-своему → расхождение вскрылось → объяснение, уступка или разрыв"),
  { ...w("rodnya", "родню пристроить", "просит за родню → пристроил → родня ленится или ворует → выгнать или терпеть"), proposed: true },
  { ...w("rebyonok", "ребёнок растёт", "взял сироту → растёт → ученик, помощник, челядь в замке"), proposed: true },
  { ...w("son", "сон сбылся", "видел сон → сбылось → к нему идут с вопросами, храм косится → почёт или страх и навет"), proposed: true },
  w("vina", "скрытая вина", "по его вине погиб человек, а записали на зверя → носит → кто-то знает → повинился, раскрыт, бежал или унёс с собой"),
];
export const THREAD_HOW: Record<ThreadHow, string> = { otkryvaet: "открывает", tolkaet: "толкает", tormozit: "тормозит", stupen: "ступень" };

// ---------- 1.7. Связи: группы людей и люди полюса признака ----------
export const LINK_GROUPS: Word<LinkGroup>[] = [
  w("palata", "палата", "палата, сборщица, писцы ставки"),
  w("lesnye", "лесные", "лесные Сайвэ на кромке"),
  w("byvalye", "бывалые", "бывалые, артели"),
  w("prishlye", "пришлые", "пришлые, новые дворы"),
  w("khram", "храм", "жрец и храм"),
  w("starozhily", "старожилы", "старые дворы деревень"),
  w("derevni", "деревни", "простой люд деревень"),
  w("chelyad", "челядь", "челядь замка"),
  w("sluzhilye", "служилые", "служилые, стража, десяток"),
  w("kuptsy", "купцы", "купцы, скупщики, заимодавцы"),
  w("sosedi", "соседи", "соседние владетели и их люди"),
  w("rodnya", "родня", "кровная родня; пока слоя родства нет — «из одного рода, из одной деревни»"),
  w("likhie", "лихие", "лица лиха — скупщик, вожак, их люди"),
];
// Как зовут людей с заметным полюсом признака: плюс — первый полюс, минус — второй.
export const POLE_PEOPLE: Record<Sign, { plus: string; minus: string }> = {
  gordost: { plus: "гордые", minus: "смиренные" },
  shchedrost: { plus: "щедрые", minus: "скупые" },
  smelost: { plus: "смелые", minus: "осторожные" },
  vera: { plus: "верующие", minus: "сомневающиеся" },
  lyubopytstvo: { plus: "любопытные", minus: "косные" },
  zhestkost: { plus: "жёсткие", minus: "мягкие" },
  privyazannost: { plus: "привязчивые", minus: "отстранённые" },
  chestolyubie: { plus: "честолюбивые", minus: "довольные малым" },
  chestnost: { plus: "прямые", minus: "лукавые" },
  terpenie: { plus: "терпеливые", minus: "вспыльчивые" },
  obshchitelnost: { plus: "общительные", minus: "замкнутые" },
  poryadok: { plus: "люди порядка", minus: "вольные" },
};

// ---------- 1.8. Следы: каналы ----------
export const CHANNELS: Word<Channel>[] = [
  w("vid", "вид", "видно при встрече: облик, манера"),
  w("molva", "молва", "говорят в деревнях и в корчме"),
  w("ushi", "свои уши", "челядь в замке"),
  w("prisutstvie", "присутствие", "Сенешаль рядом сам: корчма, писарская, объезд"),
  w("doklad", "доклад", "доклады советников"),
  w("vedomost", "ведомость", "счёт: недостача, лишнее"),
  w("zhaloba", "жалоба", "челобитья и жалобы людей"),
  w("mesto", "место", "картинка и ступень места"),
];

// ---------- 1.12. Кто держит (likho — роль из лиц лиха) ----------
export const HOLDER_ROLES: (Word<HolderRole> & { likho?: boolean })[] = [
  { ...w("skupshchik", "скупщик", "скупщик краденого — в корчме, на торгу, у перевоза"), likho: true },
  w("zaimodavets", "заимодавец", "приказчик, скупщик, свой же староста под поруку; бывает и лихим"),
  { ...w("korchmar", "корчмарь", "корчма как притон — кости и чарка в долг; лихо, если корчма без присмотра"), likho: true },
  w("dayushchiy", "дающий", "кто даёт посулы — сосед, купец, тяжущийся, Ратша"),
  w("zakazchik", "заказчик", "кому идут доносы — палата, Ратша, сосед"),
  w("ishchushchiy", "ищущий", "кто ищет беглого — прежний владетель, храм, палата"),
  { ...w("stary_tovarishch", "старый товарищ", "товарищ по прежнему лихому делу"), likho: true },
  { ...w("vozhak", "вожак", "вожак лихих людей на дороге"), likho: true },
  w("mat_rebyonka", "мать ребёнка", "мать ребёнка на стороне"),
  w("donoschitsa", "доносчица", "соседка или сосед, которые косятся и ждут награды"),
  w("muzh", "муж", "муж или родня той, по ком сохнет"),
  w("svidetel", "свидетель", "тот, кто видел чужую вину и молчит за услугу"),
];

// ---------- 2. Правило по умолчанию: полюс признака → поля ----------
// Числа (wants, holds, sluchay, obida, srok, dobro) — в единицах: +1 значит «столько, сколько даёт признак 2,5», вклад растёт с признаком без порога.
// Всё остальное — списки и пометы следов и связей — включается, когда полюс заметный. След сильного полюса — явный, заметного — «со временем».
// biasStrong — пристрастие только у сильного полюса. gde у следа — все каналы, по которым он виден.
export interface PoleRule {
  sign: Sign;
  plus: boolean;            // true — первый полюс признака (плюс), false — второй (минус)
  wants?: Partial<Record<Want, number>>;
  holds?: Partial<Record<Hold, number>>;
  holdNote?: string;
  sluchay?: number;
  da?: Approach[];          // подход работает
  net?: Approach[];         // подход не действует
  netNote?: string;
  obida?: number;
  srok?: number;
  dobro?: number;
  pomnit?: MemKey[];
  manner?: string;
  bias?: Bias;
  biasStrong?: boolean;
  ladit?: (LinkGroup | PoleKey)[];
  neLadit?: (LinkGroup | PoleKey)[];
  linkNote?: string;
  start?: number;           // отношения складываются быстрее (+) или медленнее (−)
  ten?: number;             // о человеке больше (+) или меньше (−) следов
  yasnost?: number;         // минус — следы путаные
  trace?: { gde: Channel[]; text: string };
}

export const POLE_RULES: PoleRule[] = [
  {
    sign: "gordost", plus: true, wants: { pochet: 1 }, da: ["pochtit"], net: ["sila", "stydit"], pomnit: ["unizhenie"],
    manner: "свысока, о роде и чести", bias: "priukrashivaet", neLadit: ["chestolyubie+"], linkNote: "с честолюбивыми ниже себя — выскочками",
    trace: { gde: ["vid"], text: "держится прямо, говорит о роде и чести" },
  },
  { sign: "gordost", plus: false, wants: { pokoy: 1, pochet: -1 }, da: ["zashchita"], obida: -1, manner: "тихо, с оговорками", ten: -1 },
  {
    sign: "shchedrost", plus: true, wants: { blizkie: 1, dengi: -1 }, da: ["dar"], net: ["vygoda"], netNote: "торговаться с ним мелочно", dobro: 1,
    manner: "хлебосольно", ladit: ["derevni"], trace: { gde: ["molva"], text: "у него не откажут" },
  },
  {
    sign: "shchedrost", plus: false, wants: { dengi: 1 }, da: ["vygoda"], net: ["prosba"], netNote: "даром бесполезно", pomnit: ["dolg"],
    manner: "о цене и убытке", neLadit: ["shchedrost+"], trace: { gde: ["vid", "molva"], text: "кладовые полны, обновок нет" },
  },
  {
    sign: "smelost", plus: true, holds: { strakh: -1 }, da: ["vyzov"], net: ["zashchita"], netNote: "опека обидна",
    manner: "коротко, напористо", bias: "preumenshaet", ladit: ["sluzhilye", "byvalye"], trace: { gde: ["molva"], text: "лезет вперёд" },
  },
  { sign: "smelost", plus: false, holds: { strakh: 1 }, da: ["zashchita"], net: ["vyzov"], pomnit: ["proval"], manner: "с оговорками", bias: "sgushchaet" },
  {
    sign: "vera", plus: true, wants: { chistaya_sovest: 1 }, holds: { sovest: 1 }, da: ["obychay"], pomnit: ["grekh"],
    manner: "с божьим словом и приметами", bias: "znameniya", biasStrong: true, ladit: ["khram"], neLadit: ["vera-"],
    trace: { gde: ["prisutstvie", "molva"], text: "в храме, у треб" },
  },
  {
    sign: "vera", plus: false, da: ["dovod"], net: ["obychay"], manner: "насмешливо о приметах", neLadit: ["khram"], linkNote: "с храмом — слегка",
    trace: { gde: ["molva"], text: "смеётся над приметами" },
  },
  {
    sign: "lyubopytstvo", plus: true, wants: { novoe: 1 }, da: ["novoe_delo"], manner: "расспрашивает", ladit: ["prishlye"],
    trace: { gde: ["molva"], text: "всюду суётся" },
  },
  {
    sign: "lyubopytstvo", plus: false, wants: { pokoy: 1 }, da: ["obychay"], net: ["novoe_delo"], manner: "«так деды делали»",
    ladit: ["starozhily"], neLadit: ["prishlye"],
  },
  {
    sign: "zhestkost", plus: true, holds: { sovest: -1 }, da: ["sila"], net: ["prosba"], srok: 1, manner: "приказом, угрозой",
    ladit: ["sluzhilye"], neLadit: ["derevni"], trace: { gde: ["molva"], text: "боятся" },
  },
  {
    sign: "zhestkost", plus: false, holds: { sovest: 1 }, da: ["prosba"], net: ["sila"], srok: -1, manner: "уговаривает", bias: "vygorazhivaet",
    ladit: ["derevni", "chelyad"], trace: { gde: ["molva"], text: "слабые к нему идут" },
  },
  {
    sign: "privyazannost", plus: true, wants: { blizkie: 1 }, holdNote: "верность сильнее зависит от близости: свой Сенешаль — верен, чужой — нет",
    da: ["cherez_blizkikh"], dobro: 1, pomnit: ["obida_svoim"], manner: "о семье", bias: "vygorazhivaet", ladit: ["rodnya"],
    trace: { gde: ["vid"], text: "родня рядом" },
  },
  {
    sign: "privyazannost", plus: false, wants: { blizkie: -1 }, holds: { vernost: -1 }, da: ["vygoda", "delo"], net: ["cherez_blizkikh"],
    srok: -1, dobro: -1, manner: "сухо", trace: { gde: ["vid"], text: "один" },
  },
  {
    sign: "chestolyubie", plus: true, wants: { mesto: 1 }, da: ["dolzhnost"], pomnit: ["pomekha"], manner: "о должностях", bias: "chernit",
    neLadit: ["chestolyubie+"], linkNote: "с честолюбивыми — соперники", trace: { gde: ["molva", "ushi"], text: "метит выше" },
  },
  { sign: "chestolyubie", plus: false, wants: { pokoy: 1, mesto: -1 }, da: ["ostavit"], net: ["dolzhnost"] },
  {
    sign: "chestnost", plus: true, holds: { sovest: 1 }, da: ["s_glazu_na_glaz"], net: ["kryuchok"], netNote: "на крючке сломается или взбунтуется",
    manner: "в глаза", bias: "bez", ladit: ["derevni"], neLadit: ["chestnost-"], linkNote: "деревни ему верят",
  },
  {
    sign: "chestnost", plus: false, holds: { sovest: -1 }, holdNote: "главной удержкой остаётся страх", da: ["vygoda", "kryuchok"], net: ["s_glazu_na_glaz"],
    netNote: "с глазу на глаз получишь гладкий ответ", manner: "уклончиво", bias: "pryachet", neLadit: ["chestnost+"], yasnost: -1,
  },
  { sign: "terpenie", plus: true, sluchay: -1, da: ["vremya"], obida: -1, srok: 1, manner: "ровно" },
  {
    sign: "terpenie", plus: false, sluchay: 1, net: ["stydit"], obida: 1, srok: -1, manner: "горячо", neLadit: ["terpenie-"], ten: 1,
    trace: { gde: ["molva", "prisutstvie"], text: "сцены на людях" },
  },
  { sign: "obshchitelnost", plus: true, da: ["zastolye"], manner: "многословно", start: 1, ten: 1 },
  { sign: "obshchitelnost", plus: false, da: ["delo"], net: ["zastolye"], manner: "коротко", start: -1, ten: -1 },
  {
    sign: "poryadok", plus: true, holds: { pravilo: 1 }, da: ["ustav"], manner: "по пунктам", bias: "bez", ladit: ["palata"], neLadit: ["poryadok-"],
    trace: { gde: ["mesto"], text: "в порядке" },
  },
  {
    sign: "poryadok", plus: false, wants: { pokoy: 1 }, holds: { pravilo: -1 }, da: ["volya"], net: ["ustav"], manner: "с прибаутками", bias: "preumenshaet",
    neLadit: ["palata", "poryadok+"], trace: { gde: ["mesto"], text: "беспорядок виден" },
  },
];
