// Кризисы сторон и падение «под чужой рукой» (задача И14; src/sim/fall/): счёт отказов, кризис на столе и шрам, внеочередной сбор,
// причины падения, барон и свита, пути его падения, броня, возвращение, личные дела при бароне, опала.
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { AXES } from "../src/data/core";
import { CRISES, CRISIS_SIDES, STIR_SIDES, RETINUE, BARONS } from "../src/data/fall";
import { NATURES } from "../src/data/natura";
import { COURSES } from "../src/data/economy";
import { BALANCE, resetBalance, setAt } from "../src/sim/balance";
import { newWorld } from "../src/sim/council/generate";
import { assign } from "../src/sim/council/staff";
import { runSeason, deskView, command } from "../src/sim/season";
import type { World } from "../src/sim/state";
import { authorityCap, authoritySupport } from "../src/sim/authority";
import { zoneMult, zoneOf } from "../src/sim/economy/zones";
import { planSeason } from "../src/sim/economy/plan";
import { setCourse } from "../src/sim/economy/doer";
import { payDecree } from "../src/sim/world/apply";
import { scarOf, crisisNow, disgraced, staffBlock } from "../src/sim/fall/base";
import { crisisDef, resolveCrisis, maybeLevy, scarSeasons } from "../src/sim/fall/crisis";
import { fallNow, fallReason, comeBack, sway, swayChance, askConsent, stir, baronCourse, underSeasons } from "../src/sim/fall/under";
import { metricsOf } from "../src/sim/bots-report";
import { bot, playBot } from "../src/sim/bots";
import { dump } from "./_world";

afterEach(() => resetBalance());

const F = BALANCE.fall;
// Спокойный мир: вести и указы генератора кризисам не мешают.
function calm(seed = "падение"): World {
  setAt("world.on", 0);
  return newWorld(seed);
}
const refuse = (w: World, side: (typeof CRISIS_SIDES)[number]) => { w.factions[side] = BALANCE.economy.trust.refuse - 4; };
// Сезоны, в каждом из которых сторона «отказывает».
function refusing(w: World, side: (typeof CRISIS_SIDES)[number], n: number) {
  for (let i = 0; i < n; i++) { refuse(w, side); runSeason(w); }
}
// Сытая казна: недоимки и сборы партии не мешают.
const rich = (w: World) => { w.eco.stock = { eda: 30, tovary: 0, serebro: 30 }; return w; };

test("данные: кризис есть у всех шести сторон; у каждого выхода свой шрам; раскачать можно только стороны внутри баронства", () => {
  assert.deepEqual(CRISES.map((c) => c.side), CRISIS_SIDES);
  assert.deepEqual(CRISIS_SIDES, ["brod", "opushka", "kuptsy", "zamok", "les", "dvor"]);
  assert.deepEqual(STIR_SIDES, ["brod", "opushka", "kuptsy", "zamok"]);
  for (const c of CRISES) {
    assert.ok(c.event.options.length >= 2 && c.event.options.length <= 3, c.event.id);
    assert.deepEqual(Object.keys(c.exits).sort(), c.event.options.map((o) => o.id).sort(), "у каждого варианта — свой выход");
    assert.ok(c.scar && c.event.posts.length === 2);
    assert.ok(Object.values(c.exits).some((e) => e.scar === "light") && Object.values(c.exits).some((e) => e.scar === "full"), "выходы различаются тяжестью шрама");
  }
});

