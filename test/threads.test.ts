// Каталог нитей (задача И30): 30 нитей данными. Замысел — docs/design/niti.md.
// Движка нитей ещё нет: тест проверяет, что записи собраны из слов словаря, мешка и колоды и сходятся с картой переходов.
import { test } from "node:test";
import assert from "node:assert/strict";
import { BAG } from "../src/data/natura";
import { THREADS, CHANNELS, HOLDER_ROLES } from "../src/data/portrait";
import { DECK } from "../src/data/deck";
import { THREAD_DEFS, THREAD_MAP, THREAD_SIGNS, CLARITY, SENESCHAL_WAYS, threadDef, type ThreadDef } from "../src/data/threads";

const ids = <T extends string>(list: { id: T }[]): string[] => list.map((x) => x.id);
const NITI = ids(THREADS), TRAITS = ids(BAG);
const isTrait = (t: ThreadDef, id: string, where: string) => assert.ok(TRAITS.includes(id), `${t.id}: черта ${id} (${where}) — нет в мешке`);
const isThread = (t: ThreadDef, id: string, where: string) => assert.ok(NITI.includes(id), `${t.id}: нить ${id} (${where}) — нет в словаре`);
const edge = (a: string, b: string) => `${a}→${b}`;

test("каталог: 30 нитей, id — из словаря и без повторов; знаков — 6 порочных, 9 добрых, 15 «ни то ни другое»", () => {
  assert.equal(THREAD_DEFS.length, 30);
  assert.deepEqual(THREAD_DEFS.map((t) => t.id).sort(), [...NITI].sort());
  for (const t of THREAD_DEFS) {
    assert.ok(THREAD_SIGNS[t.sign] && /^[2-5]\.\d+$/.test(t.n) && t.about && t.wakes, t.id);
    assert.equal(threadDef(t.id), t);
  }
  const count = (sign: string) => THREAD_DEFS.filter((t) => t.sign === sign).length;
  assert.deepEqual([count("porochnaya"), count("dobraya"), count("nikakaya")], [6, 9, 15]);
  // у «ребёнка на стороне» знак зависит от брака: оговорка записана рядом
  assert.deepEqual(THREAD_DEFS.filter((t) => t.signNote).map((t) => [t.id, t.sign, t.signNote]), [["krov", "porochnaya", "порочная при браке"]]);
  // записи идут в порядке каталога: четыре пачки
  assert.deepEqual(["2", "3", "4", "5"].map((p) => THREAD_DEFS.filter((t) => t.n.startsWith(`${p}.`)).length), [6, 8, 6, 10]);
});

test("ступени: у каждой нити 4–5; у ступени — имя, что происходит, вверх; шаг вниз есть не у всех", () => {
  for (const t of THREAD_DEFS) {
    assert.ok(t.steps.length >= 4 && t.steps.length <= 5, `${t.id}: ступеней ${t.steps.length}`);
    assert.equal(new Set(t.steps.map((s) => s.name)).size, t.steps.length, `${t.id}: имя ступени повторяется`);
    for (const s of t.steps) {
      assert.ok(s.name, `${t.id}: ступень без имени`);
      if (s.down) assert.equal(s.down.est, !/^нет(?![а-яё])/i.test(s.down.text), `${t.id} «${s.name}»: шаг вниз`);
    }
  }
  const steps = THREAD_DEFS.flatMap((t) => t.steps);
  assert.equal(steps.length, 120);
  // что происходит на ступени, сказано у всех, кроме последней ступени «уйти»: там говорит само имя — «Уходит»
  assert.deepEqual(THREAD_DEFS.flatMap((t) => t.steps.filter((x) => !x.text).map((x) => `${t.id}: ${x.name}`)), ["uyti: Уходит"]);
  assert.ok(steps.filter((s) => s.up).length >= 110 && steps.filter((s) => s.stop).length >= 80);
  // что сделано, то сделано: первую кражу не отменить, а «не остановиться» можно шагнуть назад
  assert.deepEqual(threadDef("dengi").steps.map((s) => [s.name, s.down?.est]), [["Соблазн", false], ["Первая кража", false], ["Привычка", false], ["Не остановиться", true]]);
  assert.ok(steps.filter((s) => s.down?.est).length >= 20 && steps.filter((s) => s.down && !s.down.est).length >= 20);
});

