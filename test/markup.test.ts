// Разметка колоды и каталога нитей под движок (задача И33). Замысел — docs/design/svyazi.md, разделы 8–12.
// Движка событий ещё нет: тест держит связность — всякое условие из словаря поводов, всякий слот со строкой словаря ролей,
// ссылки ведут на существующее, у всякой ступени есть род шага, вариантов без меток и без разметки исхода нет.
import { test } from "node:test";
import assert from "node:assert/strict";
import { SIGNS, BAG } from "../src/data/natura";
import { WANTS, HOLDS, CHANNELS, THREADS, HOLDER_ROLES, LINK_GROUPS, BIASES } from "../src/data/portrait";
import { ORIGINS } from "../src/data/origins";
import {
  DECK, DEALS, DECK_PLACES, WHERE_ANY, CARD_WHEN, WHEN_KINDS, CROWDS_EXTRA, OUTCOME_QUESTIONS, ROLE_RODS, ROLE_WORDS, C3_POSTS, HOUSE_ROLES, CHANNEL_YASNOST,
  roleWord, cardDecider, traceYasnost, type DeckCard, type CardOutcome,
} from "../src/data/deck";
import { COND_RODS, COND_CHTO, STATE_WORDS, SCALE_FORCE, flatConds, u, naNiti, shkala, type Cond, type CondRod } from "../src/data/conditions";
import { THREAD_DEFS, STEP_RODS, STEP_DECIDERS, CLARITY, threadDef, stepTraceYasnost } from "../src/data/threads";
import { FORCES, NEIGHBORS, forceById } from "../src/data/forces";

const ids = <T extends string>(list: { id: T }[]): string[] => list.map((x) => x.id);
const POLES = SIGNS.flatMap((s) => [`${s.id}+`, `${s.id}-`]);
const PLACES = [...ids(DECK_PLACES), ...Object.keys(WHERE_ANY)];
const slotsOf = (c: DeckCard): string[] => c.who.filter((r) => r.slot).map((r) => r.slot!);
const nums = (list: DeckCard[]): number[] => list.map((c) => c.n);
const stepOf = (nit: string, step: string): boolean => {
  const t = THREAD_DEFS.find((x) => x.id === nit)!;
  return [...t.steps, ...t.endings].some((x) => x.name.toLowerCase().startsWith(step.toLowerCase()));
};
// Проверка одного условия: род и вопрос — из словаря; ссылки — на существующее. slots — слоты карточки, если условие стоит в карточке.
const checkCond = (c: Cond, at: string, slots?: string[]): void => {
  assert.ok(ids(COND_RODS).includes(c.rod), `${at}: род ${c.rod}`);
  assert.ok(c.chto in COND_CHTO[c.rod], `${at}: вопроса «${c.chto}» нет у рода ${c.rod}`);
  if (slots) for (const r of [c.rol, c.k]) if (r) assert.ok(slots.includes(r), `${at}: условие о роли {${r}}, а слота нет`);
  if (c.nit) assert.ok(ids(THREADS).includes(c.nit), `${at}: нить ${c.nit}`);
  if (c.step) assert.ok(c.nit && stepOf(c.nit, c.step), `${at}: ступень «${c.step}»`);
  if (c.trait) assert.ok(BAG.some((t) => t.id === c.trait), `${at}: черта ${c.trait}`);
  if (c.want) assert.ok(ids(WANTS).includes(c.want), `${at}: желание ${c.want}`);
  if (c.hold) assert.ok(ids(HOLDS).includes(c.hold), `${at}: удержка ${c.hold}`);
  if (c.pole) assert.ok(POLES.includes(c.pole), `${at}: полюс ${c.pole}`);
  if (c.bias) assert.ok(ids(BIASES).includes(c.bias), `${at}: пристрастие ${c.bias}`);
  if (c.origin) assert.ok(ORIGINS.some((o) => o.id === c.origin), `${at}: происхождение ${c.origin}`);
  if (c.mesto) assert.ok(PLACES.includes(c.mesto), `${at}: место ${c.mesto}`);
  if (c.sila) assert.ok(FORCES.some((f) => f.id === c.sila), `${at}: сила ${c.sila}`);
  if (c.scale) {
    const scale = forceById(SCALE_FORCE[c.scale]).scales.find((x) => x.id === c.scale)!;
    assert.equal(c.sila, SCALE_FORCE[c.scale], `${at}: шкала ${c.scale} — другой силы`);
    for (const s of c.steps ?? []) assert.ok(scale.steps.some((x) => x.name === s), `${at}: ступени «${s}» нет на шкале ${c.scale}`);
  }
  if (c.hod) assert.ok(c.sila && forceById(c.sila).moves.some((m) => m.n === c.hod), `${at}: ход ${c.hod}`);
  if (c.card) assert.ok(DECK.some((x) => x.id === c.card), `${at}: карточка ${c.card}`);
  if (c.delo) assert.ok(ids(DEALS).includes(c.delo), `${at}: дело ${c.delo}`);
  for (const m of c.mesyatsy ?? []) assert.ok(CARD_WHEN[m] && m !== "lyuboy", `${at}: месяц ${m}`);
  // слова состояния — из описи: слово деревни, хлеб и сено, ступень лиха, условие испытания
  const words: Partial<Record<`${CondRod}.${string}`, readonly string[]>> = {
    "derevnya.slovo": STATE_WORDS.derevnya, "khozyaystvo.khleb": STATE_WORDS.zapas, "khozyaystvo.seno": STATE_WORDS.zapas,
    "likho.stupen": STATE_WORDS.likho, "ispytanie.uslovie": STATE_WORDS.ispytanie,
  };
  const list = words[`${c.rod}.${c.chto}`];
  if (list && c.slovo) assert.ok(list.includes(c.slovo), `${at}: слова «${c.slovo}» нет в описи`);
};
const cardConds = (c: DeckCard): Cond[] => [
  ...flatConds(c.usl), ...(c.vysheUsl ?? []), ...c.variants.flatMap((v) => (v.outcome.otlozhen ?? []).flatMap((o) => flatConds(o.esli))),
];
const stepConds = (): { at: string; c: Cond }[] => THREAD_DEFS.flatMap((t) => t.steps.flatMap((s) =>
  [...(s.usl?.vverkh ?? []), ...(s.usl?.stop ?? []), ...(s.usl?.vniz ?? [])].map((c) => ({ at: `${t.id}, «${s.name}»`, c }))));

