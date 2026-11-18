// Совет без экрана: детерминизм и генерация партии — наследство, покровители, люди, должности, слова (src/sim/council/generate.ts, know.ts).
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { AXES, ASPIRATIONS, POSTS } from "../src/data/core";
import { BALANCE, resetBalance, setAt } from "../src/sim/balance";
import { newWorld, patronOf, patronText } from "../src/sim/council/generate";
import { runSeason } from "../src/sim/season";
import { assign, giveOrder } from "../src/sim/council/staff";
import { talk } from "../src/sim/council/talk";
import { holder, fitness, isStale } from "../src/sim/state";
import { expWord, relWord, loyaltyWord } from "../src/sim/council/know";
import { dump, fix } from "./_world";
import { SEEDS, postIds, free } from "./_council";

afterEach(() => resetBalance());

// ---------- детерминизм ----------

test("одно семя — одна и та же партия", () => {
  for (const seed of SEEDS.slice(0, 4)) {
    for (const lab of [false, true]) {
      const a = newWorld(seed, lab), b = newWorld(seed, lab);
      assert.equal(dump(a), dump(b), `генерация, семя ${seed}`);
      for (let i = 0; i < 12; i++) { runSeason(a); runSeason(b); }
      assert.equal(dump(a), dump(b), `12 сезонов, семя ${seed}`);
    }
  }
});

test("одно семя и одни действия игрока — одна и та же партия", () => {
  const play = () => {
    const w = newWorld("перестановки");
    for (let s = 0; s < 10; s++) {
      talk(w, s % 10);
      if (s % 3 === 0) assign(w, (s * 7) % 10, postIds[s % 5]);
      if (s % 4 === 1) giveOrder(w, (s * 3) % 10, AXES[s % 5]);
      runSeason(w);
    }
    return dump(w);
  };
  assert.equal(play(), play());
});

test("разные семена — разные партии", () => {
  const dumps = SEEDS.map((seed) => dump({ ...newWorld(seed), seed: "" }));
  assert.equal(new Set(dumps).size, SEEDS.length);
});

test("ручка действует сразу: логика читает BALANCE заново", () => {
  const w = newWorld("ручка");
  const events = () => w.log.filter((e) => e.kind === "event").length;
  runSeason(w);
  assert.equal(events(), 3);
  setAt("season.events", 1);
  runSeason(w);
  assert.equal(events(), 4);
  setAt("exp.staleFrom", 4);
  const p = fix(holder(w, "pisar")!, ["dolg"]);
  assert.equal(isStale(p), true);
  setAt("exp.staleFrom", 60);
  assert.equal(isStale(p), false);
});

// ---------- генерация ----------

test("наследство прежних баронов: одна-две должности на старте заняты не по годности, причина видна, одно семя — одна расстановка", () => {
  const seen = new Set<number>(), hows = new Set<string>();
  for (let i = 0; i < 60; i++) {
    const seed = `наследство-${i}`, w = newWorld(seed);
    assert.equal(dump(w), dump(newWorld(seed)), `${seed}: расстановка та же`);
    setAt("staff.legacyMin", 0); setAt("staff.legacyMax", 0);
    const plain = newWorld(seed);   // тот же совет, но весь по годности
    resetBalance();
    assert.equal(plain.legacy.length, 0);
    assert.ok(plain.log[0].lines[0].includes("Все сидят по годности"));
    const changed = POSTS.filter((d) => holder(w, d.id)!.id !== holder(plain, d.id)!.id).map((d) => d.id);
    assert.ok(changed.length >= 1 && changed.length <= 2, `${seed}: не по годности ${changed.length}`);
    assert.deepEqual(w.legacy.map((l) => l.post).sort(), [...changed].sort());
    assert.equal(w.people.filter((p) => p.post).length, POSTS.length, "пустых должностей нет");
    assert.ok(w.head != null && w.people[w.head].post, "главный — из совета");
    for (const l of w.legacy) {
      const p = holder(w, l.post)!, best = holder(plain, l.post)!;
      assert.ok(fitness(p, l.post) < fitness(best, l.post), `${seed}, ${l.post}: посаженный годен меньше обойдённого`);
      assert.equal(w.people[best.id].post, undefined, "обойдённый остался без должности");
      assert.equal(p.tenure, best.tenure, "сидит так же давно");
      assert.ok(p.bio[p.bio.length - 1].includes(l.how) && !/[{}]/.test(p.bio[p.bio.length - 1]), "причина — строкой в биографии");
      assert.ok(w.log[0].lines.some((x) => x.includes(p.name) && x.includes(l.how) && x.includes("не по годности")), "и в летописи старта");
      if (l.how === "по старшинству") assert.ok(w.people.filter((x) => !x.post && !plain.people[x.id].post).every((x) => x.age <= p.age), "по старшинству — самый старый из свободных");
      hows.add(l.how);
    }
    seen.add(changed.length);
  }
  assert.deepEqual([...seen].sort(), [1, 2], "бывает и одна, и две");
  assert.deepEqual([...hows].sort(), ["по милости", "по родству", "по старшинству"]);
});