test("следы: канал — из словаря, ясность — из четырёх слов; без канала — дело само выходит наружу", () => {
  let total = 0, clear = 0, loud = 0;
  for (const t of THREAD_DEFS) for (const s of t.steps) for (const x of s.traces) {
    total++;
    assert.ok(x.text, `${t.id} «${s.name}»: след без текста`);
    if (x.gde) assert.ok(ids(CHANNELS).includes(x.gde), `${t.id} «${s.name}»: канал ${x.gde}`);
    if (x.yasnost) { assert.ok(CLARITY[x.yasnost], `${t.id} «${s.name}»: ясность ${x.yasnost}`); clear++; }
    if (!x.gde) loud++;
  }
  assert.ok(total >= 180 && clear >= 100, `следов ${total}, с ясностью ${clear}`);
  assert.ok(loud <= 30, `следов без канала ${loud}`);
  // каждый канал словаря встречается в каталоге
  const used = new Set(THREAD_DEFS.flatMap((t) => t.steps.flatMap((s) => s.traces.map((x) => x.gde))));
  assert.deepEqual(ids(CHANNELS).filter((c) => !used.has(c as never)), []);
  // первая ступень «денег» — свои уши, смутно; последняя — ведомость, ясно
  const money = threadDef("dengi").steps;
  assert.deepEqual([money[0].traces[0].gde, money[0].traces[0].yasnost, money[3].traces[0].gde, money[3].traces[0].yasnost], ["ushi", "smutno", "vedomost", "yasno"]);
  // ступень, которая выходит на стол
  assert.ok(THREAD_DEFS.flatMap((t) => t.steps).filter((s) => s.stol).length >= 10);
});

test("черты — из мешка: кто открывает, толкает и тормозит; черта-ступень; что приходит и уходит на ступени и в развязке", () => {
  for (const t of THREAD_DEFS) {
    for (const id of t.start.opens) isTrait(t, id, "открывает");
    for (const id of t.start.pushes) isTrait(t, id, "толкает");
    for (const id of t.start.brakes) isTrait(t, id, "тормозит");
    for (const x of t.start.stepTraits ?? []) {
      isTrait(t, x.trait, "ступень");
      assert.ok(t.steps.some((s) => s.name.toLowerCase() === x.step.toLowerCase()), `${t.id}: черта-ступень «${x.step}» — такой ступени нет`);
    }
    assert.ok(t.start.traitNotes.length >= 1 && t.start.povody.length >= 1, `${t.id}: кто может начать`);
    for (const s of t.steps) for (const id of [...(s.traits?.come ?? []), ...(s.traits?.go ?? [])]) isTrait(t, id, `ступень «${s.name}»`);
    for (const e of t.endings) for (const id of [...(e.come ?? []), ...(e.go ?? []), ...(e.traits ?? [])]) isTrait(t, id, `развязка «${e.name}»`);
  }
  assert.deepEqual([threadDef("dengi").start.opens, threadDef("dengi").start.brakes], [["svoego_ne_upustit", "khitrit"], ["syt_krayukhoy", "kak_na_dukhu", "stal_nabozhen"]]);
  assert.deepEqual(threadDef("draka").start.opens, ["skor_na_ruku", "lezet_na_rozhon"]);
  assert.deepEqual(threadDef("azart").start.stepTraits, [{ trait: "udacha", step: "раз повезло" }, { trait: "igraet_v_kosti", step: "кости" }]);
  // черта приходит на ступени: «В долгах» — на «занял», «Пристрастился к чарке» — на «чарке»
  assert.deepEqual(threadDef("dolg").steps[0].traits?.come, ["v_dolgakh"]);
  assert.deepEqual(threadDef("pyanstvo").steps[0].traits?.come, ["charka"]);
  // и уходит в развязке: отдал долг — «В долгах» уходит, остаётся «Битый» или «Копейка к копейке»
  const paid = threadDef("dolg").endings[0];
  assert.deepEqual([paid.name, paid.go, paid.come?.slice(0, 2)], ["Отдал", ["v_dolgakh"], ["bity", "kopeyka_k_kopeyke"]]);
});

