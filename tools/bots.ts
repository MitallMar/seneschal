// Отчёт по ботам: работают ли механики на сотне партий, где нужна балансировка, какие решения пустые (задание — docs/design/boty.md).
// Запуск: npm run bots -- [--seeds=100] [--seasons=12] [--level=1|2|3] [--pair=О3] [--lab] [--full] [--save] [--diff]
//   --full  — у каждой пары все метрики, а не только разошедшиеся;
//   --brief — только первые строки и сравнение со снимком (так зовёт npm run balance);
//   --save  — записать средние по ботам в tools/balance.snapshot.json (коммитится вместе с правкой balance.ts);
//   --diff  — сравнить с записанным: было → стало.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { BALANCE } from "../src/sim/balance";
import { botsReport, METRICS, type BotStats, type PairStats, type MetricDef } from "../src/sim/bots-report";

const arg = (name: string, def: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1] ?? def;
const has = (name: string) => process.argv.includes(`--${name}`);
const seeds = Number(arg("seeds", String(BALANCE.bots.seeds))), seasons = Number(arg("seasons", String(BALANCE.bots.seasons)));
const levels = arg("level", "1,2,3").split(",").map(Number), onlyPair = arg("pair", "") || undefined;
const file = resolve(dirname(fileURLToPath(import.meta.url)), "balance.snapshot.json");
const brief = has("brief"), full = has("full");

const num = (v: number, def: MetricDef) => (def.pct ? `${(v * 100).toFixed(0)}%` : v.toFixed(def.digits).replace(".", ","));
const signed = (v: number, def: MetricDef) => `${v > 0 ? "+" : ""}${def.pct ? `${(v * 100).toFixed(0)} п.` : v.toFixed(Math.max(1, def.digits)).replace(".", ",")}`;
const def = (id: string) => METRICS.find((m) => m.id === id)!;

const r = botsReport(seeds, seasons, has("lab"), onlyPair ? [1, 2, 3] : levels, onlyPair);
const of = (id: string) => r.stats.find((s) => s.bot.id === id);
const pair = (id: string) => r.pairs.find((p) => p.variant.id === id);

function verdictLine(p: PairStats): string {
  const word = p.verdict === "пустое" ? "РЕШЕНИЕ ПУСТОЕ" : p.verdict === "слабо" ? "расходится слабо" : "расходится";
  const n = p.n < r.seeds ? ` (сыграна на ${p.n} семенах из ${r.seeds})` : "";
  return `${p.variant.id.padEnd(4)} ${p.variant.name} — ${word}${n}`;
}
function printPair(p: PairStats) {
  console.log(`  ${verdictLine(p)}`);
  if (p.variant.asks) console.log(`       проверяет: ${p.variant.asks}`);
  const rows = full ? p.diffs : p.top.slice(0, 7);
  for (const d of rows) {
    const m = def(d.id), luck = d.own ? " (само действие, в вердикт не идёт)" : d.luck > 2 * Math.abs(d.diff) ? " (удача сильнее: разброс по семенам вдвое больше)" : "";
    if (!full && /^[+-]?0(,0+)?( п\.)?$/.test(signed(d.diff, m).replace("+", ""))) continue;
    console.log(`       ${m.name}: ${signed(d.diff, m)} ±${signed(2 * d.se, m).replace("+", "")}${luck}`);
  }
}
function printBot(s: BotStats, ids: string[]) {
  console.log(`  ${s.bot.name}:`);
  for (const group of ["совет", "хозяйство", "авторитет"] as const) {
    const cells = METRICS.filter((m) => m.group === group && ids.includes(m.id)).map((m) => `${m.name} ${num(s.mean[m.id], m)}`);
    if (cells.length) console.log(`    ${group}: ${cells.join(" · ")}`);
  }
}
const ALL = METRICS.map((m) => m.id);
const KEY = ["leadOwn", "leadForeign", "disputes", "hostile", "complaints", "calm", "closed", "closedAll", "shortages", "patience", "refuse", "authority", "atCap", "spent", "burned"];

console.log(`Боты: ${r.seeds} семян × ${r.seasons} сезонов, лабиринт ${r.lab ? "открыт" : "закрыт"}. Пары сравниваются по семенам попарно.`);
console.log(`Пара «пустая», если ни одна метрика не разошлась больше чем на ${BALANCE.bots.weak} стандартные ошибки; «слабо» — меньше ${BALANCE.bots.strong}.\n`);

