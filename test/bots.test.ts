// Боты (задача И3, задание — docs/design/boty.md): детерминизм, свой генератор, пары по семенам, привычки делают заявленное.
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { BALANCE, resetBalance } from "../src/sim/balance";
import { newWorld, runSeason, holder, isStale, getRel, relWord } from "../src/sim/sim";
import { BOTS, bot, playBot, rivals, type Bot } from "../src/sim/bots";
import { METRICS, metricsOf, botStats, pairStats, botsReport } from "../src/sim/bots-report";
import { PRESETS } from "../src/sim/presets";
import { dump } from "./_world";

afterEach(() => resetBalance());
const world = (seed: string, id: string, seasons = 12) => playBot(seed, bot(id), seasons).w;

test("боты: три уровня, пары О1–О6 и Х1–Х16 к своим базам, id не повторяются", () => {
  assert.equal(new Set(BOTS.map((b) => b.id)).size, BOTS.length);
  assert.deepEqual(BOTS.filter((b) => b.base === "left").map((b) => b.id), ["О1", "О2", "О3", "О4", "О5", "О6"]);
  assert.deepEqual(BOTS.filter((b) => b.base === "master").map((b) => b.id), Array.from({ length: 16 }, (_, i) => `Х${i + 1}`));
  assert.equal(bot("master").base, "idle");
  for (const b of BOTS.filter((q) => q.base)) assert.ok(b.asks, `${b.id}: написано, что проверяет`);
  assert.throws(() => bot("нет такого"), /Нет бота/);
});

test("одно семя и один бот — одна и та же партия", () => {
  for (const b of BOTS) assert.equal(dump(world("бот", b.id)), dump(world("бот", b.id)), b.id);
});

test("«Ничего не трогает» — партия без игрока; бот не трогает генератор мира", () => {
  const plain = newWorld("тишина");
  for (let s = 0; s < 12; s++) runSeason(plain);
  assert.equal(dump(world("тишина", "idle")), dump(plain));
  const pulls: Bot = { ...bot("idle"), id: "тянет", habit: { ...bot("idle").habit, idleRng: true } };
  assert.equal(dump(playBot("тишина", pulls).w), dump(plain), "свой генератор бота на мир не влияет");
  assert.notEqual(dump(world("тишина", "random")), dump(plain), "«Случайный» играет иначе");
});

test("подготовка отлучки: главный, соперники, стремления, наказ, курс", () => {
  const start = (id: string) => playBot("отлучка", bot(id), 0).w;
  const rank: Record<string, number> = { "заодно": 2, "ладят": 1, "терпят": 0, "соперники": -1, "враги": -2 };
  const score = (w: ReturnType<typeof start>, id: number) => w.people.filter((p) => p.post && p.id !== id).reduce((s, p) => s + rank[relWord(getRel(w, id, p.id))], 0);
  const left = start("left"), worst = start("О1");
  const all = left.people.filter((p) => p.post).map((p) => score(left, p.id));
  assert.equal(score(left, left.head!), Math.max(...all), "главный — самый признанный");
  assert.equal(score(worst, worst.head!), Math.min(...all), "О1: главный — наименее признанный");
  assert.equal(start("О2").head, null);
  assert.equal(left.eco.course, "kopim");
  assert.equal(start("О6").eco.course, null);
  const mandate = playBot("отлучка", bot("О5"), 1).w;
  assert.equal(mandate.people[mandate.head!].order, "vygoda", "наказ главному по первой склонности курса");
  // О3: там, где есть соперники, один из них снят
  let played = 0;
  for (let i = 0; i < 12; i++) {
    const seed = `соперники-${i}`, base = newWorld(seed), pair = rivals(base);
    const run = playBot(seed, bot("О3"), 0);
    assert.equal(run.applicable, !!pair);
    if (!pair) continue;
    played++;
    assert.equal(run.w.people.filter((p) => p.post).length, 4);
    assert.ok(!run.w.people[pair[0].id].post || !run.w.people[pair[1].id].post);
  }
  assert.ok(played > 0);
  // О4: кто хотел должность, получил её, если хватило авторитета
  const asp = start("О4");
  const happy = (w: ReturnType<typeof start>) => w.people.filter((p) => p.post && p.aspiration?.post === p.post).length;
  assert.ok(happy(asp) > happy(left), `${happy(asp)} против ${happy(left)}`);
});

