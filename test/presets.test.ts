// Заготовки ситуаций эмулятора (задача И2) и веса вариантов в летописи.
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { BALANCE, resetBalance } from "../src/sim/balance";
import { newWorld, runSeason, runEvent, holder, getRel, isStale, fitness } from "../src/sim/sim";
import { EVENTS } from "../src/data/events";
import { PRESETS, newPreset } from "../src/sim/presets";
import { zoneOf, patienceWord, taxLeft, doer, planSeason } from "../src/sim/economy";
import { councilSteady } from "../src/sim/authority";
import { dump } from "./_world";

afterEach(() => resetBalance());
const make = (id: string) => newPreset("заготовка", id);

test("заготовки: десять ситуаций, id не повторяются, каждая детерминирована и играется двенадцать сезонов", () => {
  assert.equal(PRESETS.length, 10);
  assert.equal(new Set(PRESETS.map((p) => p.id)).size, PRESETS.length);
  for (const p of PRESETS) {
    const a = make(p.id), b = make(p.id);
    assert.equal(dump(a), dump(b), p.id);
    assert.notEqual(dump(a), dump(newWorld("заготовка")), `${p.id}: партия отличается от обычной`);
    assert.ok(a.log.some((e) => e.title === `Заготовка: ${p.name}`));
    for (let s = 0; s < 12; s++) runSeason(a);
    for (const v of Object.values(a.eco.stock)) assert.ok(v >= 0 && Number.isFinite(v), p.id);
  }
  assert.equal(dump(newPreset("заготовка", "нет такой")), dump(newWorld("заготовка")), "неизвестная заготовка — обычная партия");
  assert.equal(dump(newPreset("заготовка", null)), dump(newWorld("заготовка")));
});

test("заготовки совета: враги, засидевшийся писарь, новички, пустая должность, главный без признания", () => {
  const v = make("vragi"), c = v.people.filter((p) => p.post);
  for (const a of c) for (const b of c) if (a.id < b.id) assert.ok(getRel(v, a.id, b.id) <= BALANCE.rel.enemy);
  assert.ok(!councilSteady(v).ok, "опоры от такого совета нет");
  const pisar = holder(make("pisar"), "pisar")!;
  assert.ok(isStale(pisar) && pisar.gained.some((g) => g.trait.id === "obros_svyazyami"));
  const n = make("novichki");
  assert.ok(n.people.filter((p) => p.post).every((p) => p.exp === 0 && p.tenure === 0 && !p.gained.some((g) => g.trait.source === "post")));
  const e = make("pusto");
  assert.equal(holder(e, "klyuchnik"), undefined);
  assert.equal(doer(e, "klyuchnik").how, "должность пуста");
  assert.equal(e.people.filter((p) => p.post).length, 4);
  assert.ok(councilSteady(make("glavny")).why.includes("не признаёт"));
});

test("заготовки хозяйства: пустой амбар, купцы отказывают, вороватый писарь, недоимка и терпение на исходе", () => {
  const a = make("ambar");
  assert.deepEqual(a.eco.stock, { eda: BALANCE.economy.flow.upkeep, tovary: 0, serebro: 0 });
  const k = make("kuptsy");
  assert.equal(zoneOf(k, "kuptsy"), "отказывают");
  assert.ok(planSeason(k).lines.some((l) => l.text.includes("купцы отказывают")));
  const v = make("vor"), p = holder(v, "pisar")!;
  assert.ok(isStale(p) && p.star.vygoda >= BALANCE.decide.staleGreedFrom);
  assert.ok(doer(v, "pisar").stale, "засиделся: ведёт дело по-своему, а жадный тянет из казны");
  const n = make("nedoimka");
  assert.equal(patienceWord(n.eco.tax.patience), "на исходе");
  assert.ok(n.eco.tax.carried > 0 && taxLeft(n) === n.eco.tax.lesson + n.eco.tax.carried);
});

test("веса вариантов: у решения в летописи записано, из чего сложился выбор каждого", () => {
  const w = newWorld("веса");
  w.eco.floor = { eda: 0, serebro: 0 };
  const one = runEvent(w, EVENTS.find((e) => e.id === "svadba")!);
  assert.equal(one.weights!.length, 1);
  const who = holder(w, "klyuchnik")!.name;
  assert.ok(one.weights![0].startsWith(`${who}: `) && one.weights![0].includes("→ «") && one.weights![0].includes("без случая"), one.weights![0]);
  assert.equal(one.weights![0].split(" · ").length, 3, "все три варианта с весами");
  const two = runEvent(w, EVENTS.find((e) => e.id === "plotina")!);
  assert.equal(two.weights!.length, 2, "в споре — веса обоих");
  w.eco.floor.eda = 99;
  const cut = runEvent(w, EVENTS.find((e) => e.id === "svadba")!);
  assert.ok(cut.weights!.some((l) => l.includes("под нижней чертой")), cut.weights!.join(" | "));
});

test("заготовка «Наследство прежних баронов»: три должности из пяти у людей не по годности, детерминирована", () => {
  for (const seed of ["наследство", "лес", "x"]) {
    const plain = newWorld(seed), w = newPreset(seed, "nasledstvo");
    assert.equal(dump(w), dump(newPreset(seed, "nasledstvo")), seed);
    const changed = (["starosta", "desyatnik", "klyuchnik", "pisar", "lesnichiy"] as const).filter((post) => holder(w, post)!.id !== holder(plain, post)!.id);
    assert.equal(changed.length, 3, `${seed}: сменились три должности`);
    assert.equal(w.people.filter((p) => p.post).length, 5, "пустых должностей нет");
    for (const post of changed) assert.ok(fitness(holder(w, post)!, post) < fitness(holder(plain, post)!, post), `${seed}, ${post}: новый держатель годен меньше`);
    assert.ok(w.head != null && w.people[w.head].post, "главный — из совета");
  }
});
