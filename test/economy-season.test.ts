// Хозяйство без экрана целиком: детерминизм, ручки, отчёт, главный в настрое (src/sim/economy/season.ts, economy-report.ts).
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import type { Side } from "../src/data/types";
import { POSTS } from "../src/data/core";
import { SIDES } from "../src/data/economy";
import { BALANCE, resetBalance, setAt } from "../src/sim/balance";
import { newWorld } from "../src/sim/council/generate";
import { runSeason } from "../src/sim/season";
import { holder, setRel } from "../src/sim/state";
import { councilSteady } from "../src/sim/authority";
import { doer, setCourse } from "../src/sim/economy/doer";
import { planSeason } from "../src/sim/economy/plan";
import { payOptions, payTax } from "../src/sim/economy/pay";
import { economyMetrics, freeYear, PAYERS } from "../src/sim/economy-report";
import { dump, fix } from "./_world";
import { E, calm, noHead, noHand } from "./_economy";

afterEach(() => resetBalance());

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
    // урок: в спокойном мире после трёх лет испытания обычный; мир вокруг даёт надбавку или послабление
    assert.ok(a.eco.tax.lesson >= 0 && Math.abs(a.eco.tax.lesson - E.tax.normal) <= 4, `${seed}: урок ${a.eco.tax.lesson}`);
    setAt("world.on", 0);
    assert.equal(play().eco.tax.lesson, E.tax.normal, "после трёх лет испытания урок обычный");
    resetBalance();
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
