// Здоровье (задача И10): черты, крепость, сезонная проверка, исходы, наследственность, метрики. Совет здоровье не трогает.
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { HEALTH_TRAITS, NATURA_HEALTH } from "../src/data/health";
import { BAG } from "../src/data/natura";
import { BALANCE, resetBalance, setAt } from "../src/sim/balance";
import { Rng } from "../src/sim/rng";
import {
  birthHealth, makeFamily, seasonCheck, liveThrough, krepostNow, illChance, ageDeathChance, healthMods, healthTrait, KREPOST_MAX, WINTER, type Health,
} from "../src/sim/health";
import { healthMetrics, healthWarnings, healthCohort } from "../src/sim/health-report";

afterEach(() => resetBalance());

const plain = (krepost = BALANCE.health.krepostMean, traits: string[] = []): Health => ({ krepost, traits, vices: [], off: 0, state: "ok", log: [] });

test("данные здоровья: черты трёх происхождений, у нажитых названа причина, поправки осмысленны", () => {
  const dup = HEALTH_TRAITS.map((t) => t.id).filter((id, i, a) => a.indexOf(id) !== i);
  assert.deepEqual(dup, []);
  for (const origin of ["born", "hereditary", "gained"]) assert.ok(HEALTH_TRAITS.filter((t) => t.origin === origin).length >= 5, origin);
  for (const cause of ["illness", "wound", "age"]) assert.ok(HEALTH_TRAITS.filter((t) => t.cause === cause).length >= 3, cause);
  for (const t of HEALTH_TRAITS) {
    assert.ok(/^[a-z_]+$/.test(t.id) && t.name && t.desc && t.effect && t.weight > 0, t.id);
    assert.equal(!!t.cause, t.origin === "gained", `${t.id}: причина — у нажитых и только у них`);
    const better = (t.krepost ?? 0) > 0 || (t.risk ?? 1) < 1 || (t.death ?? 1) < 1 || (t.aging ?? 1) < 1;
    const worse = (t.krepost ?? 0) < 0 || (t.risk ?? 1) > 1 || (t.death ?? 1) > 1 || (t.aging ?? 1) > 1 || (t.winter ?? 1) > 1;
    assert.ok(t.good ? better && !worse : worse && !better, `${t.id}: поправки не сходятся с пометкой «на пользу»`);
  }
  assert.ok(HEALTH_TRAITS.some((t) => t.good && t.origin === "born") && HEALTH_TRAITS.some((t) => t.good && t.origin === "hereditary"));
  for (const id of Object.keys(NATURA_HEALTH)) assert.ok(BAG.some((t) => t.id === id && t.kind === "life"), `${id}: нет такой нажитой черты натуры`);
  assert.throws(() => healthTrait("net_takoy"), /Нет черты здоровья/);
});

test("здоровье при рождении: крепость в шкале, врождённая черта у части людей, одно семя — то же здоровье", () => {
  const born = Array.from({ length: 2000 }, (_, i) => birthHealth(new Rng(`р${i}`)));
  assert.ok(born.every((h) => h.krepost >= 1 && h.krepost <= KREPOST_MAX && h.state === "ok" && h.off === 0));
  const mean = born.reduce((s, h) => s + h.krepost, 0) / born.length;
  assert.ok(Math.abs(mean - BALANCE.health.krepostMean) < 0.15, `средняя крепость ${mean}`);
  const share = born.filter((h) => h.traits.length).length / born.length;
  assert.ok(Math.abs(share - BALANCE.health.bornChance) < 0.04, `доля с врождённой чертой ${share}`);
  assert.ok(born.every((h) => h.traits.every((id) => healthTrait(id).origin === "born")), "без семьи наследственного нет");
  assert.deepEqual(birthHealth(new Rng("а")), birthHealth(new Rng("а")));
  setAt("health.bornChance", 0);
  assert.equal(birthHealth(new Rng("а")).traits.length, 0);
});

test("наследственность: черта идёт по семье, у родни носителя она встречается чаще", () => {
  setAt("health.familyChance", 1);
  const fam = makeFamily(new Rng("род"), "род");
  assert.equal(fam.hereditary.length, 1);
  assert.equal(healthTrait(fam.hereditary[0]).origin, "hereditary");
  const kids = Array.from({ length: 400 }, (_, i) => birthHealth(new Rng(`д${i}`), fam));
  const got = kids.filter((h) => h.traits.includes(fam.hereditary[0])).length / kids.length;
  assert.ok(Math.abs(got - BALANCE.health.inheritChance) < 0.08, `наследуют ${got}`);
  assert.ok(kids.every((h) => h.family === "род"));
  setAt("health.inheritChance", 1);
  assert.ok(birthHealth(new Rng("х"), fam).traits.includes(fam.hereditary[0]));
  resetBalance();
  const m = healthMetrics(1500);
  assert.ok(m.kinShare.withKin > m.kinShare.base * 2, JSON.stringify(m.kinShare));
  const cohort = healthCohort(30, "семьи");
  assert.equal(new Set(cohort.map((c) => c.family.id)).size, 30 / BALANCE.health.familySize);
});

