// Генератор натур (задача И8): данные мешка, рост древа, деловые склонности из признаков, метрики. Совет он не трогает.
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import type { SignVec } from "../src/data/types";
import { AXES, LIFE_TRAITS } from "../src/data/core";
import { BACKSTORY } from "../src/data/backstory";
import { SIGNS, NATURES, BAG } from "../src/data/natura";
import { BALANCE, resetBalance, setAt } from "../src/sim/balance";
import { Rng } from "../src/sim/rng";
import {
  growPerson, growLife, growParty, rollPerson, signsOf, businessStar, saturation, candidateWeight, inConflict, isFar, isContra, cos,
  bagTrait, natureById, eventVec, beforeCount, SIGN_MAX, TRIGGERS, type NaturaPerson,
} from "../src/sim/natura";
import { naturaMetrics, naturaWarnings, jaccard, rollAll } from "../src/sim/natura-report";

afterEach(() => resetBalance());

const signIds = SIGNS.map((s) => s.id) as string[];
const vecOk = (v: SignVec) => Object.keys(v).every((key) => signIds.includes(key)) && Object.values(v).every((x) => Number.isInteger(x) && x !== 0);
const ids = (p: NaturaPerson) => p.traits.map((t) => t.id);
const each = (fn: (p: NaturaPerson, at: string) => void, rolls = 300) => rollAll(rolls, "тест").forEach((p, i) => fn(p, `${p.nature.id} №${i}`));

// ---------- данные ----------

