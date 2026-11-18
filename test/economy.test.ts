// Хозяйство и подать без экрана (задача И12, замысел — docs/design/hozyaystvo.md): запасы, зоны сторон, потоки по сезонам,
// исполнитель и курс, ведомость и прогноз, нижняя черта и недодача, урок, способы платить, сборщица и терпение Герцога.
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import type { Side } from "../src/data/types";
import { POSTS } from "../src/data/core";
import { EVENTS } from "../src/data/events";
import { SIDES, COURSES, PAY, ELDERS } from "../src/data/economy";
import { HANDS, LEVERS } from "../src/data/handwriting";
import { BALANCE, resetBalance, setAt } from "../src/sim/balance";
import { newWorld, runSeason, runEvent, assign, holder, setRel, type World } from "../src/sim/sim";
import { councilSteady } from "../src/sim/authority";
import {
  zoneWord, zoneOf, zoneMult, patienceWord, doer, setCourse, setFloor, courseStrength, handsNow, fieldHands, planSeason, economySeason,
  payOptions, payTax, taxLeft, lessonOf, forecastFork, ledgerOf, elderRel, elderSaw, addLine, seasonKind, mastery, handsOf, handText, levers,
} from "../src/sim/economy";
import { economyMetrics, freeYear, PAYERS } from "../src/sim/economy-report";
import { dump, fix } from "./_world";

afterEach(() => resetBalance());

const E = BALANCE.economy;
const event = (id: string) => EVENTS.find((e) => e.id === id)!;
const said = (lines: string[], part: string) => lines.some((l) => l.includes(part));
// Совет без настроений: все «как велено» — не засиделись, к Сенешалю ровно, должность не желанная и не чужая. Нижних черт нет.
function calm(seed = "хозяйство"): World {
  flat();
  const w = newWorld(seed);
  for (const d of POSTS) fix(holder(w, d.id)!, ["dolg"]).loyalty = 0;
  for (const el of w.eco.elders) el.rel = el.rel.map(() => 0);
  w.eco.floor = { eda: 0, serebro: 0 };
  return w;
}
// Старые проверки потоков считают исполнителя «как велено» за единицу: мастерство и опыт в них выключены ручками.
function flat() {
  noHead();
  setAt("economy.flow.scale", 1);   // и скудость земли: базовые потоки — как записаны в ручках
  for (const key of ["masteryMin", "masteryMax", "expNovice", "expSettled", "expMaster"]) setAt(`economy.doer.${key}`, 1);
  noHand();
}
// …и главный: его довод в настрое проверяется отдельно.
function noHead() {
  for (const key of ["headFor", "headAgainst"]) setAt(`economy.doer.${key}`, 0);
}
// …и почерк тоже: все его рычаги — в ноль.
function noHand() {
  for (const key of ["flow", "trust", "order", "hands", "silver", "sell", "patience"]) setAt(`economy.hand.${key}`, 0);
}
// Сезоны без событий совета: только хозяйство.
function pass(w: World, n = 1): string[] {
  const lines: string[] = [];
  for (let i = 0; i < n; i++) { economySeason(w, lines); w.season++; }
  return lines;
}
const zoneAt = (z: string) => (z === "заодно" ? E.trust.ally : z === "ладят" ? E.trust.friendly : z === "терпят" ? E.trust.refuse + 1 : E.trust.refuse);
const r1 = (v: number) => Math.round(v * 10) / 10;
const line = (w: World, part: string) => w.eco.last!.lines.find((l) => l.text.includes(part));

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

// ---------- события и запасы ----------

test("kazna и pripasy событий — это серебро и еда: запас меняется, строка идёт в ведомость", () => {
  const w = calm();
  fix(holder(w, "starosta")!, ["zabota"]);
  const e = runEvent(w, event("nedoimka"));
  assert.equal(e.effects!.pripasy, -2);
  assert.equal(w.eco.stock.eda, E.start.eda - 2);
  const l = w.eco.cur.find((x) => x.cat === "eda")!;
  assert.equal(l.v, -2);
  assert.ok(l.text.includes("Недоимка") && l.who!.includes(holder(w, "starosta")!.name), "в строке — событие и кто решил");
});

