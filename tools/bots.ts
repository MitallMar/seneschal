// Отчёт по ботам: работают ли механики на сотне партий, где нужна балансировка, какие решения пустые (задание — docs/design/boty.md).
// Запуск: npm run bots -- [--seeds=100] [--seasons=12] [--level=1|2|3|4] [--pair=О3 | --pair=заготовка:pisar] [--lab] [--full] [--save] [--diff] [--set=world.on:0]
//   уровень 4 — перепроверки (boty.md, раздел 11);
//   --full  — у каждой пары все метрики, а не только разошедшиеся;
//   --brief — только первые строки и сравнение со снимком (так зовёт npm run balance);
//   --save  — записать средние по ботам в tools/balance.snapshot.json (коммитится вместе с правкой balance.ts);
//   --diff  — сравнить с записанным: было → стало.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { BALANCE, setAt } from "../src/sim/balance";
import { botsReport, outcomeStats, METRICS, type BotStats, type PairStats, type MetricDef } from "../src/sim/bots-report";
import { bot } from "../src/sim/bots";

const arg = (name: string, def: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1] ?? def;
const has = (name: string) => process.argv.includes(`--${name}`);
// --set=путь:значение — ручка на время прогона (можно несколько): так считается спокойный мир, --set=world.on:0
for (const x of process.argv.filter((v) => v.startsWith("--set="))) {
  const [path, value] = x.slice("--set=".length).split(":");
  console.log(`Ручка на время прогона: ${path} = ${setAt(path, Number(value))}`);
}
const seeds = Number(arg("seeds", String(BALANCE.bots.seeds))), seasons = Number(arg("seasons", String(BALANCE.bots.seasons)));
const levels = arg("level", "1,2,3,4").split(",").map(Number), onlyPair = arg("pair", "") || undefined;
const file = resolve(dirname(fileURLToPath(import.meta.url)), "balance.snapshot.json");
const brief = has("brief"), full = has("full");

const num = (v: number, def: MetricDef) => (def.pct ? `${(v * 100).toFixed(0)}%` : v.toFixed(def.digits).replace(".", ","));
const signed = (v: number, def: MetricDef) => `${v > 0 ? "+" : ""}${def.pct ? `${(v * 100).toFixed(0)} п.` : v.toFixed(Math.max(1, def.digits)).replace(".", ",")}`;
const def = (id: string) => METRICS.find((m) => m.id === id)!;

const r = botsReport(seeds, seasons, has("lab"), onlyPair ? [1, 2, 3, 4] : levels, onlyPair);
const of = (id: string) => r.stats.find((s) => s.bot.id === id);
const pair = (id: string) => r.pairs.find((p) => p.variant.id === id);

function verdictLine(p: PairStats): string {
  const word = p.verdict === "пустое" ? "РЕШЕНИЕ ПУСТОЕ" : p.verdict === "слабо" ? "расходится слабо" : "расходится";
  const n = p.n < r.seeds ? ` (сыграна на ${p.n} семенах из ${r.seeds})` : "";
  const vs = p.variant.base !== p.base.id ? ` [против ${p.base.id}]` : "";
  return `${p.variant.id.padEnd(4)} ${p.variant.name}${vs} — ${word}${n}`;
}
function printPair(p: PairStats) {
  console.log(`  ${verdictLine(p)}`);
  if (p.variant.asks) console.log(`       проверяет: ${p.variant.asks}`);
  // сначала исходы партии, потом само действие и замеры
  const rows = full ? p.diffs : [...p.top.filter((d) => !d.own).slice(0, 7), ...p.top.filter((d) => d.own).slice(0, 3)];
  for (const d of rows) {
    const m = def(d.id), luck = d.own ? " (само действие или замер, в вердикт не идёт)" : d.luck > 2 * Math.abs(d.diff) ? " (удача сильнее: разброс по семенам вдвое больше)" : "";
    if (!full && /^[+-]?0(,0+)?( п\.)?$/.test(signed(d.diff, m).replace("+", ""))) continue;
    console.log(`       ${m.name}: ${signed(d.diff, m)} ±${signed(2 * d.se, m).replace("+", "")}${luck}`);
  }
}
function printBot(s: BotStats, ids: string[]) {
  console.log(`  ${s.bot.name}:`);
  for (const group of ["совет", "хозяйство", "авторитет", "замеры"] as const) {
    const cells = METRICS.filter((m) => m.group === group && ids.includes(m.id)).map((m) => `${m.name} ${num(s.mean[m.id], m)}`);
    if (cells.length) console.log(`    ${group}: ${cells.join(" · ")}`);
  }
}
const ALL = METRICS.filter((m) => !m.diag).map((m) => m.id);
const KEY = ["leadOwn", "leadForeign", "disputes", "hostile", "complaints", "calm", "closed", "closedAll", "shortages", "patience", "refuse", "fell", "authority", "atCap", "spent", "burned"];