test("кризис: сторона отказывает три сезона подряд — дело ложится на стол, совет решает, остаётся шрам", () => {
  const w = rich(calm());
  refusing(w, "brod", F.refuseSeasons - 1);
  assert.equal(w.fall.refuse.brod, F.refuseSeasons - 1);
  assert.equal(w.fall.queue.length, 0, "два сезона — ещё не кризис");
  refusing(w, "brod", 1);
  assert.deepEqual(w.fall.queue, ["brod"]);
  assert.equal(deskView(w)!.ev.id, "krizis_brod", "кризис лежит на столе Сенешаля как дело сезона");
  assert.ok(crisisNow(w));
  runSeason(w);
  const c = w.fall.crises[0];
  assert.equal(c.side, "brod");
  assert.ok(crisisDef("brod").exits[c.exit], "выход — тот вариант, что совет исполнил");
  assert.equal(w.fall.queue.length, 0);
  assert.ok(w.factions.brod >= F.afterTrust * BALANCE.economy.trust.fade - 0.2, "после кризиса сторона снова выше порога отказа");
  assert.notEqual(zoneOf(w, "brod"), "отказывают");
  const entry = w.log.find((e) => e.title.startsWith("Кризис: Деревня у брода"))!;
  assert.ok(entry.lines.some((l) => l.startsWith("Шрам:")));
  assert.ok(scarOf(w, "brod"));
});

test("шрам: поток стороны ниже, пока держится; мягкий выход — короче; зажил — поток прежний", () => {
  const w = rich(calm()), def = crisisDef("kuptsy");
  w.factions.kuptsy = 0;
  const before = zoneMult(w, "kuptsy"), plan = planSeason(w).stock.serebro;
  resolveCrisis(w, def, "oboz", []);
  assert.equal(zoneMult(w, "kuptsy"), before * F.scarMult);
  assert.ok(planSeason(w).stock.serebro < plan, "пошлин и выручки меньше");
  assert.equal(w.fall.crises[0].scarUntil, w.season + 1 + scarSeasons(false));
  assert.ok(scarSeasons(true) < scarSeasons(false));
  w.season = w.fall.crises[0].scarUntil;
  assert.equal(zoneMult(w, "kuptsy"), before, "шрам зажил");
  assert.ok(!crisisNow(w));
});

test("выходы: договор с гильдией режет пошлины, договориться через старосту стоит авторитета; никто не занялся — тяжёлый шрам, и другие стороны это видели", () => {
  const w = rich(calm());
  resolveCrisis(w, crisisDef("kuptsy"), "dogovor", []);
  assert.ok(w.eco.dutyCutUntil > w.season);
  const a = w.authority;
  resolveCrisis(w, crisisDef("brod"), "starosta", []);
  assert.equal(w.authority, a + crisisDef("brod").exits.starosta.authority!);
  assert.equal(w.auth.totals.fall, crisisDef("brod").exits.starosta.authority);
  assert.equal(w.fall.crises[1].scarUntil - w.season - 1, scarSeasons(true));
  const trust = w.factions.kuptsy;
  resolveCrisis(w, crisisDef("zamok"), undefined, []);
  assert.equal(w.fall.crises[2].scarUntil - w.season - 1, scarSeasons(false));
  assert.equal(w.factions.kuptsy, trust + F.emptyTrust);
});

test("кризисы леса и двора (И11б): нашествие тварей режет дары леса, «помощник» от Герцога — терпение уходит быстрее; о любом кризисе узнают при дворе", () => {
  const w = rich(calm());
  refusing(w, "les", F.refuseSeasons);
  assert.equal(deskView(w)!.ev.id, "krizis_les");
  const mult = zoneMult(w, "les");
  refuse(w, "les"); runSeason(w);
  assert.equal(w.fall.crises[0].side, "les");
  assert.ok(scarOf(w, "les") && zoneMult(w, "les") < 1);
  assert.equal(mult, 0, "пока лес отказывал, даров не было вовсе");
  // двор: выход «принять помощника» стоит авторитета и оставляет полный шрам
  const x = rich(calm("двор")), a = x.authority, before = zoneMult(x, "dvor");
  resolveCrisis(x, crisisDef("dvor"), "prinyat", []);
  assert.equal(x.authority, a + crisisDef("dvor").exits.prinyat.authority!);
  assert.equal(zoneMult(x, "dvor"), before * F.scarMult, "соглядатай: двор считается хуже расположенным");
  assert.equal(x.fall.crises[0].scarUntil - x.season - 1, scarSeasons(false));
  // малое колесо отдаёт назад: кризис деревни роняет доверие двора, кризис самого двора — нет
  const y = rich(calm("эхо")), dvor = y.factions.dvor;
  resolveCrisis(y, crisisDef("brod"), "ustupit", []);
  assert.equal(y.factions.dvor, dvor - F.crisisDvor);
  resolveCrisis(y, crisisDef("dvor"), "otkup", []);
  assert.equal(y.factions.dvor, dvor - F.crisisDvor, "кризис самого двора его доверие вторым разом не роняет");
});

