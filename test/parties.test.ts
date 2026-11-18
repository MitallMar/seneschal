// Отпечаток партий: те же семена и те же действия игрока дают те же партии, что и до правки.
// Сторожит правило «поведение не меняется незаметно»: правка экрана, сборки или порядка кода отпечаток не трогает.
// Правка намеренно меняет ход партии (число в balance.ts, правило совета, данные событий) — тест упадёт: это и есть сигнал.
// Тогда записать новый отпечаток: UPDATE_SNAPSHOT=1 npm test — и сказать об этом в сообщении коммита.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { AXES, POSTS } from "../src/data/core";
import { newWorld, runSeason, assign, giveOrder, holder, setHead, talk, persuade, command, deskView } from "../src/sim/sim";
import { setCourse, setFloor, payTax } from "../src/sim/economy";
import { judge, feast } from "../src/sim/authority";
import { COURSES, PAY } from "../src/data/economy";
import { digest, dump } from "./_world";

const FILE = fileURLToPath(new URL("./parties.snapshot.json", import.meta.url));
const SEEDS = ["замок", "лес", "герцог", "test"];
const postIds = POSTS.map((p) => p.id);

// 16 сезонов с действиями игрока: разговоры, перестановки, снятие с должности, наказы, смена главного, курс, нижняя черта, плата подати, пир, приказ, суд, уговор
function party(seed: string, lab: boolean): string {
  const w = newWorld(seed, lab);
  for (let s = 0; s < 16; s++) {
    talk(w, s % 10);
    talk(w, (s + 3) % 10);
    if (s % 3 === 0) assign(w, (s * 7) % 10, postIds[s % 5]);
    if (s % 5 === 1) giveOrder(w, (s * 3) % 10, AXES[s % 5]);
    if (s % 7 === 2) {
      const h = holder(w, postIds[(s + 1) % 5]);
      if (h) assign(w, h.id, null);
    }
    if (s % 4 === 3) {
      const council = w.people.filter((p) => p.post);
      if (council.length) setHead(w, council[s % council.length].id);
    }
    if (s % 5 === 2) setCourse(w, COURSES[s % COURSES.length].id);
    if (s === 6) setFloor(w, "eda", 3);
    if (s === 9) w.eco.feedFirst = "derevni";
    if (s % 4 !== 3) payTax(w, PAY[(s * 3) % PAY.length].id, 1);
    if (s === 10) w.eco.autoPay = false;
    if (s % 6 === 4) feast(w, s % 4 ? "pir" : "prazdnik");
    if (s % 3 === 1) { const d = deskView(w); if (d) command(w, d.ev.options[s % d.ev.options.length].id); }
    if (w.auth.complaints.length && s % 2) judge(w, w.auth.complaints[0].id);
    if (s === 7 || s === 8) { const h = holder(w, "pisar"); if (h) persuade(w, h.id); }
    runSeason(w);
  }
  return digest(dump(w));
}

test("отпечаток партий: те же семена — те же партии, что записаны в parties.snapshot.json", () => {
  const now: Record<string, string> = {};
  for (const seed of SEEDS) {
    now[seed] = party(seed, false);
    now[`${seed}, лабиринт открыт`] = party(seed, true);
  }
  if (process.env.UPDATE_SNAPSHOT) writeFileSync(FILE, `${JSON.stringify(now, null, 2)}\n`);
  assert.ok(existsSync(FILE), "нет test/parties.snapshot.json: записать его — UPDATE_SNAPSHOT=1 npm test");
  assert.deepEqual(now, JSON.parse(readFileSync(FILE, "utf8")), "ход партий изменился; если так задумано — UPDATE_SNAPSHOT=1 npm test");
});
