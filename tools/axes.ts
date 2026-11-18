// Отчёт «должность и характер»: должность × склонность по событиям, плюсы и минусы склонностей, прогон партий.
// Запуск: npm run axes -- [--seeds=20] [--seasons=20]
import { AXES, AXIS_NAMES, POSTS, FACTION_NAMES, RESOURCE_NAMES } from "../src/data/core";
import { EVENTS } from "../src/data/events";
import { postAxisTable, axisEffects, axesWarnings, runStats } from "../src/sim/axes-report";
import { BALANCE } from "../src/sim/balance";

const arg = (name: string, def: number) => Number(process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1] ?? def);
const seeds = arg("seeds", 20), seasons = arg("seasons", 20);
const pct = (v: number) => `${Math.round(v * 100)}%`.padStart(4);
const sign = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(1)}`;

console.log(`Событий: ${EVENTS.length} (с приключенцами). Должность × склонность: в какой доле событий должности есть вариант по оси / доля вариантов. * — родная.`);
console.log(`Порог: родная — не реже ${pct(BALANCE.report.nativeEvents).trim()} событий, остальные — не реже ${pct(BALANCE.report.otherEvents).trim()} и реже любой родной.\n`);
console.log(`${"".padEnd(18)}${AXES.map((a) => AXIS_NAMES[a].padEnd(13)).join("")}`);
const table = postAxisTable();
for (const post of POSTS) {
  const row = table[post.id];
  const cells = AXES.map((a) => `${pct(row.axes[a].events)} /${pct(row.axes[a].options)}${post.native.includes(a) ? "*" : " "}  `);
  console.log(`${`${post.name} (${row.count})`.padEnd(18)}${cells.join("")}`);
}

console.log("\nПлюсы и минусы склонностей: сумма эффектов по всем вариантам оси (вариантов, из них без единого минуса):");
const eff = axisEffects();
for (const a of AXES) console.log(`  ${AXIS_NAMES[a].padEnd(9)} +${eff[a].plus} / ${eff[a].minus}   (${eff[a].options}, без минусов ${eff[a].clean})`);

const warnings = axesWarnings();
for (const lab of [false, true]) {
  const r = runStats(seeds, seasons, lab);
  const names = { ...FACTION_NAMES, ...RESOURCE_NAMES };
  console.log(`\nПрогон ${seeds} семян × ${seasons} сезонов, лабиринт ${lab ? "открыт" : "закрыт"}. В среднем на партию:`);
  console.log(`  ${Object.entries(names).map(([k, n]) => `${n} ${sign(r.sides[k as keyof typeof names])}`).join(" · ")}`);
  const share = (b: { matched: number; decisions: number }) => `${pct(b.decisions ? b.matched / b.decisions : 0).trim()} (${b.decisions} решений)`;
  console.log(`  Решений по ведущей склонности: на своей должности ${share(r.own)}, на чужой ${share(r.foreign)}`);
  const ownShare = r.own.matched / Math.max(1, r.own.decisions), foreignShare = r.foreign.matched / Math.max(1, r.foreign.decisions);
  if (foreignShare < BALANCE.report.leadForeign) warnings.push(`лабиринт ${lab ? "открыт" : "закрыт"}: на чужой должности характер читается слабо (${pct(foreignShare).trim()})`);
  if (ownShare <= foreignShare) warnings.push(`лабиринт ${lab ? "открыт" : "закрыт"}: на своей должности характер не ярче, чем на чужой`);
}
console.log(warnings.length ? `\nЗамечания:\n${warnings.map((x) => `  ⚠ ${x}`).join("\n")}` : "\nЗамечаний нет: цели раздела report выполнены.");
