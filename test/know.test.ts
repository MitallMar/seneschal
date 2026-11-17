// Знание о людях и черты в течение жизни (задача И4): что Сенешаль знает о человеке и как человек меняется.
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import type { Axis } from "../src/data/types";
import { AXES, ASPIRATIONS, LIFE_TRAITS, POSTS, TRAITS } from "../src/data/core";
import { EVENTS } from "../src/data/events";
import { BALANCE, resetBalance, setAt } from "../src/sim/balance";
import {
  newWorld, runSeason, runEvent, assign, talk, nextTalk, holder, getRel, setRel, topAxis, axisKnown, axisWord, fitWord, headOpinion,
  rumorCheck, forecast, traitLabel, gainTrait, breakdown, type Person, type World,
} from "../src/sim/sim";
import { fix, pair } from "./_world";

const SEEDS = ["замок", "лес", "герцог", "test", "7", "осень-3", "Ведана", "x"];
const event = (id: string) => EVENTS.find((e) => e.id === id)!;
const said = (lines: string[], part: string) => lines.some((l) => l.includes(part));
const free = (w: World) => w.people.filter((p) => !p.post);
const keyTrait = (id: string) => TRAITS.find((t) => t.id === id)!;
const has = (p: Person, id: string) => p.gained.some((g) => g.trait.id === id);
const lastLog = (w: World) => w.log.at(-1)!;
const flat = (p: Person) => { for (const a of AXES) p.star[a] = 5; return p; };

afterEach(() => resetBalance());

// ---------- первая посадка и молва ----------

test("первая посадка: о каждом известна одна вещь — молва или ключевая черта; звезда, стремление и склонности закрыты", () => {
  for (const seed of SEEDS) {
    const w = newWorld(seed);
    for (const p of w.people) {
      const at = `${seed}, ${p.name}`;
      assert.equal(!!p.rumor, !p.know.trait, `${at}: ровно одно из двух`);
      if (p.know.trait) assert.ok(p.post && !p.trait.hidden, `${at}: черта с начала известна только у члена совета и только не скрытая`);
      if (p.rumor) assert.ok(p.rumor.text.length > 8 && !/[{}]/.test(p.rumor.text), `${at}: молва «${p.rumor.text}»`);
      assert.ok(!p.know.aspiration && !p.know.axes && AXES.every((a) => !axisKnown(p, a)), at);
      assert.ok(p.gained.every((g) => !g.known), `${at}: нажитое до начала партии Сенешалю неизвестно`);
    }
    assert.ok(said(w.log[0].lines, "молва или черта"));
  }
});

test("первая посадка: ручка решает, черта или молва известна о члене совета", () => {
  setAt("know.startTraitChance", 1);
  let w = newWorld("посадка");
  for (const p of w.people.filter((x) => x.post)) assert.equal(p.know.trait, !p.trait.hidden, p.name);
  assert.ok(free(w).every((p) => p.rumor && !p.know.trait));
  setAt("know.startTraitChance", 0);
  w = newWorld("посадка");
  assert.ok(w.people.every((p) => p.rumor && !p.know.trait));
});

test("молва: верная говорит о черте или ведущей склонности, неверная — о чужой черте или слабой склонности", () => {
  setAt("know.startTraitChance", 0);
  for (const seed of SEEDS) {
    setAt("know.rumorFalseChance", 0);
    for (const p of newWorld(seed).people) {
      const r = p.rumor!;
      assert.equal(r.wrong, false);
      assert.ok(r.trait ? r.trait === p.trait.id : r.axis === topAxis(p.star), `${seed}, ${p.name}`);
    }
    setAt("know.rumorFalseChance", 1);
    for (const p of newWorld(seed).people) {
      const r = p.rumor!;
      if (!r.wrong) { assert.ok(r.axis && AXES.every((a) => p.star[a] >= BALANCE.know.notable), "не нашлось слабой оси"); continue; }
      assert.ok(r.trait ? r.trait !== p.trait.id : p.star[r.axis!] < BALANCE.know.notable, `${seed}, ${p.name}`);
    }
  }
});

