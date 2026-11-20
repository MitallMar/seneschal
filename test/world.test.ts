// Генератор мира без экрана (задача И11а; src/sim/world/gen.ts, apply.ts, данные — src/data/world.ts): данные и метки,
// детерминизм и независимость от совета, бюджет давления, сдвиги хозяйства, веса событий совета, указы и их цена.
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import type { Axis, PostId } from "../src/data/types";
import { AXES, POSTS } from "../src/data/core";
import { ANSWERS } from "../src/data/answers";
import { EVENTS } from "../src/data/events";
import { PAY, SIDES } from "../src/data/economy";
import { WORLD_STATES, WORLD_TAGS } from "../src/data/world";
import { BALANCE, resetBalance, setAt } from "../src/sim/balance";
import { newWorld } from "../src/sim/council/generate";
import { runSeason } from "../src/sim/season";
import { assign } from "../src/sim/council/staff";
import { holder } from "../src/sim/state";
import type { World } from "../src/sim/state";
import { planSeason } from "../src/sim/economy/plan";
import { payTax, payOptions } from "../src/sim/economy/pay";
import { setFloor, doer } from "../src/sim/economy/doer";
import { standOf, wayOf, waysOf, softenOf } from "../src/sim/world/answer";
import { fix } from "./_world";
import { initWorld, worldStep, worldTape, worldMods, eventWeight, weatherWord, decreeMeasures } from "../src/sim/world/gen";
import { decreeOptions, payDecree, decreeLeft, worldView } from "../src/sim/world/apply";
import { metricsOf } from "../src/sim/bots-report";
import { bot, playBot } from "../src/sim/bots";

afterEach(() => resetBalance());

const W = BALANCE.world;
const event = (id: string) => EVENTS.find((e) => e.id === id)!;
const SEEDS = ["замок", "лес", "герцог", "7", "осень-3", "x", "Ведана", "test"];
// Мир без своей воли: новых состояний нет, погода ровная — в партии только то, что поставил тест.
// И без ответа совета: сила держателей и способы почерка проверяются отдельно, остальные тесты считают беду как есть.
function still(): void {
  setAt("world.chance", 0); setAt("world.budget.quiet", 24); setAt("world.weather.spread", 0); setAt("world.weather.heavy", 0);
  setAt("world.answer.gain", 0); setAt("world.decree.extraTerm", 0);
  for (const key of ["villages", "decreeSize", "harvest", "forest"]) setAt(`world.answer.${key}`, 1);
  for (const key of ["termAdd", "villagesFood", "decreeDvor", "termDvor", "harvestSilver", "forestFood"]) setAt(`world.answer.${key}`, 0);
}
const put = (w: World, id: string, strength = 1, seasons = 8) => w.world.sim.active.push({ id, from: w.season, until: w.season + seasons, strength });
// Указ придёт в начале следующего сезона: отголосок echo состояния id.
function decreeNext(w: World, id: string, echo: number, strength = 1) {
  put(w, id, strength);
  w.world.sim.queue.push({ state: id, echo, at: w.season + 1, strength });
  runSeason(w);
  return w.world.decrees[0];
}