test("приказ Сенешаля решает кризис: исполнен приказанный выход", () => {
  const w = rich(calm());
  refusing(w, "zamok", F.refuseSeasons);
  assert.equal(deskView(w)!.ev.id, "krizis_zamok");
  assert.ok(command(w, "zhalovanye"));
  runSeason(w);
  assert.equal(w.fall.crises[0].exit, "zhalovanye");
});

test("внеочередной сбор: после недоимки при недовольном Герцоге; не чаще раза в год; закрыт — падения нет, не закрыт — падение", () => {
  const start = () => {
    const w = calm("сбор");
    w.eco.stock = { eda: 2, tovary: 0, serebro: 0 };
    w.eco.autoPay = false;
    runSeason(w); runSeason(w);
    w.eco.tax.patience = BALANCE.economy.tax.displeased + BALANCE.economy.tax.arrearsPatience;   // после недоимки останется «недоволен»
    runSeason(w);   // осень: недоимка
    return w;
  };
  const w = start(), d = w.world.decrees.find((x) => x.levy)!;
  assert.ok(d, "сбор объявлен");
  assert.equal(d.due, F.levy);
  assert.equal(d.until, w.season - 1 + F.levyTerm);
  maybeLevy(w, []);
  assert.equal(w.world.decrees.filter((x) => x.levy).length, 1, "второго сбора поверх первого нет");
  for (let i = 0; i < F.levyTerm; i++) { w.eco.stock.eda = 4; runSeason(w); }
  assert.equal(d.closed, "не закрыт");
  assert.ok(w.fall.under, "сбор не закрыт — баронство отдано другому");
  assert.ok(w.fall.falls[0].why.startsWith("внеочередной сбор"));
  // закрыл — остался хозяином
  const x = start(), dx = x.world.decrees.find((q) => q.levy)!;
  x.eco.stock.serebro = 10;
  assert.equal(payDecree(x, dx.id, "serebro", dx.due), dx.due);
  for (let i = 0; i < F.levyTerm; i++) { x.eco.stock.eda = 4; runSeason(x); }
  assert.ok(!x.fall.under);
  assert.equal(metricsOf({ w: x, calm: 0, applicable: true, seasons: 12, probe: playBot("a", bot("idle"), 1).probe, aspAt: 13, shortByYear: [] }).levies, 1);
});

test("причины падения: терпение исчерпано; недоимка вместе с кризисом; два кризиса сразу", () => {
  const w = rich(calm());
  assert.equal(fallReason(w), "");
  assert.equal(fallReason(w, true), "два кризиса сторон сразу");
  w.eco.tax.patience = F.patienceOut;
  assert.equal(fallReason(w), "терпение Герцога исчерпано");
  // два кризиса сразу: вторая сторона дошла до кризиса, пока первый не зажил
  const x = rich(calm("два"));
  for (let i = 0; i < F.refuseSeasons; i++) { refuse(x, "brod"); refuse(x, "kuptsy"); runSeason(x); }
  assert.ok(x.fall.under);
  assert.equal(x.fall.falls[0].why, "два кризиса сторон сразу");
  // недоимка вместе с кризисом
  const y = rich(calm("недоимка"));
  refusing(y, "zamok", F.refuseSeasons);
  assert.equal(y.season, 4);
  assert.ok(!y.fall.under, "один кризис без недоимки — ещё не падение");
  const z = calm("недоимка");
  z.eco.autoPay = false;
  z.eco.stock = { eda: 30, tovary: 0, serebro: 0 };
  z.fall.refuse.zamok = 1;
  refusing(z, "zamok", 2);   // кризис встал в очередь к концу лета
  refuse(z, "zamok"); runSeason(z);   // осень: кризис на столе, сборщица уезжает с недобором
  assert.ok(z.fall.under);
  assert.equal(z.fall.falls[0].why, "недоимка вместе с кризисом стороны");
});