test("крепость: черты сдвигают её, в старости она убывает, «Род долгожителей» стареет медленнее", () => {
  const H = BALANCE.health;
  assert.equal(krepostNow(plain(6), 50), 6);
  assert.equal(krepostNow(plain(6, ["khily"]), 50), 4);
  assert.equal(krepostNow(plain(6, ["krepok"]), 50), 7);
  assert.equal(krepostNow(plain(6), H.oldFrom + H.agingStep * 2), 4, "две единицы за два шага старости");
  assert.ok(krepostNow(plain(6, ["dolgozhiteli"]), 170) > krepostNow(plain(6), 170) && krepostNow(plain(6, ["rano_stareyut"]), 170) < krepostNow(plain(6), 170));
  assert.equal(krepostNow(plain(1, ["khily", "dryakhleet"]), 190), 0, "ниже нуля не падает");
  const vice: Health = { ...plain(6), vices: ["charka"] };
  assert.equal(krepostNow(vice, 50), 5, "нажитая черта натуры сказывается на здоровье");
  assert.equal(healthMods(vice).risk, NATURA_HEALTH.charka.risk);
  assert.deepEqual(birthHealth(new Rng("п"), undefined, ["charka", "derzhit_slovo"]).vices, ["charka"], "берутся только черты, влияющие на здоровье");
});

test("шанс заболеть: зимой выше, у слабого выше, у крепкого ниже; ручки действуют сразу", () => {
  const H = BALANCE.health, h = plain();
  assert.equal(illChance(h, 50, 0), H.illBase);
  assert.equal(illChance(h, 50, WINTER), H.illBase * H.winterMult);
  assert.equal(illChance(h, 50, WINTER + 4), H.illBase * H.winterMult, "зима — каждый четвёртый сезон");
  assert.ok(illChance(plain(6, ["slaboe"]), 50, 0) > H.illBase * 1.8 && illChance(plain(6, ["krepok"]), 50, 0) < H.illBase * 0.6);
  assert.ok(illChance(plain(6, ["merzlyak"]), 50, WINTER) > illChance(h, 50, WINTER) && illChance(plain(6, ["merzlyak"]), 50, 0) === illChance(h, 50, 0));
  assert.ok(illChance(plain(4), 50, 0) > illChance(plain(8), 50, 0));
  assert.ok(illChance(h, 150, 0) > illChance(h, 50, 0), "в старости болеют чаще");
  setAt("health.illBase", 0.1);
  assert.equal(illChance(h, 50, 0), 0.1);
});

test("смерть от старости: до глубокой старости её нет, к пределу жизни шанс растёт", () => {
  const H = BALANCE.health, h = plain();
  assert.equal(ageDeathChance(h, H.elderFrom), 0);
  assert.equal(ageDeathChance(h, 100), 0);
  assert.equal(ageDeathChance(h, H.lifeMax), H.ageDeathMax);
  assert.ok(ageDeathChance(h, 180) > 0 && ageDeathChance(h, 180) < ageDeathChance(h, 195));
  assert.ok(ageDeathChance(plain(6, ["dolgozhiteli"]), 190) < ageDeathChance(h, 190));
});

test("сезонная проверка: слёг — сезон в постели, тяжёлая болезнь — дольше и может оставить след или убить", () => {
  setAt("health.woundChance", 0);
  setAt("health.illBase", 0.2);
  setAt("health.winterMult", 5);
  setAt("health.hardShare", 0);
  const light = plain();
  const ev = seasonCheck(new Rng("лёгкая"), light, 50, WINTER);
  assert.deepEqual(ev.map((e) => e.kind).slice(0, 1), ["ill"]);
  assert.equal(light.off, 1);
  assert.deepEqual(seasonCheck(new Rng("в постели"), light, 50, 4), [], "пока лежит — новой болезни нет");
  assert.equal(light.off, 0);
  setAt("health.hardShare", 1);
  setAt("health.hardDeath", 0);
  setAt("health.illChronic", 1);
  const hard = plain();
  const ev2 = seasonCheck(new Rng("тяжёлая"), hard, 50, WINTER);
  assert.deepEqual(ev2.map((e) => e.kind), ["hard", "trait"]);
  assert.ok(hard.off >= BALANCE.health.hardOffMin && hard.off <= BALANCE.health.hardOffMax && hard.state === "ok");
  assert.ok(hard.traits.length === 1 && healthTrait(hard.traits[0]).cause === "illness" && !healthTrait(hard.traits[0]).good, "после тяжёлой болезни остаётся дурной след");
  setAt("health.hardDeath", 0.5);
  setAt("health.krepostDeath", 1);
  const weak = plain(2);
  seasonCheck(new Rng("смерть"), weak, 50, WINTER);
  assert.deepEqual([weak.state, weak.cause, weak.log.at(-1)!.kind], ["dead", "болезнь", "dead"]);
  assert.deepEqual(seasonCheck(new Rng("после"), weak, 50, 0), [], "мёртвого проверка не трогает");
});

