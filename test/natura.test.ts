// Генератор натур (задача И8): данные мешка, рост древа, деловые склонности из признаков, метрики. Совет он не трогает.
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import type { SignVec } from "../src/data/types";
import { AXES } from "../src/data/core";
import { SIGNS, NATURES, BAG } from "../src/data/natura";
import { BALANCE, resetBalance, setAt } from "../src/sim/balance";
import { Rng } from "../src/sim/rng";
import {
  growPerson, growLife, growParty, rollPerson, signsOf, businessStar, saturation, candidateWeight, inConflict, isFar, isContra, cos,
  bagTrait, natureById, SIGN_MAX, type NaturaPerson,
} from "../src/sim/natura";
import { naturaMetrics, naturaWarnings, jaccard, rollAll } from "../src/sim/natura-report";

afterEach(() => resetBalance());

const signIds = SIGNS.map((s) => s.id) as string[];
const vecOk = (v: SignVec) => Object.keys(v).every((key) => signIds.includes(key)) && Object.values(v).every((x) => Number.isInteger(x) && x !== 0);
const ids = (p: NaturaPerson) => p.traits.map((t) => t.id);
const each = (fn: (p: NaturaPerson, at: string) => void, rolls = 300) => rollAll(rolls, "тест").forEach((p, i) => fn(p, `${p.nature.id} №${i}`));

// ---------- данные ----------

test("данные натуры: 12 признаков, 30 натур с ядром и точками кристаллизации, мешок около 80 черт и перков", () => {
  assert.equal(SIGNS.length, 12);
  assert.equal(NATURES.length, 30);
  assert.ok(BAG.length >= 80);
  const dup = (xs: string[]) => xs.filter((x, i) => xs.indexOf(x) !== i);
  assert.deepEqual(dup(SIGNS.map((s) => s.id)), []);
  assert.deepEqual(dup(NATURES.map((n) => n.id)), []);
  assert.deepEqual(dup(NATURES.map((n) => n.name)), []);
  assert.deepEqual(dup(BAG.map((t) => t.id)), []);
  assert.deepEqual(dup(BAG.map((t) => t.name)), []);
  for (const n of NATURES) {
    const strong = Object.keys(n.core).length;
    assert.ok(/^[a-z_]+$/.test(n.id) && vecOk(n.core) && strong >= 2 && strong <= 4, n.id);
    assert.ok(n.crystals.length >= 2 && n.crystals.length <= 3 && n.crystals.every((c) => vecOk(c) && cos(c, n.core) > 0), `${n.id}: точки кристаллизации`);
  }
});

test("мешок: вектор из 1–3 признаков, описание и действие есть, конфликты и requires ведут на существующее", () => {
  for (const t of BAG) {
    const n = Object.keys(t.vec).length;
    assert.ok(/^[a-z_]+$/.test(t.id) && t.name && t.desc && t.effect && t.source.length, t.id);
    assert.ok(vecOk(t.vec) && n >= 1 && n <= 3, `${t.id}: вектор`);
    for (const id of [...(t.conflicts ?? []), ...(t.requires ?? [])]) assert.ok(BAG.some((x) => x.id === id), `${t.id} → ${id}`);
    assert.ok(!t.conflicts?.includes(t.id) && !t.requires?.some((id) => t.conflicts?.includes(id)), t.id);
    assert.equal(!!t.requires, t.kind === "perk", `${t.id}: requires — у перков и только у них`);
    if (t.requires) assert.ok(t.requires.some((id) => bagTrait(id).kind === "born"), `${t.id}: перк недостижим от рождения`);
  }
  for (const kind of ["born", "life", "perk"]) assert.ok(BAG.some((t) => t.kind === kind), kind);
  for (const rarity of ["common", "rare", "exceptional"]) assert.ok(BAG.some((t) => t.rarity === rarity), rarity);
  assert.ok(BAG.some((t) => t.hidden));
  // у каждого полюса каждого признака есть черты рождения
  for (const s of SIGNS) {
    for (const dir of [1, -1]) assert.ok(BAG.filter((t) => t.kind === "born" && (t.vec[s.id] ?? 0) * dir > 0).length >= 3, `${s.id} ${dir}`);
  }
  // у каждой натуры есть из чего взять якоря, дальний якорь и противоречие
  for (const n of NATURES) {
    const born = BAG.filter((t) => t.kind === "born");
    for (const c of n.crystals) assert.ok(born.filter((t) => cos(t.vec, c) > 0).length >= 3, `${n.id}: якоря`);
    assert.ok(born.filter((t) => isFar(n, t)).length >= 5 && born.filter((t) => isContra(n, t)).length >= 5, `${n.id}: дальняя область и противоречие`);
  }
});