test("ниже нуля запас не опускается: в запись идёт то, что удалось взять", () => {
  const w = calm();
  assert.equal(addLine(w, { cat: "serebro", v: -100, text: "проба" }), -E.start.serebro);
  assert.equal(w.eco.stock.serebro, 0);
});

test("нижняя черта: совет сам из-под неё не тратит, а засидевшийся тратит — и это видно", () => {
  const w = calm();
  const tiun = fix(holder(w, "starosta")!, ["zabota"]);
  setFloor(w, "eda", E.start.eda - 1);        // «Простить» стоит 2 еды — уведёт под черту
  const e = runEvent(w, event("nedoimka"));
  assert.equal(e.effects!.pripasy, undefined, e.lines.join(" | "));
  assert.equal(w.eco.stock.eda, E.start.eda);
  tiun.tenure = BALANCE.exp.staleFrom;
  const stale = runEvent(w, event("nedoimka"));
  assert.equal(stale.effects!.pripasy, -2);
  assert.ok(said(stale.lines, "Нижняя черта нарушена"));
  assert.ok(w.eco.cur.some((l) => l.how?.includes("ниже нижней черты")));
});

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

// ---------- исполнитель и курс ----------

test("исполнитель: с огоньком, как велено, без огонька, по-своему, пустая должность", () => {
  const w = calm();
  const p = holder(w, "pisar")!;
  assert.deepEqual([doer(w, "pisar").how, doer(w, "pisar").mult], ["как велено", E.doer.plain]);
  p.loyalty = BALANCE.loyalty.trusts;
  p.aspiration = { id: "post_pisar", text: "хочет вести книги", post: "pisar" };
  assert.deepEqual([doer(w, "pisar").how, doer(w, "pisar").mult], ["с огоньком", E.doer.fire]);
  p.aspiration = undefined;
  p.loyalty = BALANCE.loyalty.unhappy;
  assert.deepEqual([doer(w, "pisar").how, doer(w, "pisar").mult], ["без огонька", E.doer.dull]);
  assert.equal(planSeason(w).lines.find((l) => l.text === "пошлины")!.v, Math.round(E.flow.duties * E.doer.dull * 100) / 100);
  p.tenure = BALANCE.exp.staleFrom;
  assert.ok(doer(w, "pisar").stale && doer(w, "pisar").note.includes("засиделся"));
  assign(w, p.id, null);
  assert.deepEqual([doer(w, "pisar").how, doer(w, "pisar").mult], ["должность пуста", E.doer.empty]);
  assert.equal(planSeason(w).lines.find((l) => l.text === "пошлины")!.v, E.flow.duties * E.doer.empty);
});

test("засидевшийся: опыт мастерский и выше, почерк вдвое сильнее, курс его не зажигает", () => {
  noHead();
  const w = newWorld("засиделся");
  const p = fix(holder(w, "starosta")!, ["dolg"]);
  p.loyalty = BALANCE.loyalty.trusts;
  const fresh = handsOf(p, "starosta");
  assert.deepEqual(fresh.map((x) => [x.hand.axis, x.weight]), [["dolg", 1]]);
  setCourse(w, "kopim");
  assert.equal(doer(w, "starosta").how, "с огоньком", "доверяет, и курс по его склонности");
  p.tenure = BALANCE.exp.staleFrom;
  const d = doer(w, "starosta");
  assert.deepEqual([d.stale, d.exp, d.how], [true, E.doer.expStale, "как велено"]);
  assert.ok(d.note.includes("засиделся") && d.hand.includes("почерк вдвое сильнее"), `${d.note}; ${d.hand}`);
  assert.equal(handsOf(p, "starosta")[0].weight, E.hand.stale);
  assert.equal(levers(w).quitrent, E.hand.stale * E.hand.nativePlus, "почерк Долга у тиуна: оброк собран сполна — вдвое");
});

