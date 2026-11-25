// Типы данных прототипа. Данные лежат отдельно от логики, чтобы перенести их в игру как есть.

export type Axis = "dolg" | "vygoda" | "zabota" | "derzost" | "obychai";
export type Star = Record<Axis, number>; // 0..10

export type PostId = "starosta" | "desyatnik" | "klyuchnik" | "pisar" | "lesnichiy";
// Ключи последствий в событиях. derevni — «деревни вообще»: в мире это две стороны (Village), событие бьёт по обеим или по названной в village.
// kazna и pripasy в мире — запасы серебра и еды (Category): id прежние, чтобы не переписывать события.
export type Faction = "derevni" | "les" | "kuptsy" | "zamok" | "dvor";
export type Resource = "kazna" | "pripasy" | "poryadok";
export type Effect = Faction | Resource;

// ---------- Хозяйство (задача И12, замысел — docs/design/hozyaystvo.md) ----------
export type Village = "brod" | "opushka";
export type Side = Village | "les" | "kuptsy" | "zamok" | "dvor";        // стороны мира: у каждой своя зона доверия
export type Category = "lyudi" | "eda" | "tovary" | "serebro";            // люди — ёмкость на сезон, остальное — запасы
export type Stock = Exclude<Category, "lyudi">;
export type HandsFrom = Village | "zamok";                                // кто даёт рабочие руки
export type CourseId = "kopim" | "polegche" | "dorogi" | "les" | "stroimsya" | "torguem";
export interface CourseDef {
  id: CourseId;
  name: string;
  desc: string;           // что курс делает с хозяйством — словами для игрока
  pro: Axis[];            // по этим склонностям совет решает мелкие дела чаще
  contra: Axis[];         // кому курс не по душе: исполняют без огонька
}
// Выборный староста деревни: внешняя фигура, в совет не входит; звезда — тем же способом, что у людей хозяйства.
export interface ElderEntry { side: Village; name: string; female: boolean; age: number; trait: string }
// Способ закрыть долю подати: «чем» и «с кого».
export type PayId =
  | "serebro" | "sbor_kuptsy" | "zaem" | "eda" | "sverh_brod" | "sverh_opushka"
  | "rekruty_brod" | "rekruty_opushka" | "rekruty_zamok" | "volnye" | "tovary";
export interface PayDef { id: PayId; name: string; what: Category; from: string; hurts: string; side?: Side }

export interface TraitMods {
  random?: number;        // насколько решения непредсказуемы (добавка к шуму)
  obedience?: number;     // насколько слушает Сенешаля и главного (-..+)
  grudge?: number;        // множитель обид (1 = обычный)
  softness?: number;      // склонность к компромиссу в споре
  ambition?: number;      // вес стремления
  loyalty?: number;       // стартовая добавка к отношению к Сенешалю
  skill?: number;         // добавка к умению на должности
  clout?: number;         // добавка к силе в споре
  sly?: number;           // проиграв спор, может сделать по-своему в обход (0 или 1)
}

// Откуда черта: ключевая — с рождения; остальные человек приобретает по ходу жизни.
export type TraitSource = "born" | "habit" | "post" | "rel" | "break";
// Поступок, который выдаёт скрытую черту.
export type Deed = "sabotage" | "bypass";

export interface Trait {
  id: string;
  name: string;
  desc: string;
  star: Partial<Star>;    // сдвиг звезды: у ключевой черты — при рождении, у приобретённой — в момент появления
  mods: TraitMods;
  source?: TraitSource;   // нет — ключевая черта (born)
  lean?: Partial<Star>;   // прибавка к весу варианта по оси: черта тянет решения
  axis?: Axis;            // для черты из привычки: по какой оси копится
  hidden?: boolean;       // разговор не открывает, только поступок
  revealedBy?: Deed;      // какой поступок выдаёт скрытую черту
  targeted?: boolean;     // черта с целью («Злопамятный к …»): поправки действуют только против этого человека
}

export interface Mark {
  id: string;
  name: string;
  desc: string;
  star: Partial<Star>;
  goodPost?: PostId;      // где метка помогает
  badPost?: PostId;       // где метка мешает
}

export interface AspirationDef {
  id: string;
  text: string;           // «хочет вести книги»
  post?: PostId;          // если стремление — должность
}

export interface BackstoryEvent {
  id: string;
  text: string;           // {name} — сам персонаж, {other} — другой ключевой персонаж
  shift: Partial<Star>;
  aspiration?: string;    // id стремления, которое может родиться из события
  link?: number;          // изменение личного отношения к {other}
}

export interface RosterEntry {
  name: string;
  female: boolean;
  age: number;
  trait: string;          // ключевая черта — задана автором
  mark?: string;          // метка прилива — задана автором
  bounds?: Partial<Record<Axis, [number, number]>>; // границы звезды для ключевых
}

