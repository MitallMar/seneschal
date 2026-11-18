// Совет и сезон. Код лежит по модулям: папка council/ и season.ts, состояние — state.ts.
// Этот файл — фасад на время рефакторинга И20: отдаёт всё прежним импортёрам и уйдёт в И20е. Новый код импортирует модуль напрямую.
export * from "./state";
export * from "./council/people";
export * from "./council/know";
export * from "./council/generate";
export * from "./council/staff";
export * from "./council/talk";
export * from "./council/decide";
export * from "./council/effects";
export * from "./council/council";
export * from "./council/traits";
export * from "./season";
