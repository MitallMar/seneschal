// Прогон без экрана: генерирует партию, гоняет сезоны и печатает сводку.
// Запуск: npm run sim -- [семя] [сезонов] [--log]
import { newWorld } from "../src/sim/council/generate";
import { runSeason } from "../src/sim/season";
import { consistency, expWord, relWord, loyaltyWord, traitLabel, axisKnown } from "../src/sim/council/know";
import { topAxis, getRel, postName } from "../src/sim/state";
import { AXES, AXIS_NAMES } from "../src/data/core";
import { SIDES, SIDE_NAMES, STOCKS, CATEGORY_NAMES } from "../src/data/economy";
import { zoneOf, patienceWord } from "../src/sim/economy/zones";

const seed = process.argv[2] ?? "test";
const seasons = Number(process.argv[3] ?? 12);
const w = newWorld(seed, true);
for (let i = 0; i < seasons; i++) runSeason(w);

for (const p of w.people) {
  const star = AXES.map((a) => `${AXIS_NAMES[a][0]}${p.star[a].toFixed(1)}`).join(" ");
  const ch = AXES.map((a) => `${AXIS_NAMES[a][0]}${p.choices[a]}`).join(" ");
  const who = `${p.name.padEnd(9)} ${p.trait.name.padEnd(13)} ${(p.post ? postName(p.post) : "—").padEnd(16)} ${expWord(p).padEnd(9)}`;
  const top = `топ:${AXIS_NAMES[topAxis(p.star)].padEnd(9)} совп:${String(consistency(p)).padStart(3)}% (${p.decisions})`;
  console.log(`${who} ${top} | ${star} | выборы ${ch} | ${loyaltyWord(p.loyalty)} ${p.loyalty} | ${p.aspiration?.text}`);
}
console.log("\nЧерты и знание (Ч — ключевая черта известна, в скобках — известные оси):");
for (const p of w.people) {
  const gained = p.gained.map((g) => `${traitLabel(w, g)} (сез. ${g.season})`).join(", ") || "—";
  const known = AXES.filter((a) => axisKnown(p, a)).map((a) => AXIS_NAMES[a]).join(", ") || "ничего";
  console.log(`  ${p.name.padEnd(9)} ${p.know.trait ? "Ч" : "·"} молва: ${p.rumor ? p.rumor.text + (p.rumor.wrong ? " [неверная]" : "") : "—"} | нажито: ${gained} | видно: (${known})`);
}
console.log("\nОтношения в совете:");
const council = w.people.filter((p) => p.post);
for (let i = 0; i < council.length; i++)
  for (let j = i + 1; j < council.length; j++)
    console.log(`  ${council[i].name} — ${council[j].name}: ${relWord(getRel(w, council[i].id, council[j].id))} (${getRel(w, council[i].id, council[j].id).toFixed(1)})`);
console.log(`\nСтороны: ${SIDES.map((s) => `${SIDE_NAMES[s]} — ${zoneOf(w, s)} (${w.factions[s]})`).join(" · ")} · порядок ${w.resources.poryadok}`);
const t = w.eco.tax;
console.log(`Запасы: ${STOCKS.map((c) => `${CATEGORY_NAMES[c].toLowerCase()} ${w.eco.stock[c]}`).join(" · ")} · недодача в ${w.eco.shortages} сезонах`);
console.log(`Подать: ${t.history.map((y) => `год ${y.year} — ${y.closed ? "закрыт" : "недоимка"} (${y.paid} из ${y.due})`).join(" · ")} · Герцог ${patienceWord(t.patience)} (${t.patience})`);
if (w.eco.last) console.log(`Ведомость прошлого сезона:\n  ${w.eco.last.lines.map((l) => `${CATEGORY_NAMES[l.cat]} ${l.v > 0 ? "+" : ""}${l.v} ${l.text}${l.who ? ` — ${l.who}, ${l.how ?? ""}` : ""}`).join("\n  ")}`);
if (process.argv.includes("--log")) for (const e of w.log) console.log(`\n[${e.season}] ${e.title}\n  ${e.lines.join("\n  ")}`);
const bio = w.people[0];
console.log(`\nБиография ${bio.name}:\n  ${bio.bio.join("\n  ")}`);
