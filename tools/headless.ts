// Прогон без экрана: генерирует партию, гоняет сезоны и печатает сводку.
// Запуск: npx tsx tools/headless.ts [семя] [сезонов]
import { newWorld, runSeason, consistency, topAxis, expWord, relWord, getRel, loyaltyWord, postName } from "../src/sim/sim";
import { AXES, AXIS_NAMES } from "../src/data/core";

const seed = process.argv[2] ?? "test";
const seasons = Number(process.argv[3] ?? 12);
const w = newWorld(seed, true);
for (let i = 0; i < seasons; i++) runSeason(w);

for (const p of w.people) {
  const star = AXES.map((a) => `${AXIS_NAMES[a][0]}${p.star[a].toFixed(1)}`).join(" ");
  const ch = AXES.map((a) => `${AXIS_NAMES[a][0]}${p.choices[a]}`).join(" ");
  console.log(`${p.name.padEnd(9)} ${p.trait.name.padEnd(13)} ${(p.post ? postName(p.post) : "—").padEnd(16)} ${expWord(p).padEnd(9)} топ:${AXIS_NAMES[topAxis(p.star)].padEnd(9)} совп:${String(consistency(p)).padStart(3)}% (${p.decisions}) | ${star} | выборы ${ch} | ${loyaltyWord(p.loyalty)} ${p.loyalty} | ${p.aspiration?.text}`);
}
console.log("\nОтношения в совете:");
const council = w.people.filter((p) => p.post);
for (let i = 0; i < council.length; i++)
  for (let j = i + 1; j < council.length; j++)
    console.log(`  ${council[i].name} — ${council[j].name}: ${relWord(getRel(w, council[i].id, council[j].id))} (${getRel(w, council[i].id, council[j].id).toFixed(1)})`);
console.log("\nСтороны:", w.factions, "\nРесурсы:", w.resources);
if (process.argv.includes("--log")) for (const e of w.log) console.log(`\n[${e.season}] ${e.title}\n  ${e.lines.join("\n  ")}`);
const bio = w.people[0];
console.log(`\nБиография ${bio.name}:\n  ${bio.bio.join("\n  ")}`);
