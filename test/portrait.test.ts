// Портрет человека по Концепту 3 (задача И27а): словарь полей, правило по умолчанию «признак → поля», особенное черт поверх признаков.
// src/data/portrait.ts, src/sim/portrait.ts; замысел — docs/design/cherty-dannye.md, разделы 1–2.
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import type { Sign, BagTrait, SignVec } from "../src/data/types";
import { TRAITS } from "../src/data/core";
import { SIGNS, NATURES, BAG, SENESCHAL } from "../src/data/natura";
import { ALLOYS, ORIGINS, MERA_NAMES, HIDDEN_ORIGINS, ORIGIN_PLACES, SENESCHAL_ORIGIN, type OriginPlace } from "../src/data/origins";
import { NAMES_PEOPLE } from "../src/data/names";
import { TRAITS_C3, COUNCIL_TO_BAG } from "../src/data/traits-c3";
import {
  WANTS, HOLDS, APPROACHES, MEM_KEYS, MEM_SCALES, BIASES, CHANNELS, LINK_GROUPS, HOLDER_ROLES, THREADS, POLE_RULES, POLE_PEOPLE, VIS_NAMES,
} from "../src/data/portrait";
import { BALANCE, resetBalance, setAt } from "../src/sim/balance";
import { Rng } from "../src/sim/rng";
import { growPerson, growSeneschal, rollPerson, growLife, originById, placeWeight, type NaturaPerson } from "../src/sim/natura";
import { rollAll, metricsOf } from "../src/sim/natura-report";
import { portraitOf, portrait, alloysOf, polesOf, traitVis, strengthWord, linkName, isNotable, isStrong } from "../src/sim/portrait";

afterEach(() => resetBalance());

const signs = (v: SignVec): Record<Sign, number> => Object.fromEntries(SIGNS.map((s) => [s.id, v[s.id] ?? 0])) as Record<Sign, number>;
const trait = (id: string, extra: Partial<BagTrait> = {}): BagTrait => ({
  id, name: `Черта ${id}`, desc: "черта для теста", kind: "life", vec: {}, rarity: "common", effect: "", source: ["life"], ...extra,
});

test("словарь: размеры как в cherty-dannye.md, id не повторяются, у каждого слово для экрана", () => {
  assert.deepEqual([WANTS, HOLDS, APPROACHES, MEM_KEYS, BIASES, CHANNELS, LINK_GROUPS, HOLDER_ROLES].map((x) => x.length), [7, 4, 21, 11, 8, 8, 13, 12]);
  // каталог нитей принят целиком: тридцать нитей, предложенных нет
  assert.deepEqual([THREADS.length, THREADS.some((t) => "proposed" in t), MEM_SCALES.length], [30, false, 3]);
  for (const list of [WANTS, HOLDS, APPROACHES, MEM_KEYS, BIASES, CHANNELS, LINK_GROUPS, HOLDER_ROLES, THREADS]) {
    assert.equal(new Set(list.map((x) => x.id)).size, list.length);
    for (const x of list) assert.ok(/^[a-z_]+$/.test(x.id) && x.name && x.desc, x.id);
  }
  assert.ok(LINK_GROUPS.some((g) => g.id === "likhie") && HOLDER_ROLES.filter((r) => r.likho).length === 4);
  assert.deepEqual(Object.keys(VIS_NAMES), ["yavnaya", "so_vremenem", "skrytaya"]);
});

test("правило по умолчанию: по строке на каждый полюс, ссылки ведут в словарь", () => {
  assert.equal(POLE_RULES.length, SIGNS.length * 2);
  const ids = <T extends { id: string }>(list: T[]) => list.map((x) => x.id);
  for (const s of SIGNS) {
    for (const plus of [true, false]) assert.equal(POLE_RULES.filter((r) => r.sign === s.id && r.plus === plus).length, 1, `${s.id} ${plus ? "+" : "−"}`);
    assert.ok(POLE_PEOPLE[s.id].plus && POLE_PEOPLE[s.id].minus);
  }
  for (const r of POLE_RULES) {
    const at = `${r.sign}${r.plus ? "+" : "-"}`;
    for (const k of Object.keys(r.wants ?? {})) assert.ok(ids(WANTS).includes(k), `${at}: желание ${k}`);
    for (const k of Object.keys(r.holds ?? {})) assert.ok(ids(HOLDS).includes(k), `${at}: удержка ${k}`);
    for (const k of [...(r.da ?? []), ...(r.net ?? [])]) assert.ok(ids(APPROACHES).includes(k), `${at}: подход ${k}`);
    assert.ok(!(r.da ?? []).some((k) => r.net?.includes(k)), `${at}: подход и работает, и не действует`);
    for (const k of r.pomnit ?? []) assert.ok(ids(MEM_KEYS).includes(k), `${at}: память ${k}`);
    if (r.bias) assert.ok(ids(BIASES).includes(r.bias), `${at}: пристрастие ${r.bias}`);
    for (const k of [...(r.ladit ?? []), ...(r.neLadit ?? [])]) assert.ok(linkName(k), `${at}: связь ${k}`);
    for (const k of r.trace?.gde ?? []) assert.ok(ids(CHANNELS).includes(k), `${at}: канал ${k}`);
  }
  assert.deepEqual([linkName("khram"), linkName("chestolyubie+"), linkName("chestnost-")], ["храм", "честолюбивые", "лукавые"]);
});

test("числа: признак 2,5 даёт вклад 1, признак 5 — 2, порога нет; минус берёт строку второго полюса", () => {
  assert.equal(portraitOf(signs({ gordost: 2.5 })).wants.pochet, 1);
  assert.equal(portraitOf(signs({ gordost: 5 })).wants.pochet, 2);
  assert.equal(portraitOf(signs({ gordost: 1 })).wants.pochet, 0.4, "числа считаются и ниже порога заметного полюса");
  const meek = portraitOf(signs({ gordost: -2.5 }));
  assert.deepEqual([meek.wants.pochet, meek.wants.pokoy, meek.memory.obida], [-1, 1, -1]);
  const hot = portraitOf(signs({ terpenie: -2.5, smelost: 2.5, poryadok: -5 }));
  assert.deepEqual([hot.sluchay, hot.holds.strakh, hot.holds.pravilo, hot.memory.obida, hot.memory.srok], [1, -1, -2, 1, -1]);
  // вклады полюсов складываются: покой дают и Косность, и Довольство малым
  assert.equal(portraitOf(signs({ lyubopytstvo: -2.5, chestolyubie: -2.5 })).wants.pokoy, 2);
  setAt("natura.portrait.divisor", 5);
  assert.equal(portraitOf(signs({ gordost: 2.5 })).wants.pochet, 0.5, "ручка делителя действует сразу");
});

test("списки: признак 1,9 их не включает, заметный полюс включает; след заметного — «со временем», сильного — явный", () => {
  const weak = portraitOf(signs({ gordost: 1.9, vera: 1.9, terpenie: -1.9 }));
  assert.deepEqual([weak.approach.da, weak.approach.net, weak.memory.pomnit, weak.links.ladit, weak.links.neLadit, weak.voice.manners, weak.traces.lines], [[], [], [], [], [], [], []]);
  assert.deepEqual([weak.voice.bias, weak.traces.ten, weak.links.start], ["bez", 0, 0]);
  assert.ok(!isNotable(1.9) && isNotable(-2) && !isStrong(3.4) && isStrong(-3.5));
  const proud = portraitOf(signs({ gordost: 2 }));
  assert.deepEqual([proud.approach.da, proud.approach.net, proud.memory.pomnit, proud.links.neLadit], [["pochtit"], ["sila", "stydit"], ["unizhenie"], ["chestolyubie+"]]);
  assert.deepEqual(proud.traces.lines, [{ gde: ["vid"], text: "держится прямо, говорит о роде и чести", vis: "so_vremenem", from: "Гордость", trait: false }]);
  assert.equal(portraitOf(signs({ gordost: 3.5 })).traces.lines[0].vis, "yavnaya");
  assert.equal(portraitOf(signs({ gordost: 3.4 })).traces.lines[0].vis, "so_vremenem");
  // тень, ясность и скорость отношений — тоже только у заметных полюсов, целой единицей
  const loud = portraitOf(signs({ obshchitelnost: 4, terpenie: -2, chestnost: -3 }));
  assert.deepEqual([loud.traces.ten, loud.traces.yasnost, loud.links.start], [2, -1, 1]);
  setAt("natura.portrait.notable", 1.5);
  assert.deepEqual(portraitOf(signs({ gordost: 1.9 })).approach.da, ["pochtit"], "ручка порога действует сразу");
});

