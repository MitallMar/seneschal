// Колода событий акта 1: первая пачка — 40 карточек (задача И28), вторая — 103 карточки, № 41–143 (задача И32). Замысел — docs/design/koloda.md.
// Движка событий ещё нет: тест проверяет, что карточки собраны только из слов словаря и ссылаются на то, что есть.
import { test } from "node:test";
import assert from "node:assert/strict";
import { SIGNS, BAG } from "../src/data/natura";
import { WANTS, HOLDS, CHANNELS, THREADS } from "../src/data/portrait";
import {
  DECK, DEALS, DECK_PLACES, WHERE_ANY, OUTSIDE, CARD_WHEN, CARD_LEVELS, CARD_KINDS, CARD_THEMES, LIKE_WORDS, SCALE_FORCE, cardById, type DeckCard,
} from "../src/data/deck";
import { FORCES, NEIGHBORS, forceById } from "../src/data/forces";
import { THREAD_DEFS, CLARITY } from "../src/data/threads";

const ids = <T extends string>(list: { id: T }[]): string[] => list.map((x) => x.id);
const POLES = SIGNS.flatMap((s) => [`${s.id}+`, `${s.id}-`]);
const LIKES = [...POLES, ...ids(WANTS), ...ids(HOLDS), "osnova"];
// слоты в тексте: «{староста}»
const slotsIn = (text: string): string[] => [...text.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]);
const declared = (c: DeckCard): string[] => c.who.filter((r) => r.slot).map((r) => r.slot!);
// первая пачка — № 1–40, вторая — № 41–143
const FIRST = DECK.filter((c) => c.n <= 40);
const SECOND = DECK.filter((c) => c.n > 40);
const nums = (list: DeckCard[]): number[] => list.map((c) => c.n);
const range = (a: number, b: number): number[] => Array.from({ length: b - a + 1 }, (_, i) => a + i);
// без вариантов игрока: скрытый ход (половина карточки), ход с открытой стороной в другой карточке и опора
const noVariants = (c: DeckCard): boolean => c.kind === "opora" || (c.kind === "khod" && (!c.hod!.open || !!c.hod!.otkrytaya));
// ступень в карточке названа словами: «копает» — ступень «Копает или показывает», «записан» — развязка
const stepOf = (nit: string, step: string): boolean => {
  const t = THREAD_DEFS.find((x) => x.id === nit)!;
  return [...t.steps, ...t.endings].some((x) => x.name.toLowerCase().startsWith(step.toLowerCase()));
};

test("колода: 143 карточки двух пачек, номера и id не повторяются, id латиницей; завязки нет только у скрытого хода и опоры", () => {
  assert.equal(DECK.length, 143);
  assert.deepEqual(nums(DECK), range(1, 143));
  assert.equal(new Set(DECK.map((c) => c.id)).size, 143);
  for (const c of DECK) {
    assert.ok(/^[a-z_]+$/.test(c.id) && c.name, c.id);
    assert.equal(!!c.intro, !noVariants(c), `${c.id}: завязка`);
    if (c.intro) assert.ok(/^[А-ЯЁ«]/.test(c.intro), c.id);
    assert.ok(CARD_THEMES[c.theme] && CARD_KINDS[c.kind] && CARD_WHEN[c.when], c.id);
    assert.equal(cardById(c.id), c);
  }
  assert.throws(() => cardById("net_takoy"), /нет карточки/);
  const count = (list: DeckCard[]) => (theme: string) => list.filter((c) => c.theme === theme).length;
  // первая пачка: восемь тем из десяти — как в koloda.md, раздел 3
  assert.equal(new Set(FIRST.map((c) => c.theme)).size, 8);
  assert.deepEqual(["zemlya", "dvory", "kromka", "khram", "dengi", "lyudi", "sovet", "predaniya"].map(count(FIRST)), [5, 7, 7, 5, 5, 6, 3, 2]);
  // вторая пачка — шесть пачек Ч6 по порядку номеров: дорога и лихо, совет, ступени нитей, ходы сил и опоры, метки, соседи
  assert.deepEqual(["doroga", "sovet", "niti", "sily", "metki", "sosedi"].map(count(SECOND)), [18, 17, 19, 28, 13, 8]);
  const of = (theme: string) => nums(SECOND.filter((c) => c.theme === theme));
  assert.deepEqual([of("doroga"), of("sovet"), of("niti"), of("sily"), of("metki"), of("sosedi")],
    [range(41, 58), range(59, 75), range(76, 94), range(95, 122), range(123, 135), range(136, 143)]);
  assert.deepEqual(Object.keys(CARD_THEMES).filter((t) => !DECK.some((c) => c.theme === t)), []);
});

test("источник: как есть, переносом или по документу замысла; тексты мира — по номерам, у переноса сказано, откуда", () => {
  const how = (list: DeckCard[]) => ["kak_est", "perenos", "po_zamyslu"].map((h) => list.filter((c) => c.source.how === h).length);
  assert.deepEqual(how(FIRST), [29, 11, 0]);
  assert.deepEqual(how(SECOND), [38, 18, 47]);
  for (const c of DECK) {
    assert.ok(c.source.texts.every((n) => n >= 1 && n <= 116), `${c.id}: номер текста мира`);
    assert.ok(c.source.texts.length >= 1 || c.source.po, `${c.id}: источник пуст`);
    if (c.source.from) assert.equal(c.source.how, "perenos", c.id);
    if (c.source.how === "po_zamyslu") assert.ok(c.source.po, `${c.id}: по какому документу`);
  }
  for (const c of FIRST) assert.ok(c.source.texts.length >= 1 && (c.source.how === "perenos") === !!c.source.from, c.id);
  // у каждого переноса сказано, откуда (ответ автора 28.11.2026: 47 — из Гарей, 116 — с Сороки)
  assert.deepEqual(nums(DECK.filter((c) => (c.source.how === "perenos") !== !!c.source.from)), []);
  assert.deepEqual([cardById("izba_do_razbora").source, cardById("smanit_dvor").source],
    [{ how: "perenos", from: "из Гарей, за Холодной", texts: [23] }, { how: "perenos", from: "с Сороки", texts: [56] }]);
  assert.deepEqual(cardById("vozhak_u_ostrozhka").source, { how: "perenos", from: "с Крайнего", texts: [75, 76, 77] });
  assert.deepEqual(cardById("tiun_nad_starostami").source, { how: "po_zamyslu", texts: [98], po: "по koncept-3.md, 9.1; тиун владетеля —" });
});

