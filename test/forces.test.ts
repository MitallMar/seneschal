// Внешние силы (задача И31): общий словарь, две силы первого акта, сторона «соседи» и набросок гильдии данными. Замысел — docs/design/sily.md.
// Движка сил ещё нет: тест проверяет, что записи собраны из слов словарей и ссылаются на то, что есть.
import { test } from "node:test";
import assert from "node:assert/strict";
import { THREADS, HOLDER_ROLES } from "../src/data/portrait";
import { DECK, DEALS, CARD_WHEN } from "../src/data/deck";
import {
  FORCES, GUILD, NEIGHBORS, AGENDA_LINES, SCALE_AXES, SCALE_MOVERS, MOVE_KINDS, MOVE_FIELDS, SVED_PATHS, SVED_CLARITY, SENESCHAL_SECRETS, SENESCHAL_FORCE_WAYS,
  forceById, type Force, type ForceEntry, type Svedenie,
} from "../src/data/forces";

const ids = <T extends string>(list: { id: T }[]): string[] => list.map((x) => x.id);
const NITI = ids(THREADS), ROLES = ids(HOLDER_ROLES), KINDS = ids(MOVE_KINDS), DELA = ids(DEALS), SECRETS = ids(SENESCHAL_SECRETS);
const CARDS = DECK.map((c) => c.n);
const uniq = (list: string[]) => new Set(list).size === list.length;
const entriesOk = (list: ForceEntry[], where: string) => {
  for (const e of list) {
    assert.ok(e.name && e.dayot && e.cena, `${where}: «${e.name}» — способ, что даёт и цена`);
    for (const d of e.delo ?? []) assert.ok(DELA.includes(d), `${where}: дело ${d}`);
  }
};

test("общий словарь: повестка пятью строками, две оси шкал, 12 видов ходов, 14 полей карточки, 7 путей сведений, 7 тайн, 16 способов войти", () => {
  assert.deepEqual(ids(AGENDA_LINES), ["cel", "zabota", "sredstva", "granica", "boitsya"]);
  assert.deepEqual(Object.keys(SCALE_AXES), ["raspolozhenie", "svoya"]);
  assert.equal(SCALE_MOVERS.length, 10);
  assert.ok(SCALE_MOVERS.every((m) => m.povod && (m.raspolozhenie || m.svoya)));
  assert.deepEqual(KINDS, ["trebovanie", "milost", "proverka", "verbovka", "posul", "davlenie", "udar", "prislat", "soyuz", "protiv", "otvet", "zhdyot"]);
  assert.ok(MOVE_KINDS.every((k) => k.name && k.does && k.znak));
  assert.equal(MOVE_FIELDS.length, 14);
  assert.equal(SVED_PATHS.length, 7);
  assert.deepEqual(Object.keys(SVED_CLARITY), ["smutno", "zametno", "yasno"]);
  assert.equal(SENESCHAL_SECRETS.length, 7);
  assert.equal(SENESCHAL_FORCE_WAYS.length, 16);
  for (const list of [AGENDA_LINES, MOVE_KINDS, MOVE_FIELDS, SVED_PATHS, SENESCHAL_SECRETS]) {
    assert.ok(uniq(ids(list)) && ids(list).every((id) => /^[a-z_]+$/.test(id)));
  }
  entriesOk(SENESCHAL_FORCE_WAYS, "общее");
  // запись сведения: что, откуда, насколько ясно, когда, правда ли
  const s: Svedenie = { fakt: "ямы недорыты", otkuda: "pyanyy_yazyk", yasnost: "yasno", dekada: 2 };
  assert.ok(ids(SVED_PATHS).includes(s.otkuda) && SVED_CLARITY[s.yasnost]);
});

test("силы: в первом акте две — «его светлость» и Ратша; гильдия — набросок второго акта без ходов", () => {
  assert.deepEqual(FORCES.map((f) => [f.id, f.act]), [["svetlost", 1], ["ratsha", 1]]);
  for (const f of FORCES) assert.equal(forceById(f.id), f);
  assert.throws(() => forceById("gildiya"), /Нет силы/);
  // «его светлость» — ещё и сторона обмена, Ратша — нет
  assert.deepEqual(FORCES.map((f) => f.storona), [true, false]);
  assert.deepEqual([GUILD.id, GUILD.act, GUILD.nabrosok, GUILD.moves.length], ["gildiya", 2, true, 0]);
  assert.ok(GUILD.agenda.khochet.length && GUILD.agenda.protiv.length && GUILD.kanon.length === 5);
  assert.equal(GUILD.reps.length, 3);
  assert.deepEqual(GUILD.scales.map((s) => [s.id, s.axis, s.steps.length]), [["raspolozhenie", "raspolozhenie", 0], ["stan", "svoya", 3]]);
});

