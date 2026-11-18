// Хозяйство без экрана: подать — способы платить, сборщица, недоимка, плательщик по умолчанию (src/sim/economy/pay.ts, tax.ts).
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { PAY } from "../src/data/economy";
import { resetBalance } from "../src/sim/balance";
import { handsNow, planSeason } from "../src/sim/economy/plan";
import { payOptions, payTax, taxLeft } from "../src/sim/economy/pay";
import { E, said, calm, pass, zoneAt, r1, line } from "./_economy";

afterEach(() => resetBalance());

// ---------- подать ----------

test("подать: способы «чем и с кого» — у каждого свой курс, предел и своя боль", () => {
  const w = calm();
  assert.equal(payOptions(w).length, PAY.length);
  const max = (id: string) => payOptions(w).find((o) => o.def.id === id)!.max;
  assert.equal(max("serebro"), E.start.serebro / E.rate.serebro);
  assert.equal(max("eda"), E.start.eda / E.rate.eda);
  assert.equal(max("tovary"), E.start.tovary / E.rate.tovary);
  assert.equal(max("rekruty_brod"), E.hands.brod / E.rate.lyudi);
  // серебром из казны
  assert.equal(payTax(w, "serebro", 1), 1);
  assert.equal(w.eco.stock.serebro, E.start.serebro - E.rate.serebro);
  assert.equal(taxLeft(w), E.tax.trial - 1);
  // зерном: полторы единицы за меру
  payTax(w, "eda", 1);
  assert.equal(w.eco.stock.eda, E.start.eda - E.rate.eda);
  // товарами: два воза за меру
  assert.equal(payTax(w, "tovary", 5), 0.5, "больше, чем есть на складе, не уйдёт");
  assert.equal(w.eco.stock.tovary, 0);
  // рекруты с деревни: рук меньше на год, деревня обижена
  const trust = w.factions.brod;
  payTax(w, "rekruty_brod", 1);
  assert.equal(handsNow(w).brod, E.hands.brod - 1);
  assert.equal(w.factions.brod, trust - E.pay.recruitTrust);
  pass(w, E.pay.recruitSeasons);
  w.factions.brod = E.start.trust;
  assert.equal(handsNow(w).brod, E.hands.brod, "через год руки вернулись");
});

test("подать: сбор с купцов режет пошлины, заём возвращают с лихвой, зерно сверх оброка и люди замка бьют по своим сторонам", () => {
  const w = calm();
  w.eco.autoPay = false;
  const t = { ...w.factions };
  assert.equal(payTax(w, "sbor_kuptsy", 9), E.pay.levyCap, "не больше предела в год");
  assert.equal(w.factions.kuptsy, r1(t.kuptsy - E.pay.levyTrust * E.pay.levyCap));
  w.factions.kuptsy = E.start.trust;
  assert.equal(planSeason(w).lines.find((l) => l.text.startsWith("пошлины"))!.v, E.flow.duties * E.pay.levyDuty);
  payTax(w, "zaem", 1);
  assert.deepEqual(w.eco.debts, [{ due: 1 + E.pay.loanTerm, sum: 1 + E.pay.loanInterest }]);
  payTax(w, "sverh_opushka", 1);
  assert.equal(w.factions.opushka, t.opushka - E.pay.extraTrust);
  const order = w.resources.poryadok;
  payTax(w, "rekruty_zamok", 1);
  assert.equal(w.factions.zamok, t.zamok - E.pay.castleTrust);
  assert.equal(w.resources.poryadok, order - E.pay.castleOrder);
  const patience = w.eco.tax.patience;
  assert.equal(payTax(w, "volnye", 3), 0.5, "остаток урока — полмеры");
  assert.equal(w.eco.tax.patience, patience - E.pay.vagrantPatience * 0.5);
  assert.equal(taxLeft(w), 0);
  assert.ok(w.eco.tax.early, "закрыт весной — досрочно");
  assert.deepEqual(w.eco.tax.by, { sbor_kuptsy: 1.5, zaem: 1, sverh_opushka: 1, rekruty_zamok: 1, volnye: 0.5 });
  // заём возвращается сам, когда подошёл срок
  w.eco.stock.serebro = 5;
  pass(w, E.pay.loanTerm + 1);
  assert.ok(line(w, "возврат займа"), w.eco.last!.lines.map((l) => l.text).join(" | "));
  assert.deepEqual(w.eco.debts, []);
});

