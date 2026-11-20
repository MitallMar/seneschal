// Совет без экрана: исходы спора, пустые должности, умение и годность (src/sim/council/council.ts, decide.ts, effects.ts).
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { BALANCE, resetBalance, setAt } from "../src/sim/balance";
import { newWorld } from "../src/sim/council/generate";
import { runEvent } from "../src/sim/council/council";
import { assign } from "../src/sim/council/staff";
import { holder, getRel, setRel, fitness } from "../src/sim/state";
import type { Person, World } from "../src/sim/state";
import { fix, pair } from "./_world";
import { SEEDS, event, said, wants } from "./_council";

afterEach(() => resetBalance());

const start = BALANCE.economy.start.trust;

// ---------- совет: исход спора зависит от отношений ----------
// «Плотина» задевает старосту и десятника: «Все на плотину» (Забота, Обычай: деревни +2, порядок −1),
// «Все в дозоры» (Долг, Дерзость: порядок +2, купцы +1, деревни −1), «Поделить пополам» (Выгода).

test("спор: думают одинаково и ладят — сошлись, и вышло лучше обычного", () => {
  for (const seed of SEEDS) {
    const w = newWorld(seed);
    const [a, b] = pair(w, "starosta", ["zabota", "obychai"], "desyatnik", ["zabota", "obychai"], 8);
    const e = runEvent(w, event("plotina"));
    assert.ok(said(e.lines, "Сошлись сразу"), `${seed}: ${e.lines.join(" | ")}`);
    assert.deepEqual(e.effects, { derevni: 2.5, poryadok: -1.2 });
    const each = Math.round((start + 2.5 * BALANCE.economy.trust.both) * 10) / 10;
    assert.equal(w.factions.brod, each);
    assert.equal(w.factions.opushka, each, "событие без названной деревни задевает обе — пополам");
    assert.equal(getRel(w, a.id, b.id), 8.5);
    assert.deepEqual([a.decisions, b.decisions], [1, 1]);
  }
});

test("спор: думают одинаково, но не ладят — сошлись без прибавки", () => {
  const w = newWorld("ровно");
  pair(w, "starosta", ["zabota"], "desyatnik", ["zabota"], 0);
  const e = runEvent(w, event("plotina"));
  assert.ok(said(e.lines, "Сошлись во мнении"));
  assert.deepEqual(e.effects, { derevni: 2, poryadok: -1 });
});

test("спор: разошлись, главный третий и с обоими в мире — рассудил главный", () => {
  for (const seed of SEEDS) {
    const w = newWorld(seed);
    const [a, b] = pair(w, "starosta", ["zabota", "obychai"], "desyatnik", ["dolg", "derzost"], -8);
    const head = fix(holder(w, "pisar")!, ["dolg"]);
    w.head = head.id;
    setRel(w, head.id, a.id, 0);
    setRel(w, head.id, b.id, 0);
    const e = runEvent(w, event("plotina"));
    assert.ok(said(e.lines, `Рассудил главный, ${head.name}: делать как хочет ${b.name}`), `${seed}: ${e.lines.join(" | ")}`);
    assert.deepEqual(e.effects, { poryadok: 1.5, kuptsy: 0.8, derevni: -0.7 }, "спорщики — враги: дело двух сфер идёт хуже, ×0,75");
    assert.equal(getRel(w, head.id, a.id), BALANCE.council.headJudgeRel);
    assert.equal(getRel(w, a.id, b.id), -8, "спорщики при суде главного не ссорятся сильнее");
    assert.deepEqual([a.decisions, b.decisions, head.decisions], [0, 1, 0]);
  }
});

