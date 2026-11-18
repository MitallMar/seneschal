// Хозяйство без экрана: руки и потоки по сезонам года (src/sim/economy/plan.ts).
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { SIDES } from "../src/data/economy";
import { resetBalance } from "../src/sim/balance";
import { holder } from "../src/sim/state";
import type { World } from "../src/sim/state";
import { seasonKind } from "../src/sim/economy/zones";
import { handsNow, fieldHands, planSeason } from "../src/sim/economy/plan";
import { ledgerOf } from "../src/sim/economy/view";
import { E, said, calm, pass, zoneAt, line } from "./_economy";

afterEach(() => resetBalance());

// ---------- люди и год по сезонам ----------

test("люди — ёмкость: руки по зоне стороны, поле берёт своё первым, зимой стоит", () => {
  const w = calm();
  assert.deepEqual(handsNow(w), { brod: E.hands.brod, opushka: E.hands.opushka, zamok: E.hands.zamok });
  assert.deepEqual(fieldHands(w), { total: 8, field: E.hands.field, free: 4, build: 0 });
  w.factions.brod = zoneAt("терпят");
  assert.equal(handsNow(w).brod, E.hands.brod * E.zone.tolerate);
  w.season = 4;
  assert.equal(fieldHands(w).field, 0);
});

test("весна: товары уходят купцам, пошлины, жалованье, прокорм — и всё это строками в ведомости", () => {
  const w = calm();
  pass(w);
  assert.deepEqual(w.eco.stock, { eda: 2, tovary: 0.25, serebro: 2.75 });
  const l = w.eco.last!;
  assert.deepEqual(l.before, { eda: 3, tovary: 1, serebro: 2 });
  assert.deepEqual(l.after, w.eco.stock);
  const duty = line(w, "пошлины")!;
  assert.deepEqual([duty.v, duty.side], [0.5, "kuptsy"]);
  assert.ok(/^(негоден|годен|прирождённый), мастер, как велено/.test(duty.how!), `в ведомости — из чего сложилась сила: ${duty.how}`);
  assert.ok(duty.who!.includes(holder(w, "pisar")!.name), "ответственный назван");
  assert.equal(line(w, "жалованье")!.v, -E.flow.salary);
  assert.equal(ledgerOf(l, "eda").lines.reduce((s, x) => s + x.v, 0), -E.flow.upkeep);
  assert.ok(ledgerOf(l, "lyudi").lines[0].text.includes("в поле 4 из 4"));
});

test("год: урожай осенью, зимой прокорм вдвое и порча; пошлины летом выше, зимой ниже", () => {
  const w = calm();
  w.eco.autoPay = false;
  pass(w, 2);
  assert.equal(line(w, "дары леса")!.v, E.flow.forestFood);
  assert.equal(line(w, "пошлины")!.v, E.flow.duties * E.year.dutySummer);
  const lines = pass(w);
  assert.ok(said(lines, "Жатва: в амбар легло 6"), lines.join(" | "));
  const crops = w.eco.last!.lines.filter((l) => l.text.startsWith("урожай"));
  assert.deepEqual(crops.map((l) => [l.side, l.v]), [["brod", 3], ["opushka", 3]]);
  const quit = w.eco.last!.lines.filter((l) => l.text === "оброк серебром");
  assert.deepEqual(quit.map((l) => l.v), [E.flow.quitrentSilver * E.flow.brodShare, 0.4], "у брода оброка больше");
  const before = w.eco.stock.eda;
  pass(w);
  const spoil = line(w, "испорчено")!.v;
  assert.equal(spoil, -Math.round((before - E.flow.upkeepWinter) * E.flow.spoil * 100) / 100);
  assert.equal(line(w, "пошлины")!.v, E.flow.duties * E.year.dutyWinter);
  assert.equal(seasonKind(w.season), 0, "после зимы — весна");
});

test("зона режет поток: «терпят» — половина урожая и рук, «отказывают» — ни урожая, ни оброка, ни пошлин", () => {
  const w = calm();
  w.eco.autoPay = false;
  w.season = 3;
  w.factions.brod = zoneAt("терпят");
  w.factions.opushka = zoneAt("отказывают");
  w.factions.kuptsy = zoneAt("отказывают");
  const plan = planSeason(w);
  const hands = fieldHands(w);
  assert.equal(hands.total, E.hands.brod / 2 + E.hands.zamok);
  const crop = plan.lines.filter((l) => l.text.startsWith("урожай"));
  assert.equal(crop.length, 1);
  assert.equal(crop[0].v, Math.round((E.flow.harvest / 2) * E.zone.tolerate * (hands.field / E.hands.field) * 100) / 100);
  assert.ok(plan.lines.some((l) => l.side === "opushka" && l.text.includes("отказывает")));
  assert.ok(plan.lines.some((l) => l.text.includes("товары лежат на складе")));
  assert.equal(plan.stock.tovary, w.eco.stock.tovary + plan.lines.filter((l) => l.cat === "tovary").reduce((s, l) => s + l.v, 0));
  assert.ok(!plan.lines.some((l) => l.text === "пошлины"));
});

test("посевная: мало рук в поле весной — меньше урожай осенью", () => {
  const harvest = (setup: (w: World) => void) => {
    const w = calm();
    w.eco.autoPay = false;
    setup(w);
    pass(w);
    for (const s of SIDES) w.factions[s] = E.start.trust;
    w.eco.recruits = [];
    pass(w, 2);
    return w.eco.last!.lines.filter((l) => l.text.startsWith("урожай")).reduce((s, l) => s + l.v, 0);
  };
  assert.equal(harvest(() => {}), E.flow.harvest);
  const thin = harvest((w) => { w.eco.recruits.push({ from: "brod", hands: 3, until: 2 }, { from: "opushka", hands: 3, until: 2 }); });
  assert.equal(thin, E.flow.harvest * (E.hands.zamok / E.hands.field), "весной в поле вышли только люди замка");
});

test("лес отказывает — потравы; деревня у опушки отказывает — даров леса вдвое меньше", () => {
  const w = calm();
  w.season = 2;
  w.factions.opushka = zoneAt("отказывают");
  assert.equal(planSeason(w).lines.find((l) => l.text.startsWith("дары леса"))!.v, Math.round(E.flow.forestFood * E.zone.noRites * 100) / 100);
  w.factions.les = zoneAt("отказывают");
  const plan = planSeason(w);
  assert.ok(!plan.lines.some((l) => l.text.startsWith("дары леса")));
  assert.equal(plan.lines.find((l) => l.text.includes("потравы"))!.v, -E.zone.lesHarm);
});