test("уровень и вид: у события, эпизода, вести и открытого хода — уровень, у эпизода — дело из каталога; у предания, скрытого хода и опоры уровня нет", () => {
  assert.equal(DEALS.length, 15);
  for (const c of DECK) {
    if (c.kind === "predanie" || c.kind === "opora" || (c.kind === "khod" && !c.hod!.open)) assert.equal(c.level, undefined, c.id);
    else assert.ok(c.level && CARD_LEVELS[c.level], `${c.id}: нет уровня`);
    assert.equal(c.kind === "khod", !!c.hod, `${c.id}: «открытый или скрытый» — у хода и только у него`);
    assert.equal(c.kind === "opora", !!c.opora, `${c.id}: исходы — у опоры и только у неё`);
    assert.equal(c.kind === "epizod", !!c.delo, `${c.id}: дело — у эпизода и только у него`);
    if (c.delo) assert.ok(ids(DEALS).includes(c.delo), `${c.id}: дело ${c.delo}`);
    if (c.rises && c.rises !== "molva") assert.ok(CARD_LEVELS[c.rises] && c.rises !== c.level, `${c.id}: поднимается на свой же уровень`);
    for (const v of c.variants) if (v.outcome.delo) assert.ok(ids(DEALS).includes(v.outcome.delo), `${c.id}: дело в исходе`);
  }
  // эпизоды дела «В Ваделу» — 52 и 55: в пути Сенешаль сам, поэтому уровень — стол
  assert.deepEqual(DECK.filter((c) => c.kind === "epizod").map((c) => c.n), [1, 2, 3, 31, 36, 38, 52, 55]);
  assert.deepEqual([cardById("polmedyaka_na_storozhu"), cardById("nochnoy_krug")].map((c) => [c.level, c.delo]), [["stol", "v_vadelu"], ["stol", "v_vadelu"]]);
  assert.deepEqual(["sobytie", "epizod", "predanie", "vest", "khod", "opora"].map((k) => DECK.filter((c) => c.kind === k).length), [105, 8, 1, 1, 24, 4]);
  // десять карточек лиха (likho.md, раздел 10) — пачка 6.1
  assert.deepEqual(nums(DECK.filter((c) => c.tags?.includes("likho"))), range(41, 50));
  // предание решает тот, до кого дошла молва; весть о соседе — стол: за владение с соседом и палатой решает только Сенешаль
  assert.deepEqual([cardById("srok_vyshel").kind, cardById("srok_vyshel").level, cardById("sosed_ushyol_perezhdat").kind, cardById("sosed_ushyol_perezhdat").level],
    ["predanie", undefined, "vest", "stol"]);
  assert.deepEqual(DECK.filter((c) => c.tags?.includes("beda")).map((c) => c.n), [17, 34]);
});

test("место — из мест Концепта 3 или с пометой «за пределами»", () => {
  assert.equal(DECK_PLACES.length, 14);
  const known = [...ids(DECK_PLACES), ...Object.keys(WHERE_ANY)];
  for (const c of DECK) {
    for (const w of c.where) assert.ok(known.includes(w), `${c.id}: место ${w}`);
    if (c.outside) assert.ok(OUTSIDE[c.outside], c.id);
    // у хода силы и опоры места в карточке нет
    if (c.kind === "khod" || c.kind === "opora") assert.ok(c.where.length === 0 && !c.outside, `${c.id}: место у хода`);
    else assert.ok(c.where.length >= 1 || c.outside, `${c.id}: ни места, ни «за пределами»`);
  }
  assert.deepEqual(FIRST.filter((c) => c.outside).map((c) => [c.n, c.outside]), [[40, "sosed"]]);
  const out = (o: string) => nums(SECOND.filter((c) => c.outside === o));
  assert.deepEqual([out("doroga"), out("stavka"), out("sosed")], [[43, 52, 55], [45, 49, 54, 84, 87, 93, 135], [136, 138, 139, 141, 142, 143]]);
  // «ведомость», «кладовые», «собрание совета» — замок; как место названо в карточке, записано рядом
  assert.deepEqual([cardById("pesok_vmesto_soli"), cardById("dva_doklada"), cardById("nedostacha_na_myshey")].map((c) => [c.where, c.whereNote]),
    [[["zamok"], "ведомость"], [["zamok"], "собрание совета"], [["zamok"], "кладовые"]]);
});