test("повестка: пять строк, забота — по срокам дорожки года, средства — из словаря видов", () => {
  for (const f of FORCES) {
    const a = f.agenda;
    assert.ok(a.cel && a.zabota.length >= 4 && a.sredstva.length && a.granica.length >= 4 && a.boitsya.length === 4, f.id);
    for (const z of a.zabota) assert.ok(CARD_WHEN[z.when] && z.text, `${f.id}: забота ${z.when}`);
    assert.ok(uniq(a.zabota.map((z) => z.when)), `${f.id}: срок заботы повторяется`);
    for (const k of a.sredstva) assert.ok(KINDS.includes(k), `${f.id}: средство ${k}`);
    // каждый вид хода силы назван в её средствах
    for (const m of f.moves) for (const k of m.vid) assert.ok(a.sredstva.includes(k), `${f.id} «${m.name}»: вида ${k} нет в средствах`);
  }
  assert.deepEqual(forceById("svetlost").agenda.sredstva, ["trebovanie", "proverka", "milost", "udar", "verbovka", "prislat", "otvet"]);
  // у Ратши ещё четыре пути к цели; средства — по видам его двенадцати ходов (sily.md, 15.2)
  const r = forceById("ratsha").agenda;
  assert.equal(r.puti?.length, 4);
  assert.deepEqual([...r.sredstva].sort(), [...new Set(forceById("ratsha").moves.flatMap((m) => m.vid))].sort());
});

test("шкалы: у силы одна-две, по 3–5 ступеней, старт — из ступеней; расположение есть только у силы-стороны", () => {
  for (const f of FORCES) {
    assert.ok(f.scales.length >= 1 && f.scales.length <= 2, f.id);
    assert.ok(uniq(f.scales.map((s) => s.id)), f.id);
    for (const s of f.scales) {
      const names = s.steps.map((x) => x.name);
      assert.ok(names.length >= 3 && names.length <= 5 && uniq(names), `${f.id}.${s.id}: ступеней ${names.length}`);
      assert.ok(s.steps.every((x) => x.name && x.text), `${f.id}.${s.id}: ступень без слов`);
      assert.ok(names.includes(s.start), `${f.id}.${s.id}: старт «${s.start}»`);
      assert.ok(SCALE_AXES[s.axis] && s.up.length && s.down.length, `${f.id}.${s.id}`);
      assert.equal(!!s.storona, s.axis === "raspolozhenie", `${f.id}.${s.id}: доверие стороны — это расположение`);
    }
    assert.equal(f.scales.some((s) => s.axis === "raspolozhenie"), f.storona, f.id);
  }
  const scale = (f: string, id: string) => forceById(f).scales.find((s) => s.id === id)!;
  assert.deepEqual(scale("svetlost", "raspolozhenie").steps.map((s) => s.name), ["довольна", "ждёт", "недовольна", "на исходе"]);
  assert.deepEqual(scale("svetlost", "podozrenie").steps.map((s) => s.name), ["спокойна", "присматривается", "подозревает", "шлёт ревизора"]);
  assert.deepEqual(scale("ratsha", "napor").steps.map((s) => s.name), ["ждёт", "копает", "давит", "ва-банк"]);
  assert.deepEqual(scale("ratsha", "ves").steps.map((s) => s.name), ["не слушают", "слушают", "верят"]);
  assert.deepEqual(FORCES.flatMap((f) => f.scales.map((s) => s.start)), ["ждёт", "присматривается", "копает", "слушают"]);
});

test("представители: двое-трое, у каждого роль, ядро, что исполняет и окно; роль «кто держит» и нити — из словаря", () => {
  for (const f of FORCES) {
    assert.ok(f.reps.length >= 2 && f.reps.length <= 3 && uniq(ids(f.reps)), f.id);
    for (const r of f.reps) {
      assert.ok(/^[a-z_]+$/.test(r.id) && r.name && r.core && r.does && r.okno, `${f.id}: ${r.id}`);
      if (r.holder) assert.ok(ROLES.includes(r.holder), `${f.id}: роль ${r.holder}`);
      for (const n of r.niti ?? []) assert.ok(NITI.includes(n), `${f.id} ${r.id}: нить ${n}`);
    }
    assert.ok(f.okno && f.znanie.start.length && f.znanie.puti.length && f.znanie.skorost, f.id);
  }
  assert.deepEqual(ids(forceById("svetlost").reps), ["sborshchitsa", "voevoda", "podyachiy"]);
  assert.deepEqual(ids(forceById("ratsha").reps), ["ratsha", "ego_chelovek", "zaimodavets"]);
  assert.equal(forceById("ratsha").reps[2].holder, "zaimodavets");
  // агенты: у Ратши шесть нитей вербовки
  assert.deepEqual(forceById("ratsha").agents!.niti.map((x) => x.nit), ["dolg", "mest", "posuly", "pyanstvo", "podsidet", "soglyadatay"]);
});