console.log(`Боты: ${r.seeds} семян × ${r.seasons} сезонов, лабиринт ${r.lab ? "открыт" : "закрыт"}. Пары сравниваются по семенам попарно.`);
console.log(`Пара «пустая», если ни одна метрика не разошлась больше чем на ${BALANCE.bots.weak} стандартные ошибки; «слабо» — меньше ${BALANCE.bots.strong}.\n`);

// первые строки: решает ли, на кого оставил, и сколько даёт игра руками
const level2 = r.pairs.filter((p) => p.variant.level === 2);
if (onlyPair) { console.log(""); for (const p of [...r.pairs, ...r.presets]) printPair(p); }
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

if (!brief && !onlyPair) {
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
    for (const p of r.pairs.filter((q) => q.variant.level === 3 && q.variant.id !== "master" && q.base.id === "master")) printPair(p);
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

if (!brief && !onlyPair && levels.includes(4) && of("Х6б")) {
  const m = (id: string) => of(id)!.mean, f1 = (v: number) => v.toFixed(1).replace(".", ","), f2 = (v: number) => v.toFixed(2).replace(".", ",");
  console.log("\n=== Уровень 4. Перепроверки (boty.md, раздел 11) ===");
  console.log("\n  11.1. Наказ: сколько раз за партию он был применим и чем кончилось");
  for (const id of ["О5", "О5б", "О5в", "О5г", "Х6", "Х6б", "Х6в"]) {
    const x = m(id), share = (v: number) => (x.orderFit ? `${((v / x.orderFit) * 100).toFixed(0)}%` : "—");
    console.log(`    ${id.padEnd(4)} применим ${f1(x.orderFit)} · поменял выбор ${f2(x.orderWorked)} (${share(x.orderWorked)}) · и так выбрал бы ${share(x.orderAlready)}`
      + ` · не услышан ${share(x.orderDeaf)} · прибавки не хватило ${share(x.orderWeak)} · потрачено ${f1(x.spent)}`);
  }
  for (const id of ["О5б", "О5в", "О5г", "Х6б", "Х6в"]) printPair(pair(id)!);

  console.log("\n  11.2. Знание о людях: стремления через разговор");
  for (const id of ["master", "Х2", "Х2б", "Х2в"]) {
    const runs = of(id)!.runs.map((x) => x.aspAt).sort((a, b) => a - b), p90 = runs[Math.ceil(runs.length * 0.9) - 1];
    const never = runs.filter((v) => v > r.seasons).length;
    console.log(`    ${id.padEnd(6)} стремления совета известны к сезону: в среднем ${f1(m(id).aspAt)}, у 90% партий — к ${p90 > r.seasons ? "концу не узнал" : p90}; не узнал за партию — ${never} из ${r.seeds}`);
  }
  for (const p of r.pairs.filter((q) => ["Х2б", "Х2в"].includes(q.variant.id))) printPair(p);

  console.log("\n  11.3. Заготовка «Наследство прежних баронов»: три должности из пяти не по годности");
  for (const id of ["Н1", "Н3", "Н10"]) printPair(pair(id)!);

  console.log("\n  11.4. Исходы дел совета: что остаётся в запасах и доверии сторон (на одно дело)");
  const NAMES: Record<string, string> = {
    alone: "решил один", agree: "сошлись", deal: "договорились", judge: "рассудил главный", compromise: "компромисс", push: "продавил",
    rival: "соперник настоял", sabotage: "саботаж", silent: "враг смолчал", ordered: "по приказу", empty: "должности пусты",
  };
  for (const [title, b] of [["обычная партия", bot("idle")], ["заготовка «Враги в совете»", { ...bot("idle"), preset: "vragi" }]] as const) {
    console.log(`    ${title}:`);
    for (const row of outcomeStats(b, seeds, seasons)) {
      console.log(`      ${NAMES[row.outcome].padEnd(18)} ${f1(row.perParty).padStart(5)} за партию · размах ${f2(row.size)} · запасы ${f2(row.stock)} · доверие ${f2(row.trust)}`
        + ` · порядок ${f2(row.order)} · не тронуло запасов и доверия ${(row.none * 100).toFixed(0)}%`);
    }
  }

  console.log("\n  11.5. Подать нынешним урожаем: сколько вносит автоплата совета после жатвы");
  for (const id of ["idle", "master", "Х12", "Х17", "Х17б"]) {
    const x = m(id);
    console.log(`    ${id.padEnd(6)} внесено ${f1(x.paid)} мер, из них автоплатой после жатвы ${f1(x.autoPaid)} (${x.paid ? ((x.autoPaid / x.paid) * 100).toFixed(0) : 0}%) · уроков закрыто ${f2(x.closed)} · все уроки ${(x.closedAll * 100).toFixed(0)}%`);
  }
  for (const id of ["Х17", "Х17б"]) printPair(pair(id)!);

  console.log("\n  11.6. Пиры");
  for (const id of ["Х9б", "Х9в"]) printPair(pair(id)!);

  console.log("\n  11.7. Нижние черты и цена недодачи");
  for (const id of ["Х16", "master", "Х16б"]) {
    const x = m(id), per = (v: number) => (x.shortages ? f2(v / x.shortages) : "—");
    console.log(`    ${id.padEnd(6)} сезонов с недодачей ${f2(x.shortages)} · на один такой сезон: еды недодано ${per(x.shortFood)}, серебра ${per(x.shortSilver)}, доверия ушло ${per(x.shortTrust)}`
      + ` · уроков закрыто ${f2(x.closed)} · все уроки ${(x.closedAll * 100).toFixed(0)}% · терпение Герцога ${f1(x.patience)}`);
  }
  printPair(pair("Х16б")!);
}

// Годы испытания и мерка цели 5 (boty.md, раздел 13): лучший и худший совет — по внесённой подати и её разбросу по семенам.
if (!brief && !onlyPair && idle) {
  const pct = (v: number) => `${(v * 100).toFixed(0)}%`, f1 = (v: number) => v.toFixed(1).replace(".", ",");
  console.log("\n=== Годы испытания: доля партий, закрывших урок в срок ===");
  for (const id of ["idle", "master", "Н0", "Н1"]) {
    const s = of(id);
    if (s) console.log(`  ${s.bot.name.padEnd(34)} год 1 — ${pct(s.mean.year1)} · год 2 — ${pct(s.mean.year2)} · год 3 — ${pct(s.mean.year3)} · все три — ${pct(s.mean.closedAll)}`);
  }
  console.log(`\n=== Цель 5. Лучший и худший совет: внесено подати, мер за акт (разброс по семенам у «Ничего не трогает» — ${f1(idle.sd.paid)}) ===`);
  console.log(`  ${"обычная партия, совет сам".padEnd(44)} ${f1(idle.mean.paid)}`);
  const rows: [string, number, number, number, number[]][] = [];
  for (const p of r.presets.filter((x) => ["vragi", "novichki", "nasledstvo", "glavny"].includes(x.variant.preset ?? ""))) {
    const d = p.diffs.find((x) => x.id === "paid")!;
    rows.push([p.variant.name, d.diff, d.se, d.z, p.runs.map((x) => x.paid)]);
  }
  for (const id of ["master", "Х3"]) {
    const s = of(id);
    if (!s) continue;
    const d = s.runs.map((x, i) => x.paid - idle.runs[i].paid), m = d.reduce((a, b) => a + b, 0) / d.length;
    const se = Math.sqrt(d.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, d.length - 1) / d.length);
    rows.push([`«${s.bot.name}»`, m, se, se ? m / se : 0, s.runs.map((x) => x.paid)]);
  }
  rows.sort((a, b) => a[1] - b[1]);
  for (const [name, diff, se] of rows) {
    console.log(`  ${name.padEnd(44)} ${diff > 0 ? "+" : ""}${f1(diff)} ±${f1(2 * se)} · ${(Math.abs(diff) / idle.sd.paid).toFixed(2).replace(".", ",")} разброса`);
  }
  if (rows.length > 1) {
    const gap = rows[rows.length - 1][1] - rows[0][1];
    console.log(`  от худшего до лучшего: ${f1(gap)} меры — ${(gap / idle.sd.paid).toFixed(2).replace(".", ",")} разброса по семенам`);
    // мерка цели 5 (И22): попарно по семенам — тот же мир, разные советы; общий разброс партий в неё не входит
    const worst = rows[0], best = rows[rows.length - 1];
    const d = best[4].map((x, i) => x - worst[4][i]), n = d.length, m = d.reduce((a, b) => a + b, 0) / n;
    const sdev = Math.sqrt(d.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, n - 1)), se = sdev / Math.sqrt(n);
    const ahead = d.filter((x) => x > 0).length / n, behind = d.filter((x) => x < 0).length / n;
    console.log(`  попарно по семенам, ${best[0]} против ${worst[0]}: ${m > 0 ? "+" : ""}${f1(m)} ±${f1(2 * se)} меры · ${(se ? m / se : 0).toFixed(1).replace(".", ",")} ошибки`
      + ` · лучший впереди в ${pct(ahead)} партий, позади в ${pct(behind)} · разброс разницы ${f1(sdev)}`);
  }
  // Мир вокруг (И11а): давление за акт, указы и чем закрыты, плохие по погоде годы
  const W = BALANCE.world, f2 = (v: number) => v.toFixed(2).replace(".", ",");
  console.log(`\n=== Мир вокруг: давление за акт (${W.on ? "генератор включён" : "спокойный мир"}) ===`);
  for (const id of ["idle", "master"]) {
    const s = of(id);
    if (!s) continue;
    const x = s.mean, per = (hit: number, n: number) => (n ? f2(hit / n) : "—");
    console.log(`  ${s.bot.name}: состояний ${f1(x.states)}, из них бед ${f1(x.bads)} · указов ${f2(x.decrees)}: исполнено ${f2(x.decreesDone)} (советом самим ${f2(x.decreesCouncil)}), не исполнено ${f2(x.decreesFailed)}`);
    console.log(`    мер по указам: людьми ${f2(x.decreeLyudi)}, едой ${f2(x.decreeEda)}, серебром ${f2(x.decreeSerebro)}, товарами ${f2(x.decreeTovary)}`);
    const good = s.runs.length ? x.closedBad + x.closedGood > 0 || x.badYears > 0 : false, years = BALANCE.bots.seasons / 4;
    if (good) console.log(`    плохих по погоде лет ${f2(x.badYears)} из ${years}: уроков закрыто на такой год ${per(x.closedBad, x.badYears)} против ${per(x.closedGood, years - x.badYears)} в прочие;`
      + ` сезонов с недодачей на год ${per(x.shortBad, x.badYears)} против ${per(x.shortGood, years - x.badYears)}`);
  }
  // Порядок (И13): где шкала проводит партию и сколько стоит держать её на краю
  console.log("\n=== Порядок: сезонов на каждой ступени за партию и цена краёв ===");
  for (const id of ["idle", "master", "Х18б", "Х18", "Х19"]) {
    const s = of(id);
    if (!s) continue;
    const x = s.mean;
    console.log(`  ${s.bot.name.padEnd(58)} смута ${f1(x.stepSmuta)} · вольница ${f1(x.stepVolnitsa)} · тихо ${f1(x.stepTiho)} · строгость ${f1(x.stepStrogost)} · твёрдая рука ${f1(x.stepRuka)}`);
    console.log(`    ${"".padEnd(56)} на стражу ${f1(x.guardSpent)} серебра · внесено ${f1(x.paid)} мер · все уроки ${pct(x.closedAll)} · недодач ${f1(x.shortages)}`
      + ` · доверие сторон ${f1(x.trust)} · авторитет ${f1(x.authority)}`);
  }
  // Кризисы и падение (И14): как часто, когда и почему баронство отдают другому, сколько длится «под чужой рукой» и как возвращаются
  console.log(`\n=== Кризисы и падение: ${BALANCE.fall.on ? `партия ${r.seasons} сезонов, броня ${BALANCE.fall.armor}` : "выключены"} ===`);
  for (const id of ["idle", "master", "Х20", "Х21"]) {
    const s = of(id);
    if (!s) continue;
    const x = s.mean, fallen = s.runs.filter((q) => q.fell), n = Math.max(1, fallen.length), avg = (f: (q: typeof x) => number) => fallen.reduce((a, q) => a + f(q), 0) / n;
    const byYear = [1, 2, 3].map((y) => fallen.filter((q) => Math.ceil(q.fallAt / 4) === y).length / s.runs.length);
    console.log(`  ${s.bot.name}: пало ${pct(x.fell)} партий (год 1 — ${pct(byYear[0])}, год 2 — ${pct(byYear[1])}, год 3 — ${pct(byYear[2])}) · кризисов сторон ${f2(x.crises)} за партию`
      + ` · внеочередных сборов ${f2(x.levies)}, не закрыто ${f2(x.levyFailed)}`);
    console.log(`    почему: терпение исчерпано ${pct(x.whyPatience)} · сбор не закрыт ${pct(x.whyLevy)} · недоимка с кризисом ${pct(x.whyArrears)} · два кризиса сразу ${pct(x.whyDouble)}`);
    if (fallen.length) console.log(`    у павших: сезон падения ${f1(avg((q) => q.fallAt))} · под чужой рукой ${f1(avg((q) => q.underSeasons))} сез. до конца партии`
      + ` · вернулись своими силами ${pct(avg((q) => q.backOwn))}, дождались леса ${pct(avg((q) => q.backArmor))}, ещё под рукой ${pct(avg((q) => q.stillUnder))}`
      + ` · опал ${f2(avg((q) => q.disgraces))} · авторитет к концу ${f1(avg((q) => q.authority))} · внесено ${f1(avg((q) => q.paid))} мер`);
  }
  if (W.on) {
    const G = W.goal, bear = idle.mean.closedAll, dec = idle.mean.decrees, mark = (ok: boolean) => (ok ? "в коридоре" : "⚠ мимо");
    console.log(`  Цель: «Ничего не трогает» закрывает все три урока в ${G.bearMin * 100}–${G.bearMax * 100}% партий — ${pct(bear)}, ${mark(bear >= G.bearMin && bear <= G.bearMax)}.`);
    console.log(`  Цель: указов за акт ${G.decreesMin}–${G.decreesMax} — ${f2(dec)}, ${mark(dec >= G.decreesMin && dec <= G.decreesMax)}.`);
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