test("кто: каждый слот завязки, вариантов, исходов и отношений объявлен; условия ролей — из мешка и словаря", () => {
  for (const c of DECK) {
    const slots = declared(c);
    assert.ok(c.who.length >= 1 && c.who.every((r) => r.slot || r.text), `${c.id}: пустая роль`);
    assert.equal(new Set(slots).size, slots.length, `${c.id}: слот объявлен дважды`);
    const texts = [c.intro ?? "", c.chtoDelaet ?? "", c.ispolnenie ?? "", ...c.traces.map((t) => t.text),
      ...c.variants.flatMap((v) => [v.text, v.outcome.text, ...(v.outcome.otnosheniya ?? []).map((o) => o.kto)])];
    for (const s of texts.flatMap(slotsIn)) assert.ok(slots.includes(s), `${c.id}: слот {${s}} не объявлен в «Кто»`);
    for (const r of c.who) {
      if (r.trait) assert.ok(BAG.some((t) => t.id === r.trait), `${c.id}: черта ${r.trait}`);
      if (r.want) assert.ok(ids(WANTS).includes(r.want), `${c.id}: желание ${r.want}`);
      if (r.thread) assert.ok(ids(THREADS).includes(r.thread.nit) && (!r.thread.step || stepOf(r.thread.nit, r.thread.step)), `${c.id}: нить ${r.thread.nit}`);
    }
    if (c.oneOf) assert.ok(BAG.some((t) => t.id === c.oneOf!.trait) && c.oneOf.slots.every((s) => slots.includes(s)), `${c.id}: «у одного из»`);
  }
  // условия из карточек: стражник с «Пристрастился к чарке»; у одного из троих — «Нечист на руку»
  assert.equal(cardById("pyan_v_dozore").who[0].trait, "charka");
  assert.deepEqual(cardById("ukho_snova").oneOf, { slots: ["мужик", "писарь", "десятник"], trait: "nechist_na_ruku" });
  // «Мешки с мельницы»: вор — помощник ключника с «Нечист на руку»
  assert.deepEqual(cardById("meshki_s_melnitsy").who.map((r) => [r.slot, r.trait]), [["мельник", undefined], ["меченый", undefined], ["помощник ключника", "nechist_na_ruku"], ["ключник", undefined]]);
});

test("варианты: у карточки три-четыре, в первой пачке 124, во второй 348; у каждого — метка из словаря и непустой исход", () => {
  assert.equal(new Set(LIKE_WORDS.map((w) => w.word)).size, LIKE_WORDS.length);
  for (const w of LIKE_WORDS) assert.ok(w.says && w.likes.length >= 1 && w.likes.every((k) => LIKES.includes(k)), `слово «${w.word}»`);
  const total = (list: DeckCard[]) => list.reduce((n, c) => n + c.variants.length, 0);
  assert.deepEqual([total(FIRST), total(SECOND)], [124, 348]);
  // без вариантов — скрытые ходы, «Ловушка с долей» (её открытая сторона — карточка 48 «Доля») и четыре опоры
  assert.deepEqual(nums(DECK.filter((c) => c.variants.length === 0)), [98, 99, 107, 108, 109, 110, 111, 112, 113, 114, 115, 117, 119, 120, 121, 122]);
  // вариантов без метки в колоде нет: «Съездить самому» в «Двух докладах» — по душе любопытным (ответ автора 28.11.2026)
  assert.deepEqual(DECK.flatMap((c) => c.variants.filter((v) => v.words.length === 0 || v.likes.length === 0).map((v) => [c.n, v.text])), []);
  assert.deepEqual(cardById("dva_doklada").variants[3].likes, ["lyubopytstvo+"]);
  for (const c of DECK) {
    if (noVariants(c)) { assert.equal(c.variants.length, 0, `${c.id}: варианты у половины карточки`); continue; }
    assert.ok(c.variants.length >= 3 && c.variants.length <= 4, `${c.id}: вариантов ${c.variants.length}`);
    if (c.n > 40) assert.equal(c.variants.length, 4, `${c.id}: во второй пачке вариантов четыре`);
    for (const v of c.variants) {
      assert.ok(v.text && /^[А-ЯЁ«]/.test(v.text), `${c.id}: вариант без текста`);
      assert.ok(v.likes.length >= 1 && v.likes.every((k) => LIKES.includes(k)), `${c.id}: «${v.text}» — метки ${v.likes.join(", ") || "нет"}`);
      assert.ok(v.outcome.text, `${c.id}: «${v.text}» — исход пуст`);
      assert.deepEqual(v.likes, [...new Set(v.words.flatMap((x) => LIKE_WORDS.find((q) => q.word === x)!.likes))], `${c.id}: метки — по таблице слов`);
    }
  }
  // четыре варианта в первой пачке — у четырёх карточек: двух первых и двух дописанных автором
  assert.deepEqual(FIRST.filter((c) => c.variants.length === 4).map((c) => c.n), [1, 2, 32, 37]);
  // каждое слово таблицы встречается в первой пачке; вторая новых слов не вводит (koloda.md, 7.0) а «сомнение» и «место» не берёт
  const used = (list: DeckCard[]) => new Set(list.flatMap((c) => c.variants.flatMap((v) => v.words)));
  assert.deepEqual(LIKE_WORDS.filter((w) => !used(FIRST).has(w.word)).map((w) => w.word), []);
  assert.deepEqual(LIKE_WORDS.filter((w) => !used(SECOND).has(w.word)).map((w) => w.word), ["сомнение", "место"]);
  assert.equal(LIKE_WORDS.length, 30);
  // перевод по ответам автора: «забота» — мягкие, «мир» — мягкие и смиренные, «по правде» — прямые и совесть
  const likes = (word: string) => LIKE_WORDS.find((w) => w.word === word)!.likes;
  assert.deepEqual([likes("забота"), likes("мир"), likes("правда")], [["zhestkost-"], ["zhestkost-", "gordost-"], ["chestnost+", "sovest"]]);
  assert.deepEqual([likes("близкие"), likes("место"), likes("верность"), likes("честолюбие")], [["blizkie"], ["mesto"], ["vernost"], ["chestolyubie+"]]);
  const first = cardById("mezha_do_sukhoy_beryozy").variants;
  assert.deepEqual(first.map((v) => v.likes), [["lyubopytstvo-"], ["poryadok+"], ["zhestkost-", "gordost-"], ["gordost-", "pokoy"]]);
  assert.deepEqual(cardById("kosyat_pod_ruku").variants[1].likes, ["smelost+", "zhestkost+"]);
  assert.deepEqual(cardById("izba_starika").variants.map((v) => v.likes), [["chestnost+", "sovest", "terpenie+"], ["strakh"], ["zhestkost-", "smelost+"]]);
  // где забота стоит серебра, добра или дохода — рядом щедрость: 6, 9, 20, 25, 28, 29; у 5 и 7 — одна забота
  const care = (withGift: boolean) => FIRST.filter((c) => c.variants.some((v) => v.words.includes("забота") && v.words.includes("щедрость") === withGift)).map((c) => c.n);
  assert.deepEqual([care(true), care(false)], [[6, 9, 20, 25, 28, 29], [5, 7]]);
  // «основа» — у шести вариантов
  assert.deepEqual(FIRST.filter((c) => c.variants.some((v) => v.likes.includes("osnova"))).map((c) => c.n), [4, 6, 7, 8, 11, 22]);
  // вторая пачка: слова карточек — те же
  assert.deepEqual(cardById("svoy_oboz_za_solyu").variants.map((v) => v.words), [["выгода", "основа"], ["осторожность", "мир"], ["покой"], ["выгода"]]);
  assert.deepEqual(cardById("vtoroy_pomoshchnik").variants[0].likes, ["vernost", "osnova"]);
  // чьи варианты: старшого обоза, того, кто остался за главного, Сенешаля после совета; у открытого хода — Сенешаля
  assert.deepEqual(["beglyy_prositsya_na_voz", "snyali_muzhikov_s_yam", "soglasilsya_na_sovete", "revizor", "smanit_dvor"].map((id) => cardById(id).decides),
    ["старшой", "кто за главного", "Сенешаль после совета", "Сенешаль", "староста или Сенешаль"]);
});