// ---------- рост древа ----------

test("детерминизм: одно семя — тот же человек и та же партия, другое семя — другие", () => {
  const n = natureById("sluzhily");
  assert.deepEqual(rollPerson("а", n), rollPerson("а", n));
  assert.deepEqual(growParty("партия", 10), growParty("партия", 10));
  assert.notDeepEqual(ids(rollPerson("а", n)), ids(rollPerson("б", n)));
  assert.equal(new Set(Array.from({ length: 20 }, (_, i) => ids(rollPerson(`с${i}`, n)).join())).size, 20, "двадцать рероллов — двадцать разных наборов");
  assert.throws(() => natureById("net_takoy"), /Нет натуры/);
  assert.throws(() => bagTrait("net_takoy"), /нет черты/);
});

test("человек при рождении: черт от birthMin до birthMax, без повторов, только черты рождения", () => {
  for (const n of NATURES) {
    for (let i = 0; i < 10; i++) {
      const p = growPerson(new Rng(`${n.id}-${i}`), n);
      assert.ok(p.traits.length >= BALANCE.natura.birthMin && p.traits.length <= BALANCE.natura.birthMax, `${n.id}: ${p.traits.length}`);
      assert.equal(new Set(ids(p)).size, p.traits.length);
      assert.ok(p.traits.every((t) => t.kind === "born"));
    }
  }
  assert.equal(growPerson(new Rng("x"), NATURES[0], { count: 6 }).traits.length, 6);
});

test("конфликтующие черты не берутся вместе, перк — только когда есть нужная черта", () => {
  assert.ok(inConflict(bagTrait("khlebosol"), bagTrait("zimoy_snega")) && inConflict(bagTrait("zimoy_snega"), bagTrait("khlebosol")), "конфликт действует в обе стороны");
  each((p, at) => {
    for (const a of p.traits) for (const b of p.traits) assert.ok(!inConflict(a, b), `${at}: ${a.id} и ${b.id}`);
    p.traits.forEach((t, i) => {
      if (t.requires) assert.ok(p.traits.slice(0, i).some((x) => t.requires!.includes(x.id)), `${at}: перк ${t.id} раньше своей черты`);
    });
  }, 600);
});

test("якоря: от разных точек кристаллизации ядра, и один — из дальней области, действительно далёкий от ядра", () => {
  each((p, at) => {
    assert.equal(p.anchors.length, BALANCE.natura.anchorsNear, at);
    assert.equal(new Set(p.anchors).size, p.anchors.length, at);
    for (const id of p.anchors) assert.ok(p.nature.crystals.some((c) => cos(bagTrait(id).vec, c) > 0), `${at}: якорь ${id} не у точки кристаллизации`);
    assert.ok(p.far && ids(p).includes(p.far), `${at}: дальнего якоря нет`);
    assert.ok(Math.abs(cos(p.nature.core, bagTrait(p.far).vec)) <= BALANCE.natura.farCos, `${at}: дальний якорь ${p.far} близок к ядру`);
    assert.ok(!p.anchors.includes(p.far), at);
  });
});

test("обязательное противоречие: у каждого есть черта против ядра натуры", () => {
  each((p, at) => {
    assert.ok(p.contra && ids(p).includes(p.contra), `${at}: противоречия нет`);
    assert.ok(cos(p.nature.core, bagTrait(p.contra).vec) <= -BALANCE.natura.contraCos, `${at}: ${p.contra} не против ядра`);
  });
});