export interface EventOption {
  id: string;
  text: string;
  axes: Axis[];           // к каким склонностям относится вариант
  effects: Partial<Record<Effect, number>>;
  risky?: boolean;        // смелый вариант: выигрыш больше, но провал по опыту бьёт сильнее
  careful?: boolean;      // осторожный вариант: и выигрыш, и цена меньше, без риска
  hands?: number;         // сколько рук людей замка вариант занимает на этот сезон
  later?: Later;          // вложение: отдача через сезон-другой
}
// Отложенные последствия вложения: через seasons сезонов, со строкой в ведомости.
export interface Later { seasons: number; effects: Partial<Record<Effect, number>>; text: string }

export interface GameEvent {
  id: string;
  title: string;
  text: string;
  posts: PostId[];        // одна или две сферы
  adventurers?: boolean;  // только когда открыт лабиринт
  village?: Village;      // последствие derevni бьёт только по этой деревне; нет — по обеим
  strict?: boolean;       // событие строгого края: приходит только при порядке от ступени «Строгость» (ручка order.strictFrom)
  tags: WorldTag[];       // метки мира: при состоянии мира с такой меткой событие приходит чаще, при глушащем её — реже
  options: EventOption[];
}

// ---------- Натура: глубокий слой личности (задача И8, замысел — docs/design/natura.md) ----------

// Признак — глубокое измерение личности, двухполюсное, −5…+5: плюс — первый полюс, минус — второй.
export type Sign =
  | "gordost" | "shchedrost" | "smelost" | "vera" | "lyubopytstvo" | "zhestkost"
  | "privyazannost" | "chestolyubie" | "chestnost" | "terpenie" | "obshchitelnost" | "poryadok";
export type SignVec = Partial<Record<Sign, number>>;

export interface SignDef { id: Sign; plus: string; minus: string }

// Натура — архетип: ядро (2–4 сильных признака) и точки кристаллизации — области мешка, из которых берутся якоря.
export interface NatureDef {
  id: string;
  name: string;
  core: SignVec;
  crystals: SignVec[];
}

// врождённая, нажитая (до игры или в игре), перк (умение, открывается делом), облик (вектора нет, натурой не тянется: у человека 0–1)
export type BagKind = "born" | "life" | "perk" | "look";
// Повод, по которому нажитая черта или перк появляются в игре: привычка, должность, отношения, перелом, поступок.
export type BagTrigger = "habit" | "post" | "rel" | "break" | "deed";
export type Rarity = "common" | "rare" | "exceptional";
export type BagSource = "birth" | "backstory" | "life" | "post";

// ---------- Черты под Концепт 3 (задача И27а; словарь полей — docs/design/cherty-dannye.md, раздел 1) ----------
// Слова для экрана и правило по умолчанию — src/data/portrait.ts, расчёт портрета — src/sim/portrait.ts.

// Видимость черты и следа: явная — при знакомстве; со временем — по поступкам за несколько месяцев; скрытая — только через след или раскрытие.
export type Vis = "yavnaya" | "so_vremenem" | "skrytaya";
// Желания — что тянет человека к варианту; удержки — что удерживает от него.
export type Want = "dengi" | "pochet" | "pokoy" | "blizkie" | "mesto" | "chistaya_sovest" | "novoe";
export type Hold = "sovest" | "strakh" | "vernost" | "pravilo";
// Подход — чем человека взять.
export type Approach =
  | "pochtit" | "zashchita" | "dar" | "vygoda" | "vyzov" | "obychay" | "dovod" | "novoe_delo" | "sila" | "prosba" | "cherez_blizkikh"
  | "dolzhnost" | "ostavit" | "s_glazu_na_glaz" | "kryuchok" | "vremya" | "stydit" | "zastolye" | "delo" | "ustav" | "volya";
// Что человек помнит особо или прощает легко.
export type MemKey = "unizhenie" | "dolg" | "proval" | "obida_svoim" | "grekh" | "pomekha" | "slovo" | "nakazanie" | "starina" | "milost" | "zasluga";
// Пристрастие доклада: как человек искажает то, что докладывает. Одно на человека.
export type Bias = "bez" | "sgushchaet" | "preumenshaet" | "priukrashivaet" | "pryachet" | "vygorazhivaet" | "chernit" | "znameniya";
// Канал следа: откуда Сенешаль узнаёт.
export type Channel = "vid" | "molva" | "ushi" | "prisutstvie" | "doklad" | "vedomost" | "zhaloba" | "mesto";
// Связи: с группой людей или с людьми полюса признака («chestolyubie+» — честолюбивые, «chestnost-» — лукавые).
export type LinkGroup =
  | "palata" | "lesnye" | "byvalye" | "prishlye" | "khram" | "starozhily" | "derevni" | "chelyad" | "sluzhilye" | "kuptsy" | "sosedi" | "rodnya" | "likhie";