test("курс: шесть курсов; «Копим к подати» поднимает оброк, со второго сезона сильнее, деревни ворчат", () => {
  assert.equal(COURSES.length, 6);
  const w = calm();
  w.eco.autoPay = false;
  setCourse(w, "kopim");
  assert.equal(courseStrength(w, "kopim"), E.course.effect);
  assert.equal(courseStrength(w, "polegche"), 0);
  const before = w.factions.brod;
  pass(w);
  assert.equal(courseStrength(w, "kopim"), E.course.effect * E.course.inertia, "курс держится второй сезон");
  assert.equal(w.factions.brod, Math.round((before - E.course.trust) * E.trust.fade * 10) / 10);
  w.season = 3;
  for (const s of SIDES) w.factions[s] = E.start.trust;
  const quit = planSeason(w).lines.find((l) => l.text === "оброк серебром")!.v;
  assert.equal(quit, Math.round(E.flow.quitrentSilver * E.flow.brodShare * (1 + E.course.effect * E.course.inertia) * 100) / 100);
  assert.ok(w.log.some((e) => e.title === "Курс"));
});

test("курс: несогласный исполняет без огонька; частая смена курса — шатание", () => {
  const w = calm();
  fix(holder(w, "starosta")!, ["zabota"]).loyalty = BALANCE.loyalty.trusts;
  assert.equal(doer(w, "starosta").how, "как велено");
  setCourse(w, "polegche");
  assert.equal(doer(w, "starosta").how, "с огоньком", "курс по душе и доверяет Сенешалю");
  setCourse(w, "kopim");
  assert.ok(w.eco.shaky, "сменили, не продержав");
  assert.equal(doer(w, "starosta").how, "без огонька");
  pass(w, E.course.shaky);
  assert.ok(!w.eco.shaky, "курс продержался — шатание прошло");
});

test("курс тянет мелкие дела совета: при «Копим к подати» тиун чаще взыскивает", () => {
  const picks = (course: boolean) => {
    let n = 0;
    for (let i = 0; i < 60; i++) {
      const w = calm(`курс-${i}`);
      const p = holder(w, "starosta")!;
      p.star = { dolg: 5, vygoda: 5, zabota: 5.4, derzost: 5, obychai: 5 };
      if (course) { setCourse(w, "kopim"); w.eco.courseSeasons = 1; }
      if (runEvent(w, event("nedoimka")).effects!.pripasy === 2) n++;
    }
    return n;
  };
  assert.ok(picks(true) > picks(false) + 5, `${picks(true)} против ${picks(false)}`);
});

test("курсы «Бережём лес», «Строимся», «Торгуем» меняют потоки", () => {
  const w = calm();
  setCourse(w, "les");
  assert.ok(planSeason(w).lines.some((l) => l.text.includes("брёвен нет")));
  setCourse(w, "stroimsya");
  assert.deepEqual([fieldHands(w).build, fieldHands(w).field], [E.course.buildHands, E.hands.field]);
  w.factions.brod = zoneAt("отказывают"); w.factions.opushka = zoneAt("отказывают");
  assert.equal(fieldHands(w).field, E.hands.zamok - E.course.buildHands, "рук мало — стройка забирает руку у поля");
  const t = calm();
  t.eco.stock.eda = 8;
  const plain = planSeason(t).stock.serebro;
  setCourse(t, "torguem");
  const plan = planSeason(t);
  assert.ok(plan.lines.some((l) => l.text.includes("излишек продан")));
  assert.ok(plan.stock.serebro > plain);
  assert.equal(plan.stock.eda, t.eco.floor.eda + E.flow.upkeepWinter, "продают только сверх черты и зимнего прокорма");
});

// ---------- старосты деревень ----------