test("молва проверяется, когда становится известна черта или склонность", () => {
  setAt("know.startTraitChance", 0);
  setAt("know.rumorTraitChance", 1);
  for (const [chance, verdict] of [[0, "подтвердилась"], [1, "не подтвердилась"]] as const) {
    setAt("know.rumorFalseChance", chance);
    const w = newWorld("молва");
    const p = w.people.find((x) => !x.trait.hidden)!;
    assert.equal(rumorCheck(p), "");
    talk(w, p.id);
    assert.equal(rumorCheck(p), verdict);
  }
  setAt("know.rumorTraitChance", 0);
  setAt("know.rumorFalseChance", 0);
  const p = newWorld("молва").people[0];
  assert.equal(rumorCheck(p), "");
  p.know.seen[p.rumor!.axis!] = BALANCE.know.seenToKnow;
  assert.equal(rumorCheck(p), "подтвердилась");
});

// ---------- разговоры ----------

test("разговоры открывают по порядку: ключевую черту, стремление, склонности словами; дальше говорить не о чем", () => {
  setAt("know.startTraitChance", 0);
  const w = newWorld("разговоры");
  const p = w.people.find((x) => !x.trait.hidden && !x.gained.length)!;
  assert.equal(nextTalk(p), "черты");
  talk(w, p.id);
  assert.deepEqual([p.know.trait, p.know.aspiration, p.know.axes], [true, false, false]);
  assert.ok(said(lastLog(w).lines, `«${p.trait.name}»`));
  assert.equal(nextTalk(p), "стремление");
  talk(w, p.id);
  assert.deepEqual([p.know.trait, p.know.aspiration, p.know.axes], [true, true, false]);
  assert.ok(said(lastLog(w).lines, p.aspiration!.text));
  assert.ok(AXES.every((a) => !axisKnown(p, a)));
  assert.equal(nextTalk(p), "склонности");
  talk(w, p.id);
  assert.ok(p.know.axes && AXES.every((a) => axisKnown(p, a)));
  const line = lastLog(w).lines.join(" ");
  assert.ok(/сильно|заметно|слабо/.test(line) && !/\d/.test(line), `склонности словами, без чисел: ${line}`);
  runSeason(w);
  assert.equal(nextTalk(p), null);
  assert.equal(talk(w, p.id), false);
  assert.equal(w.deedsLeft, BALANCE.season.deeds);
  assert.equal(p.know.talks, 3);
});

test("слова склонностей переключаются на порогах-ручках", () => {
  assert.deepEqual([10, 7, 6.9, 4.5, 4.4, 0].map(axisWord), ["сильно", "сильно", "заметно", "заметно", "слабо", "слабо"]);
  setAt("know.strong", 9);
  assert.equal(axisWord(8), "заметно");
});

test("черта, известная с первой посадки, разговора не тратит: первый разговор — о стремлении", () => {
  setAt("know.startTraitChance", 1);
  const w = newWorld("посадка");
  const p = w.people.find((x) => x.post && x.know.trait && !x.gained.length)!;
  assert.equal(nextTalk(p), "стремление");
});

test("нажитую до начала партии черту открывает разговор о чертах", () => {
  setAt("staff.startTenureMin", 12);
  setAt("know.startTraitChance", 1);
  const w = newWorld("мастера");
  const p = w.people.find((x) => x.post && !x.trait.hidden)!;
  assert.ok(has(p, "master_dela") && !p.gained[0].known);
  assert.equal(nextTalk(p), "черты");
  talk(w, p.id);
  assert.ok(p.gained[0].known && said(lastLog(w).lines, "Мастер своего дела"));
  assert.equal(nextTalk(p), "стремление");
});

// ---------- наблюдение ----------

test("наблюдение: решение оставляет отметку у оси, после N наблюдений ось видна словом", () => {
  const w = newWorld("наблюдение");
  const p = fix(holder(w, "starosta")!, ["zabota"]);
  assert.ok(AXES.every((a) => p.know.seen[a] === 0 && !axisKnown(p, a)));
  const first = runEvent(w, event("nedoimka"));
  const seen = AXES.filter((a) => p.know.seen[a] === 1);
  assert.ok(seen.length >= 1 && seen.every((a) => !axisKnown(p, a)), "одно решение — отметка есть, слова ещё нет");
  assert.ok(!said(first.lines, "Насмотрелись"));
  let told = false;
  for (let i = 1; i < BALANCE.know.seenToKnow; i++) told = said(runEvent(w, event("nedoimka")).lines, "Насмотрелись в деле") || told;
  const known = AXES.filter((a) => axisKnown(p, a));
  assert.ok(known.length >= 1 && known.every((a) => p.know.seen[a] >= BALANCE.know.seenToKnow) && told);
  assert.deepEqual(p.know.seen, p.choices);
  assert.equal(p.know.axes, false);
});