test("словарь поводов: девятнадцать родов, у каждого — закрытый список вопросов; сборка условия", () => {
  assert.equal(COND_RODS.length, 19);
  assert.deepEqual(ids(COND_RODS), Object.keys(COND_CHTO));
  for (const r of COND_RODS) {
    assert.ok(r.name && r.sprashivaet && r.primer, r.id);
    const chto = Object.entries(COND_CHTO[r.id]);
    assert.ok(chto.length >= 1 && chto.every(([k, text]) => /^[a-z_]+$/.test(k) && text), `${r.id}: вопросы`);
  }
  assert.deepEqual(u.nit("na_stupeni", { rol: "писарь", nit: "dengi", step: "соблазн" }), { rod: "nit", chto: "na_stupeni", rol: "писарь", nit: "dengi", step: "соблазн" });
  assert.deepEqual(naNiti("писарь", "dengi", "соблазн"), u.nit("na_stupeni", { rol: "писарь", nit: "dengi", step: "соблазн" }));
  assert.deepEqual(naNiti(undefined, "metka", "смотр"), { rod: "nit", chto: "na_stupeni", nit: "metka", step: "смотр" });
  assert.deepEqual(shkala("napor", "давит"), { rod: "sila", chto: "stupen", sila: "ratsha", scale: "napor", steps: ["давит"] });
  assert.deepEqual(flatConds([u.mir("sluchay"), u.ili(u.dvor("pust"), u.dvor("ushyol"))]).map((c) => c.chto), ["sluchay", "pust", "ushyol"]);
  // слова доверия соседей — те же, что у стороны
  assert.deepEqual([...STATE_WORDS.doverie], NEIGHBORS.doverie.steps);
});

test("всякое условие — из словаря: поводы карточек, «выше», отложенные исходы, строки «вверх, стоп, вниз» у ступеней", () => {
  for (const c of DECK) for (const cond of cardConds(c)) checkCond(cond, `карточка ${c.n}`, slotsOf(c));
  for (const { at, c } of stepConds()) checkCond(c, at);
  const deck = DECK.flatMap(cardConds);
  const steps = stepConds().map((x) => x.c);
  assert.deepEqual([deck.length, steps.length], [322, 242]);
  // каждый род словаря где-то спрошен
  const all = [...deck, ...steps];
  assert.deepEqual(ids(COND_RODS).filter((r) => !all.some((c) => c.rod === r)), []);
  // вопросы, которых пока никто не задал, — только названные в самом словаре svyazi.md, 11.1: происхождение и желание роли, сорванный жетон, гнездо лиха
  const used = new Set(all.map((c) => `${c.rod}.${c.chto}`));
  const idle = Object.entries(COND_CHTO).flatMap(([r, m]) => Object.keys(m).filter((k) => !used.has(`${r}.${k}`)).map((k) => `${r}.${k}`));
  assert.deepEqual(idle, ["chelovek.proiskhozhdenie", "chelovek.zhelanie", "zheton.sorvan", "likho.gnezdo"]);
});

test("повод каждой карточки — условиями словаря; у события без повода — «время, место и роли» и то, что вынуто из завязки", () => {
  for (const c of DECK) assert.ok(Array.isArray(c.usl), `${c.id}: нет условий повода`);
  const bez = DECK.filter((c) => !c.povod);
  assert.deepEqual([bez.length, bez.filter((c) => c.usl.length).length], [67, 48]);
  // пустой список — «время, место и роли»: у девятнадцати карточек без повода и у трёх, где повод называет только это
  assert.deepEqual(nums(DECK.filter((c) => !c.usl.length)), [1, 3, 4, 15, 18, 21, 26, 28, 33, 36, 38, 41, 43, 44, 49, 52, 53, 65, 66, 96, 118, 140]);
  assert.deepEqual(nums(DECK.filter((c) => !c.usl.length && c.povod)), [96, 118, 140]);
  const card = (id: string) => DECK.find((c) => c.id === id)!;
  // повод словами остаётся рядом
  assert.match(card("skupshchik_nochuet_u").povod!, /^Нить «деньги», ступень «соблазн»/);
  assert.deepEqual(card("skupshchik_nochuet_u").usl[0], naNiti("писарь", "dengi", "соблазн"));
  assert.deepEqual(card("kniga_protiv_dela").usl, [shkala("podozrenie", "присматривается", "подозревает", "шлёт ревизора")]);
  assert.deepEqual(card("tiun_nad_starostami").usl.map((x) => ("ili" in x ? "ili" : `${x.rod}.${x.chto}`)), ["vremya.god", "schyot.raz"]);
  // «или» в поводе — группой: у писаря или у десятника
  assert.deepEqual(card("ukho_snova").usl, [u.ili(naNiti("писарь", "dengi", "первая кража"), naNiti("десятник", "dengi", "первая кража"))]);
  // карточка-ступень спрашивает свою нить и ступень
  for (const c of DECK.filter((x) => x.thread?.step)) {
    const asks = flatConds(c.usl).some((x) => x.rod === "nit" && x.nit === c.thread!.nit && (x.step ?? c.thread!.step) === c.thread!.step);
    assert.ok(asks, `${c.id}: повод не спрашивает нить «${c.thread!.nit}», ступень «${c.thread!.step}»`);
  }
  // ход силы спрашивает ступень шкалы там, где она названа у хода в forces.ts
  for (const c of DECK.filter((x) => x.kind === "khod")) {
    const m = forceById(c.sila!.sila as "svetlost").moves.find((x) => x.n === c.sila!.hod)!;
    if (!m.stupen) continue;
    const cond = flatConds(c.usl).find((x) => x.rod === "sila" && x.chto === "stupen");
    assert.ok(cond && cond.scale === m.stupen.scale, `${c.id}: шкала хода — ${m.stupen.scale}`);
    for (const s of m.stupen.steps) assert.ok(cond!.steps!.includes(s), `${c.id}: ступень «${s}» из forces.ts`);
  }
});

