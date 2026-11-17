// Логика совета без экрана: генерация, детерминизм, перестановки, исходы споров, длинные прогоны.
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { AXES, ASPIRATIONS, POSTS } from "../src/data/core";
import { EVENTS } from "../src/data/events";
import { BALANCE, resetBalance, setAt } from "../src/sim/balance";
import {
  newWorld, runSeason, runEvent, assign, assignCost, talk, giveOrder, holder, getRel, setRel, fitness, isStale, expWord,
  relWord, loyaltyWord, type Person, type World,
} from "../src/sim/sim";
import { dump, fix, pair } from "./_world";

const SEEDS = ["замок", "лес", "герцог", "test", "7", "осень-3", "Ведана", "x"];
const postIds = POSTS.map((p) => p.id);
const event = (id: string) => EVENTS.find((e) => e.id === id)!;
const said = (lines: string[], part: string) => lines.some((l) => l.includes(part));
const free = (w: World) => w.people.filter((p) => !p.post);
const wants = (post: string) => ASPIRATIONS.find((a) => a.post === post)!;

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

test("генерация: 10 персонажей с биографией и стремлением, звезда в пределах 0–10", () => {
  for (const seed of SEEDS) {
    const w = newWorld(seed);
    assert.equal(w.people.length, 10);
    for (const p of w.people) {
      assert.equal(p.bio.length, BALANCE.star.backstoryCount, `${seed}, ${p.name}: событий в биографии`);
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
  talk(w, 0); talk(w, 0);
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
    assert.equal(w.factions.derevni, 2.5);
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
    assert.deepEqual(e.effects, { poryadok: 2, kuptsy: 1, derevni: -1 });
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

test("спор: враги — саботаж: дело сделано на треть, порядок падает, жалобы с обеих сторон", () => {
  for (const seed of SEEDS) {
    const w = newWorld(seed);
    const [a, b] = pair(w, "starosta", ["zabota", "obychai"], "desyatnik", ["dolg"], -8);
    a.tenure = 60; // староста заведомо сильнее в споре: стаж
    setAt("council.sabotageChance", 1);
    const e = runEvent(w, event("plotina"));
    assert.ok(said(e.lines, "Саботаж") && said(e.lines, "Жалобы с обеих сторон"), `${seed}: ${e.lines.join(" | ")}`);
    assert.deepEqual(e.effects, { derevni: 0.6, poryadok: -1.3 });
    assert.equal(w.resources.poryadok, -1.3);
    assert.equal(getRel(w, a.id, b.id), -9);
    assert.deepEqual([a.decisions, b.decisions], [1, 0]);
  }
});

test("спор: враги, но саботажа не случилось — проигравший смолчал, дело сделано целиком", () => {
  const w = newWorld("смолчал");
  const [a, b] = pair(w, "starosta", ["zabota", "obychai"], "desyatnik", ["dolg"], -8);
  a.tenure = 60;
  setAt("council.sabotageChance", 0);
  const e = runEvent(w, event("plotina"));
  assert.ok(said(e.lines, "смолчал") && !said(e.lines, "Саботаж"));
  assert.deepEqual(e.effects, { derevni: 2, poryadok: -1 });
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
  assert.deepEqual(half.e.effects, { derevni: 1.4, poryadok: -0.7 });
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