export type PoleKey = `${Sign}+` | `${Sign}-`;
export type LinkKey = LinkGroup | PoleKey;
// Нити — линии судьбы; каталог со ступенями — docs/design/niti.md.
export type ThreadId =
  | "dengi" | "dolg" | "azart" | "pyanstvo" | "lyubov" | "krov" | "proshloe" | "soglyadatay" | "posuly" | "mest" | "khvor" | "nedosmotr" | "metka"
  | "podsidet" | "uyti" | "nadel" | "svadba" | "gramota" | "propavshiy" | "svoy_dvor" | "obet" | "draka" | "sabotazh" | "rodnya" | "rebyonok" | "son" | "vina" | "svoe_delo" | "dobroe_imya" | "vernulsya";
export type ThreadHow = "otkryvaet" | "tolkaet" | "tormozit" | "stupen";
// Кто держит порок или тайну: роль-слот, генератор подставит человека.
export type HolderRole =
  | "skupshchik" | "zaimodavets" | "korchmar" | "dayushchiy" | "zakazchik" | "ishchushchiy" | "stary_tovarishch" | "vozhak" | "mat_rebyonka" | "donoschitsa" | "muzh" | "svidetel";

export interface TraitApproach { da?: Approach[]; net?: Approach[]; note?: string }
// Число, которому поправка положена: желание, удержка, случай или одно из трёх чисел памяти.
export type ScaleKey = Want | Hold | "sluchay" | "obida" | "srok" | "dobro";
// Поправка с оговоркой («страх +2 на кромке», «держит +2 — обиду своим»): действует только при условии и в общий счёт портрета не идёт.
export interface TraitIf { chto: ScaleKey; v: number; kogda: string }
// Фраза автора по полю целиком: в ней оговорки, которых нет в ключах словаря.
export type TraitNoteKey = "vesy" | "podkhod" | "pamyat" | "golos" | "niti" | "svyazi" | "sledy" | "delo" | "likho" | "derzhit" | "otdykh" | "lore" | "prochee";
export interface TraitMemory { obida?: number; srok?: number; dobro?: number; pomnit?: MemKey[]; proshchaet?: MemKey[] }
// top — пристрастие «сильнее любой другой черты»: берёт верх независимо от редкости.
export interface TraitVoice { manner?: string; bias?: Bias; top?: boolean; note?: string }
// step — имя ступени, на которой черта появляется или уходит («чарка», «ждёт часа»).
export interface TraitThread { nit: ThreadId; kak: ThreadHow; step?: string; uDrugogo?: boolean }
export interface TraitLinks { ladit?: LinkKey[]; neLadit?: LinkKey[]; start?: number }
export interface TraceLine { gde: Channel; text: string }
export interface TraitTraces { ten?: number; tenSfery?: number; yasnost?: number; chuzhie?: "boltaet" | "uznayot" | "molchit"; razgovor?: number; lines?: TraceLine[] }
export interface TraitDeed { gde: string; sila: number }
export interface TraitHolder { role: HolderRole; likho?: boolean }
// Особенное черты — то, чего не дают её признаки. Пустое поле значит «как по признакам» (правило по умолчанию, cherty-dannye.md, раздел 2).
// Числа: +1 — столько, сколько даёт признак 2,5; +2 — признак на краю шкалы; −1 и −2 — так же вниз.
export interface TraitC3 {
  vis?: Vis;                // видимость; не задана — «скрытая» у черты с hidden, иначе «явная» (до И27б)
  wants?: Partial<Record<Want, number>>;
  holds?: Partial<Record<Hold, number>>;
  sluchay?: number;         // доля случайности в выборе
  ifs?: TraitIf[];          // поправки с оговоркой
  approach?: TraitApproach;
  memory?: TraitMemory;
  voice?: TraitVoice;
  threads?: TraitThread[];
  links?: TraitLinks;
  traces?: TraitTraces;
  deed?: TraitDeed[];       // действие на силу дела: где и насколько
  holder?: TraitHolder[];   // кто держит
  likho?: number;           // плюс — порок даёт лиху прикрытие
  likhoByWeights?: boolean; // прикрытие зависит от совести человека: нечестному — лихо, честному — ясность следов лиха (likho.md, раздел 5)
  posts?: string[];         // у перка: должности Концепта 3, на которых он работает («любая» — на всякой)
  places?: string[];        // у перка: места и дела
  notes?: Partial<Record<TraitNoteKey, string>>;
}