test("«когда» — срок или сезон у каждой карточки с «когда»; у «в любой месяц» пометы нет", () => {
  assert.deepEqual(Object.keys(WHEN_KINDS), ["srok", "sezon"]);
  for (const c of DECK) assert.equal(!!c.kogda, c.when !== "lyuboy", `${c.id}: срок или сезон`);
  assert.deepEqual(["srok", "sezon"].map((k) => DECK.filter((c) => c.kogda === k).length), [45, 50]);
  const kogda = (n: number) => DECK[n - 1].kogda;
  // срок: смотр, торг, жатва, первый лёд, опоры
  assert.deepEqual([29, 103, 101, 23, 119, 121].map(kogda), ["srok", "srok", "srok", "srok", "srok", "srok"]);
  // сезон: повод сильнее. Восемь карточек, на которых стоит бумажный месяц (svyazi.md, 21.2), — все сезоном: скупщик (76) приедет и по ледоходу
  assert.deepEqual([76, 75, 67, 13, 17, 61, 9, 136].map(kogda), Array(8).fill("sezon"));
  assert.deepEqual([7, 96, 127].map(kogda), ["sezon", "sezon", "sezon"]);
  // опоры — всегда срок; карточка-ступень — сезон, кроме привязанных к жатве, подати, смотру и смотру метки
  for (const c of DECK.filter((x) => x.kind === "opora")) assert.equal(c.kogda, "srok", c.id);
  assert.deepEqual(nums(DECK.filter((c) => c.thread && c.kogda === "srok")), [23, 35, 79, 93, 123]);
});

test("словарь ролей: шесть родов, всякий слот колоды — со строкой словаря, пары в двух написаниях — одна строка", () => {
  assert.deepEqual(ids(ROLE_RODS), ["dolzhnost", "sluzhba", "sila", "dvor", "prishlye", "cherta"]);
  const all = ROLE_WORDS.flatMap((r) => r.slots);
  assert.equal(new Set(all).size, all.length, "слот в двух строках словаря");
  const used = new Set(DECK.flatMap(slotsOf));
  for (const s of used) assert.doesNotThrow(() => roleWord(s), `слот {${s}}`);
  assert.throws(() => roleWord("нет такого"), /нет слота/);
  assert.deepEqual(all.filter((s) => !used.has(s)), [], "строка словаря без карточки");
  // 67 слотов карточек и 20, данных разметкой участникам без слота; строк — 79
  assert.deepEqual([used.size, ROLE_WORDS.length, ROLE_WORDS.filter((r) => r.novyy).length], [87, 79, 16]);
  assert.deepEqual(ids(ROLE_RODS).map((r) => ROLE_WORDS.filter((x) => x.rod === r).flatMap((x) => x.slots).length), [11, 11, 21, 23, 9, 12]);
  assert.deepEqual(ROLE_WORDS.filter((r) => r.slots.length > 1).map((r) => r.slots), [
    ["староста соседа", "староста_соседа"], ["невеста", "девушка"], ["семья", "двор"], ["пришлый", "пришлые"], ["беглый", "беглые"], ["тулл", "туллья"],
    ["меченый", "меченая"], ["кандидаты", "кандидат"],
  ]);
  for (const r of ROLE_WORDS) {
    const at = r.slots[0];
    assert.ok(r.ishchem, `${at}: условие поиска словами`);
    if (r.post) assert.ok(C3_POSTS[r.post], `${at}: должность`);
    for (const m of r.mesto ?? []) assert.ok(PLACES.includes(m), `${at}: место ${m}`);
    if (r.sila) assert.ok(FORCES.some((f) => f.id === r.sila), `${at}: сила`);
    if (r.rep) assert.ok(r.sila && forceById(r.sila).reps.some((x) => x.id === r.rep), `${at}: представитель ${r.rep}`);
    if (r.holder) assert.ok(ids(HOLDER_ROLES).includes(r.holder), `${at}: роль «кто держит»`);
    if (r.dom) assert.ok(HOUSE_ROLES[r.dom], `${at}: место в доме`);
    for (const o of r.origin ?? []) assert.ok(ORIGINS.some((x) => x.id === o), `${at}: происхождение ${o}`);
    // у рода — своё условие поиска
    if (r.rod === "sluzhba") assert.ok(r.mesto?.length, `${at}: служба — при месте`);
    if (r.rod === "prishlye") assert.ok(r.origin?.length, `${at}: пришлые — по происхождению`);
    if (r.rod === "dvor") assert.ok(r.dom || r.mnogo, `${at}: двор — место в доме`);
    if (r.rod === "sila") assert.ok(r.sila || r.storona || r.holder || r.priezzhiy, `${at}: чей человек`);
  }
  // строки, заведённые разметкой, в карточках стоят только как роли без слота
  const novye = ROLE_WORDS.filter((r) => r.novyy).flatMap((r) => r.slots);
  for (const c of DECK) for (const r of c.who) if (r.slot && novye.includes(r.slot) && r.slot !== "двор") assert.ok(r.novyy, `${c.id}: {${r.slot}} — слот разметки`);
  assert.deepEqual([roleWord("беглые"), roleWord("воевода").rep, roleWord("хозяин нити").khozyain], [roleWord("беглый"), "voevoda", true]);
});

