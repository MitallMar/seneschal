// Совет без экрана: перестановки, разговор, наказ (src/sim/council/staff.ts, talk.ts).
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { BALANCE, resetBalance, setAt } from "../src/sim/balance";
import { newWorld } from "../src/sim/council/generate";
import { runSeason } from "../src/sim/season";
import { runEvent } from "../src/sim/council/council";
import { assign, assignCost, giveOrder } from "../src/sim/council/staff";
import { talk } from "../src/sim/council/talk";
import { holder, getRel } from "../src/sim/state";
import type { Person, World } from "../src/sim/state";
import { dump, fix } from "./_world";
import { postIds, event, said, free, wants } from "./_council";

afterEach(() => resetBalance());

// ---------- перестановки ----------

// партия, где должность post пуста, а её бывший держатель остался без места
function vacated(seed: string, post: (typeof postIds)[number]): World {
  const w = newWorld(seed);
  assign(w, holder(w, post)!.id, null);
  w.authority = BALANCE.staff.authorityStart;
  return w;
}

test("перестановка: на пустую должность человек без должности встаёт бесплатно", () => {
  const w = vacated("пусто", "pisar");
  const p = free(w)[0];
  assert.equal(assignCost(w, p, "pisar").cost, 0);
  assign(w, p.id, "pisar");
  assert.equal(w.authority, BALANCE.staff.authorityStart);
  assert.equal(holder(w, "pisar"), p);
  assert.equal(p.post, "pisar");
  assert.equal(p.tenure, 0);
});

test("перестановка: перевод на желанную пустую должность бесплатен, на нежеланную — по цене снятия", () => {
  const w = vacated("желанная", "pisar");
  const p = holder(w, "starosta")!;
  p.tenure = 5;
  p.aspiration = wants("pisar");
  assert.equal(assignCost(w, p, "pisar").cost, 0);
  p.aspiration = wants("lesnichiy");
  assert.equal(assignCost(w, p, "pisar").cost, 1);
  p.aspiration = wants("pisar");
  const loyalty = p.loyalty;
  assign(w, p.id, "pisar");
  assert.equal(w.authority, BALANCE.staff.authorityStart);
  assert.equal(p.loyalty, Math.min(10, loyalty + BALANCE.staff.desiredLoyalty));
  assert.equal(holder(w, "starosta"), undefined);
  assert.ok(said(w.log.at(-1)!.lines, "желанную должность"));
});

test("перестановка: снять против воли стоит авторитета, и дороже со стажем", () => {
  const cost = (tenure: number) => {
    const w = newWorld("стаж");
    const p = holder(w, "klyuchnik")!;
    p.tenure = tenure;
    const c = assignCost(w, p, null).cost;
    assign(w, p.id, null);
    assert.equal(w.authority, BALANCE.staff.authorityStart - c, `авторитет после снятия при стаже ${tenure}`);
    assert.equal(holder(w, "klyuchnik"), undefined);
    return c;
  };
  assert.deepEqual([0, 7, 8, 16, 30].map(cost), [1, 1, 2, 3, 4]);
  setAt("staff.removePerSeasons", 4);
  assert.equal(cost(16), 5);
});

test("перестановка: занять чужую должность — платишь за снятие держателя; снятый обижен и теряет половину опыта", () => {
  const w = newWorld("замена");
  const old = holder(w, "desyatnik")!;
  old.tenure = 20; old.exp = 10; old.aspiration = undefined;
  const p = free(w)[0];
  const loyalty = old.loyalty;
  assert.equal(assignCost(w, p, "desyatnik").cost, 3);
  assign(w, p.id, "desyatnik");
  assert.equal(w.authority, BALANCE.staff.authorityStart - 3);
  assert.equal(old.post, undefined);
  assert.equal(old.exp, 5);
  assert.equal(old.loyalty, Math.max(-10, loyalty + BALANCE.staff.removedLoyalty));
  assert.ok(said(w.log.at(-1)!.lines, "Авторитет −3."));
});

test("перестановка: обойдённый, кто метил на должность, хуже относится к назначенному", () => {
  const w = vacated("обойдённый", "lesnichiy");
  const [p, rival] = free(w);
  p.aspiration = undefined;
  for (const o of w.people) if (o.aspiration?.post === "lesnichiy") o.aspiration = undefined;
  rival.aspiration = wants("lesnichiy");
  rival.trait = { ...rival.trait, mods: {} };
  p.trait = { ...p.trait, mods: {} };
  const before = getRel(w, p.id, rival.id);
  assign(w, p.id, "lesnichiy");
  assert.equal(getRel(w, p.id, rival.id), Math.max(-10, before + BALANCE.staff.bypassedRel));
});

test("поставить человека на его же должность — ничего не происходит", () => {
  const w = newWorld("тот же");
  const p = holder(w, "starosta")!;
  const before = dump(w);
  assign(w, p.id, "starosta");
  assert.equal(dump(w), before);
});

test("разговор тратит личное дело; дела возвращаются с новым сезоном", () => {
  const w = newWorld("разговор");
  const loyalty = w.people[0].loyalty;
  assert.equal(talk(w, 0), true);
  assert.equal(w.people[0].know.talks, 1);
  assert.equal(w.people[0].loyalty, Math.min(10, loyalty + BALANCE.staff.talkLoyalty));
  for (const p of w.people.slice(2)) while (talk(w, p.id)) { /* остаток личных дел уходит на разговоры с другими */ }
  assert.equal(w.deedsLeft, 0);
  assert.equal(talk(w, 1), false);
  assert.equal(w.people[1].know.talks, 0);
  runSeason(w);
  assert.equal(w.deedsLeft, BALANCE.season.deeds);
});

test("наказ стоит авторитета один раз; смена и снятие наказа бесплатны", () => {
  const w = newWorld("наказ");
  giveOrder(w, 2, "dolg");
  assert.equal(w.authority, BALANCE.staff.authorityStart - BALANCE.staff.orderCost);
  giveOrder(w, 2, "zabota");
  assert.equal(w.people[2].order, "zabota");
  giveOrder(w, 2, null);
  assert.equal(w.people[2].order, undefined);
  assert.equal(w.authority, BALANCE.staff.authorityStart - BALANCE.staff.orderCost);
});

test("наказ склоняет решение лояльного человека, а засидевшийся упрямец его не слышит", () => {
  // «Недоимка» решает староста: простить (Забота), взыскать (Долг, Выгода), отработка (Обычай, Забота)
  const choice = (setup: (p: Person) => void) => {
    const w = newWorld("наказ-решение");
    const p = fix(holder(w, "starosta")!, []);
    setAt("decide.noise", 0);
    setup(p);
    return runEvent(w, event("nedoimka")).lines[1];
  };
  assert.ok(choice((p) => { p.loyalty = 8; p.order = "dolg"; }).includes("Взыскать"));
  assert.ok(choice((p) => { p.loyalty = 8; p.order = "dolg"; }).includes("по наказу"));
  assert.ok(!choice((p) => { p.loyalty = -9; p.order = "dolg"; }).includes("по наказу"));
  assert.ok(!choice((p) => { p.loyalty = 0; p.order = "dolg"; p.tenure = BALANCE.exp.staleFrom; }).includes("по наказу"));
});
