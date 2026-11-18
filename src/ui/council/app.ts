// Состояние экрана прототипа совета — один объект app: партия, «Взгляд дизайнера», вкладка и перерисовка. Здесь же адрес страницы и мелкие слова и числа для показа.
// Панели берут партию из app.w и зовут app.render(): перерисовку вписывает main.ts, поэтому панели его не импортируют.
import { SEASON_NAMES } from "../../data/economy";
import type { Axis } from "../../data/types";
import type { World } from "../../sim/state";
import { $ } from "../dom";

export const app: { w: World; designer: boolean; tab: "council" | "eco" | "world"; render: () => void } = {
  w: undefined as unknown as World,   // партию создаёт start() в main.ts до первой перерисовки
  designer: false,
  tab: "council",
  render: () => {},
};

export const AXIS_COLOR: Record<Axis, string> = {
  dolg: "var(--axis-dolg)", vygoda: "var(--axis-vygoda)", zabota: "var(--axis-zabota)",
  derzost: "var(--axis-derzost)", obychai: "var(--axis-obychai)",
};

export const SEASONS = SEASON_NAMES;

// Адрес страницы помнит семя, заготовку и галочки: ?seed=…&preset=…&lab=1&designer=1&tab=eco&knobs=1
export function syncUrl() {
  const q = new URLSearchParams();
  q.set("seed", ($("seed") as HTMLInputElement).value.trim() || "замок");
  const preset = ($("preset") as HTMLSelectElement).value;
  if (preset) q.set("preset", preset);
  if (($("lab") as HTMLInputElement).checked) q.set("lab", "1");
  if (app.designer) q.set("designer", "1");
  if (app.tab !== "council") q.set("tab", app.tab);
  if (!$("knobs-panel").hasAttribute("hidden")) q.set("knobs", "1");
  try { history.replaceState(null, "", `?${q.toString()}`); } catch { /* страница открыта так, что адрес менять нельзя — не беда */ }
}

export function seasonLabel(n: number) {
  return `${SEASONS[(n - 1) % 4]}, год ${Math.floor((n - 1) / 4) + 1}`;
}

export const fmt = (v: number) => String(Math.round(v * 100) / 100).replace(".", ",");

export const signed = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${fmt(Math.abs(v))}`;