test("голос: манера — у двух самых сильных полюсов; пристрастие одно — у самого сильного из тех, у кого оно есть", () => {
  const p = portraitOf(signs({ gordost: 3, smelost: 4, chestnost: -2.5, obshchitelnost: 2 }));
  assert.deepEqual(p.voice.manners, ["коротко, напористо", "свысока, о роде и чести"]);
  assert.deepEqual([p.voice.bias, p.voice.biasFrom], ["preumenshaet", "Смелость"]);
  // Прямота и Порядок выдвигают «без пристрастия»
  assert.deepEqual(portraitOf(signs({ chestnost: 4, gordost: 3 })).voice.bias, "bez");
  assert.deepEqual(portraitOf(signs({ chestnost: 2, gordost: 3 })).voice.bias, "priukrashivaet");
  // «видит знамения» — только у сильной Веры
  assert.equal(portraitOf(signs({ vera: 3 })).voice.bias, "bez");
  assert.equal(portraitOf(signs({ vera: 3.5 })).voice.bias, "znameniya");
  assert.equal(portraitOf(signs({ vera: 3, zhestkost: -2 })).voice.bias, "vygorazhivaet", "у несильной Веры пристрастия нет — берётся следующий полюс");
  assert.equal(portraitOf(signs({ lyubopytstvo: 4 })).voice.bias, "bez", "нет полюсов с пристрастием — доклад без пристрастия");
});

test("признаки спорят: верх берёт более сильный полюс, при равной силе — «не действует»", () => {
  // Смирение: «защитить» работает; Смелость: «защитить» не действует
  assert.deepEqual(portraitOf(signs({ gordost: -4, smelost: 2 })).approach.da.includes("zashchita"), true);
  assert.deepEqual(portraitOf(signs({ gordost: -2, smelost: 4 })).approach.net.includes("zashchita"), true);
  const even = portraitOf(signs({ gordost: -3, smelost: 3 }));
  assert.ok(even.approach.net.includes("zashchita") && !even.approach.da.includes("zashchita"));
  // Щедрость ладит с деревнями, Жёсткость — нет
  assert.ok(portraitOf(signs({ shchedrost: 4, zhestkost: 2 })).links.ladit.includes("derevni"));
  assert.ok(portraitOf(signs({ shchedrost: 2, zhestkost: 4 })).links.neLadit.includes("derevni"));
});

test("черта поверх признаков: числа складываются, списки объединяются, по тому же ключу верна черта", () => {
  const base = signs({ gordost: 2.5, shchedrost: 3 });
  const t = trait("a", {
    wants: { pochet: 1, novoe: 2 }, holds: { strakh: -1 }, sluchay: 1, approach: { net: ["pochtit"], da: ["delo"], note: "только делом" },
    memory: { srok: 2, pomnit: ["slovo"], proshchaet: ["unizhenie"] }, links: { neLadit: ["derevni"], ladit: ["kuptsy"], start: 1 },
    traces: { ten: -1, tenSfery: -1, razgovor: 1, chuzhie: "molchit", lines: [{ gde: "ushi", text: "ходит ночами" }] },
    threads: [{ nit: "dolg", kak: "otkryvaet" }], deed: [{ gde: "торг", sila: 1 }], holder: [{ role: "zaimodavets" }], likho: 1,
  });
  const p = portraitOf(base, [t]), bare = portraitOf(base);
  assert.deepEqual([p.wants.pochet, p.wants.novoe, p.holds.strakh, p.sluchay, p.memory.srok], [2, 2, -1, 1, 2]);
  assert.ok(bare.approach.da.includes("pochtit") && p.approach.net.includes("pochtit") && !p.approach.da.includes("pochtit"), "черта перекрыла «почтить»");
  assert.ok(p.approach.da.includes("dar") && p.approach.da.includes("delo"), "остальное объединилось");
  assert.ok(bare.memory.pomnit.includes("unizhenie") && p.memory.proshchaet.includes("unizhenie") && !p.memory.pomnit.includes("unizhenie") && p.memory.pomnit.includes("slovo"));
  assert.ok(bare.links.ladit.includes("derevni") && p.links.neLadit.includes("derevni") && p.links.ladit.includes("kuptsy") && p.links.start === 1);
  assert.deepEqual([p.traces.ten, p.traces.tenSfery, p.traces.razgovor, p.traces.chuzhie, p.likho], [-1, -1, 1, "molchit", 1]);
  assert.deepEqual(p.traces.lines.at(-1), { gde: ["ushi"], text: "ходит ночами", vis: "yavnaya", from: "Черта a", trait: true });
  const from = "Черта a";
  assert.deepEqual([p.threads, p.deed, p.holder], [[{ nit: "dolg", kak: "otkryvaet", from }], [{ gde: "торг", sila: 1, from }], [{ role: "zaimodavets", from }]]);
  assert.equal(p.approach.notes.at(-1), "Черта a: только делом");
  // поздняя черта перекрывает раннюю
  const later = trait("b", { approach: { da: ["pochtit"] } });
  assert.ok(portraitOf(base, [t, later]).approach.da.includes("pochtit") && portraitOf(base, [later, t]).approach.net.includes("pochtit"));
});

test("пристрастие доклада и видимость у черты: черта главнее признака, из двух черт — более редкая, при равной редкости — нажитая позже", () => {
  const base = signs({ smelost: 4 });
  const common = trait("c", { voice: { bias: "chernit", manner: "сквозь зубы" } }), rare = trait("r", { rarity: "rare", voice: { bias: "pryachet" } });
  const other = trait("o", { voice: { bias: "sgushchaet" } });
  assert.deepEqual([portraitOf(base).voice.bias, portraitOf(base, [common]).voice.bias, portraitOf(base, [common]).voice.biasFrom], ["preumenshaet", "chernit", "Черта c"]);
  assert.equal(portraitOf(base, [rare, common]).voice.bias, "pryachet");
  assert.equal(portraitOf(base, [common, rare]).voice.bias, "pryachet");
  assert.equal(portraitOf(base, [common, other]).voice.bias, "sgushchaet");
  assert.equal(portraitOf(base, [other, common]).voice.bias, "chernit");
  assert.deepEqual(portraitOf(base, [common]).voice.manners, ["сквозь зубы", "коротко, напористо"]);
  // видимость: своя, а пока не задана — по прежнему полю hidden
  assert.deepEqual([traitVis(trait("x")), traitVis(trait("x", { hidden: true })), traitVis(trait("x", { hidden: true, vis: "so_vremenem" }))], ["yavnaya", "skrytaya", "so_vremenem"]);
  const secret = portraitOf(base, [trait("s", { hidden: true, traces: { lines: [{ gde: "vedomost", text: "недостача" }] } })]);
  assert.equal(secret.traces.lines.at(-1)!.vis, "skrytaya");
});