test("подать: кто отказывает, с того не взять; в долг дают только тем, с кем ладят", () => {
  const w = calm();
  w.factions.brod = zoneAt("отказывают");
  w.factions.kuptsy = zoneAt("терпят");
  const opt = (id: string) => payOptions(w).find((o) => o.def.id === id)!;
  assert.ok(opt("sverh_brod").blocked && opt("rekruty_brod").blocked && opt("zaem").blocked);
  assert.equal(payTax(w, "sverh_brod", 1), 0);
  assert.ok(!opt("sbor_kuptsy").blocked);
});

test("сборщица: урок закрыт — терпение растёт (досрочно — больше), новый урок объявляют зимой", () => {
  for (const early of [true, false]) {
    const w = calm();
    w.eco.autoPay = false;
    const patience = w.eco.tax.patience;
    if (!early) pass(w, 2);
    w.eco.stock.serebro = 9;
    payTax(w, "serebro", E.tax.trial);
    assert.equal(w.eco.tax.early, early);
    const lines = pass(w, early ? 3 : 1);
    assert.ok(said(lines, "приняла урок"), lines.join(" | "));
    assert.equal(w.eco.tax.patience, patience + (early ? E.tax.early : E.tax.onTime));
    assert.deepEqual(w.eco.tax.history, [{ year: 1, due: E.tax.trial, paid: E.tax.trial, closed: true, early, by: { serebro: E.tax.trial } }]);
    assert.ok(said(pass(w), "Герцог объявил урок"));
    assert.deepEqual([w.eco.tax.year, w.eco.tax.due, w.eco.tax.paid], [2, E.tax.trial, 0]);
  }
});

test("недоимка: остаток с надбавкой переходит на следующий год, терпение Герцога тает; двор смягчает или ускоряет", () => {
  const loss = (dvor: string) => {
    const w = calm();
    w.eco.autoPay = false;
    w.eco.stock.serebro = 9;
    payTax(w, "serebro", 3);
    w.factions.dvor = dvor === "заодно" ? E.trust.max : dvor === "отказывают" ? -E.trust.max : E.start.trust;
    const patience = w.eco.tax.patience;
    const lines = pass(w, 3);
    assert.ok(said(lines, "с недобором"), lines.join(" | "));
    assert.equal(w.eco.tax.carried, (E.tax.trial - 3) * (1 + E.tax.arrears));
    pass(w);
    assert.equal(w.eco.tax.due, E.tax.trial + w.eco.tax.carried);
    return patience - w.eco.tax.patience;
  };
  assert.equal(loss("ладят"), E.tax.arrearsPatience);
  assert.ok(loss("заодно") < loss("ладят") && loss("ладят") < loss("отказывают"));
});

test("плательщик по умолчанию: закрывает урок серебром, потом зерном — не ниже нижних черт", () => {
  const w = calm();
  w.season = 3;
  w.eco.stock = { eda: 5, tovary: 0, serebro: 3 };
  w.eco.floor = { eda: E.start.floorEda, serebro: E.start.floorSerebro };
  w.factions.kuptsy = zoneAt("отказывают"); w.factions.brod = zoneAt("отказывают"); w.factions.opushka = zoneAt("отказывают");
  const plan = planSeason(w);
  const lines = pass(w);
  assert.ok(said(lines, "Совет сам закрывает урок"), lines.join(" | "));
  assert.ok(w.eco.stock.serebro >= w.eco.floor.serebro && w.eco.stock.serebro < w.eco.floor.serebro + E.rate.serebro / 10 + 0.01, `серебро ${w.eco.stock.serebro}`);
  assert.ok(w.eco.stock.eda >= w.eco.floor.eda && w.eco.stock.eda < w.eco.floor.eda + E.rate.eda / 10 + 0.01, `еда ${w.eco.stock.eda}`);
  assert.ok(plan.stock.serebro > w.eco.stock.serebro && plan.stock.eda > w.eco.stock.eda, "платили и серебром, и зерном");
  assert.deepEqual(Object.keys(w.eco.tax.history[0].by), ["serebro", "eda"]);
  assert.ok(!w.eco.tax.history[0].closed);
});
