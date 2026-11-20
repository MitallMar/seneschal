// Порядок — шкала строгости (задача И13; src/sim/order.ts, order-season.ts): ступени и градации, норма и дрейф,
// стража и её цена, плюсы и минусы ступеней, гниль, события строгого края.
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { EVENTS } from "../src/data/events";
import { BALANCE, resetBalance, setAt } from "../src/sim/balance";
import { newWorld } from "../src/sim/council/generate";
import { runSeason, runEvents } from "../src/sim/season";
import { assign } from "../src/sim/council/staff";
import { holder } from "../src/sim/state";
import type { World } from "../src/sim/state";
import { ORDER_MAX, STEPS, stepOf, gradeOf, orderMods, orderNorm, guardCost, guardHands, setGuard } from "../src/sim/order";
import { orderSeason, villageCap } from "../src/sim/order-season";
import { addTrust } from "../src/sim/economy/zones";
import { planSeason, fieldHands } from "../src/sim/economy/plan";
import { setCourse } from "../src/sim/economy/doer";
import { metricsOf } from "../src/sim/bots-report";
import { bot, playBot } from "../src/sim/bots";
import { fix } from "./_world";

afterEach(() => resetBalance());

const O = BALANCE.order;
// Десятник без уклона: норму двигают только стража и курс.
function level(seed = "порядок"): World {
  setAt("world.on", 0);
  setAt("fall.on", 0);   // кризисы и падение — своя проверка (fall.test.ts)
  const w = newWorld(seed);
  fix(holder(w, "desyatnik")!, ["vygoda"]);
  return w;
}
const at = (w: World, l: number) => { w.order.level = l; return w; };

test("шкала: пять ступеней покрывают 0–15 без дыр, у каждой плюсы и минусы; градации лёгкая, полная, глубокая", () => {
  assert.equal(STEPS.length, 5);
  for (let l = 0; l <= ORDER_MAX; l++) assert.equal(STEPS.filter((s) => l >= s.from && l <= s.to).length, 1, `отметка ${l}`);
  for (const s of STEPS) assert.ok(s.name && s.plus && s.minus);
  assert.deepEqual([0, 3, 7, 9, 12, 15].map((l) => stepOf(l).name), ["Смута", "Вольница", "Тихо", "Строгость", "Твёрдая рука", "Твёрдая рука"]);
  assert.deepEqual([9, 10, 11].map((l) => gradeOf(l).word), ["лёгкая", "полная", "глубокая"]);
  assert.deepEqual([5, 4, 3].map((l) => gradeOf(l).word), ["лёгкая", "полная", "глубокая"], "градация глубже к краю, а не к большему числу");
  assert.deepEqual([2, 1, 0].map((l) => gradeOf(l).k), [O.light, 1, O.deep]);
  assert.deepEqual([6, 7, 8].map((l) => gradeOf(l).k), [1, 1, 1], "середина — всё по единице");
  assert.equal(newWorld("порядок").order.level, O.start);
});

test("множители ступеней: середина — единицы; края усиливают и плюсы, и минусы; градация тянет множитель", () => {
  const w = level();
  assert.deepEqual(orderMods(at(w, 7)), { duty: 1, price: 1, villageGain: 1, villageCap: false, seen: 1, theft: 1, strictWeight: 1 });
  const free = orderMods(at(w, 4)), strict = orderMods(at(w, 10)), hard = orderMods(at(w, 13)), smuta = orderMods(at(w, 1));
  assert.ok(free.duty === O.dutyVolnitsa && free.price === O.priceVolnitsa && free.villageGain === O.trustVolnitsa && free.seen === O.seenVolnitsa && free.theft === O.theftVolnitsa);
  assert.ok(strict.duty === O.dutyStrogost && strict.villageGain === O.trustStrogost && strict.seen === O.seenStrogost && strict.theft === O.theftStrogost && !strict.villageCap);
  assert.ok(hard.duty === O.dutyRuka && hard.villageCap && hard.seen === O.seenRuka && hard.strictWeight === O.strictWeight);
  assert.equal(smuta.duty, O.dutySmuta);
  assert.ok(orderMods(at(w, 9)).duty < strict.duty && orderMods(at(w, 11)).duty > strict.duty, "лёгкая градация слабее полной, глубокая сильнее");
  assert.ok(orderMods(at(w, 0)).duty < smuta.duty, "глубокая смута режет пошлины сильнее");
});