test("староста деревни: решения тиуна по его душе — отношения лучше, и доверие деревни растёт", () => {
  const w = calm();
  const tiun = holder(w, "starosta")!, el = w.eco.elders[0];
  el.star = { dolg: 2, vygoda: 9, zabota: 2, derzost: 2, obychai: 2 };
  elderSaw(w, tiun, ["vygoda"]);
  assert.equal(elderRel(w, el), E.trust.elderStep);
  elderSaw(w, tiun, ["zabota"]);        // Забота против Выгоды
  elderSaw(w, tiun, ["zabota"]);
  assert.equal(elderRel(w, el), -E.trust.elderStep);
  elderSaw(w, tiun, ["dolg"]);
  assert.equal(elderRel(w, el), -E.trust.elderStep, "посторонняя склонность старосту не трогает");
  el.rel[tiun.id] = 10;
  const before = w.factions.brod, other = w.factions.opushka;
  pass(w);
  assert.equal(w.factions.brod, Math.round((before + 10 * E.trust.elder) * E.trust.fade * 10) / 10);
  assert.equal(w.factions.opushka, Math.round(other * E.trust.fade * 10) / 10);
  assign(w, tiun.id, null);
  assert.equal(elderRel(w, el), undefined, "тиуна нет — говорить старосте не с кем");
});

// ---------- ведомость и прогноз ----------

test("ведомость: вороватый писарь прячет строку — игрок видит только «не сходится»", () => {
  const w = calm();
  setAt("season.theftChance", 1);
  const p = holder(w, "pisar")!;
  p.tenure = BALANCE.exp.staleFrom; p.star.vygoda = 10;
  runSeason(w);
  const l = w.eco.last!;
  const seen = ledgerOf(l, "serebro"), all = ledgerOf(l, "serebro", true);
  assert.ok(seen.mismatch);
  assert.ok(!seen.lines.some((x) => x.text.includes("утекло")));
  assert.equal(all.lines.find((x) => x.text.includes("утекло"))!.v, -BALANCE.season.theft);
  assert.ok(said(w.log[w.log.length - 1].lines, "не сходится"));
  // вор на другой должности счёт не ведёт: строка видна
  const k = calm();
  const kl = holder(k, "klyuchnik")!;
  kl.tenure = BALANCE.exp.staleFrom; kl.star.vygoda = 10;
  runSeason(k);
  assert.ok(ledgerOf(k.eco.last!, "serebro").lines.some((x) => x.text.includes("утекло")));
  assert.ok(!ledgerOf(k.eco.last!, "serebro").mismatch);
});

test("прогноз вилкой: у годного счетовода узкая, у негодного широкая, без счетовода — шире всех; правда внутри", () => {
  const width = (setup: (w: World) => void) => {
    const w = calm();
    setup(w);
    const f = forecastFork(w), truth = planSeason(w).stock;
    for (const x of f) assert.ok(x.lo <= truth[x.cat] + 0.05 && truth[x.cat] <= x.hi + 0.05, `${x.cat}: ${x.lo}–${x.hi}, выйдет ${truth[x.cat]}`);
    return f.find((x) => x.cat === "serebro")!.hi - f.find((x) => x.cat === "serebro")!.lo;
  };
  const good = width((w) => { holder(w, "pisar")!.star = { dolg: 10, vygoda: 10, zabota: 0, derzost: 0, obychai: 0 }; });
  const bad = width((w) => { holder(w, "pisar")!.star = { dolg: 0, vygoda: 0, zabota: 10, derzost: 10, obychai: 10 }; });
  const none = width((w) => assign(w, holder(w, "pisar")!.id, null));
  assert.ok(good < bad && bad < none, `${good} < ${bad} < ${none}`);
  assert.equal(Math.round(good * 10) / 10, E.fork.min * 2);
  const w = calm();
  w.eco.stock.eda = 1.5; w.eco.floor.eda = 4;
  assert.equal(forecastFork(w).find((x) => x.cat === "eda")!.word, "не хватит");
  w.eco.stock.eda = 12;
  assert.equal(forecastFork(w).find((x) => x.cat === "eda")!.word, "с запасом");
});

// ---------- недодача ----------