test("участник без слота — одно из трёх: толпа, уточнение к названной роли или роль со слотом разметки", () => {
  const crowds = [...ids(LINK_GROUPS), ...Object.keys(CROWDS_EXTRA)];
  for (const c of DECK) {
    const slots = slotsOf(c);
    assert.equal(new Set(slots).size, slots.length, `${c.id}: слот дважды`);
    for (const r of c.who) {
      assert.equal([!!r.slot, !!r.tolpa, !!r.k].filter(Boolean).length, 1, `${c.id}: «${r.text}» — слот, толпа или уточнение`);
      if (r.tolpa) assert.ok(crowds.includes(r.tolpa) && r.text, `${c.id}: толпа ${r.tolpa}`);
      for (const k of r.k ?? []) assert.ok(slots.includes(k), `${c.id}: уточнение к {${k}}, а слота нет`);
      if (r.novyy) assert.ok(r.slot && r.text, `${c.id}: слот разметки хранит слова карточки`);
      if (r.thread) assert.ok(ids(THREADS).includes(r.thread.nit) && (!r.thread.step || stepOf(r.thread.nit, r.thread.step)), `${c.id}: нить роли`);
    }
  }
  const roles = DECK.flatMap((c) => c.who);
  // сто участников без слота: 27 — толпа, 2 — уточнение, 71 получил слот (у 121 «старосты, писарь» — две роли, поэтому слотов разметки 72)
  assert.deepEqual([roles.filter((r) => r.tolpa).length, roles.filter((r) => r.k).length, roles.filter((r) => r.novyy).length], [27, 2, 72]);
  assert.equal(roles.filter((r) => r.slot && !r.novyy).length, 266);
  const tolpa = (g: string) => roles.filter((r) => r.tolpa === g).length;
  assert.deepEqual(["derevni", "sosedi", "marka", "rodnya", "palata", "tully", "prishlye", "sovet", "sluzhilye"].map(tolpa), [10, 4, 4, 3, 2, 1, 1, 1, 1]);
  const card = (n: number) => DECK[n - 1];
  assert.deepEqual(card(74).who[0], { text: "двое советников с разным пристрастием доклада", k: ["десятник", "староста"] });
  assert.deepEqual(card(18).who[0], { text: "бабы деревни", tolpa: "derevni" });
  assert.deepEqual(card(82).who[0], { slot: "советник", text: "советник в запое", novyy: true, thread: { nit: "pyanstvo", step: "запой" } });
  assert.deepEqual(card(121).who.map((r) => [r.slot, r.text ?? null]), [["подьячий", null], ["ревизор", "или"], ["староста", "старосты"], ["писарь", "писарь"]]);
});

test("кто решает: у личного, должностного и пересечения — слоты или помета; у стола — Сенешаль", () => {
  for (const c of DECK) {
    if (!c.variants.length) { assert.equal(c.reshaet, undefined, `${c.id}: решать нечего`); continue; }
    const d = cardDecider(c);
    if (c.level !== "stol") assert.ok(c.reshaet, `${c.id}: кто решает`);
    if (d.kto === "roli") {
      assert.ok(d.slots.length >= 1 && d.slots.every((s) => slotsOf(c).includes(s)), `${c.id}: решает слот карточки`);
      // решающий — человек, а не толпа: должность, служба, двор, пришлый
      for (const s of d.slots) assert.ok(!roleWord(s).mnogo || s === "семья", `${c.id}: решает {${s}}`);
    }
  }
  const by = (k: string) => nums(DECK.filter((c) => c.reshaet?.kto === k));
  // «тот, до кого дошло» — и там, где варианты судьи, а судьи в ролях нет (вопрос автору, koloda.md, раздел 9)
  assert.deepEqual(by("doshlo"), [13, 18, 21, 24, 28, 39, 81, 86, 87, 132]);
  assert.deepEqual(by("za_glavnogo"), [75]);
  // варианты Сенешаля у карточки, которая ещё не поднялась на стол
  assert.deepEqual(by("seneschal"), [78, 93, 94, 138]);
  assert.equal(by("roli").length, 49);
  // стол без пометы — Сенешаль; единственный стол со слотом — 116 «Сманить двор»: открытый для деревни
  assert.deepEqual(DECK.filter((c) => c.level === "stol" && c.reshaet).map((c) => [c.n, cardDecider(c)]), [[116, { kto: "roli", slots: ["староста"] }]]);
  assert.deepEqual(cardDecider(DECK[1]), { kto: "seneschal" });
  assert.deepEqual([cardDecider(DECK[0]), cardDecider(DECK[75])], [{ kto: "roli", slots: ["староста", "староста соседа"] }, { kto: "roli", slots: ["писарь", "ключник", "староста"] }]);
});