test("слова для экрана: сильнее и слабее по порогам", () => {
  assert.deepEqual([0.4, 0.5, 1.4, 1.5, -0.4, -0.5, -1.5].map(strengthWord), ["", "сильнее", "сильнее", "намного сильнее", "", "слабее", "намного слабее"]);
  assert.equal(BALANCE.natura.portrait.wordFrom, 0.5);
});

test("один и тот же человек — один и тот же портрет; у каждой натуры видно ядро", () => {
  for (const n of NATURES) {
    const a = growPerson(new Rng(`портрет-${n.id}`), n), b = growPerson(new Rng(`портрет-${n.id}`), n);
    assert.deepEqual(portrait(a), portrait(b), n.id);
    assert.deepEqual(portrait(a), portraitOf(a.signs, a.traits, { origin: originById(a.origin) }));
    const p = portrait(a), poles = polesOf(a.signs);
    assert.ok(poles.every((x, i) => i === 0 || x.v <= poles[i - 1].v), "полюса — от сильного к слабому");
    assert.ok(poles.filter((x) => isNotable(x.v)).length >= 1, `${n.id}: заметных полюсов нет`);
    assert.ok(p.approach.da.length >= 1 && p.voice.manners.length >= 1, `${n.id}: портрет пустой`);
    assert.ok(!p.approach.da.some((k) => p.approach.net.includes(k)) && !p.links.ladit.some((k) => p.links.neLadit.includes(k)), `${n.id}: ключ на обеих сторонах`);
  }
});

// ---------- особенное черт мешка (задача И27б; cherty-dannye.md, разделы 3–6) ----------

const bag = (id: string): BagTrait => { const t = BAG.find((x) => x.id === id); assert.ok(t, `в мешке нет ${id}`); return t; };
const zero = signs({});

test("мешок: у каждой черты и перка есть видимость и строка действия; в мешке 188, как в cherty-dannye.md", () => {
  const people = BAG.filter((t) => !t.seneschal), count = (list: BagTrait[], kind: string) => list.filter((t) => t.kind === kind).length;
  // люди: 109 прежних черт + 16 пороков и тайн + 5 добрых нитей, 6 облика, 22 + 13 перков; Сенешаль: ядро 3, умения 4 (пятое — общее с людьми), на выбор 8
  assert.deepEqual([BAG.length, count(people, "born") + count(people, "life"), count(people, "look"), count(people, "perk")], [188, 132, 6, 35]);
  assert.deepEqual([BAG.filter((t) => t.seneschal).length, SENESCHAL.core.length, SENESCHAL.skills.length, SENESCHAL.pick.length], [15, 3, 5, 8]);
  assert.deepEqual(Object.keys(TRAITS_C3).sort(), BAG.map((t) => t.id).sort(), "особенное записано ровно для черт мешка");
  for (const t of BAG) {
    assert.ok(t.vis && VIS_NAMES[t.vis], `${t.id}: нет видимости`);
    assert.ok(t.effect && t.effect === TRAITS_C3[t.id].effect && /^[А-ЯЁ]/.test(t.effect), `${t.id}: нет строки действия`);
    assert.equal(t.vis === "skrytaya", !!t.hidden, `${t.id}: «скрытая» — те же черты, что открывались только поступком`);
    assert.ok(t.name && t.desc && t.vec && t.rarity && t.source.length, `${t.id}: прежние поля на месте`);
  }
  // умение видно по делу: сразу видны только четыре
  assert.deepEqual(BAG.filter((t) => t.kind === "perk" && !t.seneschal && t.vis === "yavnaya").map((t) => t.id).sort(),
    ["golos", "knizhnik", "kuznets", "lekar", "plotnik", "povitukha", "stroevaya_vypravka"]);
  assert.ok(BAG.filter((t) => t.kind === "perk" && !t.seneschal).every((t) => t.vis !== "skrytaya" && (t.places?.length || t.posts?.length)), "у перка есть должность или места");
  assert.equal(BAG.filter((t) => t.vis === "skrytaya").length, 13, "скрытых было две, с И27в — одиннадцать, с И27г — тринадцать");
});

test("мешок: ключи полей — только из словаря", () => {
  const ids = <T extends { id: string }>(list: T[]) => list.map((x) => x.id);
  const scale = [...ids(WANTS), ...ids(HOLDS), "sluchay", ...ids(MEM_SCALES)], noteKeys = ["vesy", "podkhod", "pamyat", "golos", "niti", "svyazi", "sledy", "delo", "likho", "derzhit", "otdykh", "lore", "prochee"];
  for (const t of BAG) {
    const at = (what: string, k: string, list: string[]) => assert.ok(list.includes(k), `${t.id}: ${what} ${k} нет в словаре`);
    for (const k of Object.keys(t.wants ?? {})) at("желание", k, ids(WANTS));
    for (const k of Object.keys(t.holds ?? {})) at("удержка", k, ids(HOLDS));
    for (const x of t.ifs ?? []) { at("условная поправка", x.chto, scale); assert.ok(x.v && x.kogda, `${t.id}: поправка без числа или условия`); }
    for (const k of [...(t.approach?.da ?? []), ...(t.approach?.net ?? [])]) at("подход", k, ids(APPROACHES));
    assert.ok(!(t.approach?.da ?? []).some((k) => t.approach?.net?.includes(k)), `${t.id}: подход и работает, и не действует`);
    for (const k of [...(t.memory?.pomnit ?? []), ...(t.memory?.proshchaet ?? [])]) at("память", k, ids(MEM_KEYS));
    if (t.voice?.bias) at("пристрастие", t.voice.bias, ids(BIASES));
    for (const x of t.threads ?? []) { at("нить", x.nit, ids(THREADS)); assert.equal(!!x.step, x.kak === "stupen", `${t.id}: имя ступени — у ступени и только у неё`); }
    for (const k of [...(t.links?.ladit ?? []), ...(t.links?.neLadit ?? [])]) {
      assert.ok(ids(LINK_GROUPS).includes(k) || SIGNS.some((sg) => k === `${sg.id}+` || k === `${sg.id}-`), `${t.id}: связь ${k} нет в словаре`);
    }
    for (const l of t.traces?.lines ?? []) { at("канал следа", l.gde, ids(CHANNELS)); assert.ok(l.text, `${t.id}: след без текста`); }
    for (const x of t.holder ?? []) at("кто держит", x.role, ids(HOLDER_ROLES));
    for (const x of t.deed ?? []) assert.ok(x.gde && Math.abs(x.sila) === 1, `${t.id}: дело без места или силы`);
    for (const k of Object.keys(t.notes ?? {})) at("пояснение", k, noteKeys);
    for (const v of [...Object.values(t.wants ?? {}), ...Object.values(t.holds ?? {}), t.sluchay ?? 1, t.memory?.obida ?? 1, t.memory?.srok ?? 1, t.memory?.dobro ?? 1]) {
      assert.ok(Number.isInteger(v) && v !== 0 && Math.abs(v) <= 2, `${t.id}: число вне шкалы −2…+2`);
    }
  }
  // всё, что автор написал о черте, лежит в пояснениях: по фразе на каждое заполненное поле
  for (const t of BAG) {
    const filled: [boolean, string][] = [[!!(t.wants || t.holds || t.sluchay), "vesy"], [!!t.approach, "podkhod"], [!!t.memory, "pamyat"], [!!t.voice, "golos"],
      [!!t.threads, "niti"], [!!t.links, "svyazi"], [!!t.traces, "sledy"], [!!t.deed, "delo"]];
    for (const [has, key] of filled) if (has) assert.ok(t.notes?.[key as keyof NonNullable<BagTrait["notes"]>], `${t.id}: поле ${key} без фразы автора`);
  }
});