test("спор: главного не признают, если он с кем-то из спорщиков в ссоре; главный-спорщик себя не судит", () => {
  const w = newWorld("непризнанный");
  const [a, b] = pair(w, "starosta", ["zabota", "obychai"], "desyatnik", ["dolg", "derzost"], 0);
  const head = fix(holder(w, "pisar")!, ["dolg"]);
  w.head = head.id;
  setRel(w, head.id, a.id, -4);
  setRel(w, head.id, b.id, 5);
  const e = runEvent(w, event("plotina"));
  assert.ok(said(e.lines, "не признали") && !said(e.lines, "Рассудил главный"));
  const w2 = newWorld("непризнанный");
  const [a2] = pair(w2, "starosta", ["zabota", "obychai"], "desyatnik", ["dolg", "derzost"], 0);
  w2.head = a2.id;
  const e2 = runEvent(w2, event("plotina"));
  assert.ok(!said(e2.lines, "Рассудил главный") && !said(e2.lines, "не признали"));
});

test("спор: враги — саботаж: польза на треть, цена целиком, порядок падает, жалобы с обеих сторон", () => {
  for (const seed of SEEDS) {
    const w = newWorld(seed);
    const [a, b] = pair(w, "starosta", ["zabota", "obychai"], "desyatnik", ["dolg"], -8);
    a.tenure = 60; // староста заведомо сильнее в споре: стаж
    setAt("council.sabotageChance", 1);
    const e = runEvent(w, event("plotina"));
    assert.ok(said(e.lines, "Саботаж") && said(e.lines, "Жалобы с обеих сторон"), `${seed}: ${e.lines.join(" | ")}`);
    // польза срезана до доли саботажа и вражды (2 × 0,3 × 0,75), цена дела — целиком (−1) и ещё порядок от самой ссоры (−1)
    assert.deepEqual(e.effects, { derevni: 0.5, poryadok: -2 });
    assert.equal(w.resources.poryadok, -2);
    assert.equal(getRel(w, a.id, b.id), -9);
    assert.deepEqual([a.decisions, b.decisions], [1, 0]);
  }
});

test("спор: враги, но саботажа не случилось — проигравший смолчал, дело сделано слабее", () => {
  const w = newWorld("смолчал");
  const [a, b] = pair(w, "starosta", ["zabota", "obychai"], "desyatnik", ["dolg"], -8);
  a.tenure = 60;
  setAt("council.sabotageChance", 0);
  const e = runEvent(w, event("plotina"));
  assert.ok(said(e.lines, "смолчал") && !said(e.lines, "Саботаж"));
  assert.deepEqual(e.effects, { derevni: 1.1, poryadok: -0.6 }, "враг смолчал ×0,75 и вражда в совете ×0,75"); // 2 × 0,5625 = 1,125 → 1,1
  assert.equal(getRel(w, a.id, b.id), -8.5);
});

test("спор: ладят — договариваются о лучшем для обоих", () => {
  const w = newWorld("ладят");
  const [a, b] = pair(w, "starosta", ["zabota", "obychai"], "desyatnik", ["dolg", "derzost"], 3);
  b.star.zabota = 6; // десятнику плотина тоже не чужда: сумма весов за неё выше
  const e = runEvent(w, event("plotina"));
  assert.ok(said(e.lines, "договорились: «Все на плотину»"), e.lines.join(" | "));
  assert.equal(getRel(w, a.id, b.id), 3.3);
  assert.deepEqual([a.decisions, b.decisions], [1, 1]);
});

test("спор: терпят — компромисс вполсилы или один продавил и отношения хуже", () => {
  const run = (chance: number) => {
    const w = newWorld("терпят");
    const [a, b] = pair(w, "starosta", ["zabota", "obychai"], "desyatnik", ["dolg"], 0);
    a.tenure = 60;
    setAt("council.compromiseChance", chance);
    return { e: runEvent(w, event("plotina")), rel: getRel(w, a.id, b.id) };
  };
  const half = run(1), push = run(0);
  assert.ok(said(half.e.lines, "вполсилы"));
  assert.deepEqual(half.e.effects, { derevni: 1.2, poryadok: -0.6 });
  assert.equal(half.rel, 0);
  assert.ok(said(push.e.lines, "продавил"));
  assert.deepEqual(push.e.effects, { derevni: 2, poryadok: -1 });
  assert.equal(push.rel, BALANCE.council.pushRel);
});