test("«держит»: совесть — у всех вариантов «по душе лукавым», страх и верность — разметкой; «правило» в карточку не пишется", () => {
  const V = DECK.flatMap((c) => c.variants.map((v, i) => ({ id: `${c.n}.${i + 1}`, v })));
  for (const { id, v } of V) {
    for (const h of v.derzhit ?? []) assert.ok(["sovest", "strakh", "vernost"].includes(h), `${id}: удержка ${h}`);
    if (v.words.includes("лукавство")) assert.ok(v.derzhit?.includes("sovest"), `${id}: лукавый вариант держит совесть`);
    if (v.derzhit) assert.equal(new Set(v.derzhit).size, v.derzhit.length, `${id}: удержка дважды`);
  }
  const s = (h: string) => V.filter((x) => x.v.derzhit?.includes(h as never)).map((x) => x.id);
  const lukavykh = V.filter((x) => x.v.words.includes("лукавство")).length;
  assert.deepEqual([lukavykh, s("sovest").length, s("strakh").length, s("vernost").length, V.filter((x) => x.v.derzhit).length], [32, 36, 23, 11, 47]);
  // совесть сверх лукавых — ложь в книге и отчёте, отступное
  assert.deepEqual(V.filter((x) => x.v.derzhit?.includes("sovest") && !x.v.words.includes("лукавство")).map((x) => x.id), ["97.2", "102.2", "118.2", "129.3"]);
  assert.deepEqual(s("vernost"), ["19.2", "26.2", "26.3", "43.2", "62.4", "76.1", "82.1", "82.4", "124.3", "126.2", "128.3"]);
  // страх — по словам исхода: «если узнают», «тайна», «найдёт — пеня», «спросят»
  for (const id of s("strakh")) {
    const v = V.find((x) => x.id === id)!.v;
    assert.match(v.outcome.text, /узна|найд|пойма|вскро|всплыв|тайн|пен[яюи]|опал|спрос|поймёт|донос|вербует/, `${id}: слова страха в исходе`);
  }
  // сговор писаря (76): согласиться — против совести и верности
  assert.deepEqual(DECK[75].variants.map((v) => v.derzhit), [["sovest", "vernost"], undefined, undefined, undefined]);
});

test("«разговор» — вариант, где Сенешаль говорит с человеком: слот собеседника объявлен", () => {
  const V = DECK.flatMap((c) => c.variants.map((v, i) => ({ id: `${c.n}.${i + 1}`, v, c })));
  for (const { id, v, c } of V.filter((x) => x.v.razgovor)) {
    assert.ok(slotsOf(c).includes(v.razgovor!), `${id}: собеседник {${v.razgovor}}`);
    // вариант может достаться Сенешалю: карточка стола, поднимается на стол или отдана ему разметкой
    assert.ok(c.level === "stol" || c.rises === "stol" || cardDecider(c).kto !== "roli", `${id}: разговор у варианта, который Сенешалю не достанется`);
  }
  assert.equal(V.filter((x) => x.v.razgovor).length, 35);
  const razgovor = (n: number) => DECK[n - 1].variants.map((v) => v.razgovor ?? null);
  // «поговорить с глазу на глаз», «помирить», «наедине, по её вере» (svyazi.md, 9.4)
  assert.deepEqual([razgovor(67), razgovor(63), razgovor(73)], [["ключник", null, null, null], [null, null, null, "десятник"], [null, null, "староста", null]]);
});

