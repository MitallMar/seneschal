// Отчёт о здоровье: сколько людей за партию слегает, выбывает со службы и умирает, до скольких лет живут; предупреждения по целям.
// Запуск: npm run health -- [--people=3000] [--seed=здоровье] [--save] [--diff]
//   --save — записать метрики в tools/health.snapshot.json (коммитится вместе с правкой ручек или черт здоровья);
//   --diff — сравнить с записанным: было → стало.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { HEALTH_TRAITS } from "../src/data/health";
import { BALANCE } from "../src/sim/balance";
import { healthMetrics, healthWarnings, type HealthMetrics } from "../src/sim/health-report";

const arg = (name: string, def: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1] ?? def;
const people = Number(arg("people", "3000")), seed = arg("seed", "здоровье");
const file = resolve(dirname(fileURLToPath(import.meta.url)), "health.snapshot.json");
const G = BALANCE.health.goal, H = BALANCE.health;
const pct = (v: number) => `${(v * 100).toFixed(v < 0.1 ? 1 : 0)}%`;
const ORIGIN = { born: "врождённая", hereditary: "наследственная", gained: "нажитая" };

const m = healthMetrics(people, seed);
console.log(`Людей ${m.people} (семя «${seed}»), возраст на начало ${H.ageMin}–${H.ageMax} лет, партия ${m.years} лет. Черт здоровья ${HEALTH_TRAITS.length}.\n`);
console.log(`За партию умерло или выбыло со службы: ${pct(m.removed)} — цель ${pct(G.removedMin)}–${pct(G.removedMax)}; из них умерло ${pct(m.dead)}`);
console.log(`  причины: ${Object.entries(m.causes).map(([key, v]) => `${key === "здоровье" ? "выбыл по здоровью" : key} ${pct(v)}`).join(" · ")}`);
console.log(`  по возрасту на начало партии: ${m.byAge.map((b) => `${b.from}–${b.to} лет — ${pct(b.removed)}`).join(" · ")}`);
console.log(`  из совета в пять человек за партию выбывает в среднем ${(m.removed * 5).toFixed(1)}`);
console.log(`  ещё служат по годам: ${m.curve.filter((_, y) => y % 5 === 0).map((v, i) => `${i * 5}-й год ${pct(v)}`).join(" · ")}`);
console.log(`Слегали хотя бы раз: ${pct(m.sickEver)}; в постели ${pct(m.offShare)} сезонов — цель ${pct(G.offMin)}–${pct(G.offMax)}; нажили черту здоровья ${pct(m.gained)}`);
console.log(`Дурная черта здоровья с рождения: у ${pct(m.badBorn)} — цель ${pct(G.badBornMin)}–${pct(G.badBornMax)}`);
console.log(`Наследственная черта: у ${pct(m.kinShare.base)} людей; у родни носителя — у ${pct(m.kinShare.withKin)}`);
console.log(`Срок жизни взрослого: половина доживает до ${m.life.median} лет — цель не меньше ${G.medianLife}; до ${H.elderFrom} — ${pct(m.life.reachElder)} (цель не меньше ${pct(G.reachElder)}); до ${H.lifeMax - 10} — ${pct(m.life.reachMax)}`);
console.log(`  здоровые с рождения — до ${m.life.medianHealthy}, с дурной чертой — до ${m.life.medianBad}`);
console.log("\nЧерты здоровья к концу партии:");
for (const t of HEALTH_TRAITS) console.log(`  ${t.name.padEnd(22)} ${ORIGIN[t.origin].padEnd(15)} ${pct(m.traitShare[t.id]).padStart(5)}`);

const warnings = healthWarnings(m);
console.log(warnings.length ? `\nПредупреждения:\n${warnings.map((x) => `  ⚠ ${x}`).join("\n")}` : "\nПредупреждений нет: цели выполнены.");

const flat = (x: HealthMetrics): Record<string, number> => ({
  "выбыло за партию": x.removed, "умерло за партию": x.dead, ...Object.fromEntries(Object.entries(x.causes).map(([key, v]) => [`причина: ${key}`, v])),
  "слегали": x.sickEver, "сезонов в постели": x.offShare, "нажили черту": x.gained, "дурная черта с рождения": x.badBorn,
  "наследственная у родни носителя": x.kinShare.withKin, "половина доживает до": x.life.median, "доживают до глубокой старости": x.life.reachElder, "доживают до предела": x.life.reachMax,
});
if (process.argv.includes("--diff")) {
  if (!existsSync(file)) console.log("\nСнимка ещё нет: сначала npm run health -- --save");
  else {
    const old = JSON.parse(readFileSync(file, "utf8")) as { people: number; seed: string; metrics: Record<string, number> };
    const now = flat(m);
    const changed = Object.keys(now).filter((key) => old.metrics[key] !== now[key]);
    console.log(`\nСравнение со снимком (${old.people} человек, семя «${old.seed}»): ${changed.length ? "" : "без изменений"}`);
    for (const key of changed) console.log(`  ${key}: ${old.metrics[key]} → ${now[key]}`);
  }
}
if (process.argv.includes("--save")) {
  writeFileSync(file, `${JSON.stringify({ people, seed, metrics: flat(m) }, null, 2)}\n`);
  console.log(`\nСнимок записан: tools/health.snapshot.json`);
}