test("два перка: «Знает лес» и «Свой человек в палате» — новые имена под прежними id", () => {
  const les = bag("govorit_s_lesom"), palata = bag("pri_dvore");
  assert.deepEqual([les.name, les.desc, palata.name], ["Знает лес", "Где зверь прошёл, где ступать нельзя", "Свой человек в палате"]);
  assert.ok(les.requires?.includes("slushaet_les") && les.requires.length === 4, "к требованиям добавлено «Слушает лес»");
  assert.deepEqual([les.posts, les.links?.ladit, palata.threads], [["ловчий"], ["lesnye"], [{ nit: "posuly", kak: "tolkaet" }]]);
});

test("настоящая черта перекрывает признак по тому же ключу; остальное складывается", () => {
  // Жёсткость: «сила» работает; «Мастер своего дела»: не действует — «не учи меня»
  const hard = signs({ zhestkost: 3 });
  assert.ok(portraitOf(hard).approach.da.includes("sila"));
  const master = portraitOf(hard, [bag("master_dela")]);
  assert.ok(master.approach.net.includes("sila") && !master.approach.da.includes("sila") && master.approach.da.includes("pochtit"));
  assert.deepEqual(master.by.approach.sila, { from: "Мастер своего дела", trait: true });
  // Гордость: «пристыдить» не действует; «Постится и кается»: работает — покается
  const proud = signs({ gordost: 3 });
  assert.ok(portraitOf(proud).approach.net.includes("stydit") && portraitOf(proud, [bag("postitsya_i_kaetsya")]).approach.da.includes("stydit"));
  // Щедрость ладит с деревнями по признаку, «Хлебосол» добавляет пришлых и почёт сверх признака Гордости
  const host = portraitOf(signs({ gordost: 2.5, shchedrost: 3 }), [bag("khlebosol")]);
  assert.deepEqual([host.wants.pochet, host.links.ladit], [2, ["prishlye", "derevni"]]);
  assert.deepEqual(host.by.wants.pochet, [{ from: "Гордость", trait: false, v: 1 }, { from: "Хлебосол", trait: true, v: 1 }]);
  assert.deepEqual([host.by.approach.dar, host.by.approach.pochtit], [{ from: "Хлебосол", trait: true }, { from: "Гордость", trait: false }]);
  assert.deepEqual([host.by.links.prishlye?.trait, host.by.links.derevni?.trait, host.by.memKeys.unizhenie?.from], [true, false, "Хлебосол"]);
  assert.ok(host.notes.some((n) => n.key === "podkhod" && n.from === "Хлебосол" && n.text.includes("принять его хлеб")), "фраза автора дошла до портрета");
});

test("поправка с оговоркой в общий счёт не идёт: она лежит отдельно, с условием", () => {
  const p = portraitOf(zero, [bag("boitsya_lesa"), bag("za_semyu_goroy")]);
  assert.deepEqual([p.holds.strakh, p.memory.srok], [0, 0]);
  assert.deepEqual(p.ifs, [{ chto: "strakh", v: 2, kogda: "на кромке и в делах за тыном", from: "Боится леса" }, { chto: "srok", v: 2, kogda: "обида своим — до смерти", from: "За семью горой" }]);
  assert.deepEqual(p.memory.pomnit, ["obida_svoim"]);
  // без оговорки — в счёт: «Терпит и ждёт» держит обиду до смерти
  assert.equal(portraitOf(zero, [bag("terpit_i_zhdyot")]).memory.srok, 2);
  assert.ok(portraitOf(zero, [bag("starover")]).sluchay === -1 && portraitOf(zero, [bag("starover")]).ifs[0].chto === "pravilo");
});

test("пристрастие «сильнее любой другой черты» берёт верх и над более редкой, и над более поздней", () => {
  const rare = trait("r", { rarity: "exceptional", voice: { bias: "chernit" } });
  for (const order of [[bag("kak_na_dukhu"), rare, bag("yazyk_bez_kostey")], [rare, bag("yazyk_bez_kostey"), bag("kak_na_dukhu")]]) {
    const p = portraitOf(signs({ smelost: 4 }), order);
    assert.deepEqual([p.voice.bias, p.voice.biasFrom, p.by.bias], ["bez", "Как на духу", { from: "Как на духу", trait: true }]);
  }
  assert.equal(portraitOf(zero, [bag("chtit_primety")]).voice.bias, "znameniya", "«Чтит приметы» видит знамения и без сильной Веры");
  assert.deepEqual(portraitOf(zero, [bag("charka")]).voice, { manners: ["доклад путаный"], bias: "preumenshaet", biasFrom: "Пристрастился к чарке", notes: [] });
});

test("нити, дело и следы черт доходят до портрета с именем черты", () => {
  const p = portraitOf(zero, [bag("charka"), bag("skor_na_ruku"), bag("sebe_na_ume")]);
  assert.deepEqual(p.threads.filter((x) => x.from === "Пристрастился к чарке"), [
    { nit: "pyanstvo", kak: "stupen", step: "чарка", from: "Пристрастился к чарке" }, { nit: "pyanstvo", kak: "tolkaet", from: "Пристрастился к чарке" }]);
  assert.ok(p.threads.some((x) => x.nit === "mest" && x.uDrugogo && x.from === "Скор на руку"));
  assert.deepEqual(p.deed, [{ gde: "любое дело", sila: -1, from: "Пристрастился к чарке" }]);
  const hidden = p.traces.lines.filter((l) => l.from === "Себе на уме");
  assert.ok(hidden.length === 3 && hidden.every((l) => l.vis === "skrytaya" && l.trait), "след скрытой черты — скрытый");
  assert.deepEqual(p.traces.lines.filter((l) => l.from === "Скор на руку").map((l) => l.gde[0]), ["vid", "zhaloba", "prisutstvie"]);
});

test("лихо по весам: свои люди засидевшегося прикрывают лихо у нечестного и служат глазами у честного", () => {
  const obros = bag("obros_svyazyami");
  assert.ok(obros.likhoByWeights && obros.notes?.likho);
  const crook = portraitOf(signs({ zhestkost: 3 }), [obros]), honest = portraitOf(signs({ chestnost: 3 }), [obros]), middle = portraitOf(zero, [obros]);
  assert.ok(crook.holds.sovest < 0 && honest.holds.sovest >= BALANCE.natura.portrait.honestFrom && middle.holds.sovest === 0);
  assert.deepEqual([[crook.likho, crook.likhoYasnost], [honest.likho, honest.likhoYasnost], [middle.likho, middle.likhoYasnost]], [[1, 0], [0, 1], [0, 0]]);
  assert.deepEqual([portraitOf(signs({ zhestkost: 3 })).likho, portraitOf(signs({ chestnost: 3 })).likhoYasnost], [0, 0], "без черты прикрытия нет");
  setAt("natura.portrait.honestFrom", 2);
  assert.equal(portraitOf(signs({ chestnost: 3 }), [obros]).likhoYasnost, 0, "ручка порога честного действует сразу");
});

test("черты совета → мешок: у каждой из десяти черт совета названа пара или сказано, что пары нет", () => {
  assert.deepEqual(Object.keys(COUNCIL_TO_BAG).sort(), TRAITS.map((t) => t.id).sort());
  for (const [id, pair] of Object.entries(COUNCIL_TO_BAG)) {
    for (const b of [...pair.bag, ...(pair.support ?? [])]) bag(b);
    assert.ok(pair.how && (pair.bag.length > 0 || pair.support?.length), `${id}: ни пары, ни поддержки`);
  }
  assert.deepEqual([COUNCIL_TO_BAG.verny.bag, COUNCIL_TO_BAG.verny.support], [[], ["derzhit_slovo", "svoikh_ne_sdayot"]]);
});

// ---------- новые черты, облик, умения, сплавы, мешок Сенешаля, «Откуда и чей» (задача И27в; cherty-dannye.md, разделы 7–10) ----------