const stepsOf = (f: Force, scale: string): string[] => f.scales.find((s) => s.id === scale)?.steps.map((x) => x.name) ?? [];

test("ходы: по 12 у силы; вид — из словаря, срок — из дорожки года, ступень — из шкалы силы, исполнитель — её представитель", () => {
  const all = FORCES.flatMap((f) => f.moves);
  assert.ok(uniq(ids(all)) && ids(all).every((id) => /^[a-z_]+$/.test(id)));
  for (const f of FORCES) {
    assert.equal(f.moves.length, 12, f.id);
    assert.deepEqual(f.moves.map((m) => m.n), Array.from({ length: 12 }, (_, i) => i + 1));
    for (const m of f.moves) {
      const at = `${f.id} «${m.name}»`;
      assert.ok(m.name && m.povod && m.text && m.kto.length, at);
      for (const k of m.vid) assert.ok(KINDS.includes(k), `${at}: вид ${k}`);
      assert.ok(m.vid.length >= 1 && m.vid.length <= 2, `${at}: вид`);
      assert.ok(m.when.length > 0 && uniq(m.when) && m.when.every((w) => CARD_WHEN[w]), `${at}: срок`);
      if (m.when.length > 1) assert.ok(!m.when.includes("lyuboy"), `${at}: «в любой месяц» рядом со сроком`);
      if (m.stupen) {
        const steps = stepsOf(f, m.stupen.scale);
        assert.ok(m.stupen.steps.length > 0 && m.stupen.steps.every((s) => steps.includes(s)), `${at}: ступень ${m.stupen.steps.join(", ")}`);
      }
      for (const r of m.reps) assert.ok(ids(f.reps).includes(r), `${at}: представитель ${r}`);
      assert.ok(m.reps.length <= m.kto.length, at);
      if (m.holder) assert.ok(ROLES.includes(m.holder), `${at}: роль ${m.holder}`);
      for (const n of m.niti ?? []) assert.ok(NITI.includes(n), `${at}: нить ${n}`);
      for (const c of m.cards ?? []) assert.ok(CARDS.includes(c), `${at}: карточка ${c}`);
      if (m.opora) assert.ok(ids(f.anchors).includes(m.opora), `${at}: опора ${m.opora}`);
      if (m.openNote) assert.ok(m.open, at);
    }
  }
  // «Смотр по ледоходу» — проверка: «календарный» — это срок, а не вид (решение автора 26.11.2026)
  const smotr = forceById("svetlost").moves[8];
  assert.deepEqual([smotr.id, smotr.vid, smotr.vidNote, smotr.when], ["smotr_po_ledokhodu", ["proverka"], undefined, ["ledokhod"]]);
  // два вида — только у «Отсрочки у сборщицы»: милость или ответ
  assert.deepEqual(all.filter((m) => m.vid.length > 1).map((m) => [m.id, m.vid]), [["otsrochka_u_sborshchitsy", ["milost", "otvet"]]]);
  // палата ходит больше открыто, Ратша — скрыто
  assert.deepEqual(FORCES.map((f) => f.moves.filter((m) => m.open).length), [10, 3]);
  const kniga = forceById("svetlost").moves[0];
  assert.deepEqual([kniga.id, kniga.vid, kniga.open, kniga.when, kniga.stupen?.steps], ["kniga_protiv_dela", ["proverka"], true, ["ledokhod"], ["присматривается"]]);
  // лихо Ратша кормит руками вожака
  assert.deepEqual(forceById("ratsha").moves.filter((m) => m.holder === "vozhak").map((m) => m.id), ["kormit_likho", "lovushka_s_doley"]);
});

