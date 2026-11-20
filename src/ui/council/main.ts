// Точка входа прототипа совета: новая партия, сезоны, перерисовка, вкладки, «Взгляд дизайнера», кнопки и горячие клавиши, параметры адреса, window.__emu.
import type { Stock } from "../../data/types";
import { KNOBS, getAt, snapshotBalance, resetBalance } from "../../sim/balance";
import { PRESETS, newPreset } from "../../sim/presets";
import { runSeason } from "../../sim/season";
import { $, esc } from "../dom";
import { app, syncUrl } from "./app";
import { renderCouncil, renderRelations } from "./view-council";
import { renderEconomy, renderYear } from "./view-economy";
import { renderDesk } from "./view-desk";
import { renderPeople } from "./view-people";
import { renderLog, renderStatus } from "./view-log";
import { renderWorld } from "./view-world";
import { renderOrder } from "./view-order";
import { renderFall } from "./view-fall";
import { knobId, sets, active, changedKnobs, renderKnobs, setKnob, switchSet, dumpKnobs, toggleKnobs } from "./emu";

function start() {
  const seed = ($("seed") as HTMLInputElement).value.trim() || "замок";
  app.w = newPreset(seed, ($("preset") as HTMLSelectElement).value || null, ($("lab") as HTMLInputElement).checked);
  render();
}

function setTab(next: "council" | "eco" | "world") {
  app.tab = next;
  $("tab-council").hidden = app.tab !== "council";
  $("tab-eco").hidden = app.tab !== "eco";
  $("tab-world").hidden = app.tab !== "world";
  document.querySelectorAll<HTMLButtonElement>(".tabs button").forEach((b) => b.classList.toggle("on", b.dataset.tab === app.tab));
  syncUrl();
}

function setDesigner(on: boolean) {
  app.designer = on;
  ($("designer") as HTMLInputElement).checked = on;
  render();
}

const seasons = (n: number) => { for (let i = 0; i < n; i++) runSeason(app.w); render(); };

function render() {
  renderStatus();
  renderDesk();
  renderFall();
  renderWorld();
  renderOrder();
  renderCouncil();
  renderRelations();
  renderEconomy();
  renderPeople();
  renderLog();
  renderYear();
  syncUrl();
}

app.render = render;

$("new").addEventListener("click", start);
$("season").addEventListener("click", () => seasons(1));
$("season5").addEventListener("click", () => seasons(5));
$("lab").addEventListener("change", () => { app.w.labOpen = ($("lab") as HTMLInputElement).checked; syncUrl(); });
$("designer").addEventListener("change", () => setDesigner(($("designer") as HTMLInputElement).checked));
$("preset").addEventListener("change", start);
$("knobs-toggle").addEventListener("click", () => toggleKnobs());
$("ab1").addEventListener("click", () => switchSet(0));
$("ab2").addEventListener("click", () => switchSet(1));
$("knobs-reset").addEventListener("click", () => { resetBalance(); sets[active] = snapshotBalance(); renderKnobs(); render(); });
$("knobs-dump").addEventListener("click", dumpKnobs);
$("knobs").addEventListener("input", (e) => {
  const el = e.target as HTMLInputElement;
  if (!el.dataset.knob) return;
  const v = setKnob(el.dataset.knob, Number(el.value));
  const q = KNOBS.find((x) => x.path === el.dataset.knob)!, row = $(knobId(q));
  row.classList.toggle("changed", v !== q.def);
  row.querySelector(".knob-val")!.textContent = String(v);
  render();
});
$("knobs").addEventListener("change", renderKnobs);
document.querySelectorAll<HTMLButtonElement>(".tabs button").forEach((b) => b.addEventListener("click", () => setTab(b.dataset.tab as "council" | "eco" | "world")));
// После щелчка кнопка не держит фокус: иначе пробел нажал бы её ещё раз.
document.addEventListener("click", (e) => { if (e.target instanceof HTMLButtonElement) e.target.blur(); });

// Горячие клавиши — по коду клавиши, раскладка не важна. В полях ввода и списках клавиши работают как обычно.
document.addEventListener("keydown", (e) => {
  const t = e.target as HTMLElement;
  const typing = ["INPUT", "SELECT", "TEXTAREA"].includes(t.tagName) && t.id !== "dump-out"; // поле выгрузки только для чтения: клавиши в нём работают
  if (e.ctrlKey || e.metaKey || e.altKey || typing) return;
  const keys: Record<string, () => void> = {
    Space: () => seasons(1), KeyF: () => seasons(5), KeyR: start, KeyD: () => setDesigner(!app.designer), Tab: () => toggleKnobs(),
    KeyP: () => { toggleKnobs(true); dumpKnobs(); }, Digit1: () => switchSet(0), Digit2: () => switchSet(1),
  };
  const run = keys[e.code];
  if (!run) return;
  e.preventDefault();
  run();
});

// Параметры адреса
const params = new URLSearchParams(location.search);
$("preset").innerHTML = `<option value="">без заготовки</option>${PRESETS.map((p) => `<option value="${p.id}" title="${esc(p.desc)}">${esc(p.name)}</option>`).join("")}`;
if (params.get("seed")) ($("seed") as HTMLInputElement).value = params.get("seed")!;
if (PRESETS.some((p) => p.id === params.get("preset"))) ($("preset") as HTMLSelectElement).value = params.get("preset")!;
($("lab") as HTMLInputElement).checked = params.get("lab") === "1";
app.designer = params.get("designer") === "1";
($("designer") as HTMLInputElement).checked = app.designer;
start();
setTab(params.get("tab") === "eco" ? "eco" : params.get("tab") === "world" ? "world" : "council");
if (params.get("knobs") === "1") toggleKnobs(true);

// Для автопроверок и консоли: то же, что кнопки, без щелчков.
interface Emu {
  restart: (seed?: string, preset?: string) => void; season: (n?: number) => void; setKnob: (path: string, v: number) => number;
  snapshot: () => { season: number; authority: number; stock: Record<Stock, number>; knobs: Record<string, number>; set: string; log: number };
}
const emu: Emu = {
  restart: (seed, preset) => {
    if (seed !== undefined) ($("seed") as HTMLInputElement).value = seed;
    if (preset !== undefined) ($("preset") as HTMLSelectElement).value = preset;
    start();
  },
  season: (n = 1) => seasons(n),
  setKnob: (path, v) => { const out = setKnob(path, v); renderKnobs(); render(); return out; },
  snapshot: () => ({
    season: app.w.season, authority: app.w.authority, stock: { ...app.w.eco.stock }, set: active ? "стало" : "было", log: app.w.log.length,
    knobs: Object.fromEntries(changedKnobs().map((q) => [q.path, getAt(q.path)])),
  }),
};
(window as unknown as { __emu: Emu }).__emu = emu;
