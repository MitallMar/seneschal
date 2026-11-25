// Колода событий акта 1 (задача И28): первая пачка — 40 карточек данными. Замысел — docs/design/koloda.md.
// Движка событий ещё нет: тест проверяет, что карточки собраны только из слов словаря и ссылаются на то, что есть.
import { test } from "node:test";
import assert from "node:assert/strict";
import { SIGNS, BAG } from "../src/data/natura";
import { WANTS, HOLDS, CHANNELS, THREADS } from "../src/data/portrait";
import {
  DECK, DEALS, DECK_PLACES, WHERE_ANY, OUTSIDE, CARD_WHEN, CARD_LEVELS, CARD_KINDS, CARD_THEMES, LIKE_WORDS, cardById, type DeckCard,
} from "../src/data/deck";

const ids = <T extends string>(list: { id: T }[]): string[] => list.map((x) => x.id);
const POLES = SIGNS.flatMap((s) => [`${s.id}+`, `${s.id}-`]);
const LIKES = [...POLES, ...ids(WANTS), ...ids(HOLDS), "osnova"];
// слоты в тексте: «{староста}»
const slotsIn = (text: string): string[] => [...text.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]);
const declared = (c: DeckCard): string[] => c.who.filter((r) => r.slot).map((r) => r.slot!);

test("первая пачка: 40 карточек, номера и id не повторяются, id латиницей, восемь тем из десяти", () => {
  assert.equal(DECK.length, 40);
  assert.deepEqual(DECK.map((c) => c.n), Array.from({ length: 40 }, (_, i) => i + 1));
  assert.equal(new Set(DECK.map((c) => c.id)).size, 40);
  for (const c of DECK) {
    assert.ok(/^[a-z_]+$/.test(c.id) && c.name && c.intro && /^[А-ЯЁ«]/.test(c.intro), c.id);
    assert.ok(CARD_THEMES[c.theme] && CARD_KINDS[c.kind] && CARD_WHEN[c.when], c.id);
    assert.equal(cardById(c.id), c);
  }
  assert.throws(() => cardById("net_takoy"), /нет карточки/);
  assert.equal(new Set(DECK.map((c) => c.theme)).size, 8);
  // по темам — как в koloda.md, раздел 3
  const count = (theme: string) => DECK.filter((c) => c.theme === theme).length;
  assert.deepEqual(["zemlya", "dvory", "kromka", "khram", "dengi", "lyudi", "sovet", "predaniya"].map(count), [5, 7, 7, 5, 5, 6, 3, 2]);
  // как есть — 29, переносом — 11; у переноса сказано, откуда
  assert.deepEqual([DECK.filter((c) => c.source.how === "kak_est").length, DECK.filter((c) => c.source.how === "perenos").length], [29, 11]);
  for (const c of DECK) assert.ok(c.source.texts.length >= 1 && c.source.texts.every((n) => n >= 1 && n <= 112) && (c.source.how === "perenos") === !!c.source.from, c.id);
});

test("уровень и вид: у события и эпизода — уровень, у эпизода — дело из каталога, у предания и вести уровня нет", () => {
  assert.equal(DEALS.length, 15);
  for (const c of DECK) {
    if (c.kind === "predanie" || c.kind === "vest") assert.equal(c.level, undefined, c.id);
    else assert.ok(c.level && CARD_LEVELS[c.level], `${c.id}: нет уровня`);
    assert.equal(c.kind === "epizod", !!c.delo, `${c.id}: дело — у эпизода и только у него`);
    if (c.delo) assert.ok(ids(DEALS).includes(c.delo), `${c.id}: дело ${c.delo}`);
    if (c.rises && c.rises !== "molva") assert.ok(CARD_LEVELS[c.rises] && c.rises !== c.level, `${c.id}: поднимается на свой же уровень`);
    for (const v of c.variants) if (v.outcome.delo) assert.ok(ids(DEALS).includes(v.outcome.delo), `${c.id}: дело в исходе`);
  }
  assert.deepEqual(DECK.filter((c) => c.kind === "epizod").map((c) => c.n), [1, 2, 3, 31, 36, 38]);
  assert.deepEqual([cardById("srok_vyshel").kind, cardById("sosed_ushyol_perezhdat").kind], ["predanie", "vest"]);
  assert.deepEqual(DECK.filter((c) => c.tags?.includes("beda")).map((c) => c.n), [17, 34]);
});

test("место — из мест Концепта 3 или с пометой «за пределами»", () => {
  assert.equal(DECK_PLACES.length, 14);
  const known = [...ids(DECK_PLACES), ...Object.keys(WHERE_ANY)];
  for (const c of DECK) {
    for (const w of c.where) assert.ok(known.includes(w), `${c.id}: место ${w}`);
    if (c.outside) assert.ok(OUTSIDE[c.outside], c.id);
    assert.ok(c.where.length >= 1 || c.outside, `${c.id}: ни места, ни «за пределами»`);
  }
  assert.deepEqual(DECK.filter((c) => c.outside).map((c) => [c.n, c.outside]), [[40, "sosed"]]);
});

