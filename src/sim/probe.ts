// Зонд: счётчики для отчётов ботов, которые не лежат в партии и на её ход не влияют (задача И16).
// Прогон с зондом и без совпадает до числа: зонд только считает то, что логика и так вычислила.
// Перед партией бот зовёт resetProbe, после — забирает PROBE.
export interface Probe {
  // наказ: у события был вариант с осью наказа — и чем кончилось
  order: { fit: number; worked: number; already: number; deaf: number; weak: number };
  autoPaid: number;                                        // мер подати, закрытых автоплатой совета после жатвы
  short: { seasons: number; food: number; silver: number; trust: number; order: number }; // недодача: сезонов, сколько недодано, сколько доверия и порядка ушло
}
const blank = (): Probe => ({
  order: { fit: 0, worked: 0, already: 0, deaf: 0, weak: 0 }, autoPaid: 0, short: { seasons: 0, food: 0, silver: 0, trust: 0, order: 0 },
});
export const PROBE: Probe = blank();
export function resetProbe(): void {
  Object.assign(PROBE, blank());
}
