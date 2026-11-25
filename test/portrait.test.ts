// Портрет человека по Концепту 3 (задача И27а): словарь полей, правило по умолчанию «признак → поля», особенное черт поверх признаков.
// src/data/portrait.ts, src/sim/portrait.ts; замысел — docs/design/cherty-dannye.md, разделы 1–2.
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import type { Sign, BagTrait, SignVec } from "../src/data/types";
import { SIGNS, NATURES, BAG } from "../src/data/natura";
import {
  WANTS, HOLDS, APPROACHES, MEM_KEYS, MEM_SCALES, BIASES, CHANNELS, LINK_GROUPS, HOLDER_ROLES, THREADS, POLE_RULES, POLE_PEOPLE, VIS_NAMES,
} from "../src/data/portrait";
import { BALANCE, resetBalance, setAt } from "../src/sim/balance";
import { Rng } from "../src/sim/rng";
import { growPerson } from "../src/sim/natura";
import { portraitOf, portrait, polesOf, traitVis, strengthWord, linkName, isNotable, isStrong } from "../src/sim/portrait";

afterEach(() => resetBalance());

const signs = (v: SignVec): Record<Sign, number> => Object.fromEntries(SIGNS.map((s) => [s.id, v[s.id] ?? 0])) as Record<Sign, number>;
const trait = (id: string, extra: Partial<BagTrait> = {}): BagTrait => ({
  id, name: `Черта ${id}`, desc: "черта для теста", kind: "life", vec: {}, rarity: "common", effect: "", source: ["life"], ...extra,
});

test("словарь: размеры как в cherty-dannye.md, id не повторяются, у каждого слово для экрана", () => {
  assert.deepEqual([WANTS, HOLDS, APPROACHES, MEM_KEYS, BIASES, CHANNELS, LINK_GROUPS, HOLDER_ROLES].map((x) => x.length), [7, 4, 21, 11, 8, 8, 13, 11]);
  assert.deepEqual([THREADS.filter((t) => !t.proposed).length, THREADS.filter((t) => t.proposed).length, MEM_SCALES.length], [21, 5, 3]);
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
  assert.deepEqual(proud.traces.lines, [{ gde: ["vid"], text: "держится прямо, говорит о роде и чести", vis: "so_vremenem", from: "Гордость" }]);
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
  assert.deepEqual(p.traces.lines.at(-1), { gde: ["ushi"], text: "ходит ночами", vis: "yavnaya", from: "Черта a" });
  assert.deepEqual([p.threads, p.deed, p.holder, p.approach.notes.at(-1)], [[{ nit: "dolg", kak: "otkryvaet" }], [{ gde: "торг", sila: 1 }], [{ role: "zaimodavets" }], "Черта a: только делом"]);
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
  for (const t of BAG) assert.equal(traitVis(t), t.hidden ? "skrytaya" : "yavnaya", `${t.id}: до И27б видимость — по прежнему полю`);
});

test("слова для экрана: сильнее и слабее по порогам", () => {
  assert.deepEqual([0.4, 0.5, 1.4, 1.5, -0.4, -0.5, -1.5].map(strengthWord), ["", "сильнее", "сильнее", "намного сильнее", "", "слабее", "намного слабее"]);
  assert.equal(BALANCE.natura.portrait.wordFrom, 0.5);
});

test("один и тот же человек — один и тот же портрет; у каждой натуры видно ядро", () => {
  for (const n of NATURES) {
    const a = growPerson(new Rng(`портрет-${n.id}`), n), b = growPerson(new Rng(`портрет-${n.id}`), n);
    assert.deepEqual(portrait(a), portrait(b), n.id);
    assert.deepEqual(portrait(a), portraitOf(a.signs, a.traits));
    const p = portrait(a), poles = polesOf(a.signs);
    assert.ok(poles.every((x, i) => i === 0 || x.v <= poles[i - 1].v), "полюса — от сильного к слабому");
    assert.ok(poles.filter((x) => isNotable(x.v)).length >= 1, `${n.id}: заметных полюсов нет`);
    assert.ok(p.approach.da.length >= 1 && p.voice.manners.length >= 1, `${n.id}: портрет пустой`);
    assert.ok(!p.approach.da.some((k) => p.approach.net.includes(k)) && !p.links.ladit.some((k) => p.links.neLadit.includes(k)), `${n.id}: ключ на обеих сторонах`);
  }
});
