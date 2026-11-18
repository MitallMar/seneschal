// Данные: id не повторяются, ссылки ведут на существующее, у событий есть из чего выбирать.
import { test } from "node:test";
import assert from "node:assert/strict";
import { AXES, AXIS_NAMES, AXIS_DAT, OPPOSED, POSTS, FACTION_NAMES, RESOURCE_NAMES, TRAITS, MARKS, ASPIRATIONS, ROSTER } from "../src/data/core";
import { BACKSTORY } from "../src/data/backstory";
import { RUMORS_AXIS, RUMORS_TRAIT } from "../src/data/rumors";
import { EVENTS } from "../src/data/events";
import { BALANCE } from "../src/sim/balance";
import { postAxisTable, axisEffects, axesWarnings, runStats } from "../src/sim/axes-report";

const dup = (ids: string[]) => ids.filter((id, i) => ids.indexOf(id) !== i);
const postIds = POSTS.map((p) => p.id);
const isAxis = (a: string) => (AXES as string[]).includes(a);
const starOk = (s: object) => Object.keys(s).every(isAxis);

test("id не повторяются", () => {
  assert.deepEqual(dup(TRAITS.map((x) => x.id)), []);
  assert.deepEqual(dup(MARKS.map((x) => x.id)), []);
  assert.deepEqual(dup(ASPIRATIONS.map((x) => x.id)), []);
  assert.deepEqual(dup(BACKSTORY.map((x) => x.id)), []);
  assert.deepEqual(dup(EVENTS.map((x) => x.id)), []);
  assert.deepEqual(dup(postIds), []);
  assert.deepEqual(dup(ROSTER.map((x) => x.name)), []);
  for (const ev of EVENTS) assert.deepEqual(dup(ev.options.map((o) => o.id)), [], ev.id);
});

test("оси: пять, у каждой название и падеж; пары трения из существующих осей", () => {
  assert.equal(AXES.length, 5);
  for (const a of AXES) assert.ok(AXIS_NAMES[a] && AXIS_DAT[a], a);
  assert.ok(OPPOSED.every(([x, y]) => isAxis(x) && isAxis(y) && x !== y));
});

test("должности, черты, метки и стремления ссылаются на существующее", () => {
  assert.equal(POSTS.length, 5);
  assert.ok(POSTS.every((p) => p.name && p.sphere && p.axes.length > 0 && p.axes.every(isAxis)));
  assert.ok(TRAITS.every((t) => t.name && t.desc && starOk(t.star)));
  assert.ok(MARKS.every((m) => m.name && m.desc && starOk(m.star)
    && (!m.goodPost || postIds.includes(m.goodPost)) && (!m.badPost || postIds.includes(m.badPost))));
  assert.ok(ASPIRATIONS.every((a) => a.text && (!a.post || postIds.includes(a.post))));
  for (const post of postIds) assert.ok(ASPIRATIONS.some((a) => a.post === post), `на должность ${post} никто не может метить`);
});

test("ключевые персонажи: десять человек, черта и метка из списков, границы звезды внутри 0–10", () => {
  assert.equal(ROSTER.length, 10);
  assert.ok(ROSTER.length >= POSTS.length);
  for (const r of ROSTER) {
    assert.ok(TRAITS.some((t) => t.id === r.trait), `${r.name}: черта ${r.trait}`);
    assert.ok(!r.mark || MARKS.some((m) => m.id === r.mark), `${r.name}: метка ${r.mark}`);
    for (const [axis, range] of Object.entries(r.bounds ?? {})) {
      assert.ok(isAxis(axis) && range[0] >= 0 && range[0] <= range[1] && range[1] <= 10, `${r.name}: границы ${axis}`);
    }
  }
});

test("предыстория: событий хватает на прогон, стремления из списка, сдвиги по существующим осям", () => {
  assert.ok(BACKSTORY.length >= BALANCE.star.backstoryCount);
  for (const ev of BACKSTORY) {
    assert.ok(ev.text && starOk(ev.shift), ev.id);
    assert.ok(!ev.aspiration || ASPIRATIONS.some((a) => a.id === ev.aspiration), `${ev.id}: стремление ${ev.aspiration}`);
    assert.equal(ev.text.includes("{other}"), ev.link !== undefined, `${ev.id}: {other} в тексте и связь link идут вместе`);
    const unknown = (ev.text.match(/\{[^}]*\}/g) ?? []).filter((t) => !["{name}", "{other}", "{а}", "{oа}", "{ся}", "{ась}", "{он}", "{его}"].includes(t));
    assert.deepEqual(unknown, [], `${ev.id}: неизвестная подстановка`);
  }
});