test("данные натуры: 12 признаков, 30 натур с ядром и точками кристаллизации, мешок больше сотни черт и перков", () => {
  assert.equal(SIGNS.length, 12);
  assert.equal(NATURES.length, 30);
  assert.ok(BAG.length >= 120);
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

test("мешок: вектор из 1–3 признаков, описание и действие есть, ссылки ведут на существующее, у нажитого есть повод", () => {
  for (const t of BAG) {
    const n = Object.keys(t.vec).length;
    assert.ok(/^[a-z_]+$/.test(t.id) && t.name && t.desc && t.effect && t.source.length, t.id);
    assert.ok(vecOk(t.vec) && n >= 1 && n <= 3, `${t.id}: вектор`);
    for (const id of [...(t.conflicts ?? []), ...(t.requires ?? []), ...(t.replaces ?? [])]) assert.ok(BAG.some((x) => x.id === id), `${t.id} → ${id}`);
    assert.ok(!t.conflicts?.includes(t.id) && !t.requires?.some((id) => t.conflicts?.includes(id)), t.id);
    assert.equal(!!t.requires, t.kind === "perk", `${t.id}: requires — у перков и только у них`);
    assert.equal(!!t.trigger, t.kind !== "born", `${t.id}: повод — у нажитых и перков, у врождённых его нет`);
    if (t.trigger) assert.ok(TRIGGERS.includes(t.trigger), t.id);
    assert.equal(t.source.includes("birth"), t.kind === "born", `${t.id}: source`);
    if (t.source.includes("backstory")) assert.equal(t.kind, "life", `${t.id}: до игры наживаются только черты, не перки`);
    for (const id of t.replaces ?? []) assert.equal(bagTrait(id).kind, "life", `${t.id} вытесняет ${id}: вытеснить можно только нажитое`);
    if (t.replaces) assert.equal(t.kind, "life", `${t.id}: вытесняет только нажитая черта`);
  }
  for (const kind of ["born", "life", "perk"]) assert.ok(BAG.some((t) => t.kind === kind), kind);
  for (const rarity of ["common", "rare", "exceptional"]) assert.ok(BAG.some((t) => t.rarity === rarity), rarity);
  for (const trigger of TRIGGERS) assert.ok(BAG.filter((t) => t.kind === "life" && t.trigger === trigger).length >= 5, `повод ${trigger}`);
  assert.ok(BAG.some((t) => t.hidden));
  const count = (kind: string) => BAG.filter((t) => t.kind === kind).length;
  assert.ok(count("life") > count("born"), "нажитых черт в мешке больше, чем врождённых");
  assert.ok(count("perk") >= 20);
  // перк достижим: среди требуемых черт есть не перк
  for (const t of BAG.filter((x) => x.requires)) assert.ok(t.requires!.some((id) => bagTrait(id).kind !== "perk"), t.id);
  // у каждой натуры есть из чего взять якоря, дальний якорь и противоречие
  for (const n of NATURES) {
    for (const c of n.crystals) assert.ok(BAG.filter((t) => t.kind === "born" && cos(t.vec, c) > 0).length >= 2, `${n.id}: врождённые якоря`);
    const life = BAG.filter((t) => t.kind === "life");
    assert.ok(life.filter((t) => isFar(n, t)).length >= 5 && life.filter((t) => isContra(n, t)).length >= 5, `${n.id}: дальняя область и противоречие`);
  }
});

test("одна система черт: каждая черта жизни совета есть в мешке под тем же id", () => {
  for (const t of LIFE_TRAITS) {
    const b = BAG.find((x) => x.id === t.id);
    assert.ok(b && b.kind === "life" && b.council, `${t.id}: нет в мешке`);
    assert.ok(b.name.startsWith(t.name), `${t.id}: название «${b.name}» против «${t.name}»`);
    const trigger = { habit: "habit", post: "post", rel: "rel", break: "break" }[t.source as string];
    assert.equal(b.trigger, trigger, `${t.id}: повод`);
  }
  assert.equal(BAG.filter((t) => t.council).length, LIFE_TRAITS.length);
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

test("три происхождения: врождённых одна-две, нажитых до игры тем больше, чем старше человек", () => {
  const N = BALANCE.natura;
  assert.deepEqual([30, 54, 55, 80, 130, 200].map(beforeCount), [2, 2, 3, 4, 6, 6]);
  assert.equal(beforeCount(10), N.beforeMin, "моложе взрослого — как у только что повзрослевшего");
  for (const n of NATURES) {
    for (const age of [30, 60, 120]) {
      const p = growPerson(new Rng(`${n.id}-${age}`), n, { age });
      const born = p.traits.filter((t) => t.kind === "born"), life = p.traits.filter((t) => t.kind === "life");
      assert.equal(p.age, age);
      assert.ok(born.length >= N.innateMin && born.length <= N.innateMax, `${n.id}: врождённых ${born.length}`);
      assert.equal(life.length, beforeCount(age), `${n.id}, ${age} лет: нажитых ${life.length}`);
      assert.equal(p.traits.length, born.length + life.length, "перков до игры нет");
      assert.equal(new Set(ids(p)).size, p.traits.length);
      assert.deepEqual(p.anchors, born.map((t) => t.id), "врождённые черты — якоря");
      for (const t of life) assert.ok(BACKSTORY.some((ev) => ev.id === p.via[t.id]), `${t.id}: нажитая до игры черта пришла из события предыстории`);
    }
  }
  const young = rollAll(300, "молодые").filter((p) => p.age < 60), old = rollAll(300, "молодые").filter((p) => p.age > 120);
  const avg = (ps: NaturaPerson[]) => ps.reduce((s, p) => s + p.traits.length, 0) / ps.length;
  assert.ok(avg(old) > avg(young) + 2, `старые ${avg(old)}, молодые ${avg(young)}`);
});

test("событие предыстории предлагает короткий список: черта близка к событию, одна судьба — похожие люди разных натур", () => {
  for (const ev of BACKSTORY) assert.ok(Object.keys(eventVec(ev)).length >= 1, `${ev.id}: у события нет вектора в признаках`);
  const pious = BACKSTORY.find((ev) => ev.id === "babka_znakharka")!;
  assert.ok((eventVec(pious).vera ?? 0) > 0, "знахарка тянет к вере");
  const story = [BACKSTORY[0], pious, pious, pious];
  const vera = (events: typeof story) => {
    let sum = 0;
    for (let i = 0; i < 100; i++) sum += growPerson(new Rng(`судьба-${i}`), natureById("tikhonya"), { age: 80, backstory: events }).signs.vera;
    return sum / 100;
  };
  const other = BACKSTORY.find((ev) => ev.id === "kontrabanda")!;
  assert.ok(vera(story) > vera([BACKSTORY[0], other, other, other]) + 1, `${vera(story)}`);
  const p = growPerson(new Rng("короткий список"), natureById("tikhonya"), { age: 80, backstory: story });
  assert.deepEqual(Object.values(p.via), story.map((ev) => ev.id));
});

test("конфликтующие черты не берутся вместе, перк — только когда есть нужная черта", () => {
  assert.ok(inConflict(bagTrait("khlebosol"), bagTrait("zimoy_snega")) && inConflict(bagTrait("zimoy_snega"), bagTrait("khlebosol")), "конфликт действует в обе стороны");
  setAt("natura.lifeSteps", 4);
  each((p, at) => {
    for (const a of p.traits) for (const b of p.traits) assert.ok(!inConflict(a, b), `${at}: ${a.id} и ${b.id}`);
    p.traits.forEach((t, i) => {
      if (t.requires) assert.ok(p.traits.slice(0, i).some((x) => t.requires!.includes(x.id)) || p.lost.some((id) => t.requires!.includes(id)), `${at}: перк ${t.id} раньше своей черты`);
    });
  }, 600);
});

test("якоря: врождённые — от разных точек кристаллизации ядра, дальний — нажитая черта, действительно далёкая от ядра", () => {
  each((p, at) => {
    assert.equal(new Set(p.anchors).size, p.anchors.length, at);
    for (const id of p.anchors) assert.ok(bagTrait(id).kind === "born" && p.nature.crystals.some((c) => cos(bagTrait(id).vec, c) > 0), `${at}: якорь ${id} не у точки кристаллизации`);
    assert.ok(p.far && bagTrait(p.far).kind === "life", `${at}: дальнего якоря нет`);
    assert.ok(Math.abs(cos(p.nature.core, bagTrait(p.far).vec)) <= BALANCE.natura.farCos, `${at}: дальний якорь ${p.far} близок к ядру`);
    assert.ok(!p.anchors.includes(p.far), at);
  });
});

test("обязательное противоречие: у каждого есть черта против ядра натуры", () => {
  each((p, at) => {
    assert.ok(p.contra && (ids(p).includes(p.contra) || p.lost.includes(p.contra)), `${at}: противоречия нет`);
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

test("жизнь в игре: черта или перк по поводу, признаки и склонности пересчитываются", () => {
  for (const trigger of TRIGGERS) {
    const p = growPerson(new Rng(`жизнь-${trigger}`), natureById("khozyain"), { age: 60 });
    const before = p.traits.length;
    const t = growLife(new Rng("жизнь-2"), p, { trigger, events: [{ poryadok: 2 }] });
    assert.ok(t && t.kind !== "born" && t.trigger === trigger, `${trigger}: ${t?.id}`);
    assert.ok(p.traits.length === before + 1 - p.lost.length && p.inGame.includes(t.id) && p.events.length === 1);
    assert.deepEqual(p.signs, signsOf(p.nature, p.traits));
    assert.deepEqual(p.star, businessStar(p.signs));
  }
  setAt("natura.lifeSteps", 3);
  assert.equal(rollPerson("долгая жизнь", natureById("khozyain")).inGame.length, 3);
  setAt("natura.lifeSteps", 6);
  const perks = rollAll(300, "перки").filter((p) => p.traits.some((t) => t.kind === "perk")).length;
  assert.ok(perks > 100, `за шесть поводов перк нажил хотя бы каждый третий: ${perks} из 300`);
});

test("замещение: нажитая черта вытесняет противоположную нажитую, врождённую и якоря — нет", () => {
  const base = () => {
    const p = growPerson(new Rng("замещение"), natureById("khozyain"), { age: 30 });
    p.traits = p.traits.filter((t) => t.kind === "born");
    p.far = ""; p.contra = ""; p.via = {}; p.from = {};
    return p;
  };
  // «Гуляка» нажит — «Остепенился» может его вытеснить
  let swapped = 0, blocked = 0;
  for (let i = 0; i < 300; i++) {
    const p = base();
    p.traits.push(bagTrait("gulyaka"));
    const t = growLife(new Rng(`з${i}`), p, { trigger: "habit", events: [{ poryadok: 2, terpenie: 2 }] });
    if (t?.id === "ostepenilsya") {
      swapped++;
      assert.ok(!ids(p).includes("gulyaka") && p.lost.includes("gulyaka"), "старая черта ушла в утраченные");
    }
    assert.ok(!(ids(p).includes("gulyaka") && ids(p).includes("ostepenilsya")));
    // «Вольный ветер» — врождённая: с ней «Остепенился» в конфликте и не берётся вовсе
    const q = base();
    if (!ids(q).includes("volny_veter")) q.traits.push(bagTrait("volny_veter"));
    if (growLife(new Rng(`з${i}`), q, { trigger: "habit", events: [{ poryadok: 2, terpenie: 2 }] })?.id === "ostepenilsya") blocked++;
  }
  assert.ok(swapped > 0, "за триста попыток замещение случилось");
  assert.equal(blocked, 0, "врождённую черту нажитая не вытесняет");
});

// ---------- признаки и деловые склонности ----------

test("признаки: ядро плюс векторы черт, сложение убывающее — в потолок шкалы признак не упирается", () => {
  const n = natureById("sluzhily"), N = BALANCE.natura;
  const soft = (raw: number) => Math.round(SIGN_MAX * Math.tanh(raw / N.signSoft) * 10) / 10;
  assert.equal(signsOf(n, []).poryadok, soft(3 * N.coreScale));
  assert.equal(signsOf(n, [bagTrait("derzhit_slovo")]).poryadok, soft(3 * N.coreScale + 1));
  assert.equal(signsOf(n, [bagTrait("volny_veter")]).privyazannost, soft(-1));
  const one = signsOf(n, [bagTrait("derzhit_slovo")]).chestnost, two = signsOf(n, [bagTrait("derzhit_slovo"), bagTrait("rubit_pravdu")]).chestnost;
  const three = signsOf(n, [bagTrait("derzhit_slovo"), bagTrait("rubit_pravdu"), bagTrait("kak_na_dukhu")]).chestnost;
  assert.ok(one < two && two < three && three < SIGN_MAX, `${one} < ${two} < ${three} < ${SIGN_MAX}: каждая новая черта ещё что-то добавляет`);
  assert.ok(three - two < two - one, "но всё меньше");
  each((p, at) => assert.ok(Object.values(p.signs).every((v) => v > -SIGN_MAX && v < SIGN_MAX), at));
});

test("деловые склонности считаются из признаков по весам-ручкам и остаются в шкале звезды", () => {
  const zero = Object.fromEntries(SIGNS.map((s) => [s.id, 0])) as NaturaPerson["signs"];
  const N = BALANCE.natura, r1 = (v: number) => Math.round(v * 10) / 10;
  assert.deepEqual(businessStar(zero), { dolg: 5, vygoda: 5, zabota: 5, derzost: 5 + N.shift.derzost, obychai: 5 });
  assert.equal(businessStar({ ...zero, poryadok: 4 }).dolg, r1(5 + 4 * N.w.dolg.poryadok * N.axisGain));
  assert.ok(businessStar({ ...zero, shchedrost: -4 }).vygoda > 5, "скупость поднимает Выгоду");
  setAt("natura.axisGain", 1);
  setAt("natura.w.dolg.poryadok", 1);
  assert.equal(businessStar({ ...zero, poryadok: 4 }).dolg, 9, "ручка действует сразу");
  resetBalance();
  each((p, at) => assert.ok(AXES.every((a) => p.star[a] >= 0 && p.star[a] <= 10), at));
  // натура читается в склонностях: у Служилого ведущая чаще всего Долг, у Торгаша — Выгода
  const top = (id: string) => {
    const stars = Array.from({ length: 60 }, (_, i) => rollPerson(`${id}-${i}`, natureById(id)).star);
    const lead = (a: (typeof AXES)[number]) => stars.filter((s) => AXES.every((x) => s[a] >= s[x])).length;
    return AXES.reduce((best, a) => (lead(a) > lead(best) ? a : best), AXES[0]);
  };
  assert.deepEqual([top("sluzhily"), top("torgash"), top("zastupnik"), top("igrok"), top("revnitel")], ["dolg", "vygoda", "zabota", "derzost", "obychai"]);
});

// ---------- метрики ----------

test("метрики: на тысяче рероллов цели выполнены, предупреждений нет", () => {
  const m = naturaMetrics(1000);
  const G = BALANCE.natura.goal;
  assert.deepEqual(naturaWarnings(m), []);
  assert.ok(m.jaccard <= G.jaccard && m.nn >= G.nnMin && m.nn <= G.nnMax && m.signNn >= G.signNn, `похожесть ${m.jaccard}, по чертам ${m.nn}, по признакам ${m.signNn}`);
  assert.ok(m.lifeShare >= G.lifeShare && m.kinds.life + m.kinds.perk > m.kinds.born * 2, `нажитого ${m.lifeShare}: ${JSON.stringify(m.kinds)}`);
  assert.deepEqual(m.never, []);
  assert.ok(m.commonMax.share <= G.commonShare, JSON.stringify(m.commonMax));
  assert.deepEqual(naturaMetrics(200, "а"), naturaMetrics(200, "а"), "метрики зависят только от семени");
});

test("предупреждения появляются, когда цель не выполнена", () => {
  setAt("natura.coreScale", 0.2);
  setAt("natura.corePull", 0);
  setAt("natura.temperature", 4);
  const loose = naturaWarnings(naturaMetrics(300));
  assert.ok(loose.some((x) => x.startsWith("натуры сливаются")), loose.join("; "));
  resetBalance();
  setAt("natura.goal.commonShare", 0.05);
  setAt("natura.goal.lifeShare", 1);
  const strict = naturaWarnings(naturaMetrics(300));
  assert.ok(strict.some((x) => x.includes("слишком часто")) && strict.some((x) => x.startsWith("нажитого мало")), strict.join("; "));
});

test("совет натуру не зовёт: генератор стоит отдельно", async () => {
  const { readFileSync } = await import("node:fs");
  for (const f of ["src/sim/sim.ts", "src/ui/main.ts"]) assert.ok(!/natura/.test(readFileSync(f, "utf8")), f);
});