test("недодача: еды не хватило — последний в очереди обижен; очередь задаёт, кого кормим первым", () => {
  const short = (first: "zamok" | "derevni") => {
    const w = calm();
    w.eco.stock.eda = E.flow.upkeep * E.flow.castleShare;
    w.eco.feedFirst = first;
    const before = { ...w.factions }, lines = pass(w);
    assert.ok(said(lines, "Недодача"), lines.join(" | "));
    assert.equal(w.eco.shortages, 1);
    assert.equal(w.eco.stock.eda, 0);
    return SIDES.filter((s) => w.factions[s] < Math.round(before[s] * E.trust.fade * 10) / 10);
  };
  assert.deepEqual(short("zamok"), ["brod", "opushka"]);
  assert.deepEqual(short("derevni"), ["zamok"]);
});

test("недодача жалованья: люди замка обижены, порядок падает", () => {
  const w = calm();
  w.eco.stock.serebro = 0; w.eco.stock.tovary = 0;
  w.factions.kuptsy = zoneAt("отказывают");
  const before = w.factions.zamok, order = w.resources.poryadok;
  pass(w);
  assert.equal(w.factions.zamok, Math.round((before - E.trust.short * E.flow.salary) * E.trust.fade * 10) / 10);
  assert.equal(w.resources.poryadok, Math.round((order - E.trust.shortOrder * E.flow.salary) * 10) / 10);
});

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

// ---------- целиком ----------

test("хозяйство детерминировано, запасы не уходят ниже нуля, числа конечны", () => {
  for (const seed of ["замок", "лес", "x"]) {
    const play = () => {
      const w = newWorld(seed);
      for (let s = 0; s < 16; s++) {
        if (s === 2) setCourse(w, "kopim");
        if (s === 6) setCourse(w, "torguem");
        if (s % 4 === 1) payTax(w, "sverh_brod", 1);
        runSeason(w);
        for (const v of Object.values(w.eco.stock)) assert.ok(v >= 0 && Number.isFinite(v), `${seed}: запас ${v}`);
        for (const s2 of SIDES) assert.ok(Number.isFinite(w.factions[s2 as Side]));
      }
      return w;
    };
    const a = play(), b = play();
    assert.equal(dump(a), dump(b));
    assert.equal(a.eco.tax.history.length, 4);
    assert.equal(a.eco.tax.lesson, E.tax.normal, "после трёх лет испытания урок обычный");
  }
});

test("ручка хозяйства действует сразу", () => {
  const w = calm();
  setAt("economy.flow.duties", 2);
  assert.equal(planSeason(w).lines.find((l) => l.text === "пошлины")!.v, 2);
  setAt("economy.rate.eda", 3);
  assert.equal(payOptions(w).find((o) => o.def.id === "eda")!.max, 1);
});

test("отчёт о хозяйстве: метрики считаются по ботам, год щедрее в лучшей зоне", () => {
  const base = economyMetrics(8, 12, PAYERS[0]), only = economyMetrics(8, 12, PAYERS[PAYERS.length - 1]);
  assert.equal(base.closedByYear.length, 3);
  assert.deepEqual(PAYERS.map((b) => b.id), ["idle", "master", "Х11", "Х13", "Х14"]);
  assert.ok(Object.keys(base.measuresBy).every((id) => id === "serebro" || id === "eda"), "совет сам платит только казной и амбаром");
  assert.deepEqual(Object.keys(only.measuresBy), ["serebro"], "бот «платит только казной»");
  assert.ok(only.paidShare < base.paidShare, `${only.paidShare} против ${base.paidShare}`);
  const free = ["заодно", "ладят", "терпят", "отказывают"].map((z) => freeYear(z as "ладят").free);
  assert.ok(free[0] > free[1] && free[1] > free[2] && free[2] > free[3], free.join(" > "));
  assert.ok(free[1] < E.tax.trial, "при «ладят» урок испытания без жертв не закрыть");
});