test("исходы: серебро числом, хлеб и сено словами, дворы, слово Сенешаля, отношения; нити и черты — из словаря и мешка", () => {
  for (const c of DECK) {
    for (const v of c.variants) {
      const o = v.outcome;
      if (o.serebro !== undefined) assert.ok([-2, -1, 1].includes(o.serebro), `${c.id}: серебро ${o.serebro}`);
      if (o.dvory !== undefined) assert.ok(Number.isInteger(o.dvory) && o.dvory !== 0, `${c.id}: дворы`);
      for (const text of [o.khleb, o.seno]) if (text !== undefined) assert.ok(text.length > 3, `${c.id}: хлеб и сено — словами`);
      for (const x of o.otnosheniya ?? []) assert.ok(x.kto && (x.v === 1 || x.v === -1), `${c.id}: отношения`);
      if (o.nit) assert.ok(ids(THREADS).includes(o.nit.nit) && (!o.nit.step || stepOf(o.nit.nit, o.nit.step)), `${c.id}: нить в исходе`);
      if (o.trait) assert.ok(BAG.some((t) => t.id === o.trait), `${c.id}: черта в исходе`);
    }
  }
  const sum = (f: (c: DeckCard) => number) => FIRST.reduce((s, c) => s + f(c), 0);
  assert.ok(sum((c) => c.variants.filter((v) => v.outcome.serebro).length) >= 15, "серебро есть в исходах");
  assert.ok(sum((c) => c.variants.filter((v) => v.outcome.otnosheniya).length) >= 20, "отношения есть в исходах");
  assert.deepEqual(cardById("vtorye_synovya_bez_otpuska").variants.map((v) => v.outcome.dvory), [3, 3, undefined]);
  assert.deepEqual(cardById("klin_za_pud_myoda").variants[0].outcome.slovo, 1);
  assert.deepEqual(cardById("pustye_marki_prodayut_grafam").variants[0].outcome, { text: "слово Сенешаля под залог", slovo: "zalog", zheton: "обещание деревням" });
  // вариант даёт черту и ступень нити: «Дрова в долг» — «В долгах», «Смотр метки» — «Прячет меченое дитя»
  assert.deepEqual(cardById("drova_v_dolg").variants[0].outcome.trait, "v_dolgakh");
  assert.deepEqual(cardById("smotr_metki").variants[1].outcome.trait, "pryachet_mechenoe");
});