test("норма и дрейф: шкала идёт к норме на шаг за сезон; норму задают стража, стиль десятника и курс", () => {
  const w = level();
  assert.equal(orderNorm(w).norm, O.base);
  setGuard(w, 2);
  assert.equal(orderNorm(w).norm, O.base + 2 * O.guardStep);
  const lines: string[] = [];
  orderSeason(w, lines);
  assert.equal(w.order.level, O.start + 1, "шаг за сезон, а не скачок");
  for (let i = 0; i < 6; i++) orderSeason(w, lines);
  assert.equal(w.order.level, O.base + 2 * O.guardStep);
  assert.ok(lines.some((l) => l.includes("Порядок: теперь «Строгость»")));
  setGuard(w, 0);
  orderSeason(w, lines);
  assert.equal(w.order.level, O.base + 2 * O.guardStep - 1, "отпустил — шкала пошла обратно");
  // десятник: Долг и Дерзость — строже, Забота — вольнее; нет десятника — норма ниже
  const x = level();
  fix(holder(x, "desyatnik")!, ["dolg", "derzost"]);
  assert.equal(orderNorm(x).norm, O.base + O.desyatnik);
  assert.ok(orderNorm(x).parts.some((p) => p.includes("держит строго")));
  fix(holder(x, "desyatnik")!, ["zabota"]);
  assert.equal(orderNorm(x).norm, O.base - O.desyatnik);
  assign(x, holder(x, "desyatnik")!.id, null);
  assert.equal(orderNorm(x).norm, O.base - O.noDesyatnik);
  // курс
  const y = level();
  setCourse(y, "dorogi");
  assert.equal(orderNorm(y).norm, O.base + O.course);
  setCourse(y, "polegche");
  assert.equal(orderNorm(y).norm, O.base - O.course);
});

test("события толкают шкалу: каждые pushStep единиц порядка — шаг, не больше pushMax за сезон, остаток копится", () => {
  const w = level();
  w.resources.poryadok += O.pushStep - 1;
  orderSeason(w, []);
  assert.equal(w.order.level, O.start, "меньше шага — шкала стоит");
  w.resources.poryadok += 1;
  orderSeason(w, []);
  assert.equal(w.order.level, O.start, "шаг вверх от событий, шаг вниз к норме");
  const x = level();
  x.resources.poryadok -= O.pushStep * 10;
  orderSeason(x, []);
  assert.equal(x.order.level, O.start - O.pushMax + 1, "за сезон — не больше pushMax шагов (и шаг к норме обратно)");
  orderSeason(x, []);
  assert.ok(x.order.level < O.start, "остаток толчка действует и в следующем сезоне");
});

test("стража: затянуть — каждый шаг дороже, руки уходят в дозоры; отпустить — бесплатно и чуть сберегает", () => {
  assert.deepEqual([1, 2, 3, 4].map(guardCost), [1, 3, 6, 10].map((n) => Math.round(n * O.guardCost * 100) / 100));
  assert.ok(guardCost(2) - guardCost(1) > guardCost(1) - guardCost(0), "второй шаг дороже первого");
  assert.equal(guardCost(-2), -2 * O.guardSave);
  assert.equal(guardHands(2), 2 * O.guardHands);
  assert.equal(guardHands(-2), 0);
  const w = level();
  const silver = (x: World) => planSeason(x).lines.filter((l) => l.cat === "serebro" && l.v < 0).reduce((s, l) => s + l.v, 0);
  const base = silver(w), hands = fieldHands(w).total;
  assert.equal(setGuard(w, 3), true);
  assert.ok(Math.abs(silver(w) - (base - guardCost(3))) < 0.02 && planSeason(w).lines.some((l) => l.text.startsWith("дозоры")));
  assert.ok(fieldHands(w).total < hands && Math.abs(hands - fieldHands(w).total - guardHands(3)) <= 0.1, "руки ушли в дозоры");
  assert.ok(w.log.at(-1)!.title === "Стража" && w.log.at(-1)!.lines[0].includes("затянуть"));
  setGuard(w, -1);
  assert.ok(silver(w) > base, "распущенная стража дешевле обычной");
  assert.equal(setGuard(w, 99), true);
  assert.equal(w.order.guard, O.guardMax, "больше предела не затянуть");
  assert.equal(setGuard(w, O.guardMax), false, "тот же приказ — ничего не происходит");
});

test("ступени в хозяйстве: пошлины по шкале, товары дороже на вольном краю; смута — разбой, вольница — мелкое воровство", () => {
  const duty = (l: number) => planSeason(at(level(), l)).lines.find((x) => x.text.startsWith("пошлины"))!.v;
  assert.ok(duty(1) < duty(4) && duty(4) < duty(7) && duty(7) < duty(10) && duty(10) < duty(13), [1, 4, 7, 10, 13].map(duty).join(" "));
  const w = at(level(), 1), silver = w.eco.stock.serebro, kuptsy = w.factions.kuptsy;
  orderSeason(w, []);
  assert.ok(w.eco.stock.serebro < silver && w.factions.kuptsy < kuptsy && w.eco.cur.some((l) => l.text.startsWith("разбой")));
  const x = at(level(), 4);
  setGuard(x, -2);
  orderSeason(x, []);
  assert.ok(x.eco.cur.some((l) => l.text.startsWith("мелкое воровство")));
});