test("данные мира: 10–15 состояний, беды и блага, метки из списка, у каждого события совета есть метка", () => {
  assert.ok(WORLD_STATES.length >= 10 && WORLD_STATES.length <= 15, String(WORLD_STATES.length));
  assert.equal(new Set(WORLD_STATES.map((s) => s.id)).size, WORLD_STATES.length, "id состояний не повторяются");
  assert.ok(WORLD_STATES.some((s) => s.cost > 0) && WORLD_STATES.some((s) => s.cost <= 0), "есть и беды, и блага");
  for (const s of WORLD_STATES) {
    assert.ok(s.name && s.text && s.end && s.weight > 0 && s.seasons[0] >= 1 && s.seasons[0] <= s.seasons[1], s.id);
    for (const t of [...s.tags, ...(s.mutes ?? [])]) assert.ok(WORLD_TAGS.includes(t), `${s.id}: метка ${t}`);
    assert.ok(s.shift || s.echoes?.length || s.tags.length, `${s.id}: состояние что-то делает`);
    for (const e of s.echoes ?? []) {
      assert.ok(e.delay[0] >= 1 && e.delay[0] <= e.delay[1] && e.delay[0] < s.seasons[1], `${s.id}: отголосок успевает дойти`);
      assert.ok(!!e.decree !== !!e.effects, `${s.id}: отголосок — либо указ, либо местное последствие`);
      if (e.decree) assert.ok(e.decree.measures > 0 && e.decree.term >= 1 && PAY.some((p) => e.decree!.accepts.includes(p.what)), `${s.id}: указ ${e.decree.id}`);
    }
  }
  const decrees = WORLD_STATES.flatMap((s) => (s.echoes ?? []).flatMap((e) => (e.decree ? [e.decree.id] : [])));
  assert.equal(new Set(decrees).size, decrees.length, "id указов не повторяются");
  for (const t of WORLD_TAGS) assert.ok(WORLD_STATES.some((s) => s.tags.includes(t)), `метку ${t} несёт хотя бы одно состояние`);
  for (const e of EVENTS) assert.ok(e.tags.length >= 1 && e.tags.every((t) => WORLD_TAGS.includes(t)), `событие ${e.id}: метки`);
  for (const t of WORLD_TAGS) assert.ok(EVENTS.filter((e) => e.tags.includes(t)).length >= 5, `метку ${t} несут хотя бы пять событий совета`);
});

test("лента мира: одно семя — одна лента, разные семена — разные; слои и вести на месте", () => {
  const text = (seed: string) => JSON.stringify(worldTape(seed, 50));
  assert.equal(text("замок"), text("замок"));
  assert.notEqual(text("замок"), text("лес"));
  const tape = worldTape("замок", 50);
  assert.equal(tape.length, 50);
  const news = tape.flatMap((r) => r.news);
  for (const layer of ["mir", "baronstvo", "mesto"] as const) assert.ok(news.some((n) => n.layer === layer), `слой ${layer} в ленте есть`);
  assert.equal(news.filter((n) => n.kind === "weather").length, 13, "погода объявляется каждую весну");
  assert.ok(news.some((n) => n.kind === "decree" && n.measures! > 0), "за 50 сезонов приходит указ");
});

test("мир не зависит от совета: действия игрока ленту не сдвигают, а мир не сдвигает случайность совета", () => {
  for (const seed of ["замок", "герцог"]) {
    const tape = worldTape(seed, 13);
    const w = newWorld(seed), seen = [w.world.sim.news.map((n) => n.text)];
    for (let s = 0; s < 12; s++) {
      if (s === 2) assign(w, w.people.find((p) => !p.post)!.id, "pisar");
      if (s % 4 === 1) payTax(w, "sverh_brod", 1);
      runSeason(w);
      seen.push(w.world.sim.news.map((n) => n.text));
    }
    assert.deepEqual(seen, tape.map((r) => r.news.map((n) => n.text)), `${seed}: вести партии — те же, что в ленте без партии`);
    assert.deepEqual(w.world.sim.active, tape[12].active);
  }
  // и обратно: совет до первого события мира решает то же, что решал бы в спокойном мире
  const a = newWorld("замок");
  setAt("world.on", 0);
  const b = newWorld("замок");
  assert.deepEqual(a.people.map((p) => [p.name, p.post, p.star]), b.people.map((p) => [p.name, p.post, p.star]));
  assert.equal(a.desk!.event, b.desk!.event);
});

test("спокойный мир (world.on = 0): ни вестей, ни сдвигов, веса событий равны", () => {
  setAt("world.on", 0);
  const tape = worldTape("замок", 30);
  assert.ok(tape.every((r) => !r.news.length && !r.active.length));
  assert.deepEqual(tape[20].mods, { harvest: 1, price: 1, duty: 1, forest: 1, lesson: 0 });
  const w = newWorld("замок");
  for (let s = 0; s < 8; s++) runSeason(w);
  assert.ok(!w.log.some((e) => e.title === "Вести") && !w.world.past.length && !w.world.decrees.length);
  assert.ok(EVENTS.every((e) => eventWeight(w.world.sim, e) === 1));
  assert.equal(worldView(w).line, "тихо");
});

