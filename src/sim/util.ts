// Мелкие помощники счёта, общие для ядра: зажать в диапазон, округлить, среднее. Без состояния и без случайности.
export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const round1 = (v: number) => Math.round(v * 10) / 10;
export const round2 = (v: number) => Math.round(v * 100) / 100;
export const round3 = (v: number) => Math.round(v * 1000) / 1000;
export const mean = (xs: number[]) => (xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : 0);