test("исходы второй пачки: шкалы сил словом, доверие соседей, тягота, жетон на дорожке, «под чужой рукой»", () => {
  const withOut = <T>(f: (o: DeckCard["variants"][number]["outcome"]) => T | undefined) => DECK.flatMap((c) => c.variants.flatMap((v, i) => (f(v.outcome) !== undefined ? [`${c.n}.${i + 1}`] : [])));
  for (const c of DECK) {
    for (const v of c.variants) {
      const o = v.outcome;
      // шкала — из шкал своей силы: расположение и подозрение палаты, напор и вес Ратши
      for (const s of o.shkala ?? []) assert.ok(SCALE_FORCE[s.scale] === s.sila && forceById(s.sila).scales.some((x) => x.id === s.scale) && (s.v === 1 || s.v === -1), `${c.id}: шкала ${s.scale}`);
      if (o.doverie !== undefined) assert.ok(o.doverie === 1 || o.doverie === -1, `${c.id}: доверие соседей`);
      if (o.doverieDo) assert.ok(o.doverie === 1 && NEIGHBORS.doverie.steps.includes(o.doverieDo), `${c.id}: доверие до «${o.doverieDo}»`);
      if (o.tyagota) assert.match(o.text, /тягота/, `${c.id}: тягота названа словом`);
      if (o.zhetonHod) assert.ok(o.zhetonHod.zheton && ["sorvan", "sdvinut", "ugroza", "tsel"].includes(o.zhetonHod.chto), `${c.id}: жетон`);
    }
  }
  // 50.4 «палата присматривается» и 103.4 «недоимка в книгу смотра» записаны шкалой при разметке исходов словами (И33)
  assert.deepEqual(withOut((o) => o.shkala),
    ["50.4", "95.1", "96.1", "96.4", "97.1", "97.4", "100.1", "100.4", "101.3", "101.4", "102.1", "103.4", "104.3", "105.1", "118.1", "118.3", "141.1", "141.3", "141.4"]);
  assert.deepEqual(withOut((o) => o.doverie), ["54.4", "83.3", "83.4", "102.4", "136.1", "137.1", "137.3", "138.1", "138.2", "138.3", "139.2", "140.1", "140.3", "141.1", "141.2", "141.3", "142.1", "142.4", "143.1", "143.2"]);
  assert.deepEqual(withOut((o) => o.tyagota), ["48.1", "58.1", "78.4", "95.2", "97.3", "100.3", "102.2", "105.2", "105.4", "118.2", "129.3"]);
  assert.deepEqual(withOut((o) => o.zheton), ["10.1", "53.4", "73.1"]);
  // пять из одиннадцати — из исходов словами (И33): 57.2 и 57.4 «к смотру опоздали», 66.3 «подать в срок», 101.2 «подать мёдом», 103.4 «недоимка»
  assert.deepEqual(withOut((o) => o.zhetonHod), ["54.2", "57.2", "57.4", "66.3", "70.4", "79.3", "96.4", "101.1", "101.2", "103.3", "103.4"]);
  // отступное (118): акт идёт дальше «под чужой рукой» по уговору — против совести Сенешаля
  assert.deepEqual(withOut((o) => o.podChuzhoyRukoy), ["118.2"]);
  assert.deepEqual(cardById("sosed_v_gostyakh").variants.map((v) => v.outcome.shkala), [[{ sila: "ratsha", scale: "napor", v: -1 }], undefined, [{ sila: "ratsha", scale: "napor", v: 1 }], undefined]);
  // «Съезд союза у храма»: подписать — доверие до «ладят», палата косится; не подписывать — палата довольна, соседи косятся
  const sezd = cardById("sezd_soyuza_u_khrama").variants.map((v) => v.outcome);
  assert.deepEqual([sezd[0].doverie, sezd[0].doverieDo, sezd[0].shkala], [1, "ладят", [{ sila: "svetlost", scale: "raspolozhenie", v: -1 }]]);
  assert.deepEqual([sezd[2].doverie, sezd[2].shkala], [-1, [{ sila: "svetlost", scale: "raspolozhenie", v: 1 }]]);
  assert.deepEqual(cardById("podvody_sena_ostrozhku").variants[3].outcome.zhetonHod, { zheton: "подводы сена острожку", chto: "sorvan" });
  // серебро второй пачки — словами «трата», «большая трата», «приход»
  const serebro = (k: number) => SECOND.reduce((s, c) => s + c.variants.filter((v) => v.outcome.serebro === k).length, 0);
  assert.deepEqual([serebro(-1), serebro(-2), serebro(1)], [28, 6, 5]);
  assert.deepEqual(withOut((o) => (o.dvory && o.dvory > 0 ? o.dvory : undefined)).filter((x) => +x.split(".")[0] > 40), ["47.1", "88.1", "88.2", "88.4", "138.1", "142.2"]);
  assert.deepEqual(withOut((o) => o.trait).filter((x) => +x.split(".")[0] > 40), ["91.1", "93.2"]);
});

test("лихо: у шести карточек первой пачки из likho.md, раздел 10, исходы двигают лихо; во второй — по словам вариантов", () => {
  const likho = (id: string) => cardById(id).variants.map((v) => v.outcome.likho ?? 0);
  assert.deepEqual(likho("dobro_broshennykh_dvorov"), [-1, 1, 0]);
  assert.deepEqual(likho("pyan_v_dozore"), [-1, 1, 0]);
  assert.deepEqual(likho("drova_v_dolg"), [1, 1, 0]);
  assert.deepEqual(likho("dve_knigi_skupshchika"), [-1, 1, 1]);
  assert.deepEqual(likho("sol_po_vadelinskoy_tsene"), [0, 1, 0]);
  // «Мешки с мельницы»: поймать с поличным — падает; взять мукой и промолчать — растёт
  assert.deepEqual(likho("meshki_s_melnitsy"), [-1, 0, 1, 1]);
  // у остальных карточек первой пачки лиха в исходах нет
  assert.deepEqual(FIRST.filter((c) => c.variants.some((v) => v.outcome.likho)).map((c) => c.n), [11, 19, 25, 26, 30, 37]);
  // вторая пачка: «лихо растёт» и «лихо падает» в словах варианта; «лихо не растёт» — не поле
  assert.deepEqual(SECOND.filter((c) => c.variants.some((v) => v.outcome.likho)).map((c) => c.n), [41, 42, 44, 45, 46, 48, 49, 50, 56, 61, 62, 78, 79, 91, 102, 104]);
  assert.deepEqual(likho("sveli_koney_u_perevoza"), [0, -1, 1, 0]);
  assert.deepEqual(likho("skupshchik_prosit_mesto_u_perevoza"), [1, 0, 0, 0]);
  assert.deepEqual(likho("oblava_v_korchme_a_tam_pusto"), [0, 0, -1, 1]);
  assert.deepEqual(likho("dolya"), [0, 0, -1, 0]);
  // «Приписка»: посадить пришлых без отбора — лихо растёт (приём пришлых без устройства, likho.md, 3); избы «до разбора» — «дальше» на карточку 47
  assert.deepEqual(likho("pripiska"), [0, 0, 1, 0]);
  assert.deepEqual(cardById("pripiska").dalshe.map((d) => d.card), ["revizor", "izba_do_razbora"]);
});