test("бюджет давления: беды не идут подряд и не пропадают надолго, состояний не больше предела, бюджет в границах", () => {
  const isBad = (id: string) => WORLD_STATES.find((s) => s.id === id)!.cost > 0;
  let bads = 0;
  for (const seed of SEEDS) {
    const tape = worldTape(seed, 60);
    const starts = tape.flatMap((r) => r.news.filter((n) => n.kind === "start" && isBad(n.state!)).map(() => r.season));
    bads += starts.length;
    assert.ok(starts[0] > W.grace, `${seed}: в первые сезоны партии бед нет`);
    for (let i = 1; i < starts.length; i++) {
      assert.ok(starts[i] - starts[i - 1] >= W.budget.gap, `${seed}: беды ${starts[i - 1]} и ${starts[i]} идут подряд`);
      assert.ok(starts[i] - starts[i - 1] <= W.budget.quiet + W.budget.cap / W.budget.income, `${seed}: тишина между бедами ${starts[i - 1]}–${starts[i]} слишком долгая`);
    }
    for (const r of tape) {
      assert.ok(r.active.length <= W.maxActive && r.budget >= 0 && r.budget <= W.budget.cap, `${seed}, сезон ${r.season}`);
      assert.equal(new Set(r.active.map((a) => a.id)).size, r.active.length, "одно состояние не идёт дважды сразу");
    }
  }
  assert.ok(bads / SEEDS.length >= 6 && bads / SEEDS.length <= 16, `бед за 60 сезонов в среднем ${bads / SEEDS.length}`);
});

test("акт: множитель давления к актам 2 и 3 даёт больше бед", () => {
  const isBad = (id: string) => WORLD_STATES.find((s) => s.id === id)!.cost > 0;
  // давление — сумма цен начавшихся бед: при большем бюджете рассказчик берёт беды тяжелее
  const cost = (id: string) => WORLD_STATES.find((s) => s.id === id)!.cost;
  const pressure = () => SEEDS.reduce((s, seed) => s + worldTape(seed, 60).flatMap((r) => r.news).filter((n) => n.kind === "start" && isBad(n.state!)).reduce((x, n) => x + cost(n.state!), 0), 0);
  const act1 = pressure();
  setAt("world.act", 2.5);
  assert.ok(pressure() > act1, "при большем множителе акта давления больше");
});

test("сдвиги хозяйства: состояние умножает потоки по своей силе, погода — урожай; общая сила и выключатель действуют сразу", () => {
  still();
  const ws = initWorld("замок");
  assert.deepEqual(worldMods(ws), { harvest: 1, price: 1, duty: 1, forest: 1, lesson: 0 });
  ws.active.push({ id: "neurozhay", from: 1, until: 5, strength: 1 }, { id: "voyna_yug", from: 1, until: 9, strength: 1 });
  assert.deepEqual(worldMods(ws), { harvest: 0.75, price: 1, duty: 0.8, forest: 1, lesson: 1.5 });
  ws.weather = 0.8;
  assert.equal(worldMods(ws).harvest, 0.6);
  assert.equal(weatherWord(0.6), "bad");
  assert.equal(weatherWord(1), "plain");
  assert.equal(weatherWord(1.2), "good");
  ws.active[0].strength = 2;
  assert.equal(worldMods(ws).harvest, 0.4, "вдвое сильнее — сдвиг вдвое больше");
  setAt("world.strength", 0);
  assert.equal(worldMods(ws).harvest, 0.8, "без силы состояний остаётся только погода");
  setAt("world.on", 0);
  assert.equal(worldMods(ws).harvest, 1);
});

