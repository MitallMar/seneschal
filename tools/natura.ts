// Отчёт генератора натур: метрики раздела 6 черновика docs/design/natura.md, предупреждения и пять примеров людей словами.
// Запуск: npm run natura -- [--rolls=1000] [--seed=натура] [--save] [--diff]
//   --save — записать метрики в tools/natura.snapshot.json (коммитится вместе с правкой ручек или мешка);
//   --diff — сравнить с записанным: было → стало.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { AXES, AXIS_NAMES } from "../src/data/core";
import { SIGNS, NATURES, BAG } from "../src/data/natura";
import { BALANCE } from "../src/sim/balance";
import { growParty, type NaturaPerson } from "../src/sim/natura";
import { naturaMetrics, naturaWarnings, type NaturaMetrics } from "../src/sim/natura-report";

const arg = (name: string, def: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1] ?? def;
const rolls = Number(arg("rolls", "1000")), seed = arg("seed", "натура");
const file = resolve(dirname(fileURLToPath(import.meta.url)), "natura.snapshot.json");
const G = BALANCE.natura.goal;
const pct = (v: number) => `${Math.round(v * 100)}%`;

const m = naturaMetrics(rolls, seed);
const kinds = (k: string) => BAG.filter((t) => t.kind === k).length;
console.log(`Натур ${NATURES.length}, признаков ${SIGNS.length}, в мешке ${BAG.length}: рождение ${kinds("born")}, жизнь ${kinds("life")}, перки ${kinds("perk")}.`);
console.log(`Рероллов ${m.rolls} (семя «${seed}»), черт на человека в среднем ${m.traitsMean.toFixed(1)}.\n`);
console.log(`Похожесть рероллов одной натуры (медиана общих черт): ${m.jaccard.toFixed(2)} — цель не больше ${G.jaccard}`);
console.log(`  самая однообразная натура: ${m.jaccardWorst.nature}, ${m.jaccardWorst.value.toFixed(2)}`);
console.log(`Различимость: натура угадывается по чертам в ${pct(m.nn)} случаев — цель ${pct(G.nnMin)}–${pct(G.nnMax)}`);
console.log(`Покрытие мешка: не выпали ни разу — ${m.never.length ? m.never.join(", ") : "таких нет"}`);
console.log(`  самая частая обычная черта: «${m.commonMax.trait}», у ${pct(m.commonMax.share)} людей — цель не больше ${pct(G.commonShare)}`);
console.log(`Стягивание: разброс признака среди рероллов одной натуры — цель не ниже ${G.signSpread}`);
console.log(`  ${SIGNS.map((s) => `${s.plus} ${m.signSpread[s.id].toFixed(2)}`).join(" · ")}`);
console.log("Деловые склонности из признаков против нынешней звезды совета (среднее ± разброс, доля ведущих):");
for (const a of AXES) {
  const x = m.axes[a], now = m.axesNow[a];
  console.log(`  ${AXIS_NAMES[a].padEnd(9)} ${x.mean.toFixed(1)} ± ${x.spread.toFixed(1)}, ведущая у ${pct(x.top).padStart(3)}   | сейчас ${now.mean.toFixed(1)} ± ${now.spread.toFixed(1)}, у ${pct(now.top)}`);
}

const warnings = naturaWarnings(m);
console.log(warnings.length ? `\nПредупреждения:\n${warnings.map((x) => `  ⚠ ${x}`).join("\n")}` : "\nПредупреждений нет: цели раздела 6 выполнены.");

const pole = (id: string, v: number) => { const s = SIGNS.find((x) => x.id === id)!; return `${v > 0 ? s.plus : s.minus} ${Math.abs(v)}`; };
const describe = (p: NaturaPerson) => {
  const mark = (id: string) => (id === p.contra ? " (против натуры)" : id === p.far ? " (издалека)" : p.anchors.includes(id) ? " (якорь)" : "");
  const signs = Object.entries(p.signs).filter(([, v]) => Math.abs(v) >= 2).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).map(([k, v]) => pole(k, v));
  return [`${p.nature.name}`, `    черты: ${p.traits.map((t) => `«${t.name}»${mark(t.id)}`).join(", ")}`,
    `    признаки: ${signs.join(", ")}`, `    склонности: ${AXES.map((a) => `${AXIS_NAMES[a]} ${p.star[a].toFixed(1)}`).join(", ")}`].join("\n");
};
console.log(`\nПять человек одной партии (семя «${seed}»):`);
for (const p of growParty(seed, 5)) console.log(`  ${describe(p)}`);

// снимок метрик: числа без списков, чтобы сравнение было коротким
const flat = (x: NaturaMetrics): Record<string, number> => ({
  "черт на человека": x.traitsMean, "похожесть рероллов": x.jaccard, "различимость": x.nn, "не выпали": x.never.length, "самая частая обычная": x.commonMax.share,
  ...Object.fromEntries(SIGNS.map((s) => [`разброс: ${s.plus}`, x.signSpread[s.id]])),
  ...Object.fromEntries(AXES.flatMap((a) => [[`${AXIS_NAMES[a]}: среднее`, x.axes[a].mean], [`${AXIS_NAMES[a]}: разброс`, x.axes[a].spread], [`${AXIS_NAMES[a]}: ведущая`, x.axes[a].top]])),
});
if (process.argv.includes("--diff")) {
  if (!existsSync(file)) console.log("\nСнимка ещё нет: сначала npm run natura -- --save");
  else {
    const old = JSON.parse(readFileSync(file, "utf8")) as { rolls: number; seed: string; metrics: Record<string, number> };
    const now = flat(m);
    const changed = Object.keys(now).filter((key) => old.metrics[key] !== now[key]);
    console.log(`\nСравнение со снимком (${old.rolls} рероллов, семя «${old.seed}»): ${changed.length ? "" : "без изменений"}`);
    for (const key of changed) console.log(`  ${key}: ${old.metrics[key]} → ${now[key]}`);
  }
}
if (process.argv.includes("--save")) {
  writeFileSync(file, `${JSON.stringify({ rolls, seed, metrics: flat(m) }, null, 2)}\n`);
  console.log(`\nСнимок записан: tools/natura.snapshot.json`);
}