// первые строки: решает ли, на кого оставил, и сколько даёт игра руками
const level2 = r.pairs.filter((p) => p.variant.level === 2);
if (level2.length) {
  const live = level2.filter((p) => p.verdict === "расходится").length;
  const head = live === 0 ? "выбор, на кого оставить совет, пока НИЧЕГО НЕ РЕШАЕТ" : `на кого оставил — решает: расходятся ${live} пар из ${level2.length}`;
  console.log(`ГЛАВНОЕ. Отлучка: ${head}. Пустые: ${level2.filter((p) => p.verdict === "пустое").map((p) => p.variant.id).join(", ") || "нет"}.`);
}
const hands = pair("master");
if (hands) {
  console.log(`ГЛАВНОЕ. «Ничего не трогает» ↔ «Хозяин»: ${hands.verdict === "пустое" ? "игра руками НИЧЕГО НЕ ДАЁТ" : "игра руками меняет партию"}.`);
  for (const d of hands.top.slice(0, 6)) console.log(`    ${def(d.id).name}: ${signed(d.diff, def(d.id))} ±${signed(2 * d.se, def(d.id)).replace("+", "")}`);
}
const idle = of("idle");
if (idle) {
  const m = idle.mean, n = idle.runs.reduce((s, x) => s + x.leadForeignN, 0), se = Math.sqrt((m.leadForeign * (1 - m.leadForeign)) / Math.max(1, n));
  console.log(`Характер на чужой должности: ${(m.leadForeign * 100).toFixed(1)}% ±${(200 * se).toFixed(1)} (${n} решений); на своей ${(m.leadOwn * 100).toFixed(1)}%. Порог отчёта осей — ${BALANCE.report.leadForeign * 100}%.`);
}

if (!brief) {
  if (levels.includes(1) && idle) {
    console.log("\n=== Уровень 1. Совет сам ===");
    printBot(idle, ALL);
    console.log("\n  Заготовки ситуаций против обычной партии («Ничего не трогает», те же семена):");
    for (const p of r.presets) printPair(p);
  }
  if (levels.includes(2) && of("left")) {
    console.log("\n=== Уровень 2. Отлучка: подготовил и уехал ===");
    printBot(of("left")!, KEY);
    console.log("\n  Пары к базе «Оставил порядок»:");
    for (const p of level2) printPair(p);
  }
  if (levels.includes(3) && of("master")) {
    console.log("\n=== Уровень 3. Хозяин ===");
    printBot(of("master")!, ALL);
    console.log("\n  Пары к базе «Хозяин»:");
    for (const p of r.pairs.filter((q) => q.variant.level === 3 && q.variant.id !== "master")) printPair(p);
    if (of("random")) { console.log("\n  Вне пар:"); printBot(of("random")!, KEY); }
    console.log("\n  Авторитет: копится ли сам, когда его тратят");
    for (const id of ["idle", "master", "Х4", "Х6", "Х9"]) {
      const s = of(id);
      if (!s) continue;
      const m = s.mean, a = def("authority");
      console.log(`    ${s.bot.id.padEnd(7)} к концу ${num(m.authority, a)} · у потолка ${(m.atCap * 100).toFixed(0)}% · слабое слово ${(m.weak * 100).toFixed(0)}% · опора +${m.support.toFixed(1)} · потрачено ${m.spent.toFixed(1)} · добыто ${signed(m.earned, a)} · сгорело ${m.burned.toFixed(1)}`);
    }
  }
}

const flat = (): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const s of r.stats) for (const id of KEY) out[`${s.bot.id}: ${def(id).name}`] = Math.round(s.mean[id] * 1000) / 1000;
  for (const p of [...r.pairs, ...r.presets]) out[`пара ${p.variant.id}: расходится (0 пустое, 1 слабо, 2 да)`] = p.verdict === "пустое" ? 0 : p.verdict === "слабо" ? 1 : 2;
  return out;
};
if (has("diff")) {
  if (!existsSync(file)) console.log("\nСнимка ещё нет: сначала npm run balance -- --save");
  else {
    const old = JSON.parse(readFileSync(file, "utf8")) as { seeds: number; seasons: number; metrics: Record<string, number> };
    const now = flat();
    const changed = Object.keys(now).filter((key) => old.metrics[key] !== now[key]);
    console.log(`\nСравнение со снимком (${old.seeds} семян, ${old.seasons} сезонов): ${changed.length ? `изменилось ${changed.length} из ${Object.keys(now).length}` : "без изменений"}`);
    for (const key of changed) console.log(`  ${key}: ${old.metrics[key]} → ${now[key]}`);
  }
}
if (has("save")) {
  writeFileSync(file, `${JSON.stringify({ seeds: r.seeds, seasons: r.seasons, metrics: flat() }, null, 2)}\n`);
  console.log("\nСнимок записан: tools/balance.snapshot.json");
}
