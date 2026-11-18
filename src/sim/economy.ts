// Хозяйство и подать (задача И12, замысел — docs/design/hozyaystvo.md). Код лежит по модулям в папке economy/.
// Этот файл — фасад на время рефакторинга И20: отдаёт всё прежним импортёрам и уйдёт в И20е. Новый код импортирует модуль напрямую.
export type { LedgerLine, Ledger, Elder, TaxYear, Tax, Pending, Economy, Zone } from "./state";
export * from "./economy/zones";
export * from "./economy/doer";
export * from "./economy/plan";
export * from "./economy/ledger";
export * from "./economy/tax";
export * from "./economy/pay";
export * from "./economy/season";
export * from "./economy/view";