test("бароны: натура и склонности заданы данными под образ — генератор натуры их не растит, курс следует из склонностей", () => {
  for (const b of BARONS) {
    assert.ok(NATURES.some((n) => n.name === b.nature), `${b.name}: натура ${b.nature} есть среди натур`);
    assert.deepEqual(Object.keys(b.star).sort(), [...AXES].sort());
    assert.ok(AXES.every((a) => Number.isInteger(b.star[a]) && b.star[a] >= 0 && b.star[a] <= 10), `${b.name}: склонности в шкале звезды`);
  }
  const course = (i: number) => baronCourse({ ...BARONS[i], def: BARONS[i].id });
  assert.deepEqual([BARONS[0].name, course(0), BARONS[1].name, course(1)], ["Ратша", "kopim", "Доброгнева", "dorogi"]);
  // один и тот же барон в любой партии: мешок черт и семя на него не влияют
  const a = fallNow(rich(calm()), "проверка").baron, b = fallNow(rich(newWorld("другое семя")), "проверка").baron;
  assert.deepEqual([a.nature, a.star], [b.nature, b.star]);
  assert.deepEqual([a.nature, a.star], [BARONS[0].nature, BARONS[0].star]);
  const src = readFileSync(new URL("../src/sim/fall/under.ts", import.meta.url), "utf8");
  assert.ok(!/natura/.test(src), "падение не зовёт генератор натуры");
});

test("падение: новый барон со своей натурой и звездой, свита на должностях, согнанные — за Сенешаля, курс задаёт барон", () => {
  const w = rich(calm()), people = w.people.length, head = w.head;
  const u = fallNow(w, "проверка");
  assert.equal(w.fall.under, u);
  assert.equal(u.baron.def, "prositel");
  assert.ok(NATURES.some((n) => n.name === u.baron.nature));
  assert.equal(Object.keys(u.baron.star).length, 5);
  assert.ok(u.retinue.length >= F.retinueMin && u.retinue.length <= F.retinueMax);
  assert.equal(w.people.length, people + u.retinue.length);
  for (const id of u.retinue) {
    const p = w.people[id];
    assert.ok(RETINUE.some((r) => r.name === p.name) && p.post && w.posts[p.post] === id);
    assert.equal(p.loyalty, F.retinueLoyalty);
    assert.ok(w.eco.elders.every((el) => typeof el.rel[id] === "number"), "старосты деревень знают пришлых");
  }
  assert.equal(u.displaced.length, u.retinue.length, "все должности были заняты: каждого пришлого посадили на чьё-то место");
  for (const d of u.displaced) {
    const p = w.people[d.person];
    assert.equal(p.post, undefined);
    assert.ok(u.retinue.some((id) => (w.rel.get(`${Math.min(id, p.id)}|${Math.max(id, p.id)}`) ?? 0) <= F.strangerRel + BALANCE.rel.startSpread + BALANCE.rel.sameTop), "с тем, кто занял место, — плохо");
  }
  if (u.displaced.some((d) => d.person === head)) assert.equal(w.head, null);
  assert.equal(w.eco.course, baronCourse(u.baron));
  assert.equal(setCourse(w, "polegche"), w.eco.course === "polegche", "курс Сенешаль сам больше не задаёт");
  assert.ok(!setCourse(w, null));
  assert.equal(w.fall.falls.length, 1);
  assert.equal(w.log[w.log.length - 1].title, "Падение: под чужой рукой");
  // второй раз — человек двора: проситель уже пал
  const first = u.retinue.map((id) => w.people[id].name);
  comeBack(w);
  const again = fallNow(w, "снова");
  assert.equal(again.baron.def, "dvor");
  assert.ok(again.retinue.length > 0 && again.retinue.every((id) => !first.includes(w.people[id].name)), "второй барон приводит других людей");
});