test("следы: канал из словаря и текст; во второй пачке — ещё ясность и оговорка, канал назван не у всех", () => {
  for (const c of DECK) {
    for (const t of c.traces) {
      assert.ok(t.text && t.gde.every((g) => ids(CHANNELS).includes(g)), `${c.id}: след`);
      if (c.n <= 40) assert.ok(t.gde.length >= 1 && !t.yasnost && !t.note, `${c.id}: след первой пачки`);
      if (t.yasnost) assert.ok(CLARITY[t.yasnost], `${c.id}: ясность следа`);
    }
  }
  const traces = (list: DeckCard[]) => list.reduce((s, c) => s + c.traces.length, 0);
  assert.deepEqual([traces(FIRST), traces(SECOND)], [29, 165]);
  // след без канала — карточка его не называет: четырём канал дан по тексту строки (И33), два — оговорки, семь — дело само на виду
  assert.deepEqual(DECK.flatMap((c) => c.traces.filter((t) => t.gde.length === 0).map(() => c.n)), [92, 95, 96, 101, 108, 109, 111, 119, 122]);
  assert.deepEqual(cardById("nedostacha_na_myshey").traces, [{ gde: ["vedomost"], text: "мелкая недостача", yasnost: "smutno", note: "видят ясно «Глаз-алмаз» и «Чует ложь»" }]);
  assert.deepEqual(cardById("muzh_vernulsya_ranshe").traces, [{ gde: ["zhaloba"], text: "жалоба у ворот", yasnost: "yasno" }, { gde: ["molva"], text: "молва громкая", yasnost: "gromko" }]);
  assert.deepEqual(cardById("sveli_koney_u_perevoza").traces[2], { gde: ["ushi"], text: "у служилого свежие деньги", note: "если сводили свои" });
  assert.deepEqual(cardById("sledy_na_ldu").traces[0].gde, ["ushi", "prisutstvie"]);
  assert.deepEqual(cardById("ukho_snova").traces, [{ gde: ["vedomost"], text: "головных больше, чем убитых зверей" }]);
});

test("нити и «дальше»: ступень и начало нити — из словаря; «дальше» ведёт на карточку пачки, на нить словаря или на будущую карточку по имени", () => {
  for (const c of DECK) {
    if (c.thread) {
      assert.ok(ids(THREADS).includes(c.thread.nit) && (!c.thread.ili || ids(THREADS).includes(c.thread.ili)), `${c.id}: нить ${c.thread.nit}`);
      if (c.thread.step) assert.ok(stepOf(c.thread.nit, c.thread.step), `${c.id}: ступень «${c.thread.step}» нити ${c.thread.nit}`);
    }
    for (const d of c.dalshe) {
      assert.ok(d.text, c.id);
      if (d.card) assert.ok(DECK.some((x) => x.id === d.card) && d.card !== c.id, `${c.id}: «дальше» на карточку ${d.card}`);
      if (d.nit) assert.ok(ids(THREADS).includes(d.nit), `${c.id}: «дальше» на нить ${d.nit}`);
      if (d.step) assert.ok(d.nit && stepOf(d.nit, d.step), `${c.id}: «дальше» на ступень «${d.step}»`);
      if (d.budet) assert.ok(!DECK.some((x) => x.name === d.budet), `${c.id}: «${d.budet}» уже есть в пачке — нужна ссылка card`);
    }
  }
  assert.deepEqual(FIRST.filter((c) => c.thread).map((c) => [c.n, c.thread!.nit, c.thread!.start ?? false]),
    [[16, "dengi", false], [19, "pyanstvo", false], [23, "dengi", false], [25, "dolg", true], [35, "metka", true]]);
  assert.deepEqual(FIRST.flatMap((c) => c.dalshe.filter((d) => d.nit).map((d) => [c.n, d.nit])), [[14, "metka"], [25, "dolg"], [30, "svadba"], [32, "metka"], [37, "dengi"]]);
  assert.deepEqual(FIRST.flatMap((c) => c.dalshe.filter((d) => d.card).map((d) => [c.n, d.card])), [[28, "utonul_v_obkhod"]]);
  // «Смотр метки» — зима: помеченных детей проверяют на пятой и десятой зиме
  assert.deepEqual([cardById("smotr_metki").when, cardById("smotr_metki").whenNote], ["zima", "перед смотром метки"]);
  assert.equal(FIRST.flatMap((c) => c.dalshe.filter((d) => d.budet)).length, 6);
});

