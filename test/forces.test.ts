// Внешние силы (задача И31): общий словарь, «его светлость», Ратша, сторона «соседи» и набросок гильдии данными. Замысел — docs/design/sily.md.
// Движка сил ещё нет: тест проверяет, что записи собраны из слов словаря и ссылаются на то, что есть, — карточки колоды, нити, роли, дела.
import { test } from "node:test";
import assert from "node:assert/strict";
import { THREADS, CHANNELS, HOLDER_ROLES, LINK_GROUPS } from "../src/data/portrait";
import { DECK, DEALS, CARD_WHEN } from "../src/data/deck";
import { CLARITY } from "../src/data/threads";
import {
  FORCES, GUILD, NEIGHBOURS, FORCES_BY_ACT, MOVE_KINDS, MOVE_SIGNS, MOVE_FIELDS, AGENDA_LINES, SCALE_AXES, SCALE_POVODY, INFO_PATHS, SVEDENIE_YASNOST, SVEDENIE_OBRAZETS,
  SECRETS, SECRET_LEAKS, AGENT_THREADS, FORCE_THREADS, SENESCHAL_ENTRIES, forceById, type Force, type ForceCard, type ForceEntry,
} from "../src/data/forces";

const ids = <T extends string>(list: { id: T }[]): string[] => list.map((x) => x.id);
const NITI = ids(THREADS), ROLES = ids(HOLDER_ROLES), DELA = ids(DEALS), KINDS = ids(MOVE_KINDS), PATHS = ids(INFO_PATHS), TAYNY = ids(SECRETS);
const isThreads = (list: string[] | undefined, where: string) => { for (const n of list ?? []) assert.ok(NITI.includes(n), `${where}: нить ${n} — нет в словаре`); };
const isCard = (c: ForceCard, where: string) => assert.equal(DECK.find((d) => d.n === c.card)?.name, c.name, `${where}: карточка ${c.card} «${c.name}»`);
const isEntry = (e: ForceEntry, where: string) => {
  assert.ok(e.chem && e.dayot && e.stoit, `${where}: способ, что даёт и цена`);
  if (e.delo) assert.ok(DELA.includes(e.delo), `${where}: дело ${e.delo}`);
  isThreads(e.niti, where);
};
const scaleOf = (sila: string, scale: string) => forceById(sila as Force["id"]).scales.find((s) => s.id === scale);
const hasStep = (sila: string, scale: string, step: string, where: string) =>
  assert.ok(scaleOf(sila, scale)?.steps.some((s) => s.name === step), `${where}: ступень «${step}» шкалы ${sila}.${scale}`);

test("общий словарь: 12 видов ходов с id из 6.2, 14 полей карточки хода, повестка пятью строками, две оси шкал", () => {
  assert.deepEqual(KINDS, ["trebovanie", "milost", "proverka", "verbovka", "posul", "davlenie", "udar", "prislat", "soyuz", "protiv", "otvet", "zhdyot"]);
  for (const k of MOVE_KINDS) {
    assert.ok(k.name && k.text && k.signText, k.id);
    for (const s of k.signs) assert.ok(MOVE_SIGNS[s], `${k.id}: знак ${s}`);
  }
  // знак любой — у «ответа», у «ждёт» знака нет; добрый ход — милость
  assert.deepEqual(MOVE_KINDS.filter((k) => k.signs.length !== 1).map((k) => [k.id, k.signs.length]), [["trebovanie", 2], ["otvet", 3], ["zhdyot", 0]]);
  assert.deepEqual(MOVE_KINDS.filter((k) => k.signs.includes("dobryy")).map((k) => k.id), ["milost", "otvet"]);
  assert.equal(MOVE_FIELDS.length, 14);
  assert.equal(new Set(ids(MOVE_FIELDS)).size, 14);
  assert.deepEqual(ids(AGENDA_LINES), ["cel", "zabota", "sredstva", "granica", "boitsya"]);
  assert.deepEqual(Object.keys(SCALE_AXES), ["raspolozhenie", "svoya"]);
  assert.equal(SCALE_POVODY.length, 10);
  assert.equal(new Set(ids(SCALE_POVODY)).size, 10);
});