test("исходы: у каждого варианта — поле, отложенный исход, фактура или вопрос; новые поля и отложенный исход — из словарей", () => {
  const V = DECK.flatMap((c) => c.variants.map((v, i) => ({ id: `${c.n}.${i + 1}`, o: v.outcome, c })));
  const fields = (o: CardOutcome) => Object.keys(o).filter((k) => k !== "text");
  assert.equal(V.length, 472);
  for (const { id, o, c } of V) {
    assert.ok(fields(o).length >= 1, `${id}: исход не размечен`);
    // фактура — только когда больше ничего нет: строка летописи, состояния не меняет
    if (o.faktura) assert.deepEqual(fields(o), ["faktura"], `${id}: фактура рядом с полем`);
    if (o.vopros) assert.ok(OUTCOME_QUESTIONS[o.vopros], `${id}: вопрос ${o.vopros}`);
    if (o.mesto) assert.ok(ids(DECK_PLACES).includes(o.mesto.mesto) && [1, -1].includes(o.mesto.v), `${id}: ступень места`);
    if (o.ukrytie) assert.ok([...PLACES].includes(o.ukrytie.derevnya) && [1, -1].includes(o.ukrytie.v), `${id}: укрытие`);
    if (o.ruki) assert.ok(o.ruki.kto, `${id}: чьи руки заняты`);
    if (o.rabota) assert.ok(o.rabota.chto && ["da", "net", "napolovinu"].includes(o.rabota.sdelana), `${id}: работа`);
    if (o.nit?.kak) assert.ok(["spit", "stoit", "vniz"].includes(o.nit.kak), `${id}: что с нитью`);
    for (const d of o.otlozhen ?? []) {
      // слова — из исхода варианта или из строки «Шкалы» карточки
      const nachalo = d.text.split(";")[0].split(" — ")[0].slice(0, 12);
      assert.ok(d.text && [o.text, ...(c.shkaly ?? [])].some((x) => x.includes(nachalo)), `${id}: отложенный исход — словами карточки`);
      assert.ok(d.esli.length >= 1 || d.srok || d.card || d.budet, `${id}: у отложенного исхода нет ни условия, ни срока`);
      if (d.card) assert.ok(DECK.some((x) => x.id === d.card) && d.card !== c.id, `${id}: отложенный исход ведёт на ${d.card}`);
      if (d.budet) assert.ok(!DECK.some((x) => x.name === d.budet), `${id}: «${d.budet}» уже есть в колоде`);
      if (d.pole?.nit) assert.ok(ids(THREADS).includes(d.pole.nit.nit) && (!d.pole.nit.step || stepOf(d.pole.nit.nit, d.pole.nit.step)), `${id}: нить в отложенном исходе`);
      for (const s of d.pole?.shkala ?? []) assert.equal(SCALE_FORCE[s.scale], s.sila, `${id}: шкала в отложенном исходе`);
    }
  }
  const n = (f: (o: CardOutcome) => unknown) => V.filter((x) => f(x.o)).length;
  // 194 варианта были без полей (svyazi.md, 10.2); теперь размечен каждый
  assert.deepEqual([n((o) => o.otlozhen), V.reduce((s, x) => s + (x.o.otlozhen?.length ?? 0), 0), n((o) => o.faktura), n((o) => o.vopros)], [105, 105, 47, 31]);
  assert.deepEqual((["znanie", "slava", "chelovek"] as const).map((k) => n((o) => o.vopros === k)), [17, 9, 5]);
  // три новых поля рода «переводится в поля»: ступень места и укрытие деревни; руки заняты до срока; работа сделана или нет
  assert.deepEqual([n((o) => o.mesto), n((o) => o.ukrytie), n((o) => o.ruki), n((o) => o.rabota)], [4, 14, 24, 10]);
  const out = (n1: number, v: number) => DECK[n1 - 1].variants[v - 1].outcome;
  // «тын в покос» (59): работа сделана, не сделана, наполовину
  assert.deepEqual([1, 2, 3, 4].map((v) => out(59, v).rabota?.sdelana), ["da", "net", "napolovinu", "da"]);
  assert.deepEqual(out(59, 2).ukrytie, { derevnya: "verkhnyaya", v: -1 });
  assert.deepEqual(out(136, 1).ruki, { kto: "мужики на гати", do: "две недели, до снега" });
  // отложенный исход: условие и срок (10.2) — «через сезон видно, чей он», «если он лихой — гнездо», «если узнают — недоимка»
  assert.deepEqual(out(47, 3).otlozhen, [{ esli: [], srok: "через сезон", text: "видно, чей он" }]);
  assert.deepEqual(out(47, 1).otlozhen, [{ esli: [naNiti("пришлый", "proshloe", undefined, "лихой")], text: "гнездо лиха" }]);
  assert.deepEqual(out(103, 2).otlozhen![0].esli, [u.bylo("uznali")]);
  assert.equal(out(103, 2).otlozhen![0].pole!.zhetonHod!.chto, "sorvan");
  // развилка «по случаю» и «по натуре» — тоже записью с условием
  assert.deepEqual(out(13, 2).otlozhen![0].esli, [u.mir("sluchay")]);
  assert.deepEqual(out(78, 3).otlozhen![0].esli, [u.chelovek("priznak", { rol: "хозяин нити", text: "по натуре" })]);
});

test("«выше» — условиями словаря; «дальше» — ссылкой или заметкой: строк только словами не осталось", () => {
  for (const c of DECK) {
    assert.equal(!!c.vyshe, !!c.vysheUsl?.length, `${c.id}: «выше» условиями`);
    for (const d of c.dalshe) {
      assert.equal([!!d.card || !!d.nit || !!d.budet, !!d.zametka].filter(Boolean).length, 1, `${c.id}: «${d.text}» — ссылка или заметка`);
      if (d.card) assert.ok(DECK.some((x) => x.id === d.card), `${c.id}: «дальше» на ${d.card}`);
      if (d.step) assert.ok(d.nit && stepOf(d.nit, d.step), `${c.id}: ступень «${d.step}»`);
    }
  }
  assert.equal(DECK.filter((c) => c.vysheUsl).length, 30);
  // поднимается, а строки «выше» нет — дело идёт на стол, если участники не сошлись (10.3)
  assert.deepEqual(nums(DECK.filter((c) => c.rises && c.rises !== "molva" && !c.vyshe)), [5, 14, 45, 81, 93, 94, 125, 126, 127, 128, 131, 132, 133, 138]);
  const D = DECK.flatMap((c) => c.dalshe);
  // 59 строк были словами: 16 — на карточки, которых ещё нет, 3 стали ссылками на нить, 40 остались заметками
  const skolko = (f: (d: (typeof D)[number]) => unknown) => D.filter(f).length;
  assert.deepEqual([D.length, skolko((d) => d.card), skolko((d) => d.nit), skolko((d) => d.budet), skolko((d) => d.zametka)], [211, 80, 76, 16, 40]);
  assert.deepEqual(DECK[0].vysheUsl, [u.bylo("ne_soshlis"), u.sila("na_roli", { sila: "ratsha", text: "сосед — Ратша" })]);
  assert.deepEqual(DECK[76].dalshe[0], { text: "обошлось — у взявшего черта «Нечист на руку» (скрытая), нить на «привычке»", nit: "dengi", step: "привычка" });
});