test("хозяйство под миром: недород режет жатву, война — пошлины и надбавляет урок, тихий лес даёт больше товаров", () => {
  still();
  const autumn = (id?: string) => {
    const w = newWorld("хозяйство");
    if (id) put(w, id);
    runSeason(w); runSeason(w);
    return planSeason(w);
  };
  const crop = (id?: string) => autumn(id).lines.filter((l) => l.text.startsWith("урожай")).reduce((s, l) => s + l.v, 0);
  const calm = crop();
  assert.ok(Math.abs(crop("neurozhay") / calm - 0.75) < 0.02, `урожай при недороде: ${crop("neurozhay")} против ${calm}`);
  assert.ok(autumn("neurozhay").lines.some((l) => l.text.includes("недород")), "погода названа в строке урожая");
  const first = (id: string | undefined, part: string) => {
    const w = newWorld("хозяйство");
    if (id) put(w, id);
    return planSeason(w).lines.find((l) => l.text.startsWith(part))!.v;
  };
  assert.ok(Math.abs(first("voyna_yug", "пошлины") / first(undefined, "пошлины") - 0.8) < 0.02);
  assert.ok(Math.abs(first("tihiy_les", "шкуры") / first(undefined, "шкуры") - 1.25) < 0.02);
  // урок: объявляют зимой с надбавкой войны
  const w = newWorld("хозяйство");
  put(w, "voyna_yug", 1, 12);
  for (let s = 0; s < 4; s++) runSeason(w);
  assert.equal(w.eco.tax.lesson, BALANCE.economy.tax.trial + 1.5);
  assert.ok(w.log.some((e) => e.lines.some((l) => l.includes("с надбавкой 1.5"))));
});

test("метки: в войну чаще приходят дела с меткой войны и реже торговые; выбор событий совета идёт по весам", () => {
  still();
  const w = newWorld("замок");
  assert.equal(eventWeight(w.world.sim, event("dozor_spit")), 1);
  put(w, "voyna_yug", 1, 40);
  assert.equal(eventWeight(w.world.sim, event("dozor_spit")), 1 + W.tags.more);
  assert.equal(eventWeight(w.world.sim, event("yarmarka")), 1 - W.tags.less);
  assert.equal(eventWeight(w.world.sim, event("razboyniki")), 1 + W.tags.more - W.tags.less, "метка войны и торга: и чаще, и реже");
  assert.equal(eventWeight(w.world.sim, event("volki")), 1);
  setAt("world.tags.less", 1);
  assert.equal(eventWeight(w.world.sim, event("yarmarka")), W.tags.min, "вес не уходит ниже предела");
  resetBalance(); still();
  const share = (war: boolean) => {
    const x = newWorld("метки");
    if (war) put(x, "voyna_yug", 1, 40);
    for (let s = 0; s < 30; s++) runSeason(x);
    const titles = x.log.filter((e) => e.kind === "event").map((e) => e.title.replace(" — по приказу", ""));
    return titles.filter((t) => EVENTS.find((e) => e.title === t)!.tags.includes("voyna")).length / titles.length;
  };
  assert.ok(share(true) > share(false) * 1.4, `доля военных дел: ${share(true)} в войну против ${share(false)}`);
});

test("указ: ложится на стол, закрывается только своими способами; исполнил — двор доволен, указ уходит со стола", () => {
  still();
  const w = newWorld("указ");
  const d = decreeNext(w, "voyna_yug", 0);
  assert.ok(d && d.def === "nabor" && d.due === decreeMeasures(2, 1) && d.until === w.season + 1, JSON.stringify(d));
  assert.ok(w.log.some((e) => e.title === "Вести" && e.lines.some((l) => l.includes("Указ о наборе") && l.includes("люди"))));
  const opts = decreeOptions(w, d);
  assert.ok(opts.length >= 4 && opts.every((o) => o.def.what === "lyudi"), "указ о наборе берёт только людей");
  assert.equal(payDecree(w, d.id, "serebro", 1), 0, "серебром набор не закрыть");
  const trust = w.factions.dvor, hands = w.factions.brod, taxPaid = w.eco.tax.paid;
  assert.equal(payDecree(w, d.id, "rekruty_brod", 1), 1);
  assert.equal(decreeLeft(d), d.due - 1);
  assert.ok(w.factions.brod < hands && w.eco.recruits.length === 1, "рекруты: деревня обижена, рук меньше");
  assert.equal(w.eco.tax.paid, taxPaid, "плата по указу в урок подати не идёт");
  assert.equal(payDecree(w, d.id, "volnye", 5), d.due - 1, "больше остатка не берут");
  assert.equal(d.closed, "закрыт");
  assert.ok(!w.world.decrees.length && w.world.past[0] === d && w.factions.dvor > trust);
  assert.ok(payOptions(w).length === PAY.length, "у подати способы прежние — все");
});