test("деревни: на вольном краю доверие растёт легче, на строгом медленнее; при твёрдой руке — не выше «ладят»", () => {
  const gain = (l: number) => { const w = at(level(), l); w.factions.brod = 0; return addTrust(w, "brod", 1); };
  assert.ok(gain(4) > gain(7) && gain(7) > gain(10), `${gain(4)} ${gain(7)} ${gain(10)}`);
  const w = at(level(), 13);
  w.factions.brod = villageCap() - 1;
  addTrust(w, "brod", 5);
  assert.equal(w.factions.brod, villageCap());
  assert.ok(villageCap() < BALANCE.economy.trust.ally);
  const loss = at(level(), 13);
  loss.factions.brod = 0;
  assert.equal(addTrust(loss, "brod", -1), -1, "потери доверия шкала не трогает");
  assert.equal(addTrust(at(level(), 13), "kuptsy", 1), 1, "и другие стороны тоже");
  // вошли в твёрдую руку с деревней в «заодно» — её опускает до «ладят»
  const x = at(level(), 13);
  setGuard(x, O.guardMax);
  x.factions.opushka = BALANCE.economy.trust.ally + 2;
  orderSeason(x, []);
  assert.equal(x.factions.opushka, villageCap());
});

test("гниль: копится на строгом краю и всплывает разом, когда хватка ослабла", () => {
  const w = at(level(), 13);
  setGuard(w, O.guardMax);
  for (let i = 0; i < 4; i++) orderSeason(w, []);
  assert.ok(w.order.rot > 3 * O.rotRuka * O.light, `гниль ${w.order.rot}`);
  setGuard(w, O.guardMin);
  const silver = w.eco.stock.serebro, zamok = w.factions.zamok, lines: string[] = [];
  while (w.order.level >= O.strictFrom) orderSeason(w, lines);
  assert.equal(w.order.rot, 0);
  assert.ok(w.eco.stock.serebro < silver && w.factions.zamok < zamok && lines.some((l) => l.includes("всплыла гниль")), lines.join(" | "));
  const calm = at(level(), 7);
  for (let i = 0; i < 6; i++) orderSeason(calm, []);
  assert.equal(calm.order.rot, 0, "в тишине гнили нет");
});

test("застой в «Тихо»: каждый stagnation-й тихий сезон стаж растёт на лишний сезон", () => {
  const w = level(), p = holder(w, "pisar")!, was = p.tenure;
  for (let i = 0; i < O.stagnation; i++) orderSeason(w, []);
  assert.equal(p.tenure, was + 1);
  assert.equal(w.order.calm, O.stagnation);
  at(w, 12);
  setGuard(w, O.guardMax);
  orderSeason(w, []);
  assert.equal(w.order.calm, 0);
});

test("события строгого края: четыре, приходят только со «Строгости»; при твёрдой руке — чаще", () => {
  const strict = EVENTS.filter((e) => e.strict);
  assert.deepEqual(strict.map((e) => e.id), ["kaznokrad", "otravitel", "logovo", "dolzhnik"]);
  const titles = (l: number, guard: number) => {
    const w = at(level("строго"), l);
    setGuard(w, guard);
    runEvents(w, 200);
    return w.log.filter((e) => e.kind === "event").map((e) => e.title);
  };
  const isStrict = (t: string) => strict.some((e) => e.title === t);
  assert.equal(titles(7, 0).filter(isStrict).length, 0, "в тишине удач дозора нет");
  assert.ok(titles(10, 1).filter(isStrict).length > 5);
  const w = at(level("строго"), 13);
  setGuard(w, O.guardMax);
  let hard = 0, all = 0;
  for (let i = 0; i < 20; i++) { runSeason(w); }
  for (const e of w.log.filter((x) => x.kind === "event")) { all++; if (isStrict(e.title.replace(" — по приказу", ""))) hard++; }
  assert.ok(hard / all > (1.2 * strict.length) / EVENTS.length, `при твёрдой руке удач дозора ${hard} из ${all}: заметно чаще ровной доли`);
});

test("партия и отчёт: шкала в границах, история по сезонам, метрики ступеней и цены стражи", () => {
  for (const id of ["idle", "Х18", "Х19"]) {
    const run = playBot("бот-2", bot(id)), o = run.w.order, m = metricsOf(run);
    assert.equal(o.history.length, 12);
    assert.ok(o.history.every((l) => l >= 0 && l <= ORDER_MAX));
    assert.equal(m.stepSmuta + m.stepVolnitsa + m.stepTiho + m.stepStrogost + m.stepRuka, 12);
    assert.equal(m.orderLevel, o.level);
  }
  assert.ok(metricsOf(playBot("бот-2", bot("Х18"))).stepRuka >= 6 && metricsOf(playBot("бот-2", bot("Х18"))).guardSpent > 10);
  assert.ok(metricsOf(playBot("бот-2", bot("Х19"))).stepVolnitsa + metricsOf(playBot("бот-2", bot("Х19"))).stepSmuta >= 6);
  assert.equal(metricsOf(playBot("бот-2", bot("idle"))).guardSpent, 0);
});