test("сведения: семь путей наружу, зеркало — каналы словаря следов; ясность — три слова из четырёх; запись сведения", () => {
  assert.equal(INFO_PATHS.length, 7);
  for (const p of INFO_PATHS) for (const c of p.zerkalo) assert.ok(ids(CHANNELS).includes(c), `${p.id}: канал ${c}`);
  // у последнего пути — «другие силы и стороны» — зеркала у Сенешаля нет
  assert.deepEqual(INFO_PATHS.filter((p) => p.zerkalo.length === 0).map((p) => p.id), ["drugie"]);
  assert.deepEqual(Object.keys(SVEDENIE_YASNOST), ["smutno", "zametno", "yasno"]);
  for (const [k, v] of Object.entries(SVEDENIE_YASNOST)) assert.equal(CLARITY[k as keyof typeof SVEDENIE_YASNOST], v);
  for (const s of SVEDENIE_OBRAZETS) assert.ok(s.fakt && PATHS.includes(s.otkuda) && SVEDENIE_YASNOST[s.yasnost] && s.dekada >= 1, s.fakt);
  assert.deepEqual(SVEDENIE_OBRAZETS.map((s) => [s.fakt, s.yasnost]), [["ямы недорыты", "yasno"], ["конных мало", "zametno"]]);
});

test("тайны Сенешаля, агенты и нити сил: нити — из словаря, роли «кто держит» — из словаря", () => {
  assert.equal(SECRETS.length, 7);
  assert.equal(new Set(TAYNY).size, 7);
  for (const s of SECRETS) assert.ok(s.name && s.otkuda && s.opasna, s.id);
  for (const l of SECRET_LEAKS) isThreads(l.niti, "утечка тайны");
  for (const a of AGENT_THREADS) {
    isThreads(a.niti, "агенты");
    if (a.rol) assert.ok(ROLES.includes(a.rol), `агенты: роль ${a.rol}`);
  }
  assert.deepEqual(AGENT_THREADS.filter((a) => a.rol).map((a) => a.rol), ["zakazchik", "dayushchiy", "zaimodavets", "ishchushchiy"]);
  // строки «Силы» каталога нитей: 17 строк, нить не повторяется
  assert.equal(FORCE_THREADS.length, 17);
  const all = FORCE_THREADS.flatMap((x) => x.niti);
  isThreads(all, "нити сил");
  assert.equal(new Set(all).size, all.length);
  assert.equal(all.length, 18);
});

test("силы: две в первом акте — «его светлость» и Ратша; гильдия — набросок на второй акт, без ходов", () => {
  assert.deepEqual(FORCES.map((f) => [f.id, f.akt, f.n]), [["svetlost", 1, "14"], ["ratsha", 1, "15"]]);
  for (const f of FORCES) assert.equal(forceById(f.id), f);
  assert.throws(() => forceById("net_takoy" as never), /Нет силы/);
  assert.deepEqual([GUILD.id, GUILD.akt, GUILD.nabrosok, GUILD.moves.length], ["gildiya", 2, true, 0]);
  assert.deepEqual(FORCES_BY_ACT.map((a) => [a.akt, a.sily]), [[1, ["svetlost", "ratsha"]], [2, ["gildiya"]], [3, []]]);
  // «его светлость» — ещё и сторона обмена «воевода и палата»; Ратша — сила, но не сторона
  assert.deepEqual(FORCES.map((f) => [f.storona, f.gruppa]), [[true, "palata"], [false, undefined]]);
  for (const f of FORCES) if (f.gruppa) assert.ok(ids(LINK_GROUPS).includes(f.gruppa), `${f.id}: группа ${f.gruppa}`);
  // набросок гильдии: расположение — она будет и стороной; у своей шкалы три ступени; три представителя
  assert.deepEqual(GUILD.scales.map((s) => [s.id, s.axis, s.steps.length]), [["raspolozhenie", "raspolozhenie", 0], ["svoya", "svoya", 3]]);
  assert.ok(GUILD.kanon.length === 5 && GUILD.reps.length === 3 && GUILD.povestka.khochet && GUILD.povestka.protiv && GUILD.vPervomAkte);
});