test("указ не исполнен к сроку: терпение Герцога, доверие двора и авторитет падают; исполнен частью — потеря меньше", () => {
  still();
  const lose = (part: number) => {
    const w = newWorld("указ");
    w.eco.autoPay = false;
    const d = decreeNext(w, "voyna_yug", 0);
    if (part) payDecree(w, d.id, "volnye", d.due * part);
    const patience = w.eco.tax.patience, dvor = w.factions.dvor;
    runSeason(w); runSeason(w);
    assert.equal(d.closed, "не закрыт");
    assert.ok(w.world.past.includes(d) && !w.world.decrees.length);
    return { patience: patience - w.eco.tax.patience, dvor: dvor - w.factions.dvor };
  };
  const full = lose(0), half = lose(0.5);
  assert.ok(full.patience > 0 && full.dvor > 0, JSON.stringify(full));
  assert.ok(half.dvor < full.dvor, "исполнил половину — двор обижен меньше");
  const w = newWorld("указ");
  w.eco.autoPay = false;
  const d = decreeNext(w, "voyna_yug", 0);
  runSeason(w); runSeason(w);
  assert.ok(w.log.some((e) => e.lines.some((l) => l.includes(`Срок указа «${d.title}» вышел`))));
  assert.ok(w.auth.totals.tax < 0, "неисполненный указ — потеря авторитета по строке подати");
});

test("совет исполняет указ сам, как подать: запасом не ниже нижней черты; людей — вольными и рекрутами", () => {
  still();
  const w = newWorld("указ");
  setFloor(w, "eda", 1);
  w.eco.stock.eda = 6;
  const d = decreeNext(w, "neurozhay", 0);
  assert.deepEqual(d.accepts, ["eda"]);
  while (w.world.decrees.length) runSeason(w);
  assert.equal(d.closed, "закрыт советом");
  assert.ok(d.council === d.due && (d.by.eda ?? 0) === d.due, JSON.stringify(d));
  assert.ok(w.log.some((e) => e.lines.some((l) => l.includes("Совет сам исполняет указ"))));
  const x = newWorld("указ");
  const n = decreeNext(x, "voyna_yug", 0);
  while (x.world.decrees.length) runSeason(x);
  assert.equal(n.closed, "закрыт советом");
  assert.ok((n.by.volnye ?? 0) > 0, "сначала вольными из корчмы");
  // амбар у черты: совет из-под неё не берёт — указ не исполнен
  const y = newWorld("указ");
  setFloor(y, "eda", 50);
  const z = decreeNext(y, "neurozhay", 0);
  while (y.world.decrees.length) runSeason(y);
  assert.equal(z.closed, "не закрыт");
  assert.equal(z.paid, 0);
});

test("указы не идут подряд: следующий ждёт срока прошлого и передышки", () => {
  for (const seed of SEEDS) {
    const tape = worldTape(seed, 60);
    const at = tape.flatMap((r) => r.news.filter((n) => n.kind === "decree").map(() => r.season));
    for (let i = 1; i < at.length; i++) assert.ok(at[i] - at[i - 1] >= 1 + W.decree.gap, `${seed}: указы в сезоны ${at[i - 1]} и ${at[i]}`);
  }
  const ws = initWorld("замок");
  setAt("world.chance", 0); setAt("world.budget.quiet", 24);
  ws.active.push({ id: "voyna_yug", from: 1, until: 20, strength: 1 });
  ws.queue.push({ state: "voyna_yug", echo: 0, at: 2, strength: 1 }, { state: "voyna_yug", echo: 1, at: 2, strength: 1 });
  const seasons: number[] = [];
  for (let s = 2; s <= 12; s++) if (worldStep(ws, s).some((n) => n.kind === "decree")) seasons.push(s);
  assert.deepEqual(seasons, [2, 2 + 2 + W.decree.extraTerm + W.decree.gap], "второй указ пришёл после срока первого и передышки");
});