const NEW_IDS = {
  poroki: ["nechist_na_ruku", "v_dolgakh", "igraet_v_kosti", "sokhnet_po_chuzhoy", "grekh_na_storone", "beglyy_pod_imenem", "gulyal_na_doroge", "pishet_v_palatu", "beryot_posuly", "krovnik",
    "skryvaet_khvor", "lezheboka", "pryachet_mechenoe", "khvastun", "vral", "znaetsya_s_likhimi"],
  dobrye: ["kopit_na_nadel", "doch_na_vydanye", "uchitsya_gramote", "ishchet_propavshego", "stavit_svoy_dvor"],
  oblik: ["khorosh_soboy", "ryaboy", "silach", "shram", "sedoy", "zaikaetsya"],
  umeniya: ["plotnik", "znaet_zemlyu", "khodit_za_skotom", "bortnik", "znaet_vodu", "kuznets", "strelok", "konny", "govorit_po_lesnomu", "povitukha", "uchit_detey", "oboznik", "pomnit_predaniya"],
};

test("новые черты: все id из cherty-dannye.md есть в мешке — пороки и тайны, добрые нити, облик, умения", () => {
  for (const id of Object.values(NEW_IDS).flat()) bag(id);
  for (const id of [...NEW_IDS.poroki, ...NEW_IDS.dobrye]) assert.equal(bag(id).kind, "life", id);
  for (const id of NEW_IDS.umeniya) assert.ok(bag(id).kind === "perk" && bag(id).requires?.length === 4 && bag(id).places?.length, `${id}: умение с требованиями и местами`);
  // скрытые пороки и те, кого кто-то держит
  assert.deepEqual(NEW_IDS.poroki.filter((id) => bag(id).vis === "skrytaya"),
    ["nechist_na_ruku", "sokhnet_po_chuzhoy", "grekh_na_storone", "beglyy_pod_imenem", "gulyal_na_doroge", "pishet_v_palatu", "skryvaet_khvor", "pryachet_mechenoe", "znaetsya_s_likhimi"]);
  assert.deepEqual(bag("nechist_na_ruku").holder, [{ role: "skupshchik", likho: true }]);
  assert.deepEqual([bag("beryot_posuly").likho, bag("znaetsya_s_likhimi").likho, bag("znaetsya_s_likhimi").links?.ladit], [1, 1, ["likhie"]]);
  assert.deepEqual([bag("sokhnet_po_chuzhoy").nameF, bag("nechist_na_ruku").conflicts], ["Сохнет по чужому", ["kak_na_dukhu"]]);
  // «только до игры» — без повода в игре: в игре не наживается
  for (const id of ["beglyy_pod_imenem", "gulyal_na_doroge"]) assert.deepEqual([bag(id).source, bag(id).trigger], [["backstory"], undefined], id);
  // порок доходит до портрета: кто держит, лихо, нить
  const p = portraitOf(zero, [bag("beryot_posuly"), bag("v_dolgakh")]);
  assert.deepEqual([p.likho, p.holder.map((h) => h.role), p.wants.dengi, p.holds.sovest], [1, ["dayushchiy", "zaimodavets"], 2, -1]);
  assert.ok(p.threads.some((x) => x.nit === "dolg" && x.step === "занял") && p.threads.some((x) => x.nit === "dengi" && x.kak === "otkryvaet"));
  assert.ok(p.notes.some((n) => n.key === "derzhit" && n.from === "В долгах"));
});

test("облик: вектора нет, у человека не больше одной черты, доля — ручка; признаков облик не меняет", () => {
  for (const id of NEW_IDS.oblik) assert.deepEqual([bag(id).kind, Object.keys(bag(id).vec).length, bag(id).vis], ["look", 0, "yavnaya"], id);
  const people = rollAll(600, "облик"), withLook = people.filter((p) => p.traits.some((t) => t.kind === "look"));
  assert.ok(people.every((p) => p.traits.filter((t) => t.kind === "look").length <= 1));
  assert.ok(Math.abs(withLook.length / people.length - BALANCE.natura.lookShare) < 0.06, `доля с обликом ${withLook.length / people.length}`);
  assert.equal(new Set(withLook.map((p) => p.traits.find((t) => t.kind === "look")!.id)).size, 6, "выпадают все шесть");
  // в игре облик не наживается
  const p = rollPerson("облик-в-игре", NATURES[0]);
  for (let i = 0; i < 12; i++) assert.notEqual(growLife(new Rng(`жизнь-${i}`), p)?.kind, "look");
  setAt("natura.lookShare", 0);
  const bare = rollAll(200, "облик");
  assert.ok(bare.every((x) => !x.traits.some((t) => t.kind === "look")));
  // облик и происхождение тянутся из побочного ряда: остальные черты и признаки у тех же людей те же
  for (let i = 0; i < 200; i++) {
    assert.deepEqual(bare[i].traits.map((t) => t.id), people[i].traits.filter((t) => t.kind !== "look").map((t) => t.id));
    assert.deepEqual(bare[i].signs, people[i].signs);
  }
  setAt("natura.lookShare", 1);
  assert.ok(rollAll(60, "облик").every((x) => x.traits.filter((t) => t.kind === "look").length === 1));
});

test("мешок Сенешаля: его черты людям не выпадают; у Сенешаля ядро всегда, умения и черты — по ручкам", () => {
  const S = BALANCE.natura.seneschal, own = BAG.filter((t) => t.seneschal).map((t) => t.id);
  assert.deepEqual([...SENESCHAL.core, ...SENESCHAL.skills.filter((id) => id !== "pomnit_predaniya"), ...SENESCHAL.pick].sort(), [...own].sort());
  assert.ok(!bag("pomnit_predaniya").seneschal, "«Помнит предания» — общее умение с людьми");
  const people = rollAll(600, "люди");
  for (const p of people) {
    for (let i = 0; i < 4; i++) growLife(new Rng(`${p.age}-${i}`), p);
    assert.ok(!p.traits.some((t) => t.seneschal), "черта Сенешаля выпала обычному человеку");
  }
  for (const n of NATURES.slice(0, 12)) {
    const s = growSeneschal(`сенешаль-${n.id}`, n), ids = s.traits.map((t) => t.id);
    assert.deepEqual(s, growSeneschal(`сенешаль-${n.id}`, n), "одно семя — один Сенешаль");
    assert.equal(s.age, S.age);
    assert.deepEqual(ids.slice(0, 3), SENESCHAL.core, "ядро из трёх черт — всегда и первым");
    assert.equal(ids.filter((id) => SENESCHAL.skills.includes(id)).length, S.skills, `${n.id}: умений`);
    const picked = ids.filter((id) => SENESCHAL.pick.includes(id)).length;
    assert.ok(picked >= S.pickMin && picked <= S.pickMax, `${n.id}: черт из мешка ${picked}`);
    assert.ok(!(ids.includes("lyubit_okhotu") && ids.includes("molitvennik")), "«Любит охоту» не уживается с «Молитвенником»");
    assert.ok(s.traits.length > 3 + S.skills + picked, "остальное — как у людей");
    assert.equal(new Set(ids).size, ids.length);
    // ядро видно в портрете: совесть и «новое»
    const p = portrait(s);
    assert.ok(p.by.holds.sovest.some((x) => x.from === "Золотое правило" && x.v === 2) && p.by.wants.novoe.some((x) => x.from === "Мечта о дороге" && x.v === 2));
  }
  setAt("natura.seneschal.skills", 5); setAt("natura.seneschal.pickMin", 0); setAt("natura.seneschal.pickMax", 0);
  const full = growSeneschal("все умения", NATURES[0]).traits.map((t) => t.id);
  assert.ok(SENESCHAL.skills.every((id) => full.includes(id)) && !SENESCHAL.pick.some((id) => full.includes(id)), "ручки действуют сразу");
});