test("наблюдение: порог — ручка; прогноз строится только из известных склонностей", () => {
  setAt("know.seenToKnow", 1);
  const w = newWorld("наблюдение");
  const p = fix(holder(w, "starosta")!, ["zabota"]);
  assert.equal(forecast(p), "пока непонятно, как поступит");
  const e = runEvent(w, event("nedoimka"));
  assert.ok(said(e.lines, "Насмотрелись в деле"));
  assert.equal(axisKnown(p, "zabota"), p.know.seen.zabota >= 1);
  p.know.axes = true;
  assert.equal(forecast(p), "скорее всего, будет действовать по Заботе");
  flat(p);
  assert.equal(forecast(p), "сильных склонностей пока не видно");
});

// ---------- скрытые черты ----------

test("скрытую черту разговор не открывает", () => {
  const w = newWorld("скрытые");
  for (const id of ["zlopamyatny", "khitry"]) {
    const p = w.people.find((x) => x.trait.id === id)!;
    assert.ok(p.trait.hidden && !p.know.trait);
    assert.equal(talk(w, p.id), true);
    assert.deepEqual([p.know.trait, p.know.traitAsked], [false, true]);
    assert.ok(said(lastLog(w).lines, "выдаст только поступок"));
    assert.equal(nextTalk(p), "стремление");
  }
});

test("скрытую черту выдаёт поступок: саботаж — «Злопамятный»", () => {
  const w = newWorld("саботаж");
  const [a, b] = pair(w, "starosta", ["zabota", "obychai"], "desyatnik", ["dolg"], -8);
  a.tenure = 60;
  b.trait = keyTrait("zlopamyatny"); b.know.trait = false;
  setAt("council.sabotageChance", 0);
  runEvent(w, event("plotina"));
  assert.equal(b.know.trait, false, "смолчал — черта не выдана");
  setAt("council.sabotageChance", 1);
  const e = runEvent(w, event("plotina"));
  assert.ok(said(e.lines, "Саботаж") && said(e.lines, `Поступок выдал черту: ${b.name} — «Злопамятный»`), e.lines.join(" | "));
  assert.equal(b.know.trait, true);
});

test("скрытую черту выдаёт поступок: обход — «Хитрый»; хитрый, проиграв спор, делает по-своему вполсилы", () => {
  const run = (chance: number) => {
    const w = newWorld("обход");
    const [a, b] = pair(w, "starosta", ["zabota", "obychai"], "desyatnik", ["dolg"], 0);
    a.tenure = 60;
    b.trait = { ...keyTrait("khitry"), mods: { sly: 1 } }; b.know.trait = false;
    setAt("council.compromiseChance", 0);
    setAt("traits.bypassChance", chance);
    return { a, b, w, e: runEvent(w, event("plotina")) };
  };
  const no = run(0);
  assert.ok(said(no.e.lines, "продавил") && !said(no.e.lines, "в обход") && !no.b.know.trait);
  assert.deepEqual(no.e.effects, { derevni: 2, poryadok: -1 });
  const yes = run(1);
  assert.ok(said(yes.e.lines, "в обход") && said(yes.e.lines, `Поступок выдал черту: ${yes.b.name} — «Хитрый»`), yes.e.lines.join(" | "));
  assert.equal(yes.b.know.trait, true);
  assert.deepEqual(yes.e.effects, { poryadok: 1.4, kuptsy: 0.7, derevni: -0.7 });
  assert.deepEqual([yes.a.decisions, yes.b.decisions], [0, 1]);
  // не хитрый в обход не ходит, сколько ни крути ручку
  const w = newWorld("обход");
  pair(w, "starosta", ["zabota", "obychai"], "desyatnik", ["dolg"], 0)[0].tenure = 60;
  setAt("council.compromiseChance", 0);
  assert.ok(!said(runEvent(w, event("plotina")).lines, "в обход"));
});

// ---------- черты в течение жизни ----------