test("отголосок места: бьёт по названной деревне и запасу, строка идёт в летопись и ведомость", () => {
  still();
  const w = newWorld("отголосок");
  put(w, "voyna_yug");
  w.world.sim.queue.push({ state: "voyna_yug", echo: 2, at: w.season + 1, strength: 1 });
  const brod = w.factions.brod, opushka = w.factions.opushka;
  runSeason(w);
  assert.ok(w.log.some((e) => e.title === "Вести" && e.lines.some((l) => l.includes("беженцы"))));
  assert.ok(w.factions.brod < brod - 0.2, "деревня у брода задета");
  assert.ok(Math.abs(w.factions.opushka - opushka) < Math.abs(w.factions.brod - brod), "деревня у опушки — нет");
  assert.ok(w.eco.cur.some((l) => l.text.startsWith("вести:") && l.cat === "eda" && l.v < 0));
  for (const s of SIDES) assert.ok(Number.isFinite(w.factions[s]));
});

test("что видит игрок и отчёт ботов: строка «что в мире», метрики указов и плохих лет", () => {
  still();
  const w = newWorld("замок");
  assert.equal(worldView(w).line, "обычный год; в герцогстве тихо");
  put(w, "yarmarka_god");
  const v = worldView(w);
  assert.ok(v.line.includes("ярмарочный год") && v.states.length === 1 && !v.states[0].bad && v.mods.price > 1);
  resetBalance();
  const m = metricsOf(playBot("бот-3", bot("master")));
  for (const id of ["states", "bads", "decrees", "decreesDone", "decreesFailed", "decreeLyudi", "badYears", "closedBad", "shortBad"]) assert.ok(Number.isFinite(m[id]) && m[id] >= 0, id);
  assert.equal(m.badYears + 0, playBot("бот-3", bot("master")).w.world.harvests.filter((h) => h < W.weather.poor).length);
});

// ---------- Ответ совета на беду (И21) ----------

// Только мир без своей воли: ответ совета оставлен как в игре.
function quiet(): void {
  setAt("world.chance", 0); setAt("world.budget.quiet", 24); setAt("world.weather.spread", 0); setAt("world.weather.heavy", 0);
}
const native = (post: PostId) => POSTS.find((d) => d.id === post)!.axes;
const foreign = (post: PostId) => AXES.filter((a) => !native(post).includes(a)).slice(0, 2);

test("ответ на беду: годный держатель смягчает потерю, негодный усиливает, пустая должность — хуже всего", () => {
  quiet();
  const A = W.answer;
  const w = newWorld("ответ");
  const tiun = fix(holder(w, "starosta")!, native("starosta"));
  tiun.loyalty = 5;
  const strong = standOf(w, "starosta");
  assert.ok(strong.k < 1 && strong.k >= A.min && strong.word === "смягчил" && strong.text.includes(tiun.name), JSON.stringify(strong));
  fix(tiun, foreign("starosta")); tiun.exp = 0; tiun.loyalty = -5;
  const weak = standOf(w, "starosta");
  assert.ok(weak.k > 1 && weak.k <= A.max && weak.word === "усугубил", JSON.stringify(weak));
  assign(w, tiun.id, null);
  const none = standOf(w, "starosta");
  assert.ok(none.k === A.max && none.word === "должность пуста" && none.k >= weak.k);
  // недород: потеря урожая идёт через тиуна
  const harvest = (set: (x: World) => void) => { const x = newWorld("ответ"); put(x, "neurozhay"); set(x); return softenOf(x).state(WORLD_STATES.find((s) => s.id === "neurozhay")!, "harvest"); };
  const good = harvest((x) => { fix(holder(x, "starosta")!, native("starosta")).loyalty = 5; fix(holder(x, "klyuchnik")!, ["dolg"]); });
  const bad = harvest((x) => { const p = fix(holder(x, "starosta")!, foreign("starosta")); p.exp = 0; p.loyalty = -5; fix(holder(x, "klyuchnik")!, ["dolg"]); });
  assert.ok(good < 1 && bad > 1, `${good} и ${bad}`);
  setAt("world.answer.gain", 0);
  assert.equal(standOf(newWorld("ответ"), "pisar").k, 1, "без ручки силы ответа держатель беду не меняет");
});