test("рана оставляет след; когда крепость падает до порога, человек выбывает со службы", () => {
  setAt("health.woundChance", 0.05);
  setAt("health.woundDeath", 0);
  setAt("health.woundChronic", 1);
  setAt("health.illBase", 0);
  setAt("health.ageTraitChance", 0);
  let wounded: Health | undefined;
  for (let i = 0; i < 200 && !wounded; i++) {
    const h = plain(9);
    if (seasonCheck(new Rng(`рана-${i}`), h, 50, 0).some((e) => e.kind === "wound")) wounded = h;
  }
  assert.ok(wounded && wounded.traits.length === 1 && healthTrait(wounded.traits[0]).cause === "wound" && wounded.off >= 1);
  const frail = plain(BALANCE.health.incapAt + 1, ["khily"]);
  const ev = seasonCheck(new Rng("выбыл"), frail, 50, 0);
  assert.deepEqual([frail.state, frail.cause, ev.at(-1)!.kind], ["out", "здоровье", "out"]);
});

test("прожить партию: детерминизм, счёт сезонов в постели, старики выбывают чаще зрелых", () => {
  const run = (seed: string, age: number) => { const h = birthHealth(new Rng(seed)); return { l: liveThrough(new Rng(`${seed}-ж`), h, age, 80), h }; };
  assert.deepEqual(run("а", 60), run("а", 60));
  const removed = (age: number) => Array.from({ length: 600 }, (_, i) => run(`ч${i}`, age)).filter((r) => r.l.removedAt !== undefined).length / 600;
  assert.ok(removed(140) > removed(50) + 0.15, `в 140 лет ${removed(140)}, в 50 — ${removed(50)}`);
  const r = run("б", 60);
  assert.equal(r.l.offSeasons <= r.l.lived && r.l.lived <= 80, true);
  if (r.l.removedAt !== undefined) assert.notEqual(r.h.state, "ok");
  // до предела жизни не доживает никто
  const old = liveThrough(new Rng("предел"), plain(9), 195, 400);
  assert.ok(old.deadAt !== undefined && 195 + old.deadAt / 4 < BALANCE.health.lifeMax + 60);
});

test("метрики здоровья: на трёх тысячах людей цели выполнены, предупреждений нет", () => {
  const m = healthMetrics(3000), G = BALANCE.health.goal;
  assert.deepEqual(healthWarnings(m), []);
  assert.ok(m.removed >= G.removedMin && m.removed <= G.removedMax && m.offShare >= G.offMin && m.offShare <= G.offMax, `выбыло ${m.removed}, в постели ${m.offShare}`);
  assert.ok(m.life.median >= G.medianLife && m.life.reachElder >= G.reachElder && m.life.median < BALANCE.health.lifeMax, JSON.stringify(m.life.median));
  assert.ok(m.dead < m.removed && m.causes["здоровье"] > 0 && m.causes["болезнь"] > 0);
  assert.ok(m.byAge.at(-1)!.removed > m.byAge[0].removed * 2, "старые выбывают заметно чаще зрелых");
  assert.equal(m.curve.length, m.years + 1);
  assert.ok(m.curve[0] === 1 && m.curve.every((v, i) => i === 0 || v <= m.curve[i - 1]) && Math.abs(m.curve.at(-1)! - (1 - m.removed)) < 0.02, "кривая «ещё служат» не растёт");
  assert.ok(Math.abs(m.life.hist.reduce((s, b) => s + b.share, 0) - 1) < 0.01, "гистограмма срока жизни покрывает всех");
  assert.deepEqual(healthMetrics(300, "а"), healthMetrics(300, "а"), "метрики зависят только от семени");
});

test("предупреждения здоровья появляются, когда цель не выполнена", () => {
  setAt("health.illBase", 0.1);
  setAt("health.hardDeath", 0.3);
  const harsh = healthWarnings(healthMetrics(800));
  assert.ok(harsh.some((x) => x.startsWith("людей косит")) && harsh.some((x) => x.startsWith("болеют слишком часто")) && harsh.some((x) => x.startsWith("живут мало")), harsh.join("; "));
  resetBalance();
  setAt("health.illBase", 0);
  setAt("health.woundChance", 0);
  setAt("health.bornChance", 0);
  setAt("health.familyChance", 0);
  setAt("health.ageTraitChance", 0);
  setAt("health.agingStep", 60);
  const mild = healthWarnings(healthMetrics(800));
  assert.ok(mild.some((x) => x.startsWith("совет почти не меняется")) && mild.some((x) => x.startsWith("все одинаково здоровы")) && mild.some((x) => x.startsWith("болеют слишком редко")), mild.join("; "));
});

test("совет здоровье не зовёт", async () => {
  const { readFileSync } = await import("node:fs");
  for (const f of ["src/sim/sim.ts", "src/ui/main.ts"]) assert.ok(!/health/.test(readFileSync(f, "utf8")), f);
});