test("кто: каждый слот завязки, вариантов, исходов и отношений объявлен; условия ролей — из мешка и словаря", () => {
  for (const c of DECK) {
    const slots = declared(c);
    assert.ok(c.who.length >= 1 && c.who.every((r) => r.slot || r.text), `${c.id}: пустая роль`);
    assert.equal(new Set(slots).size, slots.length, `${c.id}: слот объявлен дважды`);
    const texts = [c.intro, ...c.variants.flatMap((v) => [v.text, v.outcome.text, ...(v.outcome.otnosheniya ?? []).map((o) => o.kto)]), ...c.traces.map((t) => t.text)];
    for (const s of texts.flatMap(slotsIn)) assert.ok(slots.includes(s), `${c.id}: слот {${s}} не объявлен в «Кто»`);
    for (const r of c.who) {
      if (r.trait) assert.ok(BAG.some((t) => t.id === r.trait), `${c.id}: черта ${r.trait}`);
      if (r.want) assert.ok(ids(WANTS).includes(r.want), `${c.id}: желание ${r.want}`);
      if (r.thread) assert.ok(ids(THREADS).includes(r.thread.nit), `${c.id}: нить ${r.thread.nit}`);
    }
    if (c.oneOf) assert.ok(BAG.some((t) => t.id === c.oneOf!.trait) && c.oneOf.slots.every((s) => slots.includes(s)), `${c.id}: «у одного из»`);
  }
  // условия из карточек: стражник с «Пристрастился к чарке»; у одного из троих — «Нечист на руку»
  assert.equal(cardById("pyan_v_dozore").who[0].trait, "charka");
  assert.deepEqual(cardById("ukho_snova").oneOf, { slots: ["мужик", "писарь", "десятник"], trait: "nechist_na_ruku" });
});

test("варианты: три-четыре; метки «кому по душе» — только из словаря; слова карточек переведены одной таблицей", () => {
  assert.equal(new Set(LIKE_WORDS.map((w) => w.word)).size, LIKE_WORDS.length);
  for (const w of LIKE_WORDS) assert.ok(w.likes.length >= 1 && w.likes.every((k) => LIKES.includes(k)), `слово «${w.word}»`);
  const without = DECK.filter((c) => !c.variants.length);
  // у двух карточек вариантов нет в самом документе: они помечены, остальным положено три-четыре
  assert.deepEqual(without.map((c) => c.n), [32, 37]);
  for (const c of without) assert.ok(c.noVariants, c.id);
  for (const c of DECK.filter((x) => x.variants.length)) {
    assert.ok(c.variants.length >= 3 && c.variants.length <= 4 && !c.noVariants, `${c.id}: вариантов ${c.variants.length}`);
    for (const v of c.variants) {
      assert.ok(v.text && /^[А-ЯЁ«]/.test(v.text), `${c.id}: вариант без текста`);
      assert.ok(v.likes.every((k) => LIKES.includes(k)), `${c.id}: метка не из словаря — ${v.likes.join(", ")}`);
      assert.deepEqual(v.likes, [...new Set(v.words.flatMap((x) => LIKE_WORDS.find((q) => q.word === x)!.likes))], `${c.id}: метки — по таблице слов`);
    }
  }
  // каждое слово таблицы встречается в пачке; неясные переводы помечены
  const used = new Set(DECK.flatMap((c) => c.variants.flatMap((v) => v.words)));
  assert.deepEqual(LIKE_WORDS.filter((w) => !used.has(w.word)).map((w) => w.word), []);
  assert.deepEqual(LIKE_WORDS.filter((w) => w.unsure).map((w) => w.word), ["забота", "мир", "правда", "основа"]);
  // примеры перевода: «порядок» — людям порядка, «выгода» — желание денег, «по душе боящимся» — удержка «страх»
  const first = cardById("mezha_do_sukhoy_beryozy").variants;
  assert.deepEqual(first.map((v) => v.likes), [["lyubopytstvo-"], ["poryadok+"], ["terpenie+"], []]);
  assert.deepEqual(cardById("kosyat_pod_ruku").variants[1].likes, ["smelost+", "zhestkost+"]);
  assert.deepEqual(cardById("izba_starika").variants[1].likes, ["strakh"]);
  assert.ok(cardById("pomol_ispolu_na_zalome").variants[2].likes.includes("osnova"));
});

