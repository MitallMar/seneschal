// Бот-искатель (задача И3б; src/sim/bots-seek.ts): пространство стратегий, перебор и случайные стратегии, новые привычки ботов,
// отбор и подтверждение на разных семенах, детерминизм отчёта.
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { BALANCE, resetBalance } from "../src/sim/balance";
import { Rng } from "../src/sim/rng";
import { MASTER_HABIT, bot, playBot, type Bot, type Habit } from "../src/sim/bots";
import { botStats, metricsOf, seedName } from "../src/sim/bots-report";
import { SPACE, GOALS, ODD, enumerated, randoms, randomHabit, describe, parts, seek } from "../src/sim/bots-seek";

afterEach(() => resetBalance());

const fields = Object.keys(SPACE) as (keyof Habit)[];
const options = (f: keyof Habit) => SPACE[f] as unknown[];

test("пространство: у каждой привычки есть вариант «Хозяина» и хотя бы один другой; настоящей годности в поиске нет", () => {
  for (const f of fields) {
    assert.ok(options(f).includes(MASTER_HABIT[f]), `${f}: вариант «Хозяина»`);
    assert.ok(options(f).length >= 2, f);
    assert.equal(new Set(options(f)).size, options(f).length, `${f}: варианты не повторяются`);
  }
  assert.ok(!options("place").includes("true"), "настоящая годность игроку недоступна");
  assert.equal(describe(MASTER_HABIT), "как «Хозяин»");
});

test("перебор: «Хозяин» с одной изменённой привычкой и со всеми парами изменений в разных привычках", () => {
  const singles = fields.reduce((s, f) => s + options(f).length - 1, 0);
  const same = fields.reduce((s, f) => s + ((options(f).length - 1) * (options(f).length - 2)) / 2, 0);
  const one = enumerated(false), all = enumerated();
  assert.equal(one.length, singles);
  assert.equal(all.length, singles + (singles * (singles - 1)) / 2 - same);
  assert.equal(new Set(all.map((c) => c.id)).size, all.length, "id не повторяются");
  for (const c of one) assert.equal(parts(c.habit).length, 1, describe(c.habit));
  for (const c of all.filter((x) => x.kind === "две привычки")) assert.equal(parts(c.habit).length, 2, describe(c.habit));
  assert.equal(new Set(one.map((c) => describe(c.habit))).size, one.length, "у каждой привычки свои слова");
  assert.ok(all.every((c) => c.habit.active), "искатель всегда играет руками");
});

test("случайные стратегии: одно семя — один набор; каждая привычка взята из пространства", () => {
  const a = randoms("искатель", 30), b = randoms("искатель", 30), c = randoms("другое", 30);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a.map((x) => x.habit), c.map((x) => x.habit));
  for (const x of a) for (const f of fields) assert.ok(options(f).includes(x.habit[f]), `${x.id}: ${f}`);
  assert.ok(new Set(a.map((x) => describe(x.habit))).size > 25, "стратегии разные");
  assert.deepEqual(randomHabit(new Rng("х")), randomHabit(new Rng("х")));
});

test("новые привычки: главный — дольше всех на должности; любой курс держится всю партию", () => {
  const as = (habit: Partial<Habit>): Bot => ({ id: "проба", name: "проба", level: 4, habit: { ...MASTER_HABIT, ...habit } });
  const w = playBot("искатель", as({ head: "senior", place: "start" }), 1).w, council = w.people.filter((p) => p.post);
  assert.equal(w.people[w.head!].tenure, Math.max(...council.map((p) => p.tenure)));
  const t = playBot("искатель", as({ course: "torguem" }), 6).w;
  assert.equal(t.eco.course, "torguem");
  assert.ok(t.eco.courseSeasons >= 5 || !!t.fall.under || t.fall.falls.length > 0, "курс не менялся, пока Сенешаль хозяин");
  assert.equal(playBot("искатель", as({ course: "none" }), 2).w.eco.course, null);
});

test("подтверждение идёт на семенах, которых отбор не видел", () => {
  const b = bot("idle"), first = botStats(b, 3, 4), next = botStats(b, 3, 4, false, 3);
  assert.deepEqual(next.runs[0], metricsOf(playBot(seedName(3), b, 4)));
  assert.deepEqual(first.runs[0], metricsOf(playBot(seedName(0), b, 4)));
  assert.notDeepEqual(first.runs, next.runs);
});

test("искатель: отчёт детерминирован; находка подтверждена только при разнице от порога; необычное — за краями привычных ботов", () => {
  const opts = { pairs: false, random: 6, screen: 4, confirm: 8, top: 2, depth: 2, climb: 5, seasons: 8 };
  const r = seek(opts);
  assert.deepEqual(JSON.parse(JSON.stringify(seek(opts))), JSON.parse(JSON.stringify(r)));
  assert.equal(r.candidates, enumerated(false).length + 6);
  assert.deepEqual([r.screen, r.confirm, r.seasons], [4, 8, 8]);
  assert.ok(r.better.length <= GOALS.length * opts.top);
  for (const f of r.better) {
    assert.ok(f.goal && f.screen * f.goal.better > 0, "на подтверждение идут только те, кто при отборе был лучше");
    assert.equal(f.confirmed, f.z * f.goal.better >= BALANCE.bots.strong);
    assert.equal(f.text, describe(f.cand.habit));
  }
  for (const f of r.odd) {
    assert.ok(f.odd && ODD.includes(f.odd.id));
    if (f.confirmed) assert.ok(f.odd.value > f.odd.hi || f.odd.value < f.odd.lo);
    if (f.confirmed) assert.ok(f.diff >= -BALANCE.bots.seekKeep, "необычная стратегия подать не проигрывает");
  }
  assert.ok(r.built.length <= GOALS.length);
  for (const f of r.built) {
    assert.ok(f.steps!.length >= 1 && f.steps!.length <= BALANCE.bots.seekDepth);
    assert.equal(parts(f.cand.habit).length, f.steps!.length, "каждый шаг меняет одну новую привычку");
    const values = f.steps!.map((s) => s.value * f.goal!.better);
    assert.ok(values.every((v, i) => i === 0 || v >= values[i - 1]), "цель с каждым шагом не хуже");
  }
  assert.equal(r.levers.length, enumerated(false).length);
  assert.deepEqual(Object.keys(r.usual).sort(), [...ODD].sort());
  for (const x of r.repeats) assert.ok(x.n > 1);
});