test("насыщение снижает вес: чем сильнее признак уже набран, тем слабее тянет новую черту того же полюса", () => {
  const n = natureById("brodyaga"); // ядро без Порядка+ и Прямоты
  const t = bagTrait("vsyo_po_polkam"), none = saturation(n, [], bagTrait("pomnit_rodstvo"));
  const one = saturation(n, [bagTrait("derzhit_slovo")], t), two = saturation(n, [bagTrait("derzhit_slovo"), bagTrait("glaz_almaz")], t);
  assert.equal(none, 1, "признак не набран — насыщения нет");
  assert.ok(two < one && one < 1, `${two} < ${one} < 1`);
  assert.equal(saturation(n, [bagTrait("volny_veter")], t), saturation(n, [], t), "противоположный полюс не насыщает");
  assert.ok(candidateWeight(n, [bagTrait("derzhit_slovo")], t, t.vec) < candidateWeight(natureById("igrok"), [], t, t.vec));
  setAt("natura.satK", 0);
  assert.equal(saturation(n, [bagTrait("derzhit_slovo")], t), 1, "ручка на нуле — насыщение выключено");
});

test("вес кандидата: близость к якорю, редкость, события жизни и повтор в партии", () => {
  const n = natureById("igrok"), w = (id: string, target?: SignVec, opts = {}) => candidateWeight(n, [], bagTrait(id), target, opts);
  assert.ok(w("vsyo_po_polkam", { poryadok: 1 }) > w("pomnit_rodstvo", { poryadok: 1 }), "близкая к якорю весит больше");
  assert.ok(w("kamennoe_serdtse") < w("poslednyuyu_rubakhu") && w("poslednyuyu_rubakhu") < w("pomnit_rodstvo"), "исключительная < редкая < обычная");
  assert.ok(w("chtit_primety", undefined, { events: [{ vera: 2 }] }) > w("chtit_primety"), "событие тянет к своему признаку");
  assert.ok(w("chtit_primety", undefined, { events: [{ vera: -2 }] }) < w("chtit_primety"), "и отталкивает от противоположного");
  const taken = new Map([["pomnit_rodstvo", 2]]);
  assert.equal(w("pomnit_rodstvo", undefined, { taken }), w("pomnit_rodstvo") * BALANCE.natura.repeatPenalty ** 2);
});

test("события жизни тянут рост: одна натура в разных судьбах вырастает по-разному", () => {
  const n = natureById("tikhonya");
  const share = (events: SignVec[]) => {
    let hits = 0;
    for (let i = 0; i < 200; i++) if (growPerson(new Rng(`судьба-${i}`), n, { events }).signs.vera > 0) hits++;
    return hits / 200;
  };
  const pious = share([{ vera: 2 }, { vera: 2 }]), sober = share([{ vera: -2 }, { vera: -2 }]);
  assert.ok(pious > sober + 0.2, `${pious} против ${sober}`);
});

test("штраф за повтор в партии: черты у людей одной партии совпадают реже, чем у выращенных поодиночке", () => {
  const same = Array.from({ length: 10 }, () => "sluzhily");
  const overlap = (people: NaturaPerson[]) => {
    let s = 0, k = 0;
    for (let a = 0; a < people.length; a++) for (let b = a + 1; b < people.length; b++) { s += jaccard(new Set(ids(people[a])), new Set(ids(people[b]))); k++; }
    return s / k;
  };
  let party = 0, alone = 0;
  for (let i = 0; i < 20; i++) {
    party += overlap(growParty(`п${i}`, 10, same));
    setAt("natura.repeatPenalty", 1);
    alone += overlap(growParty(`п${i}`, 10, same));
    resetBalance();
  }
  assert.ok(party < alone, `${party} против ${alone}`);
  assert.equal(new Set(growParty("разные", 10).map((p) => p.nature.id)).size, 10, "без списка натуры в партии не повторяются");
});

test("жизнь: дорастают черты жизни и перки, признаки и склонности пересчитываются", () => {
  const p = growPerson(new Rng("жизнь"), natureById("khozyain"));
  const before = p.traits.length;
  const t = growLife(new Rng("жизнь-2"), p, { events: [{ poryadok: 2 }] });
  assert.ok(t && t.kind !== "born" && p.traits.length === before + 1 && p.events.length === 1);
  assert.deepEqual(p.signs, signsOf(p.nature, p.traits));
  assert.deepEqual(p.star, businessStar(p.signs));
  setAt("natura.lifeSteps", 3);
  assert.equal(rollPerson("долгая жизнь", natureById("khozyain")).traits.filter((x) => x.kind !== "born").length, 3);
});