test("ответ на беду доходит до хозяйства и вестей: урожай в недород, размер указа, местный отголосок", () => {
  quiet();
  const crop = (strong: boolean) => {
    const w = newWorld("ответ");
    const p = fix(holder(w, "starosta")!, strong ? native("starosta") : foreign("starosta"));
    if (!strong) { p.exp = 0; p.loyalty = -5; } else p.loyalty = 5;
    fix(holder(w, "klyuchnik")!, ["dolg"]);
    put(w, "neurozhay");
    w.season = 3;
    const plan = planSeason(w), line = plan.lines.find((l) => l.text.startsWith("урожай"))!;
    return { v: plan.lines.filter((l) => l.text.startsWith("урожай")).reduce((s, l) => s + l.v, 0) / doer(w, "starosta").mult, text: line.text };
  };
  const a = crop(true), b = crop(false);
  assert.ok(a.v > b.v * 1.1, `урожай на единицу силы тиуна: ${a.v} у годного против ${b.v} у негодного`);
  assert.ok(a.text.includes("смягчил") && b.text.includes("усугубил"), `${a.text} | ${b.text}`);
  // указ о наборе встречает десятник
  const due = (strong: boolean) => {
    const w = newWorld("ответ");
    const p = fix(holder(w, "desyatnik")!, strong ? native("desyatnik") : foreign("desyatnik"));
    if (!strong) { p.exp = 0; p.loyalty = -5; } else p.loyalty = 5;
    fix(holder(w, "pisar")!, ["dolg"]);
    return decreeNext(w, "voyna_yug", 0);
  };
  const easy = due(true), hard = due(false);
  assert.ok(easy.due < decreeMeasures(2, 1) && hard.due > decreeMeasures(2, 1), `${easy.due} и ${hard.due}`);
  assert.ok(easy.post === "desyatnik" && easy.note.includes("смягчил") && hard.note.includes("усугубил"));
  // срок указа: два-три сезона
  assert.equal(easy.until - easy.issued + 1, 2 + W.decree.extraTerm);
  for (const s of WORLD_STATES) for (const e of s.echoes ?? []) if (e.decree) assert.ok([2, 3].includes(e.decree.term + W.decree.extraTerm), `${e.decree.id}: срок ${e.decree.term + W.decree.extraTerm}`);
});