test("под чужой рукой: потолок авторитета ниже, двор барона ест, подать и терпение Герцога — на бароне", () => {
  const w = rich(calm());
  w.authority = BALANCE.authority.cap;
  fallNow(w, "проверка");
  assert.equal(authorityCap(w), F.capUnder);
  assert.equal(w.authority, F.capUnder, "излишек сверх нового потолка сгорел");
  const court = planSeason(w).lines.filter((l) => l.text.includes("барон"));
  assert.deepEqual(court.map((l) => l.v), [-F.courtFood, -F.courtSilver]);
  w.eco.tax.patience = 0;
  assert.ok(!authoritySupport(w).lines.some((l) => l.text.includes("Герцог")), "терпение Герцога опоры не касается");
  // недоимка под бароном: авторитет и терпение Сенешаля целы, срок барона короче
  const y = calm("под рукой");
  y.eco.autoPay = false;
  y.eco.stock = { eda: 30, tovary: 0, serebro: 0 };
  const u = fallNow(y, "проверка"), patience = y.eco.tax.patience;
  runSeason(y); runSeason(y);
  const tax = y.auth.totals.tax;
  runSeason(y);
  assert.equal(y.eco.tax.patience, patience);
  assert.equal(y.auth.totals.tax, tax);
  assert.equal(u.steps.dvor, F.stepArrears);
  assert.equal(u.armor, F.armor - 3 - F.stepArrears);
  assert.ok(y.eco.tax.carried > 0, "недоимка всё равно ляжет на следующий год");
});

test("перестановки под чужой рукой: только с согласия барона, а его людей не тронуть и с согласием", () => {
  const w = rich(calm()), u = fallNow(w, "проверка");
  const mine = w.people.find((p) => p.post && !u.retinue.includes(p.id))!, free = w.people.find((p) => !p.post)!;
  assert.ok(staffBlock(w, free, mine.post!)!.includes("согласия барона"));
  assert.ok(!assign(w, free.id, mine.post!));
  assert.ok(askConsent(w));
  assert.equal(w.deedsLeft, BALANCE.season.deeds - 1);
  assert.ok(!askConsent(w), "второй раз в сезон спрашивать незачем");
  assert.equal(staffBlock(w, free, mine.post!), undefined);
  const theirs = w.people[u.retinue[0]];
  assert.ok(staffBlock(w, free, theirs.post!)!.includes("человеком барона"));
  assert.ok(staffBlock(w, theirs, null)!.includes("человек барона"));
  assert.ok(!assign(w, free.id, theirs.post!) && !assign(w, theirs.id, null));
  w.authority = F.capUnder;
  assert.ok(assign(w, free.id, mine.post!));
  runSeason(w);
  assert.ok(staffBlock(w, mine, free.post!), "согласие действует один сезон");
});

test("броня: если ничего не делать, лес выживает барона за восемь сезонов; согнанные возвращаются, авторитет ниже", () => {
  const w = rich(calm()), posts = { ...w.posts }, legacy = w.legacy.length;
  const people = w.people.length, u = fallNow(w, "проверка"), names = u.retinue.map((id) => w.people[id].name);
  for (let i = 0; i < F.armor - 1; i++) { rich(w); runSeason(w); assert.ok(w.fall.under, `сезон ${i + 1}: барон ещё держится`); }
  assert.equal(underSeasons(w), F.armor - 1, "в тесте падение — в начале сезона: счёт идёт со следующего");
  const before = w.authority;
  rich(w); runSeason(w);
  assert.equal(w.fall.under, null);
  const rec = w.fall.falls[0];
  assert.deepEqual([rec.how, rec.back], ["bronya", w.season - 1]);
  assert.deepEqual(w.posts, posts, "согнанные вернулись на свои места");
  assert.equal(w.legacy.length, legacy);
  assert.equal(w.people.length, people, "люди барона ушли вместе с ним");
  assert.ok(!w.people.some((p) => names.includes(p.name)) && w.people.every((p, i) => p.id === i));
  assert.ok([...w.rel.keys()].every((key) => key.split("|").every((x) => Number(x) < people)), "отношений с ушедшими не осталось");
  assert.ok(w.eco.elders.every((el) => el.rel.length === people));
  assert.equal(w.eco.course, null);
  assert.ok(w.eco.tax.patience >= BALANCE.economy.tax.waits, "Герцог ждёт");
  assert.equal(authorityCap(w), BALANCE.authority.cap);
  assert.equal(w.auth.last!.find((l) => l.text.includes("за кого лес"))!.v, -F.backArmor);
  assert.ok(w.authority < before + 1);
  assert.ok(setCourse(w, "polegche"), "курс снова за Сенешалем");
});

