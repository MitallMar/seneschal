// Хозяйство без экрана: исполнитель и курс, старосты деревень, сила потока, почерк (src/sim/economy/doer.ts; замысел — docs/design/lyudi-i-ishody.md).
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { POSTS } from "../src/data/core";
import { SIDES, COURSES } from "../src/data/economy";
import { HANDS, LEVERS } from "../src/data/handwriting";
import { BALANCE, resetBalance } from "../src/sim/balance";
import { newWorld } from "../src/sim/council/generate";
import { runEvent } from "../src/sim/council/council";
import { assign } from "../src/sim/council/staff";
import { holder } from "../src/sim/state";
import { doer, setCourse, courseStrength, mastery, expGain, handsOf, handText, levers } from "../src/sim/economy/doer";
import { fieldHands, planSeason } from "../src/sim/economy/plan";
import { economySeason, elderSaw } from "../src/sim/economy/season";
import { runSeason } from "../src/sim/season";
import { elderRel } from "../src/sim/economy/view";
import { fix } from "./_world";
import { E, event, calm, noHead, noHand, pass, zoneAt } from "./_economy";

afterEach(() => resetBalance());

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

// ---------- сила потока: мастерство × опыт × настрой (lyudi-i-ishody.md, 2.1) ----------

test("освоение: годный набирает опыт на должности быстрее негодного, и замена из годного раньше перестаёт быть новичком", () => {
  const w = newWorld("освоение");
  const born = fix(holder(w, "starosta")!, ["zabota", "obychai"]), unfit = fix(holder(w, "pisar")!, ["zabota", "obychai"]);
  unfit.mark = undefined; unfit.aspiration = undefined;
  assert.equal(mastery(unfit, "pisar").word, "негоден");
  assert.deepEqual([expGain(born, "starosta"), expGain(unfit, "pisar")], [BALANCE.exp.gainBorn, BALANCE.exp.gainUnfit]);
  assert.ok(BALANCE.exp.gainBorn > BALANCE.exp.gainUnfit, "по умолчанию годный осваивается быстрее");
  for (const p of [born, unfit]) { p.exp = 0; p.tenure = 0; }
  runSeason(w); runSeason(w);
  assert.deepEqual([born.exp, unfit.exp], [Math.min(2 * BALANCE.exp.gainBorn, BALANCE.exp.master), 2 * BALANCE.exp.gainUnfit]);
  assert.ok(born.exp >= BALANCE.exp.settled && unfit.exp < BALANCE.exp.settled, "прирождённый за два сезона освоился, негодный — ещё новичок");
  assert.ok(w.log.some((e) => e.lines.some((l) => l.startsWith(`${born.name} освоил`))), "в летописи — когда освоился");
  for (let i = 0; i < 40; i++) runSeason(w);
  assert.equal(born.post === "starosta" ? born.exp : BALANCE.exp.master, BALANCE.exp.master, "опыт не растёт выше потолка");
});

test("сила потока: мастерство по годности, опыт и настрой перемножаются; в ведомости видно, из чего она сложилась", () => {
  noHand(); noHead();
  const w = newWorld("сила");
  const p = fix(holder(w, "starosta")!, ["zabota", "obychai"]);   // годность тиуна — Забота и Обычай: прирождённый
  p.loyalty = 0;
  assert.deepEqual(mastery(p, "starosta"), { mult: E.doer.masteryMax, share: 1, word: "прирождённый" });
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
  assert.deepEqual([d.mastery, d.note], [E.doer.masteryMin, `негоден — дело идёт на ${Math.round((1 - E.doer.masteryMin) * 100)}% слабее, мастер, без огонька`]);
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
  assert.ok(hard.quit > soft.quit, `оброк (при том что заботливый тиун годнее, а годность с ×0,6 у негодного весит больше): Долг ${hard.quit} против Заботы ${soft.quit}`);
  assert.ok(soft.trust > hard.trust, `доверие деревни: Забота ${soft.trust} против Долга ${hard.trust}`);
});
