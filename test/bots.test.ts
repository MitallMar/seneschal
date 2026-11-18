// Боты (задача И3, задание — docs/design/boty.md): детерминизм, свой генератор, пары по семенам, привычки делают заявленное.
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { BALANCE, resetBalance } from "../src/sim/balance";
import { newWorld, runSeason, runEvent, holder, isStale, getRel, relWord } from "../src/sim/sim";
import { BOTS, bot, playBot, rivals, type Bot } from "../src/sim/bots";
import { METRICS, metricsOf, botStats, pairStats, botsReport, outcomeStats } from "../src/sim/bots-report";
import { PROBE, resetProbe } from "../src/sim/probe";
import { EVENTS } from "../src/data/events";
import { PRESETS } from "../src/sim/presets";
import { dump } from "./_world";

afterEach(() => resetBalance());
const world = (seed: string, id: string, seasons = 12) => playBot(seed, bot(id), seasons).w;

test("боты: три уровня, пары О1–О6 и Х1–Х16 к своим базам, id не повторяются", () => {
  assert.equal(new Set(BOTS.map((b) => b.id)).size, BOTS.length);
  assert.deepEqual(BOTS.filter((b) => b.base === "left" && b.level === 2).map((b) => b.id), ["О1", "О2", "О3", "О4", "О5", "О6"]);
  assert.deepEqual(BOTS.filter((b) => b.base === "master" && b.level === 3).map((b) => b.id), Array.from({ length: 16 }, (_, i) => `Х${i + 1}`));
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
  const one = botsReport(8, 12, false, [1, 2, 3, 4], "Х9");
  assert.deepEqual(one.pairs.map((p) => p.variant.id), ["master", "Х9"]);
  assert.equal(BALANCE.bots.seeds, 100, "сто семян по умолчанию");
});

// ---------- перепроверки (boty.md, раздел 11) ----------

test("зонд ничего не меняет: партия с наказами совпадает до числа, сколько бы раз его ни читали и ни сбрасывали", () => {
  const a = playBot("зонд", bot("О5в"));
  resetProbe();
  const b = playBot("зонд", bot("О5в"));
  assert.equal(dump(a.w), dump(b.w));
  assert.deepEqual(a.probe, b.probe, "зонд считает одно и то же");
  assert.ok(a.probe.order.fit > 0);
  const o = a.probe.order;
  assert.equal(o.worked + o.already + o.deaf + o.weak, o.fit, "каждый применимый наказ кончился одним из четырёх исходов");
  assert.deepEqual(playBot("зонд", bot("idle")).probe.order, { fit: 0, worked: 0, already: 0, deaf: 0, weak: 0 }, "без наказа зонд наказа молчит");
});

test("наказ сработал: послушному наказ меняет выбор, обиженному — не слышен", () => {
  const count = (loyalty: number) => {
    resetProbe();
    for (let i = 0; i < 40; i++) {
      const w = newWorld(`наказ-${i}`);
      w.eco.floor = { eda: 0, serebro: 0 };
      const p = holder(w, "klyuchnik")!;
      p.star = { dolg: 6, vygoda: 5, zabota: 5, derzost: 5, obychai: 5 };
      p.loyalty = loyalty; p.tenure = 5; p.order = "zabota";
      runEvent(w, EVENTS.find((e) => e.id === "svadba")!);
    }
    return { ...PROBE.order };
  };
  const loyal = count(10), bitter = count(-10);
  assert.equal(loyal.fit, 40);
  assert.ok(loyal.worked > 20, `послушный: поменял выбор ${loyal.worked} раз из 40`);
  assert.equal(bitter.worked, 0);
  assert.ok(bitter.deaf > 20, `обиженный: не услышал ${bitter.deaf} раз из 40`);
});

test("новые привычки делают заявленное: наказы, стремления через разговор, плата без автоплаты, пиры, двойные черты", () => {
  const run = (id: string, seed = "перепроверка") => playBot(seed, bot(id));
  const orders = (id: string) => run(id, "перепроверка").w.people.filter((p) => p.order).map((p) => p.order);
  assert.equal(orders("О5в").length, 5, "наказ каждому в совете");
  assert.ok(orders("О5в").every((a) => a === "zabota"), "против курса «Копим» — Забота");
  const weak = playBot("перепроверка", bot("О5б"), 1).w, head = weak.people[weak.head!];
  assert.equal(head.startStar[head.order!], Math.min(...Object.values(head.startStar)), "наказ по слабейшей склонности главного");
  const g = playBot("перепроверка", bot("О5г"), 1).w;
  assert.deepEqual([g.eco.course, g.people[g.head!].order], [null, "vygoda"]);
  // стремления: Х2б ставит на желанную должность только тех, чьё стремление открыто
  assert.ok(run("Х2в").aspAt <= run("Х2б").aspAt, "выспрашивать стремления первыми — не медленнее (с И19 стремление и так первая тема разговора)");
  assert.ok(run("Х2б").aspAt <= 12 && run("Х10").aspAt === 13, "кто не говорит, стремлений не узнаёт");
  // подать
  assert.equal(run("Х17").probe.autoPaid, 0);
  assert.equal(run("Х17б").probe.autoPaid, 0);
  assert.ok(run("idle").probe.autoPaid > 0);
  const paidInSpring = playBot("перепроверка", bot("Х17б"), 1).w.eco.tax.paid, none = playBot("перепроверка", bot("Х17"), 1).w.eco.tax.paid;
  assert.ok(paidInSpring > 0 && none === 0, "Х17б платит уже весной, Х17 ждёт осени");
  // пиры
  const feasts = (id: string) => [1, 2, 3, 4, 5, 6].flatMap((i) => run(id, `пир-${i}`).w.auth.feasts);
  assert.ok(feasts("Х9в").length > 0 && feasts("Х9в").every((s) => s % 4 === 0), "Х9в пирует только зимой");
  assert.ok(feasts("Х9б").length < feasts("Х9").length, "Х9б пирует реже");
  assert.deepEqual(run("Х16б").w.eco.floor, { eda: BALANCE.economy.start.floorEda * 2, serebro: BALANCE.economy.start.floorSerebro * 2 });
  assert.equal(run("Н1").w.log.filter((e) => e.title.startsWith("Заготовка: Наследство")).length, 1);
});

test("отчёт перепроверок: пары уровня 4, вторая база у Х2б, замеры в вердикт не идут, исходы дел считаются", () => {
  const r = botsReport(10, 12, false, [4]);
  const ids = r.pairs.map((p) => `${p.variant.id}↔${p.base.id}`);
  for (const want of ["О5б↔left", "О5г↔О6", "Х6в↔master", "Х2б↔master", "Х2б↔Х2", "Х17↔master", "Х9в↔master", "Х16б↔master", "Н1↔Н0", "Н3↔Н1", "Н10↔Н1"]) assert.ok(ids.includes(want), want);
  const mandate = r.pairs.find((p) => p.variant.id === "Х6в")!;
  assert.ok(mandate.diffs.find((d) => d.id === "orderFit")!.own, "замер наказа в вердикт не идёт");
  assert.ok(METRICS.filter((m) => m.diag).length >= 8);
  const one = botsReport(6, 12, false, [1, 2, 3, 4], "заготовка:pisar");
  assert.deepEqual(one.presets.map((p) => p.variant.id), ["заготовка:pisar"]);
  const rows = outcomeStats(bot("idle"), 10);
  const alone = rows.find((x) => x.outcome === "alone")!;
  assert.ok(alone.perParty > 10 && alone.size > 0 && alone.none < 1);
  assert.ok(rows.some((x) => x.outcome === "agree"));
});