test("вторая пачка: карточки-ступени стоят на ступенях своих нитей; «дальше» — на карточки обеих пачек, нити и десять будущих карточек", () => {
  // поле «Повод»: нить и ступень по каталогу нитей (пачки 6.3 и 6.5), «Согласился на совете» — ступень «тихого саботажа», «Свадьба через межу» — «любовь» или «свадьба»
  const steps = SECOND.filter((c) => c.thread).map((c) => `${c.n} ${c.thread!.nit}${c.thread!.step ? ` «${c.thread!.step}»` : ""}${c.thread!.ili ? ` или ${c.thread!.ili}` : ""}`);
  assert.deepEqual(steps, [
    "67 sabotazh «продавили»", "76 dengi «соблазн»", "77 dengi «первая кража»", "78 dengi «привычка»", "79 dengi «не остановиться»", "80 dengi «не остановиться»",
    "81 pyanstvo «чарка»", "82 pyanstvo «запой»", "83 pyanstvo «провал»", "84 pyanstvo «под откос»",
    "85 lyubov «приглянулись»", "86 lyubov «встречи»", "87 lyubov «подарки и просьбы»", "88 lyubov «подарки и просьбы»", "89 lyubov «огласка»",
    "90 proshloe «тихо живёт»", "91 proshloe «весть»", "92 proshloe «пришли»", "93 proshloe «узнали»", "94 proshloe «узнали»",
    "123 metka «смотр»", "124 metka «прячут»", "125 metka «прячут»", "126 metka «кто-то знает»", "127 metka «кто-то знает»", "128 metka или svadba",
    "129 metka «смотр»", "130 metka «записан»", "138 lyubov или svadba",
  ]);
  // у 67 ступень названа в строке источника: «ступень „Продавили“ нити „тихий саботаж“»
  for (const c of SECOND.filter((x) => x.thread?.step && x.n !== 67)) assert.match(c.povod ?? "", /^Нить «/, `${c.id}: нить и ступень стоят в поводе`);
  assert.match(cardById("soglasilsya_na_sovete").source.po!, /^ступень «Продавили» нити «тихий саботаж»/);
  assert.deepEqual(SECOND.filter((c) => c.thread?.vetv).map((c) => [c.n, c.thread!.vetv]), [[91, "лихой"], [92, "беглый"], [93, "лучшие дни"], [94, "лучшие дни"], [125, "своя метка"]]);
  // «дальше» на карточку, которой нет, — списком (koloda.md, раздел 8)
  assert.deepEqual(SECOND.flatMap((c) => c.dalshe.filter((d) => d.budet).map((d) => [c.n, d.budet])), [
    [42, "Соли до весны не хватит"], [49, "Артель ушла до ледохода"], [59, "Зверь через гнилой тын"], [67, "Сделано иначе"], [83, "Зарок у жреца"], [83, "Сорвался"],
    [91, "Предупреди об облаве"], [92, "Выход за беглого"], [93, "Старый сотник зовёт"], [96, "Хватит ли сена до ледохода"],
  ]);
  const next = (id: string) => cardById(id).dalshe.map((d) => d.card ?? d.nit ?? d.budet ?? "");
  assert.deepEqual(next("sveli_koney_u_perevoza"), ["dengi", "lodku_perevozchiku"]);
  assert.deepEqual(next("beglyy_prositsya_na_voz"), ["proshloe", "izba_do_razbora"]);
  assert.deepEqual(next("pismo_v_palatu"), ["kniga_protiv_dela", "rassprosy_na_torgu", "revizor"]);
  assert.deepEqual(next("pustit_slukh"), ["pustye_marki_prodayut_grafam", "smanit_dvor"]);
  assert.deepEqual(cardById("chuzhoe_pismo_v_sumke").dalshe[0], { text: "нить «соглядатай», ступень «пишет»", nit: "soglyadatay", step: "пишет" });
  assert.ok(SECOND.flatMap((c) => c.dalshe.filter((d) => d.card)).length >= 70 && SECOND.flatMap((c) => c.dalshe.filter((d) => d.nit)).length >= 50);
});

test("поле «Сила»: все 24 хода сил есть в колоде — «его светлости» 95–106, Ратши 107–118; скрытый ход — половина карточки, открытый — полная", () => {
  for (const f of FORCES) {
    const cards = DECK.filter((c) => c.kind === "khod" && c.sila?.sila === f.id);
    assert.deepEqual(nums(cards), f.id === "svetlost" ? range(95, 106) : range(107, 118));
    assert.deepEqual(cards.map((c) => c.sila!.hod), range(1, 12));
    for (const c of cards) {
      const m = f.moves.find((x) => x.n === c.sila!.hod)!;
      // карточка хода — тот же ход, что в forces.ts: id, название, скрытый или открытый, срок дорожки
      assert.deepEqual([c.id, c.name, c.hod!.open], [m.id, m.name, m.open], `${f.id}: ход ${m.n}`);
      assert.ok(m.when.includes(c.when), `${c.id}: срок ${c.when} — не из сроков хода`);
      assert.ok(c.povod && c.byotPo && c.who.length >= 1, `${c.id}: повод, исполнитель и «бьёт по»`);
      if (noVariants(c)) {
        // половина карточки: что делает, исполнение по натуре исполнителя, шкалы — вариантов у игрока нет
        assert.ok(c.chtoDelaet && c.ispolnenie && c.shkaly?.length && !c.intro && !c.decides && c.variants.length === 0, `${c.id}: половина карточки`);
      } else {
        // открытый ход: варианты Сенешаля плюс «исполнение» и «шкалы»
        assert.ok(c.intro && c.variants.length === 4 && c.shkaly?.length && c.decides && c.level === "stol", `${c.id}: полная карточка`);
      }
    }
  }
  assert.deepEqual(nums(DECK.filter((c) => c.kind === "khod" && !c.hod!.open)), [98, 99, 107, 108, 109, 110, 111, 112, 113, 114, 115]);
  // «исполнение» есть у каждого хода; у «Сманить двор» сманивает свояк двора за межой (ответ автора 28.11.2026)
  assert.deepEqual(nums(DECK.filter((c) => c.kind === "khod" && !c.ispolnenie)), []);
  assert.match(cardById("smanit_dvor").ispolnenie!, /^Сманивает свояк двора за межой/);
  // открытая сторона скрытого хода — другая карточка: «Скупить долги» — 45, «Ловушка с долей» — 48; та знает свою силу и номер хода
  assert.deepEqual(DECK.filter((c) => c.hod?.otkrytaya).map((c) => [c.n, c.hod!.otkrytaya]), [[110, "zaimodavets_na_osennem_torge"], [117, "dolya"]]);
  for (const c of DECK.filter((x) => x.hod?.otkrytaya)) assert.deepEqual([cardById(c.hod!.otkrytaya!).sila!.sila, cardById(c.hod!.otkrytaya!).sila!.hod], [c.sila!.sila, c.sila!.hod]);
  assert.deepEqual([cardById("smotr_po_ledokhodu").hod, cardById("smanit_dvor").hod], [{ open: true, openNote: "открытый, в срок дорожки" }, { open: true, openNote: "открытый для деревни" }]);
  // следы есть у каждого хода, кроме «Ловушки с долей»: её следы — в карточке «Доля»
  assert.deepEqual(nums(DECK.filter((c) => c.kind === "khod" && c.traces.length === 0)), [117]);
});