test("черта из привычки: доля решений по оси за последние сезоны выше порога", () => {
  for (const axis of AXES) {
    const trait = LIFE_TRAITS.find((t) => t.source === "habit" && t.axis === axis)!;
    const other: Axis = axis === "dolg" ? "zabota" : "dolg";
    const setup = (same: number, season = 1) => {
      const w = newWorld("привычка");
      const p = free(w)[0];
      p.recent = Array.from({ length: BALANCE.traits.habitMinDecisions }, (_, i) => ({ season, axes: [i < same ? axis : other] }));
      runSeason(w);
      return { w, p };
    };
    const yes = setup(5);
    assert.ok(has(yes.p, trait.id), `${axis}: 5 из 6 решений`);
    assert.ok(said(lastLog(yes.w).lines, `Новая черта: ${yes.p.name} — «${trait.name}»`));
    assert.ok(yes.p.bio.at(-1)!.includes(trait.name), "запись в биографии");
    assert.ok(yes.p.gained[0].known, "нажитое на глазах Сенешаля известно сразу");
    assert.ok(!has(setup(3).p, trait.id), `${axis}: 3 из 6 — мало`);
    assert.ok(!has(setup(5, -100).p, trait.id), `${axis}: старые решения не в счёт`);
  }
  setAt("traits.habitMinDecisions", 30);
  const w = newWorld("привычка");
  const p = free(w)[0];
  p.recent = Array.from({ length: 6 }, () => ({ season: 1, axes: ["dolg" as Axis] }));
  runSeason(w);
  assert.equal(p.gained.length, 0, "решений меньше порога — привычки нет");
});

test("черты из должности: «Мастер своего дела» на потолке опыта, «Оброс связями» после «засиделся», «Устал от службы» на нежеланной", () => {
  const w = newWorld("должность");
  const [m, s, t, ok] = (["starosta", "desyatnik", "klyuchnik", "pisar"] as const).map((post) => holder(w, post)!);
  for (const p of [m, s, t, ok]) { p.gained = []; p.aspiration = undefined; p.recent = []; }
  m.tenure = m.exp = BALANCE.exp.master - 2;
  s.tenure = BALANCE.exp.staleFrom - 2; s.exp = 0;
  t.tenure = BALANCE.traits.tiredFrom - 2; t.exp = 0; t.aspiration = ASPIRATIONS.find((a) => a.post === "lesnichiy")!;
  ok.tenure = BALANCE.traits.tiredFrom - 2; ok.exp = 0; ok.aspiration = ASPIRATIONS.find((a) => a.post === "pisar")!;
  runSeason(w);
  assert.ok(!has(m, "master_dela") && !has(s, "obros_svyazyami") && !has(t, "ustal_ot_sluzhby"), "за сезон до порога черт ещё нет");
  runSeason(w);
  assert.ok(has(m, "master_dela") && has(s, "obros_svyazyami") && has(t, "ustal_ot_sluzhby"));
  assert.ok(!has(ok, "ustal_ot_sluzhby"), "на желанной должности не устают");
  assert.ok(said(lastLog(w).lines, `${s.name} — «Оброс связями»`) && said(lastLog(w).lines, `${t.name} — «Устал от службы»`));
});

test("черта из отношений: после саботажа пострадавший — «Злопамятный к <имя>», и действует она только против этого человека", () => {
  const w = newWorld("саботаж");
  const [a, b] = pair(w, "starosta", ["zabota", "obychai"], "desyatnik", ["dolg"], -8);
  a.tenure = 60;
  setAt("council.sabotageChance", 1);
  const e = runEvent(w, event("plotina"));
  assert.deepEqual(a.gained.map((g) => [g.trait.id, g.target]), [["zlopamyatny_k", b.id]]);
  assert.equal(b.gained.length, 0);
  assert.ok(said(e.lines, `Новая черта: ${a.name} — «${traitLabel(w, a.gained[0])}»`));
  runEvent(w, event("plotina"));
  assert.equal(a.gained.length, 1, "второй саботаж того же человека черту не удваивает");
  // обида на цель растёт быстрее, чем на постороннего
  const trait = LIFE_TRAITS.find((t) => t.id === "zlopamyatny_k")!;
  setAt("council.compromiseChance", 0);
  const pushed = (target: number) => {
    const [x, y] = pair(w, "starosta", ["zabota", "obychai"], "desyatnik", ["dolg"], 0);
    x.tenure = 60;
    x.gained = [{ trait, target: target < 0 ? y.id : target, season: 1, known: true }];
    runEvent(w, event("plotina"));
    return getRel(w, x.id, y.id);
  };
  assert.equal(pushed(free(w)[0].id), BALANCE.council.pushRel, "цель — посторонний: обида обычная");
  assert.equal(pushed(-1), Math.round(BALANCE.council.pushRel * trait.mods.grudge! * 100) / 100, "цель — второй спорщик: обида сильнее");
});