test("«Откуда и чей»: двенадцать происхождений, ссылки ведут в словарь и в мешок; у каждого человека оно есть", () => {
  assert.equal(ORIGINS.length, 12);
  assert.equal(new Set(ORIGINS.map((o) => o.id)).size, 12);
  const ids = <T extends { id: string }>(list: T[]) => list.map((x) => x.id);
  for (const o of ORIGINS) {
    assert.ok(/^[a-z_]+$/.test(o.id) && o.name && MERA_NAMES[o.mera], o.id);
    for (const k of o.wants) assert.ok(ids(WANTS).includes(k), `${o.id}: желание ${k}`);
    for (const k of o.holds ?? []) assert.ok(ids(HOLDS).includes(k), `${o.id}: удержка ${k}`);
    for (const k of o.threads) assert.ok(ids(THREADS).includes(k), `${o.id}: нить ${k}`);
    for (const k of [...o.ladit, ...o.neLadit]) assert.ok(linkName(k), `${o.id}: связь ${k}`);
    for (const id of o.often) bag(id);
    for (const g of o.names) assert.ok(g === "peasant" || g === "castle" || g in NAMES_PEOPLE, `${o.id}: мешок имён ${g}`);
    assert.equal(originById(o.id), o);
  }
  assert.throws(() => originById("net_takogo"), /Нет происхождения/);
  const people = rollAll(1000, "откуда");
  assert.ok(people.every((p) => ORIGINS.some((o) => o.id === p.origin) && ORIGINS.some((o) => o.id === p.originShown)));
  const share = metricsOf(people).origins;
  assert.ok(ORIGINS.every((o) => share[o.id] > 0), "встречаются все двенадцать");
  assert.ok(share.starozhil > share.khramovy_vyuchenik && share.khramovy_vyuchenik > share.tull, `обычные чаще редких: ${JSON.stringify(share)}`);
  assert.equal(growPerson(new Rng("задано"), NATURES[0], { origin: "tull" }).originShown, "tull");
});

test("черты происхождения выпадают чаще, и вес — ручка", () => {
  const often = (weight: number) => {
    setAt("natura.originWeight", weight);
    const people = Array.from({ length: 400 }, (_, i) => rollPerson(`род-${i}`, NATURES[i % NATURES.length]));
    // у старожила: «Как деды жили», «Прикипел к месту», «Помнит родство»
    const own = people.filter((p) => p.origin === "starozhil");
    return own.filter((p) => p.traits.some((t) => originById("starozhil").often.includes(t.id))).length / own.length;
  };
  const plain = often(1), pulled = often(4);
  assert.ok(pulled > plain + 0.05, `при весе 4 — ${pulled}, без веса — ${plain}`);
});

test("скрытое происхождение: беглый — на людях не беглый; знавал лучшие дни — на людях простой, а был служилым, торговым или искателем", () => {
  const all = Array.from({ length: 3000 }, (_, i) => growPerson(new Rng(`беглый-${i}`), NATURES[i % NATURES.length], { age: 60 }));
  const has = (id: string) => (p: NaturaPerson) => p.traits.some((t) => t.id === id);
  assert.deepEqual(HIDDEN_ORIGINS.map((r) => r.trait), ["luchshie_dni", "beglyy_pod_imenem"]);
  for (const r of HIDDEN_ORIGINS) { bag(r.trait); for (const id of r.real) originById(id); }
  // «Беглый» берёт верх, если у человека обе черты
  const runaway = all.filter(has("beglyy_pod_imenem")), better = all.filter((p) => has("luchshie_dni")(p) && !has("beglyy_pod_imenem")(p));
  assert.ok(runaway.length >= 5 && better.length >= 5, `беглых под чужим именем ${runaway.length}, знававших лучшие дни ${better.length}`);
  for (const p of runaway) assert.ok(p.origin === "beglyy_s_zakata" && p.originShown !== "beglyy_s_zakata", `${p.origin} / ${p.originShown}`);
  for (const p of better) {
    assert.ok(["sluzhily_rod", "iz_vadely", "byvaly"].includes(p.origin) && p.originShown !== p.origin, `${p.origin} / ${p.originShown}`);
    assert.ok(["derevnya", "chelyad"].includes(originById(p.originShown).mera), `на людях — простое: ${p.originShown}`);
  }
  assert.ok(new Set(better.map((p) => p.origin)).size === 3, "встречаются все три прежние жизни");
  for (const p of all.filter((x) => !runaway.includes(x) && !better.includes(x))) assert.equal(p.origin, p.originShown);
});

// ---------- словарь нитей и две черты по каталогу нитей (задача И27г; niti.md, раздел 5; cherty-dannye.md, 1.6, 1.12, 7.1) ----------

test("каталог нитей: имя «ребёнок на стороне», третья ветвь «прошлого», нить «скрытая вина», роль «свидетель», две черты в мешке", () => {
  const thread = (id: string) => THREADS.find((t) => t.id === id)!, role = (id: string) => HOLDER_ROLES.find((r) => r.id === id)!;
  assert.deepEqual([thread("krov").name, thread("krov").desc], ["ребёнок на стороне", "мать просит → растёт → узнают"]);
  assert.match(thread("proshloe").desc, /«лучшие дни».*признать/);
  assert.equal(thread("vina").name, "скрытая вина");
  assert.deepEqual([role("svidetel").name, role("svidetel").likho], ["свидетель", undefined]);
  // «Знавал лучшие дни» — только до игры; «Скрывает вину» — в игре, по поступку
  const was = bag("luchshie_dni"), guilt = bag("skryvaet_vinu");
  assert.deepEqual([was.kind, was.vis, was.rarity, was.source, was.trigger, was.vec], ["life", "skrytaya", "rare", ["backstory"], undefined, { gordost: 1, obshchitelnost: -1 }]);
  assert.deepEqual([guilt.kind, guilt.vis, guilt.rarity, guilt.source, guilt.trigger, guilt.vec], ["life", "skrytaya", "common", ["life"], "deed", { chestnost: -1, smelost: -1 }]);
  assert.deepEqual([was.threads, was.approach, was.memory?.pomnit], [[{ nit: "proshloe", kak: "otkryvaet" }], { da: ["pochtit"], net: ["stydit"] }, ["unizhenie"]]);
  assert.deepEqual(guilt.threads, [{ nit: "vina", kak: "stupen", step: "носит" }, { nit: "pyanstvo", kak: "tolkaet" }]);
  assert.deepEqual([guilt.holder, guilt.memory?.pomnit], [[{ role: "svidetel" }], ["grekh"]]);
  // черты доходят до портрета: желания, удержки, нить и кто держит
  const p = portraitOf(zero, [was, guilt]);
  assert.deepEqual([p.wants.pochet, p.wants.chistaya_sovest, p.holds.strakh, p.holder.map((h) => h.role)], [1, 1, 1, ["svidetel"]]);
  assert.deepEqual(p.threads.map((t) => t.nit).sort(), ["proshloe", "pyanstvo", "vina"]);
});