test("следы: ясность по умолчанию — по каналу; след без канала — на виду, с каналом по тексту или оговорка", () => {
  assert.deepEqual(Object.keys(CHANNEL_YASNOST).sort(), ids(CHANNELS).sort());
  assert.deepEqual([CHANNEL_YASNOST.ushi, CHANNEL_YASNOST.molva, CHANNEL_YASNOST.vid, CHANNEL_YASNOST.doklad, CHANNEL_YASNOST.vedomost, CHANNEL_YASNOST.mesto],
    ["smutno", "smutno", "zametno", "zametno", "yasno", "yasno"]);
  const T = DECK.flatMap((c) => c.traces.map((t) => ({ n: c.n, t })));
  for (const { n, t } of T) {
    assert.ok(CLARITY[traceYasnost(t)], `${n}: ясность`);
    if (t.poTekstu) assert.ok(t.gde.length === 1, `${n}: канал по тексту — один`);
    if (t.zametka) assert.ok(!t.gde.length, `${n}: оговорка — не след`);
  }
  // 13 следов без канала: четырём канал дан по тексту строки, два — оговорки («почти никаких»), семь — дело само на виду
  assert.deepEqual([nums2(T, (t) => !!t.poTekstu), nums2(T, (t) => !!t.zametka)], [[48, 106, 107, 109], [109, 111]]);
  assert.deepEqual(nums2(T, (t) => !t.gde.length && !t.zametka), [92, 95, 96, 101, 108, 119, 122]);
  const tr = (n: number, i: number) => DECK[n - 1].traces[i];
  // карточка называет ясность — берётся она; не называет — по каналу; на виду — «громко»
  const yas = (n: number, i: number) => traceYasnost(tr(n, i));
  assert.deepEqual([yas(92, 0), yas(96, 0), yas(1, 0), yas(1, 1), yas(2, 1)], ["yasno", "gromko", "zametno", "smutno", "yasno"]);
  assert.deepEqual(tr(106, 1), { gde: ["mesto"], text: "деревни ворчат", poTekstu: true });
  // два канала у следа — у каждого своя ясность
  assert.deepEqual([traceYasnost(tr(13, 0), "ushi"), traceYasnost(tr(13, 0), "prisutstvie")], ["smutno", "zametno"]);
});
function nums2<T>(list: { n: number; t: T }[], f: (t: T) => boolean): number[] { return list.filter((x) => f(x.t)).map((x) => x.n); }

test("ступени нитей: у каждой из 120 — род шага; последняя ступень нити — развязка; двойной ступени — оба рода", () => {
  assert.deepEqual(ids(STEP_RODS), ["sam", "drugoy", "obstoyatelstvo", "razvyazka"]);
  const S = THREAD_DEFS.flatMap((t) => t.steps.map((s, i) => ({ id: `${t.id}.${i + 1}`, s, last: i === t.steps.length - 1 })));
  assert.equal(S.length, 120);
  for (const { id, s, last } of S) {
    assert.ok(s.rod.length >= 1 && s.rod.length <= 2 && s.rod.every((r) => ids(STEP_RODS).includes(r)) && new Set(s.rod).size === s.rod.length, `${id}: род шага`);
    assert.equal(s.rod.includes("razvyazka"), last, `${id}: развязка — последняя ступень и только она`);
    if (last) assert.deepEqual(s.rod, ["razvyazka"], `${id}: у развязки один род`);
  }
  const main = (r: string) => S.filter((x) => x.s.rod[0] === r).map((x) => x.id);
  // свой счёт по главному условию строки «вверх»; прикидка чата в svyazi.md, 11.4 — 17, 21, 52, 30
  assert.deepEqual(["sam", "drugoy", "obstoyatelstvo", "razvyazka"].map((r) => main(r).length), [18, 26, 46, 30]);
  // семнадцать ступеней «решает сам» из таблицы svyazi.md, 11.4, и «Срок» у «долга»: там «человек решает по весам»
  assert.deepEqual(main("sam"), ["dengi.1", "dolg.2", "azart.3", "posuly.1", "draka.1", "soglyadatay.1", "mest.1", "mest.3", "sabotazh.1", "khvor.1", "vina.1", "metka.1",
    "podsidet.3", "son.1", "propavshiy.3", "obet.1", "obet.2", "dobroe_imya.2"]);
  assert.deepEqual(S.filter((x) => x.s.rod.length === 2).map((x) => [x.id, ...x.s.rod]), [
    ["dengi.3", "obstoyatelstvo", "drugoy"], ["draka.3", "obstoyatelstvo", "drugoy"], ["lyubov.3", "drugoy", "obstoyatelstvo"], ["krov.2", "drugoy", "obstoyatelstvo"],
    ["rodnya.1", "drugoy", "obstoyatelstvo"], ["svoy_dvor.1", "drugoy", "obstoyatelstvo"],
  ]);
  // добрые нити шагают от обстоятельств и чужих решений: «сам» среди них только обет и «Слушают» у доброго имени
  const dobrye = THREAD_DEFS.filter((t) => t.sign === "dobraya").map((t) => t.id);
  assert.deepEqual(main("sam").filter((id) => dobrye.includes(id.split(".")[0] as never)), ["obet.1", "obet.2", "dobroe_imya.2"]);
});