test("имя цели в названии черты стоит в дательном падеже", () => {
  const w = newWorld("падеж");
  const trait = LIFE_TRAITS.find((t) => t.id === "zlopamyatny_k")!;
  const label = (name: string) => traitLabel(w, { trait, target: w.people.find((p) => p.name === name)!.id });
  assert.deepEqual(["Остап", "Ведана", "Ярема", "Тихон"].map(label), ["Злопамятный к Остапу", "Злопамятный к Ведане", "Злопамятный к Яреме", "Злопамятный к Тихону"]);
});

test("перелом: резкий сдвиг звезды, новая черта, запись в летописи и биографии", () => {
  const w = newWorld("перелом");
  const p = flat(w.people[0]);
  const bio = p.bio.length;
  assert.equal(breakdown(w, p.id, "ozhestochilsya", `${p.name} вернулся с пожарища другим человеком.`), true);
  assert.deepEqual([p.star.zabota, p.star.derzost], [2, 7]);
  assert.ok(has(p, "ozhestochilsya") && p.bio.length === bio + 1);
  assert.ok(lastLog(w).title.startsWith("Перелом") && said(lastLog(w).lines, "«Ожесточился»"));
  assert.equal(breakdown(w, p.id, "stal_nabozhen", "Знамение."), true);
  assert.equal(p.star.obychai, 8);
  assert.equal(breakdown(w, p.id, "stal_nabozhen", "Знамение."), false, "та же черта второй раз не появляется");
  assert.throws(() => breakdown(w, p.id, "master_dela", "не перелом"), /не перелом/);
  p.star.zabota = 1;
  const q = w.people[1]; q.star.zabota = 1;
  breakdown(w, q.id, "ozhestochilsya", "…");
  assert.equal(q.star.zabota, 0, "звезда не выходит за шкалу");
});

test("предел: приобретённых черт не больше ручки, ключевая в счёт не идёт", () => {
  const w = newWorld("предел");
  const p = free(w)[0];
  const lines: string[] = [];
  const ids = ["prizhimisty", "serdobolny", "riskovy", "starover"];
  assert.deepEqual(ids.map((id) => gainTrait(w, p, id, lines)), [true, true, true, false]);
  assert.equal(p.gained.length, BALANCE.traits.maxGained);
  assert.equal(lines.length, 3);
  assert.equal(breakdown(w, p.id, "ozhestochilsya", "…"), false);
  setAt("traits.maxGained", 1);
  const q = free(w)[1];
  assert.deepEqual(ids.map((id) => gainTrait(w, q, id, lines)), [true, false, false, false]);
  setAt("traits.maxGained", 0);
  const m = holder(w, "starosta")!; m.gained = []; m.exp = m.tenure = BALANCE.exp.master;
  runSeason(w);
  assert.equal(m.gained.length, 0);
  assert.throws(() => gainTrait(w, q, "net_takoy", lines), /Нет приобретаемой черты/);
});

test("приобретённая черта меняет решения: привычка тянет к своей оси", () => {
  setAt("decide.noise", 0);
  const run = (trait?: string) => {
    const w = newWorld("привычка");
    const p = flat(fix(holder(w, "starosta")!, []));
    assign(w, holder(w, "desyatnik")!.id, null);
    if (trait) gainTrait(w, p, trait, []);
    return runEvent(w, event("plotina")).lines;
  };
  assert.ok(said(run(), "Все на плотину") && !said(run(), "по привычке"), "без черты при равных склонностях — первый вариант");
  assert.ok(said(run("prizhimisty"), "Поделить людей пополам") && said(run("prizhimisty"), "по привычке"));
  assert.ok(said(run("sluzhaka"), "Все в дозоры"));
});

test("данные приобретаемых черт: у каждой оси своя привычка, источники названы, id не пересекаются с ключевыми", () => {
  for (const a of AXES) assert.equal(LIFE_TRAITS.filter((t) => t.source === "habit" && t.axis === a).length, 1, a);
  assert.ok(LIFE_TRAITS.every((t) => t.source && t.source !== "born" && t.name && t.desc));
  assert.ok(LIFE_TRAITS.every((t) => !TRAITS.some((k) => k.id === t.id)));
  for (const src of ["habit", "post", "rel", "break"]) assert.ok(LIFE_TRAITS.some((t) => t.source === src), src);
});

