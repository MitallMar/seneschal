// Отчёт о хозяйстве: закрывается ли испытание, чем и с кого платят, сколько раз срабатывает недодача, не слишком ли щедро «заодно со всеми».
// Запуск: npm run economy -- [--seeds=100] [--seasons=12] [--save] [--diff]
//   --save — записать метрики в tools/economy.snapshot.json (коммитится вместе с правкой ручек хозяйства);
//   --diff — сравнить с записанным: было → стало.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PAY, SIDES, SIDE_NAMES, CATEGORY_NAMES, STOCKS } from "../src/data/economy";
import { BALANCE } from "../src/sim/balance";
import { economyMetrics, economyNotes, freeYear, PAYERS, type EconomyMetrics } from "../src/sim/economy-report";
import type { Zone } from "../src/sim/state";
import { AUTH_KIND_NAMES } from "../src/sim/authority";
import type { AuthKind } from "../src/sim/state";

const arg = (name: string, def: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1] ?? def;
const seeds = Number(arg("seeds", String(BALANCE.bots.seeds))), seasons = Number(arg("seasons", "12"));
const file = resolve(dirname(fileURLToPath(import.meta.url)), "economy.snapshot.json");
const pct = (v: number) => `${Math.round(v * 100)}%`;
const T = BALANCE.economy.tax;

console.log(`Партий ${seeds}, сезонов ${seasons}. Играют боты (npm run bots — подробно). Урок испытания ${T.trial} мер, ${T.trialYears} года; обычный ${T.normal}.\n`);
const all = PAYERS.map((p) => ({ p, m: economyMetrics(seeds, seasons, p) }));
for (const { p, m } of all) {
  console.log(`Бот «${p.name}»`);
  console.log(`  урок закрыт в срок: ${m.closedByYear.map((v, y) => `год ${y + 1} — ${pct(v)}`).join(" · ")}; все годы — ${pct(m.closedAll)}; внесено ${pct(m.paidShare)} назначенного`);
  const by = PAY.filter((d) => m.measuresBy[d.id]).map((d) => `${d.name.toLowerCase()} ${m.measuresBy[d.id]}`).join(" · ");
  console.log(`  чем и с кого, мер за партию: ${by || "ничем"}`);
  console.log(`  недодача: в среднем ${m.shortages} сезона из ${m.seasons}, хотя бы раз — в ${pct(m.shortParties)} партий; недоимка на конец ${m.carried} мер`);
  console.log(`  терпение Герцога к концу: ${Object.entries(m.patience).filter(([, v]) => v).map(([z, v]) => `${z} ${pct(v)}`).join(" · ")}`);
  const au = m.authority, from = Object.entries(au.by).filter(([, v]) => v).map(([k, v]) => `${AUTH_KIND_NAMES[k as AuthKind]} ${v > 0 ? "+" : ""}${v}`).join(" · ");
  console.log(`  авторитет к концу (старт ${BALANCE.staff.authorityStart}, потолок ${BALANCE.authority.cap}): в среднем ${au.mean}, от ${au.min} до ${au.max}; у потолка — ${pct(au.atCap)}, не выше половины старта — ${pct(au.low)}`);
  console.log(`    откуда за партию: ${from}`);
  console.log(`  запасы к концу: ${STOCKS.map((c) => `${CATEGORY_NAMES[c].toLowerCase()} ${m.stock[c]}`).join(" · ")}`);
  console.log(`  зоны сторон к концу: ${SIDES.map((s) => `${SIDE_NAMES[s]} — ${Object.entries(m.zones[s]).filter(([, v]) => v).map(([z, v]) => `${z} ${pct(v)}`).join(", ")}`).join("; ")}\n`);
}

const ZONES: Zone[] = ["заодно", "ладят", "терпят", "отказывают"];
console.log("Год без событий, все стороны в одной зоне, исполнители «как велено» (свободный доход в мерах после прокорма, жалованья и порчи):");
const free = Object.fromEntries(ZONES.map((z) => [z, freeYear(z)]));
for (const z of ZONES) {
  const f = free[z];
  const inc = STOCKS.map((c) => `${CATEGORY_NAMES[c].toLowerCase()} ${f.income[c] > 0 ? "+" : ""}${f.income[c]}`).join(", ");
  console.log(`  ${z.padEnd(11)} свободно ${String(f.free).padStart(6)} | урок ${T.normal}: ${(f.free - T.normal).toFixed(1).padStart(5)} | урок ${T.trial}: ${(f.free - T.trial).toFixed(1).padStart(5)} | ${inc}`);
}

const notes = economyNotes(all[0].m, all[1].m);
console.log(notes.length ? `\nЗамечания:\n${notes.map((x) => `  ⚠ ${x}`).join("\n")}` : "\nЗамечаний нет.");

const flat = (list: { p: { id: string }; m: EconomyMetrics }[]): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const { p, m } of list) {
    out[`${p.id}: все годы закрыты`] = m.closedAll;
    m.closedByYear.forEach((v, y) => { out[`${p.id}: год ${y + 1} закрыт`] = v; });
    out[`${p.id}: недодач на партию`] = m.shortages;
    out[`${p.id}: авторитет к концу`] = m.authority.mean;
    out[`${p.id}: внесено от назначенного`] = m.paidShare;
    for (const c of STOCKS) out[`${p.id}: ${CATEGORY_NAMES[c].toLowerCase()} к концу`] = m.stock[c];
  }
  for (const z of ZONES) out[`год в зоне «${z}»: свободно мер`] = free[z].free;
  return out;
};
if (process.argv.includes("--diff")) {
  if (!existsSync(file)) console.log("\nСнимка ещё нет: сначала npm run economy -- --save");
  else {
    const old = JSON.parse(readFileSync(file, "utf8")) as { seeds: number; seasons: number; metrics: Record<string, number> };
    const now = flat(all);
    const changed = Object.keys(now).filter((key) => old.metrics[key] !== now[key]);
    console.log(`\nСравнение со снимком (${old.seeds} партий, ${old.seasons} сезонов): ${changed.length ? "" : "без изменений"}`);
    for (const key of changed) console.log(`  ${key}: ${old.metrics[key]} → ${now[key]}`);
  }
}
if (process.argv.includes("--save")) {
  writeFileSync(file, `${JSON.stringify({ seeds, seasons, metrics: flat(all) }, null, 2)}\n`);
  console.log("\nСнимок записан: tools/economy.snapshot.json");
}