// Черта или перк из мешка. Вектор по признакам — 1–3 ненулевых значения.
export interface BagTrait extends TraitC3 {
  id: string;
  name: string;
  desc: string;
  kind: BagKind;
  vec: SignVec;
  rarity: Rarity;
  effect: string;          // как черта действует — пока словами: совет к натуре не подключён
  source: BagSource[];     // откуда может взяться
  conflicts?: string[];    // с чем не уживается (достаточно назвать с одной стороны)
  requires?: string[];     // для перков: нужна хотя бы одна из этих черт
  trigger?: BagTrigger;    // у нажитых и перков: по какому поводу появляется в игре
  replaces?: string[];     // какие нажитые черты вытесняет (старая уходит, запись остаётся в утраченных)
  council?: boolean;       // та же черта уже работает в совете под этим id (LIFE_TRAITS)
  hidden?: boolean;        // открывается только поступком
  nameF?: string;          // имя черты у женщины, если оно другое («Сохнет по чужому»)
  seneschal?: boolean;     // черта мешка Сенешаля: обычным людям не выпадает
}

// ---------- Здоровье (задача И10, замысел — docs/design/zdorovye.md) ----------

// Откуда черта здоровья: врождённая, наследственная (идёт по семье) или нажитая (остаётся после болезни, раны, со старостью).
export type HealthOrigin = "born" | "hereditary" | "gained";
export type HealthCause = "illness" | "wound" | "age";

export interface HealthTrait {
  id: string;
  name: string;
  desc: string;
  origin: HealthOrigin;
  good?: boolean;       // черта на пользу здоровью
  cause?: HealthCause;  // у нажитой: после чего остаётся
  weight: number;       // как часто выпадает среди черт своего происхождения
  krepost?: number;     // сдвиг крепости
  risk?: number;        // множитель шанса заболеть
  winter?: number;      // дополнительный множитель шанса заболеть зимой
  death?: number;       // множитель шанса умереть от тяжёлой болезни или раны
  aging?: number;       // множитель скорости старения (меньше единицы — стареет медленнее)
  effect: string;       // как скажется на службе — пока словами
}

// ---------- Генератор мира (задача И11а, замысел — docs/design/koncept-2.md, «Генератор событий мира») ----------
// Метки связывают слои: состояние мира несёт метки, события совета — тоже; жёстких связей «это состояние → это событие» нет.
export type WorldTag = "voyna" | "golod" | "torg" | "vera" | "les";
// Три слоя, у каждого свой темп: мир и герцогство (состояния на годы), баронство (погода года, указы), место (отголоски и события совета).
export type WorldLayer = "mir" | "baronstvo" | "mesto";
// Сдвиг хозяйства, пока состояние длится: множители потоков (1 — без перемен) и надбавка к уроку подати в мерах (меньше нуля — послабление).
export interface WorldShift { harvest?: number; price?: number; duty?: number; forest?: number; lesson?: number }
// Указ: разовое требование Герцога. accepts — чем его можно закрыть (категории способов «чем и с кого»), term — сколько сезонов на это дано.
export interface DecreeDef { id: string; title: string; text: string; accepts: Category[]; measures: number; term: number }
// Отголосок: приходит вниз с задержкой после начала состояния. Либо указ (слой баронства), либо местное последствие (слой места).
// post — чья сфера отвечает за этот отголосок или указ (нет — должность состояния).
// strict и free — как тот же отголосок приходит на строгом краю порядка (Строгость, Твёрдая рука) и на вольном (Вольница, Смута): задача И11б.
export interface EchoAlt { text: string; effects: Partial<Record<Effect, number>> }
export interface EchoDef {
  delay: [number, number]; text: string; decree?: DecreeDef; effects?: Partial<Record<Effect, number>>; village?: Village; post?: PostId;
  strict?: EchoAlt; free?: EchoAlt;
}
// Состояние верхнего слоя: длится seasons сезонов. cost — давление: беда стоит бюджета рассказчика, благо (cost ≤ 0) — нет.
// tags — события совета с такой меткой приходят чаще; mutes — с такой меткой реже.
export interface WorldStateDef {
  id: string; name: string; text: string; end: string;
  post: PostId;           // ответственная должность: сила её держателя смягчает или усиливает беду (задача И21)
  tags: WorldTag[]; mutes?: WorldTag[];
  seasons: [number, number]; weight: number; cost: number;
  shift?: WorldShift; echoes?: EchoDef[];
}

// Способ ответа на беду: почерк ответственной должности (задача И21). kind — что именно он меняет; правила — src/sim/world/answer.ts, числа — world.answer.
export type AnswerKind = "villages" | "castleRecruits" | "decreeSize" | "decreeTerm" | "harvest" | "forest";
export interface Answer { post: PostId; axis: Axis; kind: AnswerKind; name: string; good: string; price: string }