test("кто держит: роли — из словаря", () => {
  for (const t of THREAD_DEFS) {
    for (const r of t.holders) assert.ok(ids(HOLDER_ROLES).includes(r), `${t.id}: роль ${r}`);
    for (const s of t.steps) for (const r of s.holder?.roles ?? []) assert.ok(t.holders.includes(r), `${t.id} «${s.name}»: роль ${r} не в списке нити`);
  }
  assert.deepEqual([threadDef("dengi").holders, threadDef("dolg").holders, threadDef("vina").holders], [["skupshchik", "zaimodavets"], ["zaimodavets"], ["svidetel"]]);
  // все двенадцать ролей словаря, кроме вожака, названы в каталоге: вожак — лицо лиха с дороги
  const used = new Set(THREAD_DEFS.flatMap((t) => t.holders));
  assert.deepEqual(ids(HOLDER_ROLES).filter((r) => !used.has(r as never)), ["vozhak"]);
});

test("развязки: у каждой нити 2–4; что остаётся — черта, переход в другую нить, ушёл двор или человек", () => {
  for (const t of THREAD_DEFS) {
    const main = t.endings.filter((e) => !e.branch);
    assert.ok(main.length >= 2 && main.length <= 4, `${t.id}: развязок ${main.length}`);
    for (const e of t.endings) {
      assert.ok(e.name && (e.text || e.lines?.length), `${t.id}: развязка без текста`);
      for (const n of e.next ?? []) isThread(t, n, `развязка «${e.name}»`);
      for (const x of e.leaves ?? []) assert.ok(x === "dvor" || x === "chelovek", `${t.id}: ${x}`);
    }
  }
  // у «прошлого» — ещё четыре развязки ветви «лучшие дни»
  assert.deepEqual(THREAD_DEFS.filter((t) => t.endings.some((e) => e.branch)).map((t) => [t.id, t.endings.filter((e) => e.branch).length]), [["proshloe", 4]]);
  assert.equal(THREAD_DEFS.reduce((n, t) => n + t.endings.length, 0), 122);
  // переход: долг — «украл, чтобы отдать» ведёт в «деньги»; бегство пустит двор и уводит человека
  const debt = threadDef("dolg").endings;
  assert.deepEqual([debt[1].name, debt[1].next, debt[2].name, debt[2].leaves], ["Украл, чтобы отдать", ["dengi"], "Сбежал", ["dvor", "chelovek"]]);
  assert.ok(THREAD_DEFS.flatMap((t) => t.endings).filter((e) => e.leaves?.includes("dvor")).length >= 10);
});

test("где входит Сенешаль: способы — из десяти (niti.md, 1.7), цена — словами", () => {
  assert.equal(Object.keys(SENESCHAL_WAYS).length, 10);
  for (const t of THREAD_DEFS) {
    assert.ok(t.seneschal.length >= 1, `${t.id}: где входит Сенешаль`);
    for (const e of t.seneschal) {
      assert.ok(e.text, `${t.id}: вход без текста`);
      for (const w of e.ways) assert.ok(SENESCHAL_WAYS[w], `${t.id}: способ ${w}`);
    }
  }
  const all = THREAD_DEFS.flatMap((t) => t.seneschal);
  // каждый из десяти способов где-то назван
  assert.deepEqual(Object.keys(SENESCHAL_WAYS).filter((w) => !all.some((e) => e.ways.includes(w as never))), []);
  assert.ok(all.filter((e) => e.cena).length + THREAD_DEFS.filter((t) => t.cena).length >= 30, "цена названа");
  assert.ok(threadDef("dengi").seneschal[0].ways.includes("ramka") && threadDef("dengi").seneschal[0].cena?.includes("серебра"));
});

