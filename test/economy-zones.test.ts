// Хозяйство без экрана: начало партии, стороны и зоны доверия (src/sim/economy/zones.ts, начало партии — season.ts).
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { POSTS } from "../src/data/core";
import { EVENTS } from "../src/data/events";
import { SIDES, ELDERS } from "../src/data/economy";
import { resetBalance } from "../src/sim/balance";
import { newWorld } from "../src/sim/council/generate";
import { runEvent } from "../src/sim/council/council";
import { holder } from "../src/sim/state";
import { zoneWord, zoneOf, zoneMult, patienceWord } from "../src/sim/economy/zones";
import { lessonOf } from "../src/sim/economy/tax";
import { fix } from "./_world";
import { E, event, calm, pass, zoneAt } from "./_economy";

afterEach(() => resetBalance());

// ---------- начало партии ----------

test("старт: четыре категории, шесть сторон в «ладят», урок испытания, двое старост", () => {
  const w = newWorld("старт");
  assert.deepEqual(w.eco.stock, { eda: E.start.eda, tovary: E.start.tovary, serebro: E.start.serebro });
  assert.deepEqual(Object.keys(w.factions), SIDES);
  for (const s of SIDES) assert.equal(zoneOf(w, s), "ладят", s);
  assert.equal(w.eco.tax.year, 1);
  assert.equal(w.eco.tax.due, E.tax.trial);
  assert.equal(patienceWord(w.eco.tax.patience), "ждёт");
  assert.deepEqual(w.eco.elders.map((e) => e.side), ["brod", "opushka"]);
  for (const el of w.eco.elders) assert.equal(el.rel.length, w.people.length, "отношения — с каждым, кто может стать тиуном");
  assert.equal(ELDERS.length, 2);
  assert.equal(POSTS.find((p) => p.id === "starosta")!.name, "Тиун", "должность зовётся «Тиун», id прежний");
  assert.ok(w.log[0].lines.some((l) => l.includes("испытание")));
});

test("урок: испытание первые годы, потом обычный", () => {
  assert.equal(lessonOf(1), E.tax.trial);
  assert.equal(lessonOf(E.tax.trialYears), E.tax.trial);
  assert.equal(lessonOf(E.tax.trialYears + 1), E.tax.normal);
});

// ---------- стороны и зоны ----------

test("зоны доверия: слова по порогам, множитель потока по зоне", () => {
  assert.equal(zoneWord(E.trust.ally), "заодно");
  assert.equal(zoneWord(E.trust.ally - 1), "ладят");
  assert.equal(zoneWord(E.trust.friendly), "ладят");
  assert.equal(zoneWord(E.trust.friendly - 1), "терпят");
  assert.equal(zoneWord(E.trust.refuse), "отказывают");
  assert.ok(E.trust.refuse < E.trust.friendly && E.trust.friendly < E.trust.ally && E.trust.ally <= E.trust.max);
  const w = calm();
  const mult = (z: string) => { w.factions.kuptsy = zoneAt(z); return zoneMult(w, "kuptsy"); };
  assert.deepEqual(["заодно", "ладят", "терпят", "отказывают"].map(mult), [E.zone.ally, E.zone.friendly, E.zone.tolerate, E.zone.refuse]);
  const T = E.tax;
  assert.ok(T.displeased < T.waits && T.waits < T.favor);
  assert.deepEqual([T.favor, T.waits, T.displeased, 0].map(patienceWord), ["благоволит", "ждёт", "недоволен", "на исходе"]);
});

test("событие про одну деревню задевает только её; без названной — обе", () => {
  const w = calm();
  const start = E.start.trust;
  fix(holder(w, "starosta")!, ["zabota"]);
  const e = runEvent(w, event("nedoimka")); // Нижняя деревня — у брода: «Простить» (Забота: деревни +2, еда −2)
  assert.equal(e.effects!.derevni, 2);
  assert.equal(w.factions.brod, start + 2);
  assert.equal(w.factions.opushka, start);
  assert.ok(EVENTS.filter((x) => x.village).length >= 6, "события про одну деревню помечены");
});

test("доверие стороны не выходит за края шкалы и за сезон тянется к нейтральному", () => {
  const w = calm();
  w.factions.les = E.trust.max;
  pass(w);
  assert.equal(w.factions.les, Math.round(E.trust.max * E.trust.fade * 10) / 10);
  for (let i = 0; i < 40; i++) runEvent(w, event("brakonier"));
  for (const s of SIDES) assert.ok(Math.abs(w.factions[s]) <= E.trust.max, s);
});