test("повестка — пятью строками: цель, забота по срокам дорожки, средства из словаря ходов, граница, чего боится", () => {
  for (const f of FORCES) {
    const a = f.agenda;
    assert.ok(a.cel && a.zabota.length >= 4 && a.granica.length >= 4 && a.boitsya.length >= 4, f.id);
    for (const z of a.zabota) assert.ok(CARD_WHEN[z.when] && z.text, `${f.id}: забота ${z.when}`);
    for (const k of a.sredstva) assert.ok(KINDS.includes(k), `${f.id}: средство ${k}`);
    // ход силы — вида, названного в её средствах
    if (a.sredstva.length) for (const m of f.moves) for (const k of m.kinds) assert.ok(a.sredstva.includes(k), `${f.id}: ход «${m.name}» — вида ${k} нет в средствах`);
  }
  assert.deepEqual(forceById("svetlost").agenda.sredstva, ["trebovanie", "proverka", "milost", "udar", "verbovka", "prislat", "otvet"]);
  // Вопрос автору (sily.md, раздел 19): строки «Средства» у Ратши нет — вместо неё четыре пути; посулов палата не даёт
  assert.deepEqual([forceById("ratsha").agenda.sredstva, forceById("ratsha").agenda.puti?.length], [[], 4]);
  assert.ok(!forceById("svetlost").agenda.sredstva.includes("posul"));
});

test("шкалы: у силы одна-две, по 3–5 ступеней словами, старт — одна из ступеней; есть что двигает вверх и вниз", () => {
  for (const f of FORCES) {
    assert.ok(f.scales.length >= 1 && f.scales.length <= 2, `${f.id}: шкал ${f.scales.length}`);
    assert.equal(new Set(f.scales.map((s) => s.id)).size, f.scales.length);
    for (const s of f.scales) {
      const names = s.steps.map((x) => x.name);
      assert.ok(names.length >= 3 && names.length <= 5, `${f.id}.${s.id}: ступеней ${names.length}`);
      assert.equal(new Set(names).size, names.length, `${f.id}.${s.id}: ступень повторяется`);
      assert.ok(names.includes(s.start), `${f.id}.${s.id}: старт «${s.start}» — не из ступеней`);
      assert.ok(SCALE_AXES[s.axis] && s.steps.every((x) => x.text) && s.up.length >= 3 && s.down.length >= 3, `${f.id}.${s.id}`);
      for (const m of [...s.up, ...s.down]) {
        assert.ok(m.text, `${f.id}.${s.id}: повод без текста`);
        if (m.povod) assert.ok(ids(SCALE_POVODY).includes(m.povod), `${f.id}.${s.id}: повод ${m.povod}`);
        if (m.sila) assert.ok(m.sila !== f.id && ids(FORCES).includes(m.sila), `${f.id}.${s.id}: сила ${m.sila}`);
      }
    }
  }
  assert.deepEqual(FORCES.flatMap((f) => f.scales.map((s) => [f.id, s.id, s.axis, s.steps.length, s.start])), [
    ["svetlost", "raspolozhenie", "raspolozhenie", 4, "ждёт"], ["svetlost", "podozrenie", "svoya", 4, "присматривается"],
    ["ratsha", "napor", "svoya", 4, "копает"], ["ratsha", "ves", "svoya", 3, "слушают"],
  ]);
  // расположение «его светлости» — оно же доверие стороны; у Ратши расположения нет: обе шкалы свои
  assert.deepEqual(FORCES.flatMap((f) => f.scales.filter((s) => s.storona).map((s) => `${f.id}.${s.id}`)), ["svetlost.raspolozhenie"]);
  assert.deepEqual(scaleOf("svetlost", "podozrenie")?.steps.map((s) => s.name), ["спокойна", "присматривается", "подозревает", "шлёт ревизора"]);
});