test("карточки-ступени: с номером — карточка колоды, без номера — карточки ещё нет", () => {
  const norm = (s: string) => s.toLowerCase().replace(/[«»]/g, "").trim();
  for (const t of THREAD_DEFS) {
    assert.ok(t.cards.length >= 6, `${t.id}: карточек ${t.cards.length}`);
    for (const c of t.cards) {
      const byName = DECK.find((d) => norm(d.name) === norm(c.name));
      if (c.card) assert.equal(DECK.find((d) => d.n === c.card)?.id, byName?.id, `${t.id}: «${c.name}» (${c.card}) — в колоде под этим номером другая карточка`);
      else assert.equal(byName, undefined, `${t.id}: «${c.name}» есть в колоде под № ${byName?.n} — нужен номер`);
      if (c.obrazets) assert.ok(DECK.some((d) => d.n === c.obrazets), `${t.id}: образец ${c.obrazets}`);
      if (c.tekst) assert.ok(c.tekst >= 1 && c.tekst <= 112, `${t.id}: текст мира № ${c.tekst}`);
    }
  }
  const linked = THREAD_DEFS.flatMap((t) => t.cards.filter((c) => c.card).map((c) => [t.id, c.card]));
  assert.deepEqual(linked, [["dolg", 25], ["dolg", 30], ["pyanstvo", 19], ["metka", 35], ["metka", 32], ["metka", 14], ["uyti", 7], ["nadel", 11], ["nadel", 6],
    ["svadba", 30], ["svadba", 32], ["svadba", 31], ["vernulsya", 6]]);
  assert.deepEqual(THREAD_DEFS.flatMap((t) => t.cards.filter((c) => c.obrazets).map((c) => [t.id, c.obrazets])), [["dengi", 26], ["posuly", 3]]);
});

test("переходы ведут на нить словаря и сходятся с картой переходов (niti.md, раздел 6)", () => {
  for (const t of THREAD_DEFS) {
    for (const x of t.to) isThread(t, x.nit, "ведёт в");
    for (const x of t.from) isThread(t, x.nit, "входит из");
  }
  for (const r of THREAD_MAP) for (const id of [...r.from, ...r.to]) assert.ok(NITI.includes(id), `карта: нить ${id}`);
  assert.equal(THREAD_MAP.length, 71);
  const map = new Set(THREAD_MAP.flatMap((r) => r.from.flatMap((a) => r.to.map((b) => edge(a, b)))));
  const links = new Set(THREAD_DEFS.flatMap((t) => [...t.to.map((x) => edge(t.id, x.nit)), ...t.from.map((x) => edge(x.nit, t.id))]));
  const endings = new Set(THREAD_DEFS.flatMap((t) => t.endings.flatMap((e) => (e.next ?? []).map((n) => edge(t.id, n)))));
  // каждая строка карты есть в записях: в «Связях» той или другой нити или в развязке
  assert.deepEqual([...map].filter((k) => !links.has(k) && !endings.has(k)), []);
  // эти два перехода карты в «Связях» не названы — только в развязке «выгнать»
  assert.deepEqual([...map].filter((k) => !links.has(k)), ["rodnya→mest", "rodnya→sabotazh"]);
  // расхождения — вопрос автору (niti.md, раздел 9): эти переходы названы в «Связях» записей, а в карте их нет. Список не растёт молча
  const QUESTION = [
    "draka→uyti", "krov→draka", "krov→dengi", "dolg→soglyadatay", "sabotazh→podsidet", "pyanstvo→podsidet", "svadba→draka", "uyti→propavshiy", "metka→rebyonok",
    "nadel→svoe_delo", "svoy_dvor→svoe_delo", "rebyonok→svoe_delo", "proshloe→svoe_delo", "vernulsya→dobroe_imya", "proshloe→dobroe_imya", "vernulsya→proshloe",
    "vernulsya→khvor", "vernulsya→dolg",
  ];
  assert.deepEqual([...links].filter((k) => !map.has(k)).sort(), [...QUESTION].sort());
  // «у другого»: нить открывается не у человека, а у того, кого он задел
  assert.deepEqual(THREAD_DEFS.flatMap((t) => t.to.filter((x) => x.uDrugogo).map((x) => edge(t.id, x.nit))),
    ["dolg→dolg", "posuly→mest", "draka→mest", "krov→mest", "dobroe_imya→podsidet"]);
  // в «уйти» впадают почти все нити — последняя строка карты
  const last = THREAD_MAP.at(-1)!;
  assert.deepEqual([last.to, last.from.length], [["uyti"], 15]);
});
