// Сезон без экрана: события сезона, стаж и опыт, лабиринт, лояльность, долгий прогон (src/sim/season.ts).
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { AXES } from "../src/data/core";
import { BALANCE, resetBalance, setAt } from "../src/sim/balance";
import { newWorld } from "../src/sim/council/generate";
import { runSeason } from "../src/sim/season";
import { assign, giveOrder } from "../src/sim/council/staff";
import { talk } from "../src/sim/council/talk";
import { holder, getRel, setRel } from "../src/sim/state";
import { SEEDS, said, free, wants } from "./_council";

afterEach(() => resetBalance());

// ---------- сезоны ----------

test("сезон: три события, итог, стаж и опыт растут, опыт упирается в потолок", () => {
  const w = newWorld("сезон");
  const p = holder(w, "pisar")!;
  p.tenure = 9; p.exp = 9;
  runSeason(w);
  assert.equal(w.season, 2);
  assert.equal(w.log.filter((e) => e.kind === "event").length, BALANCE.season.events);
  assert.equal(w.log.filter((e) => e.kind === "season").length, 1);
  assert.deepEqual([p.tenure, p.exp], [10, 10]);
  assert.ok(said(w.log.at(-1)!.lines, `Новая черта: ${p.name} — «Мастер своего дела»`));
  runSeason(w);
  assert.deepEqual([p.tenure, p.exp], [11, 10]);
});

test("сезон: приключенцы приходят только при открытом лабиринте", () => {
  const titles = (lab: boolean) => {
    const w = newWorld("лабиринт", lab);
    for (let i = 0; i < 20; i++) runSeason(w);
    return w.log.filter((e) => e.kind === "event").map((e) => e.title);
  };
  assert.ok(titles(false).every((t) => !t.includes("⚔")));
  assert.ok(titles(true).some((t) => t.includes("⚔")));
});

test("сезон: желанная должность растит лояльность, чужая — снижает, отношения сглаживаются", () => {
  const w = newWorld("лояльность");
  const [glad, sad] = [holder(w, "pisar")!, holder(w, "starosta")!];
  glad.aspiration = wants("pisar"); glad.loyalty = 0;
  sad.aspiration = wants("lesnichiy"); sad.loyalty = 0; sad.tenure = 0; sad.trait = { ...sad.trait, mods: {} };
  setAt("season.events", 1);
  const idle = free(w);
  setRel(w, idle[0].id, idle[1].id, 10);
  runSeason(w);
  assert.equal(glad.loyalty, 0.3);
  assert.equal(sad.loyalty, -0.2);
  assert.equal(getRel(w, idle[0].id, idle[1].id), 9.7);
});

test("прогон 20 сезонов на нескольких семенах: без ошибок, числа остаются в своих шкалах", () => {
  for (const seed of SEEDS) {
    for (const lab of [false, true]) {
      const w = newWorld(seed, lab);
      for (let s = 0; s < 20; s++) {
        if (s === 5) assign(w, free(w)[0].id, "pisar");
        if (s === 9) assign(w, holder(w, "starosta")!.id, null);
        if (s === 12) giveOrder(w, holder(w, "desyatnik")!.id, "zabota");
        talk(w, s % 10);
        runSeason(w);
      }
      const at = `семя ${seed}, лабиринт ${lab}`;
      assert.equal(w.season, 21, at);
      assert.equal(w.log.filter((e) => e.kind === "season").length, 20, at);
      assert.equal(w.log.filter((e) => e.kind === "event").length, 20 * BALANCE.season.events, at);
      for (const p of w.people) {
        for (const a of AXES) assert.ok(p.star[a] >= 0 && p.star[a] <= 10, `${at}, ${p.name}: ${a} = ${p.star[a]}`);
        assert.ok(p.loyalty >= -10 && p.loyalty <= 10, `${at}, ${p.name}: лояльность ${p.loyalty}`);
        assert.ok(p.exp <= BALANCE.exp.master && p.matchedTop <= p.decisions, at);
        assert.equal(p.post ? holder(w, p.post) : undefined, p.post ? p : undefined, `${at}, ${p.name}: должность и совет расходятся`);
      }
      const numbers = [...w.rel.values(), ...Object.values(w.factions), ...Object.values(w.resources), w.authority];
      assert.ok(numbers.every(Number.isFinite), at);
      assert.ok([...w.rel.values()].every((v) => v >= -10 && v <= 10), at);
      assert.ok(w.log.every((e) => e.title && e.lines.length > 0 && e.lines.every((l) => !/undefined|NaN|[{}]/.test(l))), `${at}: мусор в летописи`);
      assert.ok(w.people.filter((p) => p.post).reduce((n, p) => n + p.decisions, 0) > 0, at);
    }
  }
});