test("«Хозяин» тратит личные дела и платит руками; варианты делают заявленное", () => {
  const sum = (id: string, f: (w: ReturnType<typeof world>) => number) => [1, 2, 3, 4, 5, 6].reduce((s, i) => s + f(world(`хозяин-${i}`, id)), 0);
  const talks = (w: ReturnType<typeof world>) => w.people.reduce((s, p) => s + p.know.talks, 0);
  assert.equal(sum("idle", talks), 0);
  assert.ok(sum("master", talks) > 100, "говорит почти каждое личное дело");
  assert.equal(sum("Х10", talks), 0);
  const ordered = (w: ReturnType<typeof world>) => w.log.filter((e) => e.outcome === "ordered").length;
  assert.ok(sum("master", ordered) > 0);
  assert.equal(sum("Х7", ordered), 0);
  const feasts = (w: ReturnType<typeof world>) => w.auth.feasts.length;
  assert.equal(sum("master", feasts), 0);
  assert.ok(sum("Х9", feasts) > 0);
  const by = (id: string, pay: string) => sum(id, (w) => w.eco.tax.history.reduce((s, y) => s + (y.by[pay as "eda"] ?? 0), 0));
  assert.ok(by("master", "tovary") > 0, "Хозяин платит и товарами");
  assert.ok(by("Х11", "rekruty_opushka") > 0 && by("master", "rekruty_opushka") === 0);
  assert.ok(by("Х13", "zaem") > 0);
  assert.equal(by("Х14", "eda") + by("Х14", "tovary"), 0, "Х14 платит только казной");
  assert.ok(sum("Х14", (w) => w.eco.tax.history.filter((y) => y.closed).length) < sum("master", (w) => w.eco.tax.history.filter((y) => y.closed).length));
  assert.equal(sum("Х16", (w) => w.eco.floor.eda + w.eco.floor.serebro), 0);
  const stale = (w: ReturnType<typeof world>) => w.people.filter((p) => p.post && isStale(p)).length;
  assert.ok(sum("Х4", stale) < sum("master", stale), "Х4 снимает засидевшихся");
  assert.ok(sum("Х4", (w) => -w.auth.totals.staff) > sum("Х5", (w) => -w.auth.totals.staff), "уговор дешевле авторитета");
  assert.equal(sum("Х1", (w) => (w.head == null ? 0 : 1)), 0);
  const courses = new Set(world("хозяин-1", "Х15").log.filter((e) => e.title === "Курс").map((e) => e.lines[0]));
  assert.ok(courses.size >= 6, "Х15 перебирает курсы");
  assert.ok(holder(world("хозяин-1", "master"), "starosta") !== undefined);
});

test("метрики партии: все названы, числа конечны; исходы споров складываются в общее число", () => {
  const m = metricsOf(playBot("метрики", bot("idle")));
  for (const def of METRICS) assert.ok(Number.isFinite(m[def.id]), def.id);
  assert.equal(m.peace + m.judged + m.forced + m.hostile, m.disputes);
  assert.ok(m.disputes > 0 && m.lead > 0 && m.lead <= 1);
  assert.equal(new Set(METRICS.map((d) => d.id)).size, METRICS.length);
});

test("пара: бот против самого себя — «пустое»; явное различие — «расходится»; метрики самого действия в вердикт не идут", () => {
  const idle = botStats(bot("idle"), 30), again = botStats(bot("idle"), 30);
  assert.equal(pairStats(idle, again).verdict, "пустое");
  assert.ok(pairStats(idle, again).diffs.every((d) => d.diff === 0));
  const silver = botStats(bot("Х14"), 30), master = botStats(bot("master"), 30);
  const p = pairStats(master, silver);
  assert.equal(p.verdict, "расходится");
  assert.ok(p.top.some((d) => d.id === "closed" && d.diff < 0), "кто платит только казной, закрывает меньше уроков");
  // разница считается партия к партии: у пары то же число семян, и разброс разницы меньше разброса самих партий
  assert.equal(p.n, 30);
  const mandate = pairStats(master, botStats(bot("Х6"), 30));
  const spent = mandate.diffs.find((d) => d.id === "spent")!;
  assert.ok(spent.own && spent.diff > 0, "наказ стоит авторитета — это само действие");
});

test("отчёт целиком: уровни, пары, заготовки; пара О3 играется только на семенах с соперниками", () => {
  const r = botsReport(12, 12, false, [1, 2]);
  assert.deepEqual(r.stats.map((s) => s.bot.id), ["idle", "left", "О1", "О2", "О3", "О4", "О5", "О6"]);
  assert.equal(r.presets.length, PRESETS.length);
  assert.ok(r.presets.every((p) => p.base.id === "idle"));
  const o3 = r.pairs.find((p) => p.variant.id === "О3")!;
  assert.ok(o3.n > 0 && o3.n <= 12);
  const one = botsReport(8, 12, false, [1, 2, 3], "Х9");
  assert.deepEqual(one.pairs.map((p) => p.variant.id), ["master", "Х9"]);
  assert.equal(BALANCE.bots.seeds, 100, "сто семян по умолчанию");
});
