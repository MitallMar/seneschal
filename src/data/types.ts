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
  risky?: boolean;        // исход сильнее зависит от опыта
}

export interface GameEvent {
  id: string;
  title: string;
  text: string;
  posts: PostId[];        // одна или две сферы
  adventurers?: boolean;  // только когда открыт лабиринт
  village?: Village;      // последствие derevni бьёт только по этой деревне; нет — по обеим
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

export type BagKind = "born" | "life" | "perk";       // врождённая, нажитая (до игры или в игре), перк (умение, открывается делом)
// Повод, по которому нажитая черта или перк появляются в игре: привычка, должность, отношения, перелом, поступок.
export type BagTrigger = "habit" | "post" | "rel" | "break" | "deed";
export type Rarity = "common" | "rare" | "exceptional";
export type BagSource = "birth" | "backstory" | "life" | "post";

// Черта или перк из мешка. Вектор по признакам — 1–3 ненулевых значения.
export interface BagTrait {
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