test("исходы: серебро числом, хлеб и сено словами, дворы, слово Сенешаля, отношения; нити и черты — из словаря и мешка", () => {
  for (const c of DECK) {
    for (const v of c.variants) {
      const o = v.outcome;
      if (o.serebro !== undefined) assert.ok([-2, -1, 1].includes(o.serebro), `${c.id}: серебро ${o.serebro}`);
      if (o.dvory !== undefined) assert.ok(Number.isInteger(o.dvory) && o.dvory !== 0, `${c.id}: дворы`);
      for (const text of [o.khleb, o.seno]) if (text !== undefined) assert.ok(text.length > 3, `${c.id}: хлеб и сено — словами`);
      for (const x of o.otnosheniya ?? []) assert.ok(x.kto && (x.v === 1 || x.v === -1), `${c.id}: отношения`);
      if (o.nit) assert.ok(ids(THREADS).includes(o.nit.nit), `${c.id}: нить в исходе`);
      if (o.trait) assert.ok(BAG.some((t) => t.id === o.trait), `${c.id}: черта в исходе`);
    }
  }
  const sum = (f: (c: DeckCard) => number) => DECK.reduce((s, c) => s + f(c), 0);
  assert.ok(sum((c) => c.variants.filter((v) => v.outcome.serebro).length) >= 15, "серебро есть в исходах");
  assert.ok(sum((c) => c.variants.filter((v) => v.outcome.otnosheniya).length) >= 20, "отношения есть в исходах");
  assert.deepEqual(cardById("vtorye_synovya_bez_otpuska").variants.map((v) => v.outcome.dvory), [3, 3, undefined]);
  assert.deepEqual(cardById("klin_za_pud_myoda").variants[0].outcome.slovo, 1);
  assert.deepEqual(cardById("pustye_marki_prodayut_grafam").variants[0].outcome, { text: "слово Сенешаля под залог", slovo: "zalog", zheton: "обещание деревням" });
  // вариант даёт черту и ступень нити: «Дрова в долг» — «В долгах», «Смотр метки» — «Прячет меченое дитя»
  assert.deepEqual(cardById("drova_v_dolg").variants[0].outcome.trait, "v_dolgakh");
  assert.deepEqual(cardById("smotr_metki").variants[1].outcome.trait, "pryachet_mechenoe");
});

test("лихо: у карточек из likho.md, раздел 10, исходы двигают лихо в обе стороны или только вверх", () => {
  const likho = (id: string) => cardById(id).variants.map((v) => v.outcome.likho ?? 0);
  assert.deepEqual(likho("dobro_broshennykh_dvorov"), [-1, 1, 0]);
  assert.deepEqual(likho("pyan_v_dozore"), [-1, 1, 0]);
  assert.deepEqual(likho("drova_v_dolg"), [1, 1, 0]);
  assert.deepEqual(likho("dve_knigi_skupshchika"), [-1, 1, 1]);
  assert.deepEqual(likho("sol_po_vadelinskoy_tsene"), [0, 1, 0]);
  // «Мешки с мельницы» — шестая из списка, но вариантов у неё в документе нет
  assert.ok(cardById("meshki_s_melnitsy").noVariants?.includes("Лихо"));
  // у остальных карточек лиха в исходах нет
  assert.deepEqual(DECK.filter((c) => c.variants.some((v) => v.outcome.likho)).map((c) => c.n), [11, 19, 25, 26, 30]);
});

test("следы: канал из словаря и текст", () => {
  for (const c of DECK) for (const t of c.traces) assert.ok(t.text && t.gde.length >= 1 && t.gde.every((g) => ids(CHANNELS).includes(g)), `${c.id}: след`);
  assert.equal(DECK.reduce((s, c) => s + c.traces.length, 0), 27);
  assert.deepEqual(cardById("sledy_na_ldu").traces[0].gde, ["ushi", "prisutstvie"]);
  assert.deepEqual(cardById("ukho_snova").traces, [{ gde: ["vedomost"], text: "головных больше, чем убитых зверей" }]);
});

test("нити и «дальше»: ступень и начало нити — из словаря; «дальше» ведёт на карточку пачки, на нить словаря или на будущую карточку по имени", () => {
  for (const c of DECK) {
    if (c.thread) assert.ok(ids(THREADS).includes(c.thread.nit), `${c.id}: нить ${c.thread.nit}`);
    for (const d of c.dalshe) {
      assert.ok(d.text, c.id);
      if (d.card) assert.ok(DECK.some((x) => x.id === d.card), `${c.id}: «дальше» на карточку ${d.card}`);
      if (d.nit) assert.ok(ids(THREADS).includes(d.nit), `${c.id}: «дальше» на нить ${d.nit}`);
      if (d.budet) assert.ok(!DECK.some((x) => x.name === d.budet), `${c.id}: «${d.budet}» уже есть в пачке — нужна ссылка card`);
    }
  }
  assert.deepEqual(DECK.filter((c) => c.thread).map((c) => [c.n, c.thread!.nit, c.thread!.start ?? false]),
    [[16, "dengi", false], [19, "pyanstvo", false], [23, "dengi", false], [25, "dolg", true], [35, "metka", true]]);
  assert.deepEqual(DECK.flatMap((c) => c.dalshe.filter((d) => d.nit).map((d) => [c.n, d.nit])), [[14, "metka"], [25, "dolg"], [30, "svadba"], [32, "metka"], [37, "dengi"]]);
  assert.equal(DECK.flatMap((c) => c.dalshe.filter((d) => d.budet)).length, 6);
});
