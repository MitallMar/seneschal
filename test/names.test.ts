// Мешки имён и генератор имени (задача И26): src/data/names.ts, src/sim/names.ts; замысел — docs/design/imena.md.
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { ROSTER } from "../src/data/core";
import { NAMES_BASE, NAMES_TINT, NAMES_PEOPLE, NICKNAMES, RESERVED_NAMES, type PeopleId } from "../src/data/names";
import { BALANCE, resetBalance, setAt } from "../src/sim/balance";
import { Rng } from "../src/sim/rng";
import { makeName, newNameBook, sameStart, sameEnd, mouldOk, fitsCircle, ofFather, byHusband, nickFor, type NameAsk, type Named } from "../src/sim/names";

afterEach(() => resetBalance());

const PEOPLES = Object.keys(NAMES_PEOPLE) as PeopleId[];
const HUMAN = [...NAMES_BASE.m, ...NAMES_BASE.f, ...NAMES_TINT.m, ...NAMES_TINT.f];
const roll = (seed: string, asks: NameAsk[]): Named[] => { const rng = new Rng(seed), book = newNameBook(); return asks.map((a) => makeName(rng, book, a)); };
const many = (n: number, ask: (i: number) => NameAsk): NameAsk[] => Array.from({ length: n }, (_, i) => ask(i));

test("мешки: размеры как в imena.md, внутри мешка и между мешками людей повторов нет, сюжетных имён нет", () => {
  assert.deepEqual([NAMES_BASE.m.length, NAMES_BASE.f.length, NAMES_TINT.m.length, NAMES_TINT.f.length, NICKNAMES.length], [90, 66, 48, 46, 54]);
  assert.deepEqual(PEOPLES.map((p) => [NAMES_PEOPLE[p].m.length, NAMES_PEOPLE[p].f.length]), [[22, 15], [20, 15], [16, 11], [16, 16], [18, 6]]);
  assert.equal(NAMES_PEOPLE.forest.m, NAMES_PEOPLE.forest.f, "у лесных список общий");
  const all = [...HUMAN, ...PEOPLES.filter((p) => p !== "forest").flatMap((p) => [...NAMES_PEOPLE[p].m, ...NAMES_PEOPLE[p].f]), ...NAMES_PEOPLE.forest.m];
  assert.deepEqual(all.filter((n, i) => all.indexOf(n) !== i), [], "одно имя — в одном мешке");
  assert.equal(new Set(NICKNAMES).size, NICKNAMES.length);
  for (const n of [...all, ...NICKNAMES]) assert.ok(/^[А-ЯЁ][а-яё]+$/.test(n), `${n}: имя — одно слово с заглавной буквы`);
  for (const n of RESERVED_NAMES) assert.ok(!all.includes(n), `${n} занято сюжетом`);
});

test("одно семя — одни имена, другое семя — другие", () => {
  const asks = many(40, (i) => ({ group: i % 2 ? "peasant" : "castle", female: i % 3 === 0, place: i % 2 ? "брод" : "замок" }));
  assert.deepEqual(roll("а", asks), roll("а", asks));
  assert.notDeepEqual(roll("а", asks).map((n) => n.full), roll("б", asks).map((n) => n.full));
});

test("группа и пол: замок — из основы, народ — из своего мешка, пол соблюдается", () => {
  const castle = roll("замок", many(60, (i) => ({ group: "castle", female: i % 2 === 0 })));
  castle.forEach((n, i) => assert.ok((i % 2 === 0 ? NAMES_BASE.f : NAMES_BASE.m).includes(n.name) && !n.tint && n.full === n.name, n.full));
  for (const p of PEOPLES) {
    const got = roll(p, many(12, (i) => ({ group: p, female: i % 2 === 0 })));
    got.forEach((n, i) => assert.ok((i % 2 === 0 ? NAMES_PEOPLE[p].f : NAMES_PEOPLE[p].m).includes(n.name), `${p}: ${n.name}`));
  }
});

test("крестьяне марок: доля славянского оттенка на ста людях близка к ручке, ручка действует", () => {
  const share = (seed: string) => roll(seed, many(100, (i) => ({ group: "peasant", female: i % 2 === 0 }))).filter((n) => n.tint).length / 100;
  const mean = ["а", "б", "в", "г"].map(share).reduce((s, v) => s + v, 0) / 4;
  assert.ok(Math.abs(mean - BALANCE.names.tint) < 0.08, `доля оттенка ${mean} при ручке ${BALANCE.names.tint}`);
  const one = roll("а", many(100, (i) => ({ group: "peasant", female: i % 2 === 0 })));
  for (const n of one) assert.ok((n.tint ? [...NAMES_TINT.m, ...NAMES_TINT.f] : [...NAMES_BASE.m, ...NAMES_BASE.f]).includes(n.name), n.name);
  setAt("names.tint", 0);
  assert.equal(share("а"), 0);
  setAt("names.tint", 1);
  const tinted = roll("а", many(80, (i) => ({ group: "peasant", female: i % 2 === 0 })));
  assert.ok(tinted.every((n) => n.tint), "пока мешка оттенка хватает, в основу никто не уходит");
});