test("представители: у силы 2–3, у каждого роль, ядро, что исполняет и окно; роль «кто держит» и нити — из словаря", () => {
  for (const f of FORCES) {
    assert.ok(f.reps.length >= 2 && f.reps.length <= 3, `${f.id}: представителей ${f.reps.length}`);
    assert.equal(new Set(f.reps.map((r) => r.id)).size, f.reps.length);
    for (const r of f.reps) {
      assert.ok(/^[a-z_]+$/.test(r.id) && r.name && r.yadro && r.ispolnyaet && r.okno, `${f.id}: ${r.id}`);
      if (r.rol) assert.ok(ROLES.includes(r.rol), `${f.id}: роль ${r.rol}`);
      isThreads(r.nitiIds, `${f.id}: ${r.id}`);
    }
    isThreads(f.agents.niti, `${f.id}: агенты`);
    assert.ok(f.agents.naStarte && f.kto.length >= 4 && f.links.length >= 7 && f.srez.length >= 5, f.id);
  }
  assert.deepEqual(FORCES.map((f) => f.reps.map((r) => r.id)), [["sborshchitsa", "voevoda", "podyachiy"], ["ratsha", "ego_chelovek", "zaimodavets"]]);
  assert.equal(forceById("ratsha").reps[2].rol, "zaimodavets");
  assert.deepEqual(forceById("ratsha").agents.niti, ["dolg", "mest", "posuly", "pyanstvo", "podsidet", "soglyadatay"]);
});

test("ходы: у силы 12; вид — из словаря 6.2, срок — из CARD_WHEN, ступени повода — из шкал силы, исполнитель — её представитель или роль", () => {
  for (const f of FORCES) {
    assert.equal(f.moves.length, 12, f.id);
    assert.deepEqual(f.moves.map((m) => m.n), Array.from({ length: 12 }, (_, i) => i + 1));
    for (const m of f.moves) {
      const where = `${f.id}: ход «${m.name}»`;
      assert.ok(/^[a-z_]+$/.test(m.id) && m.name && m.kindText && m.povod && m.kto && m.text && typeof m.open === "boolean", where);
      for (const k of m.kinds) assert.ok(KINDS.includes(k), `${where}: вид ${k}`);
      assert.ok(m.when.length >= 1 && new Set(m.when).size === m.when.length, `${where}: срок`);
      for (const w of m.when) assert.ok(CARD_WHEN[w], `${where}: срок ${w}`);
      assert.ok(m.when.length === 1 || !m.when.includes("lyuboy"), `${where}: «в любой месяц» — один`);
      for (const st of m.stupeni ?? []) for (const step of st.steps) hasStep(f.id, st.scale, step, where);
      for (const r of m.reps) assert.ok(f.reps.some((x) => x.id === r), `${where}: представитель ${r}`);
      if (m.rol) assert.ok(ROLES.includes(m.rol), `${where}: роль ${m.rol}`);
      if (m.delo) assert.ok(DELA.includes(m.delo), `${where}: дело ${m.delo}`);
      if (m.opora) assert.ok(f.anchors.some((a) => a.id === m.opora), `${where}: опора ${m.opora}`);
      if (m.openNote) assert.ok(m.open, `${where}: «открытый для…» — у открытого`);
      isThreads(m.niti, where);
      for (const c of m.cards ?? []) isCard(c, where);
    }
  }
  const moves = FORCES.flatMap((f) => f.moves);
  assert.equal(new Set(moves.map((m) => m.id)).size, 24);
  // Вопрос автору (sily.md, раздел 19): у «Смотра по ледоходу» вид — «календарный», в словаре 6.2 такого нет; у остальных вид из словаря
  assert.deepEqual(moves.filter((m) => m.kinds.length === 0).map((m) => [m.id, m.kindText]), [["smotr_po_ledokhodu", "календарный"]]);
  assert.deepEqual(moves.filter((m) => m.kinds.length > 1).map((m) => [m.id, m.kinds]), [["otsrochka_u_sborshchitsy", ["milost", "otvet"]]]);
  // палата ходит открыто, Ратша — в тени: скрытых у «его светлости» два, у Ратши — девять
  assert.deepEqual(FORCES.map((f) => f.moves.filter((m) => !m.open).length), [2, 9]);
  assert.deepEqual(forceById("ratsha").moves.filter((m) => m.open).map((m) => [m.id, m.openNote]),
    [["smanit_dvor", "открытый для деревни"], ["lovushka_s_doley", "открытый для Сенешаля"], ["sosed_v_gostyakh", undefined]]);
  // исполнитель не из представителей: палата сама, ревизор от генератора, вожак лиха
  assert.deepEqual(moves.filter((m) => m.reps.length === 0).map((m) => [m.id, m.kto]), [["revizor", "ревизор"], ["penya_i_vygovor", "палата"], ["lovushka_s_doley", "вожак лиха"]]);
  // два хода разобраны образцом в 6.4
  assert.deepEqual(moves.filter((m) => m.obrazets).map((m) => [m.id, m.when]), [["kniga_protiv_dela", ["ledokhod"]], ["poit_sluzhilykh", ["ledokhod", "torg"]]]);
  assert.deepEqual(forceById("svetlost").moves[3].stupeni, [{ scale: "podozrenie", steps: ["присматривается", "подозревает", "шлёт ревизора"] }]);
});

