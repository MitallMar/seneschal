// Типы данных прототипа. Данные лежат отдельно от логики, чтобы перенести их в игру как есть.

export type Axis = "dolg" | "vygoda" | "zabota" | "derzost" | "obychai";
export type Star = Record<Axis, number>; // 0..10

export type PostId = "starosta" | "desyatnik" | "klyuchnik" | "pisar" | "lesnichiy";
export type Faction = "derevni" | "les" | "kuptsy" | "zamok" | "dvor";
export type Resource = "kazna" | "pripasy" | "poryadok";
export type Effect = Faction | Resource;

export interface TraitMods {
  random?: number;        // насколько решения непредсказуемы (добавка к шуму)
  obedience?: number;     // насколько слушает Сенешаля и главного (-..+)
  grudge?: number;        // множитель обид (1 = обычный)
  softness?: number;      // склонность к компромиссу в споре
  ambition?: number;      // вес стремления
  loyalty?: number;       // стартовая добавка к отношению к Сенешалю
}

export interface Trait {
  id: string;
  name: string;
  desc: string;
  star: Partial<Star>;
  mods: TraitMods;
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
  options: EventOption[];
}