test("главный в настрое: признан всеми и без вражды — довод «за» каждому; главного нет, не признан или вражда — довод «против»", () => {
  noHand();
  const w = newWorld("главный");
  const council = POSTS.map((d) => fix(holder(w, d.id)!, ["dolg"]));
  for (const p of council) p.loyalty = 0;
  for (const a of council) for (const b of council) if (a.id < b.id) setRel(w, a.id, b.id, 3);
  w.head = council[0].id;
  const moods = () => POSTS.map((d) => doer(w, d.id).how);
  assert.ok(councilSteady(w).ok);
  assert.ok(moods().every((m) => m === "как велено"), "один довод «за» — ещё не огонёк");
  council[1].loyalty = BALANCE.loyalty.trusts;
  assert.equal(doer(w, council[1].post!).how, "с огоньком", "главный и доверие Сенешалю — два довода");
  council[1].loyalty = 0;
  w.head = null;
  assert.ok(moods().every((m) => m === "без огонька"), "главного нет — довод «против» каждому");
  w.head = council[0].id;
  setRel(w, council[0].id, council[2].id, BALANCE.council.headMinRel - 1);
  assert.ok(moods().every((m) => m === "без огонька"), "главного не признаёт один — страдают все");
  setRel(w, council[0].id, council[2].id, 3);
  setRel(w, council[3].id, council[4].id, BALANCE.rel.enemy);
  assert.ok(moods().every((m) => m === "без огонька"), "вражда в совете");
  noHead();
  assert.ok(moods().every((m) => m === "как велено"), "ручки в ноль — довода нет");
});

// ---------- сила потока: мастерство × опыт × настрой (lyudi-i-ishody.md, 2.1) ----------

test("сила потока: мастерство по годности, опыт и настрой перемножаются; в ведомости видно, из чего она сложилась", () => {
  noHand(); noHead();
  const w = newWorld("сила");
  const p = fix(holder(w, "starosta")!, ["zabota", "obychai"]);   // годность тиуна — Забота и Обычай: прирождённый
  p.loyalty = 0;
  assert.deepEqual(mastery(p, "starosta"), { mult: E.doer.masteryMax, word: "прирождённый" });
  let d = doer(w, "starosta");
  assert.deepEqual([d.mastery, d.exp, d.mood, d.note], [E.doer.masteryMax, E.doer.expMaster, E.doer.plain, "прирождённый, мастер, как велено"]);
  assert.equal(d.hand, "почерк — Забота, с оттенком: Обычай");
  assert.equal(d.mult, Math.round(E.doer.masteryMax * E.doer.expMaster * 100) / 100);
  p.exp = 0; p.tenure = 0;
  assert.equal(doer(w, "starosta").exp, E.doer.expNovice);
  p.exp = BALANCE.exp.settled;
  assert.equal(doer(w, "starosta").exp, E.doer.expSettled);
  fix(p, ["derzost", "vygoda"]).loyalty = BALANCE.loyalty.unhappy;      // чужие склонности и недоволен
  d = doer(w, "starosta");
  assert.deepEqual([d.mastery, d.note], [E.doer.masteryMin, "негоден, мастер, без огонька"]);
  const worst = E.doer.masteryMin * E.doer.expNovice * E.doer.dull, best = E.doer.masteryMax * E.doer.expMaster * E.doer.fire;
  assert.ok(worst < 0.62 && best > 1.45, `размах от ${worst.toFixed(2)} до ${best.toFixed(2)}`);
  // годный тиун даёт больше урожая, чем негодный, при прочих равных
  const crop = (high: Parameters<typeof fix>[1]) => {
    const x = newWorld("сила");
    fix(holder(x, "starosta")!, high).loyalty = 0;
    x.season = 3;
    return planSeason(x).lines.filter((l) => l.text.startsWith("урожай")).reduce((s, l) => s + l.v, 0);
  };
  assert.ok(crop(["zabota", "obychai"]) > crop(["derzost", "vygoda"]) * 1.3, `${crop(["zabota", "obychai"])} против ${crop(["derzost", "vygoda"])}`);
});

// ---------- почерк (lyudi-i-ishody.md, 2.2) ----------