test("покровитель: снять посаженного прежним бароном — обижен покровитель; по уговору мягче; обычного снять — никого не задевает", () => {
  const kinds = new Set<string>();
  for (let i = 0; i < 40; i++) {
    const seed = `покровитель-${i}`;
    for (const agreed of [false, true]) {
      const w = newWorld(seed), l = w.legacy[0], p = holder(w, l.post)!;
      assert.equal(patronOf(w, p), l);
      assert.ok((l.side != null) !== (l.person != null), "покровитель — сторона или человек");
      assert.ok(p.bio[p.bio.length - 1].includes(patronText(w, l)) && w.log[0].lines.some((x) => x.includes(patronText(w, l))), "покровитель виден в биографии и летописи");
      const trust = { ...w.factions }, loyalty = w.people.map((x) => x.loyalty);
      w.authority = 30; p.agreed = agreed;
      assert.ok(assign(w, p.id, null));
      const soft = agreed ? BALANCE.staff.patronAgreed : 1;
      if (l.side) {
        assert.equal(Math.round((trust[l.side] - w.factions[l.side]) * 10) / 10, BALANCE.staff.patronTrust * soft, `${seed}: доверие стороны-покровителя`);
        assert.equal(l.side, { "по родству": l.side === "brod" ? "brod" : "opushka", "по старшинству": "zamok", "по милости": "dvor" }[l.how]);
      } else {
        assert.equal(l.how, "по родству");
        assert.ok(l.person !== p.id);
        assert.equal(Math.round((loyalty[l.person!] - w.people[l.person!].loyalty) * 10) / 10, BALANCE.staff.patronLoyalty * soft, `${seed}: отношение покровителя`);
      }
      assert.ok(w.log[w.log.length - 1].lines.some((x) => x.includes(`За ${p.name} стоял`)));
      assert.ok(!w.legacy.includes(l) && !patronOf(w, p), "запись о наследстве ушла вместе с должностью");
      kinds.add(l.side ? "сторона" : "человек");
    }
    // обычный держатель: ни доверие сторон, ни чужое отношение к Сенешалю не меняются
    const w = newWorld(seed), plainPost = POSTS.find((d) => !w.legacy.some((l) => l.post === d.id))!.id, q = holder(w, plainPost)!;
    const trust = { ...w.factions }, loyalty = w.people.map((x) => x.loyalty);
    w.authority = 30;
    assert.ok(assign(w, q.id, null));
    assert.deepEqual(w.factions, trust, `${seed}: стороны не задеты`);
    assert.ok(w.people.every((x) => x.id === q.id || x.loyalty === loyalty[x.id]), `${seed}: люди не задеты`);
    assert.ok(!w.log[w.log.length - 1].lines.some((x) => x.includes("стоял")));
  }
  assert.deepEqual([...kinds].sort(), ["сторона", "человек"]);
});