// ---------- годность словом и мнение главного ----------

test("годность словом: «не знаю», пока оси должности неизвестны; дальше — по известному", () => {
  const w = newWorld("годность");
  const p = w.people.find((x) => !x.mark)!;
  for (const a of AXES) p.star[a] = a === "zabota" || a === "obychai" ? 9 : 1;
  p.aspiration = undefined;
  assert.ok(POSTS.every((d) => fitWord(p, d.id) === "не знаю"));
  p.know.seen.zabota = BALANCE.know.seenToKnow;
  assert.equal(fitWord(p, "starosta"), "подходит");
  assert.equal(fitWord(p, "pisar"), "не знаю");
  p.know.axes = true;
  assert.deepEqual(POSTS.map((d) => fitWord(p, d.id)), ["подходит", "сомнительно", "сомнительно", "сомнительно", "подходит"]);
  setAt("know.fitGood", 10);
  assert.equal(fitWord(p, "starosta"), "сомнительно");
});

test("годность словом: метка видна всегда и говорит сама", () => {
  const w = newWorld("годность");
  const heavy = w.people.find((x) => x.mark?.id === "tyazhelaya_ruka")!;
  assert.equal(fitWord(heavy, "desyatnik"), "подходит");
  assert.equal(fitWord(heavy, "starosta"), "сомнительно");
  assert.equal(fitWord(heavy, "pisar"), "не знаю");
});

test("мнение главного — с пристрастием: друга хвалит, врага чернит; о себе молчит", () => {
  const w = newWorld("мнение");
  const head = w.people[w.head!];
  const p = flat(free(w).find((x) => !x.mark)!);
  p.aspiration = undefined;
  assert.equal(headOpinion(w, head), undefined);
  setRel(w, head.id, p.id, 8);
  assert.ok(headOpinion(w, p)!.text.startsWith("годится в "));
  assert.equal(headOpinion(w, p)!.bias, 8 * BALANCE.know.opinionBias);
  setRel(w, head.id, p.id, -8);
  assert.equal(headOpinion(w, p)!.text, "ни на одну должность не годится");
  setAt("know.opinionBias", 0);
  setRel(w, head.id, p.id, 8);
  assert.equal(headOpinion(w, p)!.text, "ни на одну должность не годится", "без пристрастия середняк не годится");
  w.head = null;
  assert.equal(headOpinion(w, p), undefined);
});

test("поступок открывает стремление: желанная должность и обойдённый", () => {
  const w = newWorld("стремление");
  const [p, o] = free(w);
  p.aspiration = o.aspiration = ASPIRATIONS.find((a) => a.post === "pisar")!;
  assert.ok(!p.know.aspiration && !o.know.aspiration);
  assign(w, p.id, "pisar");
  assert.ok(p.know.aspiration && o.know.aspiration);
});

test("прогон 30 сезонов: черт не больше предела, скрытое не открывается само, летопись без мусора", () => {
  for (const seed of SEEDS) {
    const w = newWorld(seed, true);
    for (let s = 0; s < 30; s++) runSeason(w);
    for (const p of w.people) {
      assert.ok(p.gained.length <= BALANCE.traits.maxGained, `${seed}, ${p.name}`);
      assert.equal(new Set(p.gained.map((g) => `${g.trait.id}|${g.target}`)).size, p.gained.length, `${seed}, ${p.name}: повтор черты`);
      assert.ok(!p.know.aspiration && !p.know.axes, `${seed}, ${p.name}: без разговоров стремление и рассказ о склонностях закрыты`);
      if (!p.post && !p.decisions) assert.ok(AXES.every((a) => !axisKnown(p, a)), `${seed}, ${p.name}: не был в деле — оси закрыты`);
      assert.ok(p.recent.every((r) => r.season > w.season - 1 - BALANCE.traits.habitSeasons));
    }
    assert.ok(w.people.some((p) => p.gained.some((g) => g.season > 0)), `${seed}: за 30 сезонов кто-то нажил черту`);
    assert.ok(w.people.some((p) => AXES.some((a) => axisKnown(p, a))), `${seed}: за 30 сезонов кого-то разглядели в деле`);
    assert.ok(w.log.every((e) => e.lines.every((l) => !/undefined|NaN|[{}]/.test(l))), `${seed}: мусор в летописи`);
  }
});
