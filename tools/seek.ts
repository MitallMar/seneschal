// Бот-искатель: стратегии, которые заметно лучше «Хозяина» или ведут к необычным исходам (задание — docs/design/boty.md, раздел 23).
// Запуск: npm run seek -- [--random=300] [--screen=20] [--confirm=200] [--top=6] [--climb=60] [--depth=4] [--seasons=12] [--seed=искатель] [--no-pairs] [--set=путь:значение]
//   --random   сколько случайных стратегий добавить к перебору;
//   --screen   партий на стратегию при отборе; --confirm — при подтверждении (на других семенах);
//   --no-pairs перебирать только по одной привычке (быстро: для пробы); --full — показать и неподтверждённое.
import { BALANCE, setAt } from "../src/sim/balance";
import { METRICS } from "../src/sim/bots-report";
import { seek, type Finding } from "../src/sim/bots-seek";

const arg = (name: string, def: number) => Number(process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1] ?? def);
for (const x of process.argv.filter((v) => v.startsWith("--set="))) {
  const [path, value] = x.slice("--set=".length).split(":");
  console.log(`Ручка на время прогона: ${path} = ${setAt(path, Number(value))}`);
}
const S = BALANCE.bots, seed = process.argv.find((a) => a.startsWith("--seed="))?.split("=")[1] ?? "искатель";
const def = (id: string) => METRICS.find((m) => m.id === id)!;
const num = (v: number, id: string) => (def(id).pct ? `${(v * 100).toFixed(0)}%` : v.toFixed(Math.max(1, def(id).digits)).replace(".", ","));
const signed = (v: number, id: string) => `${v > 0 ? "+" : ""}${def(id).pct ? `${(v * 100).toFixed(0)} п.` : v.toFixed(Math.max(1, def(id).digits)).replace(".", ",")}`;

let shown = -1;
const r = seek({
  seed, random: arg("random", S.seekRandom), screen: arg("screen", S.seekScreen), confirm: arg("confirm", S.seekConfirm), top: arg("top", S.seekTop), climb: arg("climb", S.seekClimb), depth: arg("depth", S.seekDepth),
  seasons: arg("seasons", S.seasons), pairs: !process.argv.includes("--no-pairs"),
  progress: (done, all) => { const pct = Math.floor((done / all) * 10); if (pct > shown) { shown = pct; process.stderr.write(`отбор: ${pct * 10}%\n`); } },
});

console.log(`Искатель: ${r.candidates} стратегий (по одной привычке ${r.byKind["одна привычка"]}, по две ${r.byKind["две привычки"]}, случайных ${r.byKind["случайная"]}), ${r.seasons} сезонов.`);
console.log(`Отбор — ${r.screen} партий на стратегию; подтверждение — ${r.confirm} партий на других семенах. Всё сравнивается с «Хозяином» попарно по семенам.`);
console.log(`Находка подтверждена, если на новых семенах разница не меньше ${S.strong} стандартных ошибок.\n`);

const full = process.argv.includes("--full");   // показать и то, что не подтвердилось
const costs = (f: Finding) => f.costs.map((d) => `${def(d.id).name} ${signed(d.diff, d.id)}`).join("; ") || "остальное как у «Хозяина»";
console.log("=== Лучше «Хозяина» ===");
for (const goal of [...new Set(r.better.map((f) => f.goal!))]) {
  const list = r.better.filter((f) => f.goal === goal), ok = list.filter((f) => f.confirmed);
  console.log(`\n  ${goal.name}: на подтверждение шло ${list.length}, подтвердилось ${ok.length}`);
  for (const f of full ? list : ok) {
    console.log(`    ${f.confirmed ? "✔" : "·"} [${f.cand.kind}] ${f.text}`);
    console.log(`        ${signed(f.diff, goal.id)} ±${signed(2 * f.se, goal.id).replace("+", "")} (при отборе ${signed(f.screen, goal.id)}) · ${costs(f)}`);
  }
}
console.log("\n=== Сборка по шагам: от «Хозяина» по одной привычке, пока цель растёт ===");
for (const f of r.built) {
  const goal = f.goal!;
  console.log(`\n  ${goal.name}: ${f.confirmed ? "✔ подтверждено" : "· не подтвердилось"} — ${signed(f.diff, goal.id)} ±${signed(2 * f.se, goal.id).replace("+", "")} на новых семенах`);
  for (const [i, s] of f.steps!.entries()) console.log(`    шаг ${i + 1}: ${s.text} → ${num(s.value, goal.id)} (на семенах сборки)`);
  console.log(`    цена: ${costs(f)}`);
}
if (r.repeats.length) {
  console.log("\n  Что повторяется в подтверждённых находках (перебор):");
  for (const x of r.repeats) console.log(`    ${String(x.n).padStart(2)} раз — ${x.text}`);
}
console.log("\n=== Необычные исходы: далеко за краями привычных ботов, а партия не проиграна (подати не меньше, падений не больше) ===");
const odd = r.odd.filter((f) => f.confirmed);
if (!odd.length) console.log("  Подтверждённых нет.");
for (const f of odd) {
  const o = f.odd!;
  console.log(`  ${def(o.id).name}: ${num(o.value, o.id)} (у привычных ботов ${num(o.lo, o.id)}…${num(o.hi, o.id)}) — [${f.cand.kind}] ${f.text}`);
  console.log(`        подать против «Хозяина» ${signed(f.diff, "paid")} ±${signed(2 * f.se, "paid").replace("+", "")} · ${costs(f)}`);
}
console.log(`  (на подтверждение шло ${r.odd.length}, не подтвердилось ${r.odd.length - odd.length})`);

console.log("\n=== Какая одна привычка сильнее всего двигает внесённую подать (отбор, без подтверждения) ===");
for (const l of r.levers.slice(0, 12)) console.log(`  ${signed(l.diff, "paid").padStart(6)} мер · ${l.z.toFixed(1).replace(".", ",")} ошибки · ${l.text}`);