test("покровитель: посаженного сменили другим человеком — покровитель обижен так же", () => {
  const w = newWorld("покровитель-смена"), l = w.legacy[0], p = holder(w, l.post)!, other = w.people.find((x) => !x.post && x.id !== l.person)!;
  const before = l.side ? w.factions[l.side] : w.people[l.person!].loyalty;
  w.authority = 30;
  assert.ok(assign(w, other.id, l.post));
  const after = l.side ? w.factions[l.side] : w.people[l.person!].loyalty;
  assert.equal(Math.round((before - after) * 10) / 10, l.side ? BALANCE.staff.patronTrust : BALANCE.staff.patronLoyalty);
  assert.equal(holder(w, l.post)!.id, other.id);
  assert.ok(!w.log[w.log.length - 1].lines.some((x) => x.includes(`За ${other.name}`)), `у ${p.name} был покровитель, у сменщика его нет`);
});

test("генерация: 10 персонажей с биографией и стремлением, звезда в пределах 0–10", () => {
  for (const seed of SEEDS) {
    const w = newWorld(seed);
    assert.equal(w.people.length, 10);
    for (const p of w.people) {
      const seated = w.legacy.some((l) => holder(w, l.post) === p) ? 1 : 0;   // посаженному прежним бароном — строка о том, как он получил должность
      assert.equal(p.bio.length, BALANCE.star.backstoryCount + seated, `${seed}, ${p.name}: событий в биографии`);
      assert.ok(p.bio.every((line) => line.length > 10 && !/[{}]/.test(line)), `${seed}, ${p.name}: в биографии осталась подстановка`);
      assert.ok(p.aspiration && ASPIRATIONS.includes(p.aspiration), `${seed}, ${p.name}: стремление`);
      for (const a of AXES) assert.ok(p.star[a] >= 0 && p.star[a] <= 10, `${seed}, ${p.name}: ${a} = ${p.star[a]}`);
      assert.deepEqual(p.star, p.startStar);
      assert.ok(p.loyalty >= -10 && p.loyalty <= 10 && p.know.talks === 0 && p.decisions === 0);
    }
  }
});

test("генерация: все пять должностей заняты разными людьми, главный — из совета, отношения у каждой пары", () => {
  for (const seed of SEEDS) {
    const w = newWorld(seed);
    const council = postIds.map((post) => holder(w, post));
    assert.ok(council.every((p, i) => p && p.post === postIds[i]), seed);
    assert.equal(new Set(council.map((p) => p!.id)).size, 5);
    assert.ok(w.head != null && w.people[w.head].post, `${seed}: главный`);
    assert.equal(w.rel.size, 45);
    assert.ok([...w.rel.values()].every((v) => v >= -10 && v <= 10));
    assert.equal(w.authority, BALANCE.staff.authorityStart);
    assert.equal(w.deedsLeft, BALANCE.season.deeds);
    for (const p of council) assert.ok(p!.tenure >= BALANCE.staff.startTenureMin && p!.tenure <= BALANCE.staff.startTenureMax);
  }
});

test("границы звезды ключевого персонажа соблюдаются: у Веданы Обычай не ниже 5", () => {
  for (const seed of SEEDS) assert.ok(newWorld(seed).people.find((p) => p.name === "Ведана")!.star.obychai >= 5, seed);
});

test("слова отношений, лояльности и опыта переключаются на порогах", () => {
  assert.deepEqual([6, 2, 0, -2, -6].map(relWord), ["заодно", "ладят", "терпят", "соперники", "враги"]);
  assert.deepEqual([6, 2, 0, -2, -6].map(loyaltyWord), ["предан", "доверяет", "служит", "недоволен", "озлоблен"]);
  const w = newWorld("слова");
  const p = holder(w, "pisar")!;
  const word = (exp: number) => { p.exp = exp; return expWord(p); };
  assert.deepEqual([0, 3, 4, 9, 10].map(word), ["новичок", "новичок", "освоился", "освоился", "мастер"]);
  assert.equal(expWord(free(w)[0]), "—");
});