test("поле «Сила»: за девятью карточками стоит сила; ход и опора — из её записи", () => {
  const behind = DECK.filter((c) => c.sila && c.kind !== "khod" && c.kind !== "opora");
  assert.deepEqual(behind.map((c) => [c.n, c.sila!.sila, c.sila!.hod ?? c.sila!.opora ?? null]), [
    [45, "ratsha", 4], [48, "ratsha", 11], [49, "ratsha", 5], [50, "svetlost", "schyot_dvorov"], [58, "lyubaya", null], [61, "svetlost", 1], [71, "svetlost", 9],
    [80, "ratsha", null], [141, "svetlost", null],
  ]);
  for (const c of DECK.filter((x) => x.sila)) {
    const s = c.sila!;
    if (s.sila === "lyubaya") { assert.ok(!s.hod && !s.opora && s.text, c.id); continue; }
    const f = forceById(s.sila);
    if (s.hod) assert.ok(f.moves.some((m) => m.n === s.hod), `${c.id}: ход ${s.hod}`);
    if (s.opora) assert.ok(f.anchors.some((a) => a.id === s.opora), `${c.id}: опора ${s.opora}`);
    if (c.kind !== "khod" && c.kind !== "opora") assert.ok(s.text, `${c.id}: как сила стоит за карточкой`);
  }
  // название хода в строке «Сила» — как в forces.ts
  for (const c of behind.filter((x) => x.sila!.hod)) assert.ok(c.sila!.text!.includes(forceById(c.sila!.sila).moves.find((m) => m.n === c.sila!.hod)!.name), c.id);
});

test("опоры: четыре карточки в свой срок, исходы написаны вручную, «что смотрит» и досрочный приговор", () => {
  const anchors = DECK.filter((c) => c.kind === "opora");
  assert.deepEqual(anchors.map((c) => [c.n, c.sila!.sila, c.sila!.opora]), [
    [119, "svetlost", "prigovor_goda"], [120, "ratsha", "glavnyy_khod_ratshi"], [121, "svetlost", "schyot_dvorov"], [122, "svetlost", "novoe_tryokhletye_voevody"],
  ]);
  // каждая опора сил первого акта есть в колоде
  assert.deepEqual(FORCES.flatMap((f) => f.anchors.map((a) => a.id)).sort(), anchors.map((c) => c.sila!.opora!).sort());
  const low = (s: string) => s.toLowerCase();
  for (const c of anchors) {
    const a = forceById(c.sila!.sila).anchors.find((x) => x.id === c.sila!.opora)!;
    assert.deepEqual([c.name, c.when], [a.name, a.srok], `${c.id}: название и срок — как у опоры силы`);
    assert.ok(c.opora!.ishody.length >= 3 && c.opora!.ishody.every((x) => x.name), `${c.id}: исходы`);
    assert.ok(!c.intro && !c.level && c.variants.length === 0 && c.whenNote, `${c.id}: опора выпадает сама, в свой срок`);
    // исходы, названные у силы, — те же (досрочный приговор у карточки — отдельной строкой)
    const named = a.outcomes.map((x) => low(x.name)).filter((x) => x !== "досрочный приговор");
    if (named.length) assert.deepEqual(c.opora!.ishody.map((x) => low(x.name)), named, `${c.id}: исходы — как у опоры силы`);
  }
  const prigovor = cardById("prigovor_goda").opora!;
  assert.match(prigovor.chtoSmotrit!, /^пять условий испытания/);
  assert.match(prigovor.dosrochno!, /сорван ещё один жетон палаты/);
  assert.deepEqual(prigovor.ishody.map((x) => x.kogda), ["первый и второй год", "первый и второй год", "первый и второй год", "третий год", "третий год"]);
  assert.match(cardById("glavnyy_khod_ratshi").opora!.gdeSeneschal!, /^заметил подготовку/);
  assert.deepEqual(cardById("schyot_dvorov_na_meste").opora!.ishody.map((x) => x.name),
    ["книга сходится", "дворов меньше, чем в книге, и это было в отписках", "приписка вскрылась", "дворов больше, чем в книге"]);
});