test("опоры: у «его светлости» три, у Ратши — главный ход с пятью исходами; срок — из дорожки года", () => {
  assert.deepEqual(ids(forceById("svetlost").anchors), ["prigovor_goda", "schyot_dvorov", "novoe_tryokhletye_voevody"]);
  assert.deepEqual(ids(forceById("ratsha").anchors), ["glavnyy_khod_ratshi"]);
  for (const f of FORCES) for (const a of f.anchors) {
    assert.ok(a.name && a.text && a.srokNote && a.chasto && CARD_WHEN[a.srok], `${f.id}: ${a.id}`);
    assert.ok(uniq(a.outcomes.map((o) => o.name)) && a.outcomes.every((o) => o.name && o.text), `${f.id}: ${a.id}`);
  }
  const main = forceById("ratsha").anchors[0];
  assert.equal(main.srok, "torg");
  assert.deepEqual(main.outcomes.map((o) => o.name), ["Донос с уликой", "Пустая дорога", "Деревня уходит", "Челобитье на съезде", "Ничего не готово"]);
  const verdict = forceById("svetlost").anchors[0];
  assert.deepEqual([verdict.srok, verdict.chasto, verdict.outcomes.length], ["sanny_put", "каждый год", 6]);
  assert.equal(forceById("svetlost").moves.find((m) => m.opora)?.id, "revizor");
  // новое трёхлетье воеводы — опора из таблицы раздела 9: весна третьего года, раз в акт
  const term = forceById("svetlost").anchors[2];
  assert.deepEqual([term.srok, term.chasto], ["ledokhod", "раз в акт"]);
  assert.match(term.srokNote, /^весной третьего года/);
});

test("где входит Сенешаль, тайны и ссылки: дела — из каталога, тайны — из словаря, нити и карточки существуют", () => {
  for (const f of FORCES) {
    assert.ok(f.seneschal.length >= 10, f.id);
    entriesOk(f.seneschal, f.id);
    assert.ok(f.tayny.length >= 4 && uniq(f.tayny.map((t) => t.id)), f.id);
    for (const t of f.tayny) assert.ok(SECRETS.includes(t.id) && t.text, `${f.id}: тайна ${t.id}`);
    for (const n of [...f.niti, ...(f.agents?.niti ?? [])]) assert.ok(NITI.includes(n.nit) && n.text, `${f.id}: нить ${n.nit}`);
    assert.ok(uniq(f.niti.map((n) => n.nit)), f.id);
    for (const c of f.cards) assert.ok(CARDS.includes(c.n) && c.text, `${f.id}: карточка ${c.n}`);
    assert.ok(f.kto.length && f.links.length && f.repNotes.length, f.id);
  }
  assert.deepEqual(forceById("svetlost").cards.map((c) => c.n), [27, 10]);
  assert.deepEqual(forceById("ratsha").cards.map((c) => c.n), [1, 10]);
  const dela = (f: string) => forceById(f).seneschal.flatMap((e) => e.delo ?? []);
  assert.deepEqual(dela("svetlost"), ["v_stavku", "v_vadelu"]);
  assert.deepEqual(dela("ratsha"), ["v_stavku", "v_vadelu", "vyezdnoy_sud"]);
});

test("соседи — сторона: доверие словами со стартом, желания и встречные требования, карточки колоды и жрец союза", () => {
  assert.deepEqual([NEIGHBORS.id, NEIGHBORS.act], ["sosedi", 1]);
  assert.deepEqual(NEIGHBORS.doverie.steps, ["косятся", "терпят", "ладят", "заодно"]);
  assert.ok(NEIGHBORS.doverie.steps.includes(NEIGHBORS.doverie.start));
  assert.equal(NEIGHBORS.doverie.start, "терпят");
  assert.deepEqual([NEIGHBORS.marki.length, NEIGHBORS.khotyat.length, NEIGHBORS.vstrechnye.length], [5, 4, 4]);
  // четыре карточки первой пачки и восемь второй (Ч6, пачка 6.6) — вся тема «соседи по Талице»
  assert.deepEqual(NEIGHBORS.cards, [1, 2, 8, 40, 136, 137, 138, 139, 140, 141, 142, 143]);
  for (const n of NEIGHBORS.cards) assert.ok(CARDS.includes(n), `карточка ${n}`);
  assert.deepEqual(DECK.filter((c) => c.theme === "sosedi").map((c) => c.n), NEIGHBORS.cards.slice(4));
  assert.match(NEIGHBORS.zhrets, /засчитывается в условие «в храме есть жрец»/);
  // стороне не положены повестка, ходы и опоры
  assert.ok(!("moves" in NEIGHBORS) && !("agenda" in NEIGHBORS) && !("anchors" in NEIGHBORS));
});