test("тёзок в одном месте и поколении нет; в другом месте и в другом поколении то же имя встретиться может", () => {
  for (const seed of ["а", "б", "в"]) {
    const got = roll(seed, many(120, (i) => ({ group: i % 3 ? "peasant" : "castle", female: i % 2 === 0, place: "брод", generation: 1 })));
    assert.equal(new Set(got.map((n) => n.name)).size, got.length, "пока мешка хватает — имена не повторяются");
    assert.ok(got.every((n) => !n.by && n.full === n.name));
  }
  const two = roll("г", [...many(40, (): NameAsk => ({ group: "castle", female: false, place: "брод" })), ...many(40, (): NameAsk => ({ group: "castle", female: false, place: "опушка" })),
    ...many(40, (): NameAsk => ({ group: "castle", female: false, place: "брод", generation: 1 }))]);
  const names = (from: number) => two.slice(from, from + 40).map((n) => n.name);
  assert.ok(names(0).some((n) => names(40).includes(n)) && names(0).some((n) => names(80).includes(n)), "книга имён делит людей по месту и поколению");
  assert.ok(two.every((n) => !n.by));
});

test("мешок вычерпан: имя повторяется, а человека различают — по мужу, по отцу, прозвищем; полное имя ни у кого не повторяется", () => {
  const n = NAMES_PEOPLE.orc.f.length;
  const orcs = roll("орки", many(n + 8, (i) => ({ group: "orc", female: true, father: i % 2 ? "Гордак" : undefined })));
  assert.ok(orcs.slice(0, n).every((x) => !x.by) && orcs.slice(n).every((x) => x.by), "различают только тёзок");
  assert.equal(new Set(orcs.map((x) => x.full)).size, orcs.length);
  assert.ok(orcs.some((x) => x.by === "отец" && x.full === `${x.name}, Гордакова дочь`) && orcs.some((x) => x.by === "прозвище"), orcs.slice(n).map((x) => x.full).join("; "));
  for (const x of orcs.filter((y) => y.by === "прозвище")) {
    assert.ok(NICKNAMES.map((q) => nickFor(q, true)).includes(x.full.slice(x.name.length + 1)), `${x.full}: прозвище из списка, в женском роде`);
  }
  // замужнюю крестьянку марок зовут по мужу
  const wives = NAMES_BASE.f.length + NAMES_TINT.f.length;
  const village = roll("деревня", many(wives + 3, (i) => ({ group: "peasant", female: true, place: "брод", husband: ["Будан", "Радко", "Нечай"][i % 3], father: "Велен" })));
  assert.deepEqual(village.slice(wives).map((x) => x.by), ["муж", "муж", "муж"]);
  assert.ok(village.slice(wives).every((x) => /(Буданиха|Радчиха|Нечаиха)$/.test(x.full)), village.slice(wives).map((x) => x.full).join("; "));
  // без отца и мужа — прозвище; мужчине годится любое
  const men = roll("тёзки", many(NAMES_PEOPLE.tull.m.length + 5, (): NameAsk => ({ group: "tull", female: false, father: "Сиппу" })));
  assert.ok(men.slice(NAMES_PEOPLE.tull.m.length).every((x) => x.by === "прозвище"), "от внешнего имени тулла по отцу не зовут");
});

test("по отцу, по мужу, прозвище в женском роде", () => {
  assert.deepEqual(["Радим", "Бертил", "Любош", "Нечай", "Арвель", "Ратша", "Радко", "Кело"].map(ofFather), ["Радимов", "Бертилов", "Любошев", "Нечаев", "Арвелев", "Ратшин", "Радков", "Келов"]);
  assert.deepEqual(["Сиппу", "Айвэ", "Нелле"].map(ofFather), [null, null, null]);
  assert.deepEqual(["Будан", "Нечай", "Кочет", "Радко", "Голуб"].map(byHusband), ["Буданиха", "Нечаиха", "Кочетиха", "Радчиха", "Голубиха"]);
  assert.deepEqual(["Косой", "Рыжий", "Беспалый", "Долгий", "Верхний", "Сова", "Тетеря", "Гвоздь", "Мельник"].map((x) => nickFor(x, true)),
    ["Косая", "Рыжая", "Беспалая", "Долгая", "Верхняя", "Сова", "Тетеря", null, null]);
  assert.equal(nickFor("Гвоздь", false), "Гвоздь");
});

test("склад имён: в совете и ближнем круге не больше двух имён с одинаковым началом или окончанием", () => {
  assert.ok(sameEnd("Дестан", "Тишан") && sameStart("Дестан", "Делвин") && !sameStart("Дестан", "Гарвин") && !sameEnd("Дестан", "Гарвин"));
  assert.ok(fitsCircle("Радан", ["Дестан"]) && !fitsCircle("Радан", ["Дестан", "Тишан"]) && !fitsCircle("Делвин", ["Дестан", "Деран"]));
  assert.ok(mouldOk(["Ломер", "Лорвия", "Калдер"]) && !mouldOk(["Дестан", "Тишан", "Радан"]), "у начала и у окончания счёт отдельный");
  for (const seed of ["а", "б", "в"]) {
    const rng = new Rng(seed), book = newNameBook(), circle: string[] = [];
    for (let i = 0; i < 12; i++) circle.push(makeName(rng, book, { group: i % 4 ? "castle" : "peasant", female: i % 2 === 0, place: "замок", circle }).name);
    assert.ok(mouldOk(circle), `${seed}: ${circle.join(", ")}`);
  }
});

test("люди прототипа: имена из мешков, пол сходится, тёзок нет, склад соблюдён", () => {
  for (const r of ROSTER) {
    const bags = r.female ? [...NAMES_BASE.f, ...NAMES_TINT.f] : [...NAMES_BASE.m, ...NAMES_TINT.m];
    assert.ok(bags.includes(r.name), `${r.name}: нет в мешках людей (${r.female ? "женские" : "мужские"})`);
  }
  const names = ROSTER.map((r) => r.name);
  assert.equal(new Set(names).size, names.length);
  assert.ok(mouldOk(names), names.join(", "));
});