test("способы ответа по почерку: у каждого своя польза и своя цена", () => {
  quiet();
  setAt("world.answer.gain", 0);   // сила держателя выключена: видно только способ
  assert.equal(ANSWERS.length, 6);
  for (const a of ANSWERS) assert.ok(POSTS.some((d) => d.id === a.post) && AXES.includes(a.axis) && a.name && a.good && a.price, a.kind);
  const A = W.answer;
  // ключник с Обычаем: недород бьёт по урожаю слабее, осенью платит серебром
  const w = newWorld("способ");
  fix(holder(w, "klyuchnik")!, ["obychai"]);
  assert.equal(wayOf(w, "harvest")!.weight, 1);
  assert.equal(waysOf(holder(w, "klyuchnik")!)[0].answer.kind, "harvest");
  put(w, "neurozhay");
  assert.equal(softenOf(w).state(WORLD_STATES.find((s) => s.id === "neurozhay")!, "harvest"), A.harvest);
  fix(holder(w, "klyuchnik")!, ["dolg"]);
  assert.equal(wayOf(w, "harvest"), undefined);
  // писарь с Выгодой: указ меньше, двор недоволен; с Обычаем — сезон сверху
  const decree = (axis: Axis) => {
    const x = newWorld("способ");
    fix(holder(x, "pisar")!, [axis]);
    const dvor = x.factions.dvor;
    const d = decreeNext(x, "mor", 0);
    return { d, lost: dvor - x.factions.dvor };
  };
  const plain = decree("dolg"), cheap = decree("vygoda"), late = decree("obychai");
  assert.ok(Math.abs(cheap.d.due - plain.d.due * A.decreeSize) <= 0.1, `${cheap.d.due} против ${plain.d.due}`);
  assert.ok(cheap.lost > plain.lost + 0.1, "торг с двором стоит его доверия");
  assert.equal(late.d.until, plain.d.until + A.termAdd);
  assert.ok(late.lost > plain.lost);
  // тиун с Заботой: деревня теряет доверия вдвое меньше, пострадавших кормят из амбара
  const village = (axis: Axis) => {
    const x = newWorld("способ");
    fix(holder(x, "starosta")!, [axis]);
    put(x, "voyna_yug");
    x.world.sim.queue.push({ state: "voyna_yug", echo: 2, at: x.season + 1, strength: 1 });
    const brod = x.factions.brod;
    runSeason(x);
    return { fed: x.eco.cur.some((l) => l.text === "пострадавшим из амбара"), brod };
  };
  const hard = village("dolg"), soft = village("zabota");
  assert.ok(soft.fed && !hard.fed);
  // десятник с Долгом: указ о людях совет закрывает стражей и челядью
  const recruits = (axis: Axis) => {
    const x = newWorld("способ");
    fix(holder(x, "desyatnik")!, [axis]);
    const d = decreeNext(x, "voyna_yug", 0);
    while (x.world.decrees.length) runSeason(x);
    return d;
  };
  assert.ok((recruits("dolg").by.rekruty_zamok ?? 0) > 0 && !recruits("zabota").by.rekruty_zamok);
  // лесничий с Обычаем: беды леса мягче
  const y = newWorld("способ");
  fix(holder(y, "lesnichiy")!, ["obychai"]);
  assert.equal(softenOf(y).state(WORLD_STATES.find((s) => s.id === "tvari")!, "forest"), A.forest);
});

test("погода: редкий тяжёлый год — засуха или градобой, урожай ×0,6–0,7; обычные годы в прежних краях", () => {
  let heavy = 0, years = 0;
  for (const seed of [...SEEDS, "а", "б", "в", "г", "д", "е", "ж", "з"]) {
    const ws = initWorld(seed);
    for (let s = 1; s <= 160; s++) {
      if (s > 1) worldStep(ws, s);
      if ((s - 1) % 4) continue;
      years++;
      if (ws.heavy) {
        heavy++;
        assert.ok(ws.weather >= W.weather.heavyMin && ws.weather <= W.weather.heavyMax, `${seed}: тяжёлый год ×${ws.weather}`);
        assert.ok(ws.news.some((n) => n.kind === "weather" && /Засуха|Градобой/.test(n.text)));
      } else assert.ok(ws.weather >= W.weather.min && ws.weather <= W.weather.max);
    }
  }
  assert.ok(heavy / years > W.weather.heavy / 2 && heavy / years < W.weather.heavy * 2, `тяжёлых лет ${heavy} из ${years}`);
  setAt("world.weather.heavy", 1);
  const w = newWorld("замок");
  assert.ok(["засуха", "градобой"].includes(worldView(w).heavy) && worldView(w).line.startsWith(worldView(w).heavy));
  assert.ok(worldView(w).tiun, "за худую погоду отвечает тиун");
  setAt("world.weather.heavy", 0);
  assert.equal(worldView(newWorld("замок")).heavy, "");
});