test("пути падения барона: кризис стороны и недоимка снимают броню; своими силами — только путь земли, авторитет растёт; цена — по сроку", () => {
  const w = rich(calm()), u = fallNow(w, "проверка");
  refusing(w, "kuptsy", F.refuseSeasons);
  assert.equal(deskView(w)!.ev.id, "krizis_kuptsy");
  refuse(w, "kuptsy"); runSeason(w);
  assert.equal(u.steps.zemlya, F.stepCrisis);
  assert.equal(u.armor, F.armor - (F.refuseSeasons + 1) - F.stepCrisis);
  assert.ok(w.fall.crises[0].under);
  // возвращение: путь земли
  const trust = { ...w.factions }, a = w.authority, seasons = underSeasons(w) - 1;
  w.season--;
  assert.equal(comeBack(w), "zemlya");
  assert.equal(w.authority, Math.min(BALANCE.authority.cap, a + F.backOwn));
  assert.equal(w.factions.brod, Math.round((trust.brod - F.ruin * seasons) * 10) / 10, "что барон успел сломать: чем дольше, тем дороже");
  assert.equal(w.factions.les, trust.les, "лес и двор барон не трогал");
  // путь двора: барон не справился сам — авторитет Сенешаля не растёт и не падает
  const x = rich(calm("двор")), ux = fallNow(x, "проверка");
  ux.steps.dvor = F.ownSteps; ux.steps.zemlya = 0;
  const ax = x.authority;
  assert.equal(comeBack(x), "dvor");
  assert.equal(x.authority, ax);
  // оба пути сразу — засчитана земля
  const z = rich(calm("оба")), uz = fallNow(z, "проверка");
  uz.steps.dvor = F.stepArrears * 2; uz.steps.zemlya = F.stepCrisis;
  assert.equal(comeBack(z), "zemlya");
  // ничего не сделано — броня
  const y = rich(calm("броня"));
  fallNow(y, "проверка");
  assert.equal(comeBack(y), "bronya");
});

test("склонить барона к курсу: шанс по его звезде; решает всё равно барон", () => {
  const w = rich(calm()), u = fallNow(w, "проверка"), own = w.eco.course!;
  const other = COURSES.filter((c) => c.id !== own).map((c) => c.id);
  for (const id of other) assert.ok(swayChance(w, id) <= swayChance(w, own), "к тому, что ему по душе, склонить легче");
  u.baron.star = { dolg: 5, vygoda: 5, zabota: 5, derzost: 5, obychai: 5 };
  assert.equal(swayChance(w, "polegche"), F.swayBase);
  assert.ok(!sway(w, own), "он и так держит этот курс");
  setAt("fall.swayBase", 1);
  assert.ok(sway(w, "polegche"));
  assert.equal(w.eco.course, "polegche");
  assert.equal(w.deedsLeft, BALANCE.season.deeds - 1);
  setAt("fall.swayBase", 0); setAt("fall.swayStar", 0);
  assert.ok(!sway(w, "torguem"));
  assert.equal(w.eco.course, "polegche");
  assert.equal(w.deedsLeft, BALANCE.season.deeds - 2, "дело потрачено и на отказ");
});