test("события совета: одна или две существующие должности, от двух вариантов, оси и последствия названы", () => {
  const effects = [...Object.keys(FACTION_NAMES), ...Object.keys(RESOURCE_NAMES)];
  for (const ev of EVENTS) {
    assert.ok(ev.title && ev.text, ev.id);
    assert.ok(ev.posts.length >= 1 && ev.posts.length <= 2 && ev.posts.every((p) => postIds.includes(p)), `${ev.id}: должности`);
    assert.equal(new Set(ev.posts).size, ev.posts.length, `${ev.id}: должность названа дважды`);
    assert.ok(ev.options.length >= 2, `${ev.id}: выбирать не из чего`);
    for (const o of ev.options) {
      assert.ok(o.text && o.axes.length >= 1 && o.axes.length <= 2 && o.axes.every(isAxis), `${ev.id}.${o.id}: оси`);
      assert.ok(Object.keys(o.effects).every((key) => effects.includes(key)), `${ev.id}.${o.id}: последствия`);
    }
  }
  const usual = EVENTS.filter((e) => !e.adventurers);
  assert.ok(usual.length >= BALANCE.season.events, "событий без приключенцев хватает на сезон");
  for (const post of postIds) assert.ok(usual.some((e) => e.posts.includes(post)), `у должности ${post} нет событий`);
  assert.ok(EVENTS.some((e) => e.adventurers) && usual.some((e) => e.posts.length === 2));
});

test("молва: несколько вариантов на каждую склонность и каждую ключевую черту, подстановки известны", () => {
  for (const a of AXES) assert.ok(RUMORS_AXIS[a]?.length >= 2, a);
  for (const t of TRAITS) assert.ok(RUMORS_TRAIT[t.id]?.length >= 2, t.id);
  assert.ok(Object.keys(RUMORS_TRAIT).every((id) => TRAITS.some((t) => t.id === id)), "молва о несуществующей черте");
  for (const text of [...Object.values(RUMORS_AXIS), ...Object.values(RUMORS_TRAIT)].flat()) {
    const unknown = (text.match(/\{[^}]*\}/g) ?? []).filter((t) => !["{а}", "{его}", "{ему}", "{он}"].includes(t));
    assert.deepEqual(unknown, [], text);
    assert.ok(text.startsWith("Говорят, ") && text.endsWith("."), text);
  }
});

test("скрытые черты: у каждой назван поступок, который её выдаёт", () => {
  assert.ok(TRAITS.some((t) => t.hidden));
  for (const t of TRAITS.filter((x) => x.hidden)) assert.ok(t.revealedBy, t.id);
});

// ---------- должность и характер (задача И6) ----------

test("у каждой должности 2–3 родные склонности, оси годности — среди них", () => {
  for (const post of POSTS) {
    assert.ok(post.native.length >= 2 && post.native.length <= 3 && post.native.every(isAxis), post.id);
    assert.equal(new Set(post.native).size, post.native.length, post.id);
    assert.ok(post.axes.every((a) => post.native.includes(a)), `${post.id}: ось годности не родная`);
  }
});

test("события: родные склонности должности встречаются часто, остальные — изредка, но реже родных; у каждой оси и плюсы, и минусы", () => {
  assert.deepEqual(axesWarnings(), []);
  const table = postAxisTable();
  for (const post of POSTS) {
    for (const a of AXES) {
      const v = table[post.id].axes[a].events;
      assert.ok(v >= (post.native.includes(a) ? BALANCE.report.nativeEvents : BALANCE.report.otherEvents), `${post.id}, ${a}: ${v}`);
    }
  }
  const eff = axisEffects();
  for (const a of AXES) assert.ok(eff[a].plus > 0 && eff[a].minus < 0 && eff[a].clean <= eff[a].options / 4, `${a}: ${JSON.stringify(eff[a])}`);
  // замечание появляется, когда цель не выполнена
  const onlyLes = EVENTS.filter((e) => e.posts.includes("lesnichiy") && e.posts.length === 1);
  assert.ok(axesWarnings(onlyLes).some((x) => x.startsWith("Тиун")));
});

test("характер читается в прогонах: по ведущей склонности решают не реже порога на чужой должности и чаще — на своей", () => {
  for (const lab of [false, true]) {
    const r = runStats(60, 20, lab); // на двадцати партиях доля на чужой должности гуляет на ±7 пунктов
    const own = r.own.matched / r.own.decisions, foreign = r.foreign.matched / r.foreign.decisions;
    assert.ok(foreign >= BALANCE.report.leadForeign, `лабиринт ${lab}: на чужой ${foreign}`);
    assert.ok(own > foreign, `лабиринт ${lab}: на своей ${own}, на чужой ${foreign}`);
  }
});