// ---------- признаки и деловые склонности ----------

test("признаки: ядро натуры плюс векторы черт, в шкале −5…+5", () => {
  const n = natureById("sluzhily");
  assert.equal(signsOf(n, []).poryadok, 3);
  assert.equal(signsOf(n, [bagTrait("derzhit_slovo")]).poryadok, 4);
  assert.equal(signsOf(n, [bagTrait("derzhit_slovo")]).chestnost, SIGN_MAX, "зажато в шкалу");
  assert.equal(signsOf(n, [bagTrait("volny_veter")]).privyazannost, -1);
  each((p, at) => assert.ok(Object.values(p.signs).every((v) => v >= -SIGN_MAX && v <= SIGN_MAX), at));
});

test("деловые склонности считаются из признаков по весам-ручкам и остаются в шкале звезды", () => {
  const zero = Object.fromEntries(SIGNS.map((s) => [s.id, 0])) as NaturaPerson["signs"];
  assert.deepEqual(businessStar(zero), { dolg: 5, vygoda: 5, zabota: 5, derzost: 5 + BALANCE.natura.shift.derzost, obychai: 5 });
  assert.equal(businessStar({ ...zero, poryadok: 4 }).dolg, 5 + 4 * BALANCE.natura.w.dolg.poryadok);
  assert.equal(businessStar({ ...zero, shchedrost: -5 }).vygoda, 7, "скупость поднимает Выгоду");
  setAt("natura.w.dolg.poryadok", 1);
  assert.equal(businessStar({ ...zero, poryadok: 4 }).dolg, 9, "ручка действует сразу");
  resetBalance();
  each((p, at) => assert.ok(AXES.every((a) => p.star[a] >= 0 && p.star[a] <= 10), at));
  // натура читается в склонностях: у Служилого ведущая чаще всего Долг, у Торгаша — Выгода
  const top = (id: string) => {
    const stars = Array.from({ length: 60 }, (_, i) => rollPerson(`${id}-${i}`, natureById(id)).star);
    return AXES.reduce((best, a) => (stars.filter((s) => AXES.every((x) => s[a] >= s[x])).length > stars.filter((s) => AXES.every((x) => s[best] >= s[x])).length ? a : best), AXES[0]);
  };
  assert.deepEqual([top("sluzhily"), top("torgash"), top("zastupnik"), top("igrok"), top("revnitel")], ["dolg", "vygoda", "zabota", "derzost", "obychai"]);
});

// ---------- метрики ----------

test("метрики раздела 6: на тысяче рероллов цели выполнены, предупреждений нет", () => {
  const m = naturaMetrics(1000);
  const G = BALANCE.natura.goal;
  assert.deepEqual(naturaWarnings(m), []);
  assert.ok(m.jaccard <= G.jaccard && m.nn >= G.nnMin && m.nn <= G.nnMax, `похожесть ${m.jaccard}, различимость ${m.nn}`);
  assert.deepEqual(m.never, []);
  assert.ok(m.commonMax.share <= G.commonShare, JSON.stringify(m.commonMax));
  assert.deepEqual(naturaMetrics(200, "а"), naturaMetrics(200, "а"), "метрики зависят только от семени");
});

test("предупреждения появляются, когда цель не выполнена", () => {
  setAt("natura.temperature", 4);
  setAt("natura.corePull", 0);
  const loose = naturaWarnings(naturaMetrics(300));
  assert.ok(loose.some((x) => x.startsWith("натуры сливаются")), loose.join("; "));
  resetBalance();
  setAt("natura.goal.commonShare", 0.05);
  setAt("natura.goal.jaccard", 0.1);
  const strict = naturaWarnings(naturaMetrics(300));
  assert.ok(strict.some((x) => x.includes("слишком часто")) && strict.some((x) => x.includes("слишком похожи")), strict.join("; "));
});

test("совет натуру не зовёт: генератор стоит отдельно", async () => {
  const { readFileSync } = await import("node:fs");
  for (const f of ["src/sim/sim.ts", "src/ui/main.ts"]) assert.ok(!/natura/.test(readFileSync(f, "utf8")), f);
});