test("ступени нитей: кто решает у «решает другой», метки чаш — из словарей, обстоятельство — условием словаря", () => {
  const CHASHI = [...POLES, ...ids(WANTS), ...ids(HOLDS), "obida", "dobro"];
  const DECIDERS = [...ids(HOLDER_ROLES), ...Object.keys(STEP_DECIDERS)];
  const S = THREAD_DEFS.flatMap((t) => t.steps.map((s, i) => ({ id: `${t.id}.${i + 1}`, s, t })));
  for (const { id, s, t } of S) {
    assert.equal(s.rod.includes("drugoy"), !!s.kto?.length, `${id}: «кто» — у «решает другой» и только у него`);
    for (const k of s.kto ?? []) assert.ok(DECIDERS.includes(k), `${id}: решает ${k}`);
    // держатель, названный решающим, — из держателей самой нити
    for (const k of s.kto ?? []) if (ids(HOLDER_ROLES).includes(k)) assert.ok(t.holders.includes(k as never), `${id}: ${k} не держит эту нить`);
    for (const k of [...(s.chashi?.vverkh ?? []), ...(s.chashi?.stop ?? [])]) assert.ok(CHASHI.includes(k), `${id}: метка чаши ${k}`);
    if (s.chashi) assert.ok((s.chashi.vverkh?.length ?? 0) + (s.chashi.stop?.length ?? 0) >= 1, `${id}: пустые чаши`);
    // условие «вверх» или «стоп» есть везде, где каталог даёт строку про обстоятельство
    if (s.rod[0] === "obstoyatelstvo") assert.ok((s.usl?.vverkh?.length ?? 0) + (s.usl?.stop?.length ?? 0) >= 1, `${id}: обстоятельство без условия`);
    if (s.usl?.vniz) assert.ok(s.down?.est, `${id}: условие «вниз», а шага назад у ступени нет`);
    if (s.down?.est) assert.ok(s.usl?.vniz?.length, `${id}: шаг назад без условия`);
  }
  // чаши названы в каталоге не у всех «сам»: шести ступеням метки взять неоткуда (вопрос автору, niti.md, раздел 10)
  assert.deepEqual(S.filter((x) => x.s.rod.includes("sam") && !x.s.chashi).map((x) => x.id), ["dolg.2", "podsidet.3", "son.1", "propavshiy.3", "obet.1", "dobroe_imya.2"]);
  assert.deepEqual(S.filter((x) => x.s.rod[0] === "drugoy" && x.s.chashi).map((x) => x.id), ["posuly.2", "draka.2", "soglyadatay.3", "son.3"]);
  const step = (nit: string, i: number) => threadDef(nit as never).steps[i - 1];
  // деньги, «Соблазн»: тянут нужда и слабый надзор, держат удержки — слова каталога
  assert.deepEqual(step("dengi", 1).chashi, { vverkh: ["dengi"], stop: ["sovest", "strakh", "vernost", "pravilo"] });
  assert.deepEqual(step("dengi", 1).usl!.vverkh!.map((c) => `${c.rod}.${c.chto}`), ["chelovek.dostatok", "mesto.prismotr"]);
  // страх тянет вверх, а не держит: метка, скрытая вина, хворь (svyazi.md, 11.4)
  for (const [nit, i] of [["metka", 1], ["vina", 1], ["khvor", 1]] as const) assert.ok(step(nit, i).chashi!.vverkh!.includes("strakh"), `${nit}: страх на чаше «вверх»`);
  // память обиды на чаше: драка и месть
  assert.ok(step("mest", 1).chashi!.vverkh!.includes("obida") && step("draka", 1).chashi!.vverkh!.includes("obida"));
  // где решает Сенешаль — «Просит» у «уйти», «надела», «своего дела», «Просит за своего», лес для «своего двора», приём «вернувшегося»
  for (const [nit, i] of [["uyti", 3], ["nadel", 3], ["svoe_delo", 2], ["rodnya", 1], ["svoy_dvor", 1], ["vernulsya", 3]] as const) {
    assert.ok(step(nit, i).kto!.includes("seneschal"), `${nit}: решает Сенешаль`);
  }
  assert.deepEqual(step("dolg", 3).kto, ["zaimodavets"]);
});

test("следы ступеней: 28 следов без канала — канал по тексту строки, оговорка или дело на виду; ясность — по ступени", () => {
  const T = THREAD_DEFS.flatMap((t) => t.steps.flatMap((s, i) => s.traces.map((x) => ({ t, i, x }))));
  assert.equal(T.length, 181);
  assert.deepEqual([T.filter((y) => y.x.poTekstu).length, T.filter((y) => y.x.zametka).length, T.filter((y) => !y.x.gde && !y.x.zametka).length], [11, 1, 16]);
  for (const { t, i, x } of T) {
    assert.ok(CLARITY[stepTraceYasnost(t, i, x)], `${t.id}: ясность следа`);
    if (x.gde) assert.ok(ids(CHANNELS).includes(x.gde), `${t.id}: канал`);
    if (x.poTekstu) assert.ok(x.gde, `${t.id}: канал по тексту`);
    if (x.zametka) assert.ok(!x.gde, `${t.id}: оговорка — не след`);
  }
  const dengi = threadDef("dengi");
  // каталог называет ясность — берётся она; иначе первая ступень — смутно, средние — по каналу, последняя — ясно, без канала — громко
  const sy = (t: typeof dengi, step: number, i: number) => stepTraceYasnost(t, step, t.steps[step].traces[i]);
  assert.deepEqual([sy(dengi, 0, 0), sy(dengi, 2, 1), sy(dengi, 2, 2), sy(dengi, 3, 1)], ["smutno", "zametno", "smutno", "yasno"]);
  assert.equal(sy(threadDef("pyanstvo"), 2, 0), "gromko");
  assert.deepEqual(threadDef("uyti").steps[3].traces[0], { gde: "mesto", text: "пустой двор с заколоченной дверью", poTekstu: true });
});