test("ссылки на колоду: карточки 1, 10, 27 у сил и 1, 2, 8, 40 у соседей — номер и название, как в колоде", () => {
  for (const f of FORCES) for (const c of f.cards) isCard(c, f.id);
  for (const c of NEIGHBOURS.cards) isCard(c, "соседи");
  assert.deepEqual([forceById("svetlost").cards.map((c) => c.card), forceById("ratsha").cards.map((c) => c.card), NEIGHBOURS.cards.map((c) => c.card)],
    [[27, 10], [1, 10], [1, 2, 8, 40]]);
  const used = new Set([...FORCES.flatMap((f) => [...f.cards, ...f.moves.flatMap((m) => m.cards ?? [])]), ...NEIGHBOURS.cards].map((c) => c.card));
  assert.deepEqual([...used].sort((a, b) => a - b), [1, 2, 8, 10, 27, 40]);
});

test("знание о марке: окно, пути — из семи путей словаря, тайны Сенешаля — из семи тайн", () => {
  for (const f of FORCES) {
    const k = f.knowledge;
    assert.ok(k.okno && k.naStarte.length >= 2 && k.skorost && k.puti.length >= 7, f.id);
    for (const p of k.puti) {
      assert.ok(p.text, `${f.id}: путь без текста`);
      if (p.put) assert.ok(PATHS.includes(p.put), `${f.id}: путь ${p.put}`);
    }
    assert.ok(k.tayny.length >= 4, `${f.id}: тайн ${k.tayny.length}`);
    assert.equal(new Set(k.tayny.map((t) => t.tayna)).size, k.tayny.length);
    for (const t of k.tayny) assert.ok(TAYNY.includes(t.tayna) && t.text, `${f.id}: тайна ${t.tayna}`);
  }
  assert.deepEqual(FORCES.map((f) => f.knowledge.tayny.map((t) => t.tayna)),
    [["izlishek", "dolya", "lozh_v_otpiske", "posul", "roman"], ["dolya", "izlishek", "kryuchok", "lozh_v_otpiske"]]);
});

test("где входит Сенешаль: способ, что даёт и цена словами; дело — из каталога дел, нити — из словаря", () => {
  assert.equal(SENESCHAL_ENTRIES.length, 16);
  SENESCHAL_ENTRIES.forEach((e, i) => isEntry(e, `общее, строка ${i + 1}`));
  for (const f of FORCES) f.seneschal.forEach((e, i) => isEntry(e, `${f.id}, строка ${i + 1}`));
  assert.deepEqual(FORCES.map((f) => f.seneschal.length), [10, 11]);
  const dela = (list: ForceEntry[]) => list.filter((e) => e.delo).map((e) => e.delo);
  assert.deepEqual([dela(SENESCHAL_ENTRIES), dela(forceById("svetlost").seneschal), dela(forceById("ratsha").seneschal)],
    [["v_stavku", "v_vadelu"], ["v_stavku", "v_vadelu"], ["k_sosedyam", "vyezdnoy_sud"]]);
});