test("почерк: 25 клеток, у каждой плюс и цена; рычаги названы", () => {
  assert.equal(HANDS.length, POSTS.length * 5);
  assert.equal(new Set(HANDS.map((h) => `${h.post}|${h.axis}`)).size, 25);
  for (const h of HANDS) {
    assert.ok(h.plus.length && h.good && h.bad, `${h.post}, ${h.axis}`);
    for (const [lever] of [...h.plus, ...h.minus]) assert.ok(LEVERS.includes(lever), lever);
  }
});

test("почерк: ведущая сильная склонность — в полную силу, вторая сильная — оттенком, слабые — ровно", () => {
  const w = newWorld("почерк");
  const p = holder(w, "starosta")!;
  p.tenure = 5;
  p.star = { dolg: 5, vygoda: 5, zabota: 6.5, derzost: 5, obychai: 5 };
  assert.deepEqual(handsOf(p, "starosta"), [], "сильных склонностей нет — без уклона");
  p.star.zabota = 9;
  assert.deepEqual(handsOf(p, "starosta").map((x) => [x.hand.axis, x.weight]), [["zabota", 1]]);
  p.star.derzost = 8;
  assert.deepEqual(handsOf(p, "starosta").map((x) => [x.hand.axis, x.weight]), [["zabota", 1], ["derzost", E.hand.second]]);
  assert.deepEqual(handText(p).map((x) => [x.axis, x.shade]), [["zabota", false], ["derzost", true]]);
  assert.equal(doer(w, "starosta").hand, "почерк — Забота, с оттенком: Дерзость");
  assert.ok(!doer(w, "starosta").note.includes("Забота"), "в ведомость почерк не идёт: он выдал бы склонности");
});

test("почерк: родная склонность — плюс сильнее минуса, чужая — минус не слабее плюса", () => {
  const w = newWorld("почерк");
  for (const d of POSTS) { const h = holder(w, d.id)!; h.tenure = 5; h.star = { dolg: 5, vygoda: 5, zabota: 5, derzost: 5, obychai: 5 }; }
  const tiun = holder(w, "starosta")!;
  tiun.star.zabota = 9;                       // родная для тиуна: деревни довольны (плюс), оброк меньше (минус)
  let L = levers(w);
  assert.deepEqual([L.villages, L.quitrent], [E.hand.nativePlus, -E.hand.nativeMinus]);
  tiun.star.zabota = 5; tiun.star.derzost = 9; // чужая: урожай больше (плюс), руки уходят (минус)
  L = levers(w);
  assert.deepEqual([L.harvest, L.hands], [1, -E.hand.foreignMinus]);
  assert.equal(fieldHands(w).total, 8 - E.hand.hands, "расчистка новых полей отнимает руки");
});

test("почерк доходит до потоков и доверия: заботливый и долговой тиун дают разный оброк и разное доверие деревень", () => {
  const year = (axis: "zabota" | "dolg") => {
    const w = newWorld("почерк-год");
    for (const d of POSTS) { const h = holder(w, d.id)!; h.tenure = 5; h.exp = 5; h.loyalty = 0; h.star = { dolg: 5, vygoda: 5, zabota: 5, derzost: 5, obychai: 5 }; }
    for (const el of w.eco.elders) el.rel = el.rel.map(() => 0);
    holder(w, "starosta")!.star[axis] = 9;
    w.eco.autoPay = false; w.season = 3;
    const quit = planSeason(w).lines.filter((l) => l.text === "оброк серебром").reduce((s, l) => s + l.v, 0);
    economySeason(w, []);
    return { quit, trust: w.factions.brod };
  };
  const soft = year("zabota"), hard = year("dolg");
  assert.ok(hard.quit > soft.quit * 1.1, `оброк (при том что заботливый тиун годнее): Долг ${hard.quit} против Заботы ${soft.quit}`);
  assert.ok(soft.trust > hard.trust, `доверие деревни: Забота ${soft.trust} против Долга ${hard.trust}`);
});