test("сплавы: появляются ровно при своём условии — оба полюса сильные или черта плюс заметный полюс", () => {
  assert.equal(ALLOYS.length, 6);
  for (const a of ALLOYS) for (const part of a.parts) { assert.ok(part.pole || part.traits?.length, a.id); for (const id of part.traits ?? []) bag(id); }
  const names = (sg: SignVec, traits: BagTrait[] = []) => alloysOf(signs(sg), traits).map((a) => a.id);
  // оба полюса сильные: 3,5 и выше
  assert.deepEqual(names({ zhestkost: 3.5, privyazannost: 3.5 }), ["strog_da_svoy"]);
  assert.deepEqual(names({ zhestkost: 3.4, privyazannost: 4 }), []);
  assert.deepEqual(names({ chestnost: 4, lyubopytstvo: -3.5 }), ["chestny_upryamets"]);
  assert.deepEqual(names({ chestnost: 4, lyubopytstvo: 3.5 }), [], "нужен свой полюс: косность, а не любопытство");
  // три полюса — все три
  assert.deepEqual(names({ obshchitelnost: -4, chestnost: -4, terpenie: 4 }), ["tikhiy_omut"]);
  assert.deepEqual(names({ obshchitelnost: -4, chestnost: -4, terpenie: 3 }), []);
  // черта плюс заметный полюс: от 2
  assert.deepEqual(names({ obshchitelnost: 2 }, [bag("nechist_na_ruku")]), ["vesyoly_vor"]);
  assert.deepEqual(names({ obshchitelnost: 1.9 }, [bag("nechist_na_ruku")]), []);
  assert.deepEqual(names({ obshchitelnost: 5 }), [], "без черты «Нечист на руку» весёлого вора нет");
  assert.deepEqual(names({ vera: 2 }, [bag("gulyaka")]), ["nabozhny_gulyaka"]);
  // «Праведный скупец»: вера и скупость — признаками, чертами или вперемешку
  assert.deepEqual(names({ vera: 3.5, shchedrost: -3.5 }), ["pravedny_skupets"]);
  assert.deepEqual(names({ vera: 3, shchedrost: -3 }), []);
  assert.deepEqual(names({}, [bag("stal_nabozhen"), bag("zimoy_snega")]), ["pravedny_skupets"]);
  assert.deepEqual(names({ shchedrost: -2 }, [bag("chtit_primety")]), ["pravedny_skupets"]);
  assert.deepEqual(names({ shchedrost: -1.9 }, [bag("chtit_primety")]), []);
  setAt("natura.portrait.strong", 3);
  assert.deepEqual(names({ vera: 3, shchedrost: -3 }), ["pravedny_skupets"], "ручка порога действует сразу");
});

test("сплав в портрете: имя, особенность и то, что из неё легло на ключи", () => {
  const omut = portraitOf(signs({ obshchitelnost: -4, chestnost: -4, terpenie: 4 }));
  assert.deepEqual(omut.alloys.map((a) => a.name), ["Тихий омут"]);
  // Замкнутость даёт тень −1, сплав — ещё −2; Лукавство — ясность −1, сплав — +1
  assert.deepEqual([omut.traces.ten, omut.traces.yasnost], [-3, 0]);
  const stubborn = portraitOf(signs({ chestnost: 4, lyubopytstvo: -3.5 }));
  assert.deepEqual([stubborn.voice.bias, stubborn.voice.biasFrom, stubborn.voice.manners[0]], ["bez", "сплав «Честный упрямец»", "в споре не уступает"]);
  assert.ok(stubborn.approach.da.includes("vremya") && stubborn.by.approach.vremya?.from === "сплав «Честный упрямец»");
  const miser = portraitOf(signs({ shchedrost: -2 }), [bag("chtit_primety"), bag("zhaleet_ubogikh")]);
  assert.ok(miser.approach.net.includes("prosba") && miser.approach.da.includes("obychay"), "сплав ложится поверх черт: просьба людей не действует");
  assert.deepEqual(portraitOf(signs({ zhestkost: 3 })).alloys, []);
});

// ---------- ответы автора по И27в (задача И27д; natura.md, раздел 9; koncept-3.md, 13.1) ----------

test("происхождение в портрете: желания и удержки +1, свои и чужие — в «ладит / не ладит», нити — в нити; при споре верна черта", () => {
  const rod = originById("sluzhily_rod"), gorod = originById("iz_vadely"), byvaly = originById("byvaly");
  // служилый род: почёт и правило по единице, служилые — свои; у строк видно, что они от происхождения
  const p = portraitOf(zero, [], { origin: rod });
  assert.deepEqual([p.wants.pochet, p.holds.pravilo, p.links.ladit], [1, 1, ["sluzhilye"]]);
  assert.deepEqual([p.by.wants.pochet, p.by.links.sluzhilye], [[{ from: rod.name, trait: false, origin: true, v: 1 }], { from: rod.name, trait: false, origin: true }]);
  // складывается с чертой и с признаком: «Знавал лучшие дни» тоже даёт почёт
  assert.equal(portraitOf(zero, [bag("luchshie_dni")], { origin: rod }).wants.pochet, 2);
  // сила — ручка
  setAt("natura.portrait.originForce", 0.5);
  assert.equal(portraitOf(zero, [], { origin: rod }).wants.pochet, 0.5);
  resetBalance();
  // нити происхождения — «склонен»: с пометой, откуда
  assert.deepEqual(portraitOf(zero, [], { origin: byvaly }).threads, [{ nit: "draka", kak: "tolkaet", from: byvaly.name, origin: true }]);
  // поверх признаков: гордый не ладит со служилыми? нет такого правила — берём то, что есть: у горожанина деревни чужие, палата и купцы свои
  const town = portraitOf(zero, [], { origin: gorod });
  assert.deepEqual([town.links.ladit, town.links.neLadit], [["palata", "kuptsy"], ["derevni"]]);
  // спор с признаком: происхождение сильнее; спор с чертой: верна черта
  const pole = POLE_RULES.find((r) => r.neLadit?.includes("palata") || r.ladit?.includes("derevni"));
  const against = trait("ladit_s_derevney", { links: { ladit: ["derevni"] } });
  const fixed = portraitOf(zero, [against], { origin: gorod });
  assert.ok(fixed.links.ladit.includes("derevni") && !fixed.links.neLadit.includes("derevni"), "черта перекрывает происхождение");
  assert.deepEqual(fixed.by.links.derevni, { from: against.name, trait: true });
  if (pole) {
    const signs = { ...zero, [pole.sign]: pole.plus ? 5 : -5 }, got = portraitOf(signs, [], { origin: gorod });
    assert.ok(got.links.ladit.includes("palata") && got.links.neLadit.includes("derevni"), "происхождение перекрывает признак");
  }
  // «чужие» можно не применять — так у Сенешаля
  assert.deepEqual(portraitOf(zero, [], { origin: gorod, noStrangers: true }).links.neLadit, []);
  // без происхождения портрет прежний
  assert.deepEqual(portraitOf(zero, []).threads, []);
});

test("портрет человека с тайной считается по настоящему происхождению, а не по тому, кем он зовётся", () => {
  const all = Array.from({ length: 3000 }, (_, i) => growPerson(new Rng(`беглый-${i}`), NATURES[i % NATURES.length], { age: 60 }));
  const hidden = all.filter((p) => p.origin !== p.originShown);
  assert.ok(hidden.length >= 10);
  for (const p of hidden) {
    const real = originById(p.origin), got = portrait(p);
    assert.deepEqual(got, portraitOf(p.signs, p.traits, { origin: real }));
    for (const nit of real.threads) assert.ok(got.threads.some((t) => t.nit === nit && t.origin && t.from === real.name));
  }
});