test("опоры: приговор года, счёт дворов и новое трёхлетье воеводы; у главного хода Ратши пять исходов", () => {
  assert.deepEqual(FORCES.map((f) => f.anchors.map((a) => [a.id, a.chasto, a.god, a.when])), [
    [["prigovor_goda", "kazhdyy_god", undefined, "sanny_put"], ["schyot_dvorov", "raz_v_akt", 3, undefined], ["novoe_tryokhletie", "raz_v_akt", 3, undefined]],
    [["glavnyy_khod", "raz_v_akt", 2, "torg"]],
  ]);
  for (const f of FORCES) for (const a of f.anchors) {
    assert.ok(a.name && a.srok && a.text, `${f.id}: опора ${a.id}`);
    if (a.when) assert.ok(CARD_WHEN[a.when], `${a.id}: срок ${a.when}`);
    for (const o of a.outcomes) {
      assert.ok(o.name && o.text, `${a.id}: исход без текста`);
      if (o.uslovie) hasStep(o.uslovie.sila, o.uslovie.scale, o.uslovie.step, `${a.id} «${o.name}»`);
      for (const s of o.shkaly ?? []) {
        assert.ok(scaleOf(s.sila, s.scale) && (s.to !== undefined) !== (s.delta !== undefined), `${a.id} «${o.name}»: шкала ${s.sila}.${s.scale}`);
        if (s.to) hasStep(s.sila, s.scale, s.to, `${a.id} «${o.name}»`);
      }
    }
  }
  const main = forceById("ratsha").anchors[0];
  assert.deepEqual(main.outcomes.map((o) => o.name), ["Донос с уликой", "Пустая дорога", "Деревня уходит", "Челобитье на съезде", "Ничего не готово"]);
  // донос с уликой поднимает подозрение палаты до «шлёт ревизора»; челобитье выпадает при весе «верят» и роняет расположение на ступень
  assert.deepEqual(main.outcomes[0].shkaly, [{ sila: "svetlost", scale: "podozrenie", to: "шлёт ревизора" }]);
  assert.deepEqual([main.outcomes[3].uslovie, main.outcomes[3].shkaly], [{ sila: "ratsha", scale: "ves", step: "верят" }, [{ sila: "svetlost", scale: "raspolozhenie", delta: -1 }]]);
  // приговор года: три слова в первый и второй год, два исхода в третий и досрочный приговор
  const verdict = forceById("svetlost").anchors[0];
  assert.deepEqual(verdict.outcomes.map((o) => o.name), ["доволен", "на заметке", "последнее слово", "утвердить владетелем", "отдать марку просителю", "досрочный приговор"]);
  assert.deepEqual(verdict.outcomes[5].uslovie, { sila: "svetlost", scale: "raspolozhenie", step: "на исходе" });
  // ход «Ревизор» разыгрывается и опорой третьего года
  assert.equal(forceById("svetlost").moves[10].opora, "schyot_dvorov");
});

test("соседи — сторона: доверие словами со стартом, желания и встречные требования, карточки для Ч6, жрец союза", () => {
  assert.deepEqual([NEIGHBOURS.id, NEIGHBOURS.akt, NEIGHBOURS.gruppa, NEIGHBOURS.delo], ["sosedi", 1, "sosedi", "k_sosedyam"]);
  assert.ok(ids(LINK_GROUPS).includes(NEIGHBOURS.gruppa) && DELA.includes(NEIGHBOURS.delo));
  assert.deepEqual([NEIGHBOURS.doverie.steps, NEIGHBOURS.doverie.start], [["косятся", "терпят", "ладят", "заодно"], "терпят"]);
  assert.ok(NEIGHBOURS.doverie.steps.includes(NEIGHBOURS.doverie.start) && NEIGHBOURS.doverie.startWhy);
  assert.deepEqual(NEIGHBOURS.marki.map((m) => m.name), ["Становое", "Бережки", "Сухостой", "Каменный Лог", "Липняги"]);
  assert.deepEqual([NEIGHBOURS.khotyat.length, NEIGHBOURS.vstrechnye.length, NEIGHBOURS.budut.length], [4, 4, 8]);
  // карточек для Ч6 в колоде ещё нет
  const norm = (s: string) => s.toLowerCase().replace(/[«»]/g, "").trim();
  for (const name of NEIGHBOURS.budut) assert.equal(DECK.find((d) => norm(d.name) === norm(name)), undefined, `«${name}» уже есть в колоде — нужен номер`);
  assert.ok(NEIGHBOURS.zhrets.text && NEIGHBOURS.zhrets.uslovie.includes("засчитывается") && NEIGHBOURS.zhrets.derzhitsya && NEIGHBOURS.zhrets.vtoroyPut);
  isThreads(NEIGHBOURS.niti, "соседи");
  // соседи как сторона названы в тех же строках «Силы» каталога нитей
  for (const n of NEIGHBOURS.niti) assert.ok(FORCE_THREADS.some((x) => x.niti.includes(n) && /сосед/i.test(x.text)), `соседи: нить ${n}`);
});
