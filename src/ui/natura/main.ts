// Точка входа эмулятора натуры: страница, на которой видно всё наполнение генератора (признаки, натуры, мешок), прогон рероллов с графиками
// и ручки разделов natura и health. Правил не считает: зовёт src/sim/natura.ts, portrait.ts, health.ts и их отчёты. Панели — view-*.ts, состояние — app.ts.
import { NATURES } from "../../data/natura";
import { setAt, resetBalance } from "../../sim/balance";
import { portrait, type Portrait } from "../../sim/portrait";
import { rollAll, metricsOf, currentAxes, type NaturaMetrics } from "../../sim/natura-report";
import { healthMetrics, type HealthMetrics } from "../../sim/health-report";
import { $, esc } from "../dom";
import { app, val } from "./app";
import { renderKnobs, onKnob, exportKnobs } from "./knobs";
import { renderMetrics, renderCharts } from "./view-metrics";
import { renderPerson, renderParty } from "./view-person";
import { renderHealth } from "./view-health";
import { renderTables, renderCouncil } from "./view-tables";

const axesNow = currentAxes(); // нынешняя звезда совета от ручек натуры не зависит: считаем один раз

function run() {
  const rolls = Number(val("rolls")), seed = val("seed").trim() || "натура";
  app.people = rollAll(rolls, seed);
  app.m = metricsOf(app.people, axesNow);
  app.hm = healthMetrics(1200, seed);
  $("state").textContent = `${rolls} рероллов, семя «${seed}»`;
  renderMetrics();
  renderCharts();
  renderPerson();
  renderParty();
  renderHealth();
  renderTables();
}

app.run = run;
$("nature").innerHTML = NATURES.map((x) => `<option value="${x.id}">${esc(x.name)}</option>`).join("");
renderKnobs();
renderCouncil();
$("knobs").addEventListener("input", (e) => {
  const el = e.target as HTMLInputElement;
  if (el.dataset.knob) onKnob(el.dataset.knob, el.value);
});
$("run").addEventListener("click", run);
$("rolls").addEventListener("change", run);
$("seed").addEventListener("change", run);
$("reset").addEventListener("click", () => { resetBalance(); renderKnobs(); run(); });
$("export").addEventListener("click", exportKnobs);
$("nature").addEventListener("change", () => { app.personRoll = 0; renderPerson(); });
$("age").addEventListener("change", renderPerson);
$("reroll").addEventListener("click", () => { app.personRoll++; renderPerson(); });
$("seneschal").addEventListener("click", () => { app.asSeneschal = !app.asSeneschal; renderPerson(); });
$("bag-kind").addEventListener("change", renderTables);
$("bag-sort").addEventListener("change", renderTables);
run();

// Для автопроверок в браузере (test/e2e/smoke.py, раздел natura).
declare global {
  interface Window { __emu: { run: () => void; setKnob: (path: string, v: number) => number; metrics: () => NaturaMetrics; health: () => HealthMetrics; people: () => number; portrait: () => Portrait | null } }
}
window.__emu = {
  run,
  setKnob: (path, v) => { const got = setAt(path, v); renderKnobs(); run(); return got; },
  metrics: () => app.m,
  health: () => app.hm,
  people: () => app.people.length,
  portrait: () => (app.shown ? portrait(app.shown) : null),
};
