// Отчёт генератора натур: метрики раздела 6 черновика docs/design/natura.md, предупреждения и пять примеров людей словами.
// Запуск: npm run natura -- [--rolls=1000] [--seed=натура] [--place=derevnya] [--save] [--diff]
//   --place — где люди взялись: fon (общий фон, по умолчанию), derevnya, zamok, priyom; снимок пишется и сравнивается только на общем фоне;
//   --save — записать метрики в tools/natura.snapshot.json (коммитится вместе с правкой ручек или мешка);
//   --diff — сравнить с записанным: было → стало.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { AXES, AXIS_NAMES } from "../src/data/core";
import { SIGNS, NATURES, BAG } from "../src/data/natura";
import { ORIGINS, ORIGIN_PLACES, type OriginPlace } from "../src/data/origins";
import { BALANCE } from "../src/sim/balance";
import { growParty, type NaturaPerson } from "../src/sim/natura";
import { naturaMetrics, naturaWarnings, type NaturaMetrics } from "../src/sim/natura-report";

const arg = (name: string, def: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1] ?? def;
const rolls = Number(arg("rolls", "1000")), seed = arg("seed", "натура");
const place = ORIGIN_PLACES.find((x) => x.id === arg("place", "fon"));
if (!place) throw new Error(`Нет места ${arg("place", "")}: есть ${ORIGIN_PLACES.map((x) => x.id).join(", ")}`);
const fon = place.id === "fon";
const file = resolve(dirname(fileURLToPath(import.meta.url)), "natura.snapshot.json");
const G = BALANCE.natura.goal;
const pct = (v: number) => `${Math.round(v * 100)}%`;

const m = naturaMetrics(rolls, seed, place.id as OriginPlace);
const kinds = (k: string) => BAG.filter((t) => t.kind === k && !t.seneschal).length;
console.log(`Натур ${NATURES.length}, признаков ${SIGNS.length}, в мешке ${BAG.length}: людям — врождённых ${kinds("born")}, нажитых ${kinds("life")}, перков ${kinds("perk")}, облик ${kinds("look")};`
  + ` мешок Сенешаля — ${BAG.filter((t) => t.seneschal).length}. Происхождений ${ORIGINS.length}.`);
console.log(`Рероллов ${m.rolls} (семя «${seed}»), возраст ${BALANCE.natura.ageMin}–${BALANCE.natura.ageMax} лет. Черт на человека в среднем ${m.traitsMean.toFixed(1)}:`
  + ` врождённых ${m.kinds.born.toFixed(1)}, нажитых ${m.kinds.life.toFixed(1)}, перков ${m.kinds.perk.toFixed(1)}.`);
console.log(`Доля нажитого у человека: ${pct(m.lifeShare)} — цель не меньше ${pct(G.lifeShare)}`);
console.log(`Облик: у ${pct(m.look)} людей (ручка ${pct(BALANCE.natura.lookShare)}); в метрики набора черт облик и мешок Сенешаля не входят.`);
console.log(`Откуда и чей (место — ${place.name}): ${ORIGINS.map((o) => `${o.name} ${pct(m.origins[o.id])}`).join(" · ")}\n`);
console.log(`Похожесть рероллов одной натуры (медиана общих черт): ${m.jaccard.toFixed(2)} — цель не больше ${G.jaccard}`);
console.log(`  самая однообразная натура: ${m.jaccardWorst.nature}, ${m.jaccardWorst.value.toFixed(2)}`);
console.log(`Различимость: по признакам натура угадывается в ${pct(m.signNn)} случаев — цель не меньше ${pct(G.signNn)}`);
console.log(`  по набору черт — в ${pct(m.nn)} — цель ${pct(G.nnMin)}–${pct(G.nnMax)} (ниже — черты от натуры не зависят, выше — шаблон)`);
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
  const mark = (id: string) => (id === p.contra ? " (против натуры)" : id === p.far ? " (издалека)" : p.anchors.includes(id) ? " (врождённая)" : p.inGame.includes(id) ? " (в игре)" : "");
  const signs = Object.entries(p.signs).filter(([, v]) => Math.abs(v) >= 2).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).map(([k, v]) => pole(k, v));
  return [`${p.nature.name}, ${p.age} лет`, `    черты: ${p.traits.map((t) => `«${t.name}»${mark(t.id)}`).join(", ")}`,
    `    признаки: ${signs.join(", ")}`, `    склонности: ${AXES.map((a) => `${AXIS_NAMES[a]} ${p.star[a].toFixed(1)}`).join(", ")}`].join("\n");
};
console.log(`\nПять человек одной партии (семя «${seed}»):`);
for (const p of growParty(seed, 5)) console.log(`  ${describe(p)}`);

// снимок метрик: числа без списков, чтобы сравнение было коротким
const flat = (x: NaturaMetrics): Record<string, number> => ({
  "черт на человека": x.traitsMean, "врождённых": x.kinds.born, "нажитых": x.kinds.life, "перков": x.kinds.perk, "доля нажитого": x.lifeShare,
  "похожесть рероллов": x.jaccard, "различимость по признакам": x.signNn, "различимость по чертам": x.nn, "не выпали": x.never.length, "с обликом": x.look, "самая частая обычная": x.commonMax.share,
  ...Object.fromEntries(ORIGINS.map((o) => [`откуда: ${o.name}`, x.origins[o.id]])),
  ...Object.fromEntries(SIGNS.map((s) => [`разброс: ${s.plus}`, x.signSpread[s.id]])),
  ...Object.fromEntries(AXES.flatMap((a) => [[`${AXIS_NAMES[a]}: среднее`, x.axes[a].mean], [`${AXIS_NAMES[a]}: разброс`, x.axes[a].spread], [`${AXIS_NAMES[a]}: ведущая`, x.axes[a].top]])),
});
if (!fon && (process.argv.includes("--diff") || process.argv.includes("--save"))) {
  console.log(`\nСнимок — только для общего фона: с местом «${place.name}» он не сравнивается и не пишется.`);
} else if (process.argv.includes("--diff")) {
  if (!existsSync(file)) console.log("\nСнимка ещё нет: сначала npm run natura -- --save");
  else {
    const old = JSON.parse(readFileSync(file, "utf8")) as { rolls: number; seed: string; metrics: Record<string, number> };
    const now = flat(m);
    const changed = Object.keys(now).filter((key) => old.metrics[key] !== now[key]);
    console.log(`\nСравнение со снимком (${old.rolls} рероллов, семя «${old.seed}»): ${changed.length ? "" : "без изменений"}`);
    for (const key of changed) console.log(`  ${key}: ${old.metrics[key]} → ${now[key]}`);
  }
}
if (fon && process.argv.includes("--save")) {
  writeFileSync(file, `${JSON.stringify({ rolls, seed, metrics: flat(m) }, null, 2)}\n`);
  console.log(`\nСнимок записан: tools/natura.snapshot.json`);
}