test("спор: соперники — один настоял, недовольный проигравший идёт с жалобой", () => {
  const w = newWorld("соперники");
  const [a, b] = pair(w, "starosta", ["zabota", "obychai"], "desyatnik", ["dolg"], -4);
  a.tenure = 60;
  b.loyalty = 0;
  const e = runEvent(w, event("plotina"));
  assert.ok(said(e.lines, "Они соперники") && said(e.lines, `Жалоба: ${b.name}`));
  assert.equal(getRel(w, a.id, b.id), -5);
});

test("в споре сильнее главный и тот, у кого больше стаж", () => {
  const winner = (setup: (w: World, a: Person, b: Person) => void) => {
    const w = newWorld("сила");
    const [a, b] = pair(w, "starosta", ["zabota", "obychai"], "desyatnik", ["dolg"], -4);
    a.tenure = 0; b.tenure = 0;
    setAt("council.powerRandom", 0);
    setup(w, a, b);
    runEvent(w, event("plotina"));
    return a.decisions ? "староста" : "десятник";
  };
  assert.equal(winner((w, a) => { a.tenure = 12; }), "староста");
  assert.equal(winner((w, a, b) => { b.tenure = 12; }), "десятник");
  assert.equal(winner((w, a, b) => { a.tenure = 12; w.head = b.id; }), "десятник");
});

test("пустые должности: дело двух сфер решает один, а без обоих страдает порядок", () => {
  const w = newWorld("пустые");
  const a = fix(holder(w, "starosta")!, ["zabota"]);
  assign(w, holder(w, "desyatnik")!.id, null);
  const alone = runEvent(w, event("plotina"));
  assert.ok(said(alone.lines, "в одиночку"));
  assert.equal(a.decisions, 1);
  assign(w, a.id, null);
  const before = w.resources.poryadok;
  const nobody = runEvent(w, event("plotina"));
  assert.ok(said(nobody.lines, "никто не занялся"));
  assert.equal(w.resources.poryadok, before - BALANCE.council.emptyOrder);
});

test("умение: новичок делает дело хуже мастера, метка на своём месте помогает", () => {
  const derevni = (setup: (p: Person) => void) => {
    const w = newWorld("умение");
    const p = fix(holder(w, "starosta")!, ["zabota"]);
    setAt("decide.noise", 0);
    setup(p);
    w.eco.floor.eda = 0; // «Простить» стоит еды: нижняя черта не должна мешать
    return runEvent(w, event("nedoimka")).effects!.derevni;
  };
  assert.equal(derevni(() => {}), 2);
  assert.equal(derevni((p) => { p.exp = 5; }), 1.7);
  assert.equal(derevni((p) => { p.exp = 0; }), 1.2);
  const mark = { id: "m", name: "м", desc: "м", star: {} };
  assert.equal(derevni((p) => { p.exp = 5; p.mark = { ...mark, goodPost: "starosta" }; }), 2);
  assert.equal(derevni((p) => { p.mark = { ...mark, badPost: "starosta" }; }), 1.5);
});

test("годность: метка и стремление двигают человека к должности", () => {
  const w = newWorld("годность");
  const p = fix(w.people[0], ["zabota", "obychai"]);
  assert.equal(fitness(p, "starosta"), 10);
  assert.equal(fitness(p, "desyatnik"), 0);
  p.aspiration = wants("desyatnik");
  assert.equal(fitness(p, "desyatnik"), 1);
  p.mark = { id: "m", name: "м", desc: "м", star: {}, goodPost: "pisar", badPost: "starosta" };
  assert.equal(fitness(p, "starosta"), 7);
  assert.equal(fitness(p, "pisar"), 2);
});