test("раскачать сторону: её доверие падает; барон заметил — опала: два сезона без личных дел и потеря авторитета", () => {
  setAt("fall.stirNotice", 0);
  const w = rich(calm()), trust = w.factions.brod;
  assert.ok(!stir(w, "brod"), "без барона раскачивать некого");
  fallNow(w, "проверка");
  assert.ok(!stir(w, "les"), "лес и двор не раскачать");
  assert.ok(stir(w, "brod"));
  assert.equal(w.factions.brod, trust - F.stir);
  assert.ok(!disgraced(w));
  setAt("fall.stirNotice", 1);
  const a = w.authority, season = w.season;
  assert.ok(stir(w, "kuptsy"));
  assert.ok(disgraced(w));
  assert.equal(w.deedsLeft, 0, "остаток сезона тоже потерян");
  assert.equal(w.authority, a - F.disgraceAuthority);
  for (let i = 0; i < F.disgraceSeasons; i++) { runSeason(w); assert.equal(w.deedsLeft, 0, `сезон ${w.season}: опала`); }
  runSeason(w);
  assert.equal(w.season, season + F.disgraceSeasons + 1);
  assert.equal(w.deedsLeft, BALANCE.season.deeds, "опала кончилась");
});

test("конец акта под чужой рукой: остаток заберёт прыжок — пометка в летописи, один раз", () => {
  const w = rich(calm());
  for (let i = 0; i < F.actSeasons - 2; i++) { rich(w); w.eco.tax.patience = 8; runSeason(w); }
  assert.ok(!w.fall.under);
  fallNow(w, "проверка");
  rich(w); runSeason(w); rich(w); runSeason(w); rich(w); runSeason(w);
  const notes = w.log.flatMap((e) => e.lines).filter((l) => l.includes("заберёт прыжок"));
  assert.equal(notes.length, 1);
  assert.ok(w.fall.under!.jump);
});

test("выключатель: при fall.on = 0 нет ни счёта отказов, ни кризисов, ни падения", () => {
  setAt("fall.on", 0);
  const w = calm();
  w.eco.tax.patience = 0;
  refusing(w, "brod", F.refuseSeasons + 2);
  assert.deepEqual([w.fall.queue.length, w.fall.crises.length, w.fall.under, w.fall.refuse.brod], [0, 0, null, undefined]);
});

test("детерминизм и боты: одна партия — одно падение; отчёт считает падения, причины и возвращения; привычки под рукой делают заявленное", () => {
  const play = () => { const w = calm("дет"); w.eco.tax.patience = 0; for (let i = 0; i < 12; i++) runSeason(w); return w; };
  const a = play(), b = play();
  assert.ok(a.fall.falls.length >= 1);
  assert.equal(dump(a), dump(b));
  resetBalance();
  const seeds = Array.from({ length: 40 }, (_, i) => `s${i}`);
  const runs = (id: string) => seeds.map((s) => playBot(s, bot(id)));
  const idle = runs("idle").map(metricsOf), fallen = idle.filter((m) => m.fell);
  assert.ok(fallen.length > 0 && fallen.length < seeds.length, `пало ${fallen.length} из ${seeds.length}`);
  for (const m of fallen) {
    assert.ok(m.fallAt >= 1 && m.underSeasons >= 0);
    assert.equal(m.whyPatience + m.whyLevy + m.whyArrears + m.whyDouble, 1, "у падения одна причина");
  }
  assert.ok(idle.filter((m) => !m.fell).every((m) => m.fallAt === 0 && m.underSeasons === 0));
  // привычки под рукой проверяются там, где падают часто: Герцог с первого дня почти потерял терпение
  setAt("economy.start.patience", BALANCE.economy.tax.arrearsPatience);
  const stirred = runs("Х20"), master = runs("master");
  assert.ok(stirred.some((r) => r.w.log.some((e) => e.title === "Против барона")), "Х20 под чужой рукой раскачивает стороны");
  assert.ok(master.every((r) => !r.w.log.some((e) => e.title === "Против барона")));
  const hinder = runs("Х21").filter((r) => r.w.fall.under && r.w.fall.falls[r.w.fall.falls.length - 1].season < 12);
  assert.ok(hinder.length > 0 && hinder.every((r) => !r.w.eco.autoPay), "Х21 под чужой рукой подать барона не платит");
});