test("доли по месту: в деревне чаще старожилы и пришлые, в замке — челядь, сироты и служилые, на приёме — только пришлые", () => {
  assert.deepEqual(ORIGIN_PLACES.map((x) => x.id), ["fon", "derevnya", "zamok", "priyom"]);
  for (const at of ORIGIN_PLACES) for (const id of [...(at.often ?? []), ...(at.seldom ?? []), ...(at.only ?? [])]) originById(id);
  const share = (place?: OriginPlace) => metricsOf(Array.from({ length: 1200 }, (_, i) => rollPerson(`место-${i}`, NATURES[i % NATURES.length], undefined, place))).origins;
  const fon = share(), village = share("derevnya"), castle = share("zamok");
  // общий фон — прежние доли: место по умолчанию ничего не меняет
  assert.deepEqual(fon, share("fon"));
  assert.ok(village.starozhil > fon.starozhil * 1.5 && village.prishly_na_lgotu > fon.prishly_na_lgotu * 1.5, JSON.stringify(village));
  assert.ok(village.sluzhily_rod < fon.sluzhily_rod && village.iz_chelyadi < fon.iz_chelyadi);
  assert.ok(castle.iz_chelyadi > fon.iz_chelyadi * 1.5 && castle.zamkovy_sirota > fon.zamkovy_sirota * 1.5 && castle.sluzhily_rod > fon.sluzhily_rod * 1.5, JSON.stringify(castle));
  assert.ok(castle.starozhil < fon.starozhil);
  // полукровка и тулл — исключительные везде
  for (const s of [village, castle]) assert.ok(s.polukrovka < 0.04 && s.tull < 0.04, JSON.stringify(s));
  // приём пришлых: настоящее происхождение — одно из четырёх или тайное прошлое; на людях — всегда одно из четырёх
  const four = ORIGIN_PLACES.find((x) => x.id === "priyom")!.only!;
  const came = Array.from({ length: 1500 }, (_, i) => growPerson(new Rng(`приём-${i}`), NATURES[i % NATURES.length], { age: 60, place: "priyom" }));
  assert.ok(came.every((p) => four.includes(p.originShown)), "на людях — пришлый");
  assert.ok(came.every((p) => four.includes(p.origin) || p.traits.some((t) => t.id === "luchshie_dni")), "настоящее — пришлый или «лучшие дни»");
  assert.ok(four.every((id) => came.some((p) => p.origin === id)), "встречаются все четыре");
  // веса места — ручки
  assert.equal(placeWeight(originById("starozhil"), "derevnya"), BALANCE.natura.placeOften);
  assert.equal(placeWeight(originById("sluzhily_rod"), "derevnya"), BALANCE.natura.placeSeldom);
  assert.equal(placeWeight(originById("starozhil"), "priyom"), 0);
  setAt("natura.placeOften", 1); setAt("natura.placeSeldom", 1);
  for (const o of ORIGINS) assert.equal(placeWeight(o, "zamok"), placeWeight(o, "fon"), o.id);
});

test("натура с довольством малым в ядре: «Сыт краюхой» и «Знает свой шесток» выпадают не как исключительные", () => {
  const quiet = NATURES.find((n) => n.id === "domosed")!;
  assert.deepEqual([quiet.name, quiet.core.chestolyubie, Object.keys(quiet.core).length], ["Домосед", -3, 3]);
  const people = rollAll(1000, "натура"), has = (id: string) => people.filter((p) => p.traits.some((t) => t.id === id)).length;
  // до новой натуры было 3–6 на тысячу — на грани покрытия
  assert.ok(has("syt_krayukhoy") >= 8 && has("znaet_shestok") >= 8, `«Сыт краюхой» ${has("syt_krayukhoy")}, «Знает свой шесток» ${has("znaet_shestok")} на тысячу`);
  const own = people.filter((p) => p.nature === quiet);
  assert.ok(own.filter((p) => p.traits.some((t) => ["syt_krayukhoy", "znaet_shestok"].includes(t.id))).length / own.length > 0.3, "у Домоседа — у многих");
});

test("откуда Сенешаль: одно из четырёх происхождений поровну, тайного прошлого нет, «чужие» не применяются", () => {
  assert.deepEqual([SENESCHAL_ORIGIN.ids, SENESCHAL_ORIGIN.mera], [["sluzhily_rod", "vtoroy_syn", "khramovy_vyuchenik", "iz_vadely"], "sluzhba"]);
  const all = Array.from({ length: 400 }, (_, i) => growSeneschal(`откуда-${i}`, NATURES[i % NATURES.length]));
  for (const id of SENESCHAL_ORIGIN.ids) {
    const n = all.filter((s) => s.origin === id).length;
    assert.ok(n > 70 && n < 130, `${id}: ${n} из 400`);
  }
  assert.ok(all.every((s) => s.origin === s.originShown && SENESCHAL_ORIGIN.ids.includes(s.origin)));
  assert.ok(all.every((s) => !s.traits.some((t) => HIDDEN_ORIGINS.some((r) => r.trait === t.id))), "ни беглого, ни «лучших дней»");
  // горожанин из Ваделы: у людей деревни чужие, у Сенешаля — нет; свои и желания — как у людей
  const town = all.find((s) => s.origin === "iz_vadely")!, got = portrait(town);
  assert.equal(got.by.links.derevni?.origin, undefined);
  assert.ok(got.by.wants.dengi.some((x) => x.origin) && got.by.wants.novoe.some((x) => x.origin));
  assert.deepEqual(got, portraitOf(town.signs, town.traits, { origin: originById("iz_vadely"), noStrangers: true }));
});

// ---------- три добрые нити и связи черт (задача И27е; niti.md, 5.8–5.10 и 7.4; cherty-dannye.md, 1.6) ----------

test("добрые нити «своё дело», «доброе имя», «вернулся»: есть в словаре, черты их открывают, толкают и тормозят", () => {
  const thread = (id: string) => THREADS.find((t) => t.id === id)!;
  assert.deepEqual(["svoe_delo", "dobroe_imya", "vernulsya"].map((id) => thread(id).name), ["своё дело", "доброе имя", "вернулся"]);
  assert.match(thread("svoe_delo").desc, /новое место или ступень места/);
  assert.match(thread("vernulsya").desc, /двойник «уйти»/);
  // кто как связан с нитью: id черт — по именам из таблицы cherty-dannye.md, 1.6
  const linked = (nit: string, kak: string) => BAG.filter((t) => t.threads?.some((x) => x.nit === nit && x.kak === kak)).map((t) => t.id).sort();
  assert.deepEqual(linked("svoe_delo", "otkryvaet"), ["bortnik", "chuet_vygodu", "kuznets", "nabil_ruku", "plotnik", "torgovaya_khvatka", "znaet_vodu"]);
  assert.deepEqual([linked("svoe_delo", "tolkaet"), linked("svoe_delo", "tormozit")], [["prodast_i_kupit", "razzhilsya"], ["kak_dedy", "lezheboka"]]);
  assert.deepEqual(linked("dobroe_imya", "otkryvaet"), ["derzhit_slovo", "poslednyuyu_rubakhu", "zhaleet_ubogikh"]);
  assert.deepEqual([linked("dobroe_imya", "tolkaet"), linked("dobroe_imya", "tormozit")], [["golos", "kak_na_dukhu", "khlebosol", "mirit"], ["khvastun", "nazhil_vragov", "vral"]]);
  // «вернулся» открывается развязками других нитей, а не чертами; у оставшихся его толкают «Помнит родство» и «За семью горой» — нить у другого
  assert.deepEqual([linked("vernulsya", "otkryvaet"), linked("vernulsya", "tolkaet")], [[], ["pomnit_rodstvo", "za_semyu_goroy"]]);
  for (const id of ["pomnit_rodstvo", "za_semyu_goroy"]) assert.ok(bag(id).threads!.find((x) => x.nit === "vernulsya")!.uDrugogo, id);
  // прежние связи на месте, новая — рядом: «Лежебока» по-прежнему открывает «недосмотр»
  assert.deepEqual(bag("lezheboka").threads, [{ nit: "nedosmotr", kak: "otkryvaet" }, { nit: "svoe_delo", kak: "tormozit" }]);
  // у каждой ссылки черты на нить нить есть в словаре; связь доходит до портрета
  for (const t of BAG) for (const x of t.threads ?? []) assert.ok(THREADS.some((q) => q.id === x.nit), `${t.id}: нить ${x.nit}`);
  assert.ok(portraitOf(zero, [bag("kuznets")]).threads.some((x) => x.nit === "svoe_delo" && x.kak === "otkryvaet"));
});

