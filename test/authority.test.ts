// Авторитет без экрана (задача И15, замысел — docs/design/avtoritet.md): опора, потолок, подать, суд лично и брошенные жалобы,
// обычаи и пиры, приказ против мнения советника, уговор вместо снятия, ведомость.
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { POSTS } from "../src/data/core";
import { EVENTS } from "../src/data/events";
import { SIDES } from "../src/data/economy";
import { BALANCE, resetBalance, setAt } from "../src/sim/balance";
import { newWorld, runSeason, assign, assignCost, giveOrder, holder, setRel, persuade, persuadeStep, command, deskView, orderCost, type World } from "../src/sim/sim";
import { economySeason, payTax } from "../src/sim/economy";
import {
  addAuthority, authorityCap, authorityWeak, complaintLeft, authoritySupport, authoritySeason, councilSteady, addComplaint, judge, feast, feastGain, feastsThisYear, FEASTS,
} from "../src/sim/authority";
import { economyMetrics, PAYERS } from "../src/sim/economy-report";
import { dump, fix } from "./_world";

afterEach(() => resetBalance());

const A = BALANCE.authority, E = BALANCE.economy, START = BALANCE.staff.authorityStart;
const said = (lines: string[], part: string) => lines.some((l) => l.includes(part));
// Ровный совет: все ладят между собой, главный — тиун, нижних черт нет.
function calm(seed = "авторитет"): World {
  const w = newWorld(seed);
  const council = POSTS.map((d) => fix(holder(w, d.id)!, ["dolg"]));
  for (const p of w.people) p.loyalty = 0;
  for (const a of council) for (const b of council) if (a.id < b.id) setRel(w, a.id, b.id, 3);
  w.head = council[0].id;
  w.eco.floor = { eda: 0, serebro: 0 };
  return w;
}
const lastText = (w: World) => w.log[w.log.length - 1].lines.join(" | ");

// ---------- опора и потолок ----------

test("опора: стороны в «ладят» и «заодно», признанный главный без вражды, терпение Герцога", () => {
  const w = calm();
  assert.equal(authoritySupport(w).total, Math.round((SIDES.length * A.sideFriendly + A.council) * 100) / 100);
  w.factions.les = E.trust.ally;
  w.factions.kuptsy = E.trust.refuse;
  const s = authoritySupport(w);
  assert.equal(s.total, Math.round(((SIDES.length - 2) * A.sideFriendly + A.sideAlly + A.council) * 100) / 100, "заодно — вдвое, отказывают — ничего");
  assert.ok(s.lines.some((l) => l.text.includes("заодно — лес")));
  w.eco.tax.patience = E.tax.favor;
  assert.equal(authoritySupport(w).total, Math.round((s.total + A.dukeFavor) * 100) / 100);
  w.eco.tax.patience = E.tax.displeased;
  assert.equal(authoritySupport(w).total, Math.round((s.total - A.dukeDispleased) * 100) / 100);
});

test("опора от совета пропадает, если главного нет, его не признают или в совете враги", () => {
  const w = calm();
  const [a, b, c] = POSTS.map((d) => holder(w, d.id)!);
  assert.ok(councilSteady(w).ok);
  setRel(w, b.id, c.id, BALANCE.rel.enemy);
  assert.ok(councilSteady(w).why.includes("враги"));
  setRel(w, b.id, c.id, 3);
  setRel(w, a.id, b.id, BALANCE.council.headMinRel - 1);
  assert.ok(councilSteady(w).why.includes("не признаёт"));
  setRel(w, a.id, b.id, 3);
  w.head = null;
  assert.deepEqual(councilSteady(w), { ok: false, why: "главного нет" });
  assert.equal(authoritySupport(w).total, Math.round(SIDES.length * A.sideFriendly * 100) / 100);
});

test("опора в минус не уходит, пока терпение Герцога не на исходе", () => {
  const w = calm();
  for (const s of SIDES) w.factions[s] = E.trust.refuse;
  w.head = null;
  w.eco.tax.patience = E.tax.displeased;
  assert.deepEqual(authoritySupport(w), { lines: [], total: 0 });
  w.eco.tax.patience = 0;
  assert.equal(authoritySupport(w).total, -A.dukeEdge);
});

test("сезон: опора приходит в авторитет, ведомость прошлого сезона — построчно", () => {
  const w = calm();
  const support = authoritySupport(w).total;
  authoritySeason(w, []);
  assert.equal(w.authority, START + support);
  assert.equal(w.auth.lastSeason, 1);
  assert.ok(w.auth.last!.every((l) => l.kind === "support") && w.auth.last!.length === 2);
  assert.deepEqual(w.auth.cur, []);
  assert.equal(w.auth.totals.support, support);
});

test("потолок: излишек сгорает, и это видно в ведомости", () => {
  const w = calm();
  assert.equal(authorityCap(), A.cap);
  w.authority = A.cap - 0.5;
  addAuthority(w, 2, "проба", "feast");
  assert.equal(w.authority, A.cap);
  assert.deepEqual(w.auth.cur.map((l) => [l.v, l.kind]), [[2, "feast"], [-1.5, "burn"]]);
  addAuthority(w, -3, "трата", "staff");
  assert.equal(w.authority, A.cap - 3);
  setAt("authority.cap", 20);
  addAuthority(w, 6, "проба", "feast");
  assert.equal(w.authority, 18, "ручка потолка действует сразу");
});

// ---------- подать ----------

test("подать: в срок +1, досрочно +2, недоимка −2", () => {
  const year = (setup: (w: World) => void) => {
    const w = calm();
    w.eco.autoPay = false;
    w.eco.stock.serebro = 9;
    setup(w);
    for (let i = w.season; i <= 3; i++) { economySeason(w, []); w.season++; }
    return w.auth.totals.tax;
  };
  assert.equal(year((w) => { payTax(w, "serebro", E.tax.trial); }), A.taxEarly);
  assert.equal(year((w) => { w.season = 3; payTax(w, "serebro", E.tax.trial); }), A.taxOnTime);
  assert.equal(year(() => {}), -A.taxArrears);
});

// ---------- жалобы ----------

test("суд лично: жалоба — дело на столе; разобрал — авторитет и благодарность, личное дело потрачено", () => {
  const w = calm();
  addComplaint(w, 2, 5);
  const c = w.auth.complaints[0], loyalty = w.people[2].loyalty;
  assert.deepEqual([c.from, c.on, c.season], [2, 5, 1]);
  assert.ok(judge(w, c.id));
  assert.equal(w.authority, START + A.judge);
  assert.equal(w.deedsLeft, BALANCE.season.deeds - 1);
  assert.equal(w.people[2].loyalty, loyalty + A.judgeLoyalty);
  assert.deepEqual(w.auth.complaints, []);
  assert.ok(lastText(w).includes("сам разобрал жалобу"));
  assert.ok(!judge(w, c.id), "той же жалобы уже нет");
  addComplaint(w, 3, 4);
  w.deedsLeft = 0;
  assert.ok(!judge(w, w.auth.nextId - 1), "без личных дел суд не идёт");
  assert.equal(w.auth.complaints.length, 1);
});

test("жалоба ждёт год: в конце — авторитет падает, жалобщик обижен, жалоба уходит; до того штрафа нет", () => {
  const w = calm();
  addComplaint(w, 2, 5);
  const c = w.auth.complaints[0], loyalty = w.people[2].loyalty;
  assert.equal(complaintLeft(w, c), A.complaintSeasons);
  for (let i = 0; i < A.complaintSeasons; i++) {
    authoritySeason(w, []);
    assert.equal(w.auth.totals.complaint, 0, `сезон ${i + 1}: ещё ждёт`);
    w.season++;
    assert.equal(complaintLeft(w, c), A.complaintSeasons - i - 1);
  }
  assert.equal(w.auth.complaints.length, 1, "весь год жалобу можно разобрать");
  const lines: string[] = [];
  authoritySeason(w, lines);
  assert.equal(w.auth.totals.complaint, -A.complaintLeft);
  assert.equal(w.people[2].loyalty, loyalty - A.leftLoyalty);
  assert.ok(said(lines, "пролежала год"));
  assert.deepEqual(w.auth.complaints, []);
});

test("ниже нуля авторитет не уходит", () => {
  const w = calm();
  w.authority = 1;
  addAuthority(w, -A.taxArrears, "недоимка", "tax");
  assert.equal(w.authority, 0);
  assert.equal(w.auth.totals.tax, -A.taxArrears, "в ведомости потеря записана целиком");
});

test("слово весит меньше: ниже порога каждая трата дороже, бесплатное остаётся бесплатным", () => {
  const w = calm();
  const p = holder(w, "pisar")!, free = w.people.find((x) => !x.post)!;
  const base = assignCost(w, p, null).cost;
  assert.ok(!authorityWeak(w));
  assert.equal(orderCost(w), BALANCE.staff.orderCost);
  w.authority = A.weakBelow;
  assert.equal(assignCost(w, p, null).cost, base, "ровно на пороге цена прежняя");
  w.authority = A.weakBelow - 1;
  assert.ok(authorityWeak(w));
  assert.equal(assignCost(w, p, null).cost, base + A.weakExtra);
  assert.ok(assignCost(w, p, null).why.includes("слово весит меньше"));
  assert.equal(orderCost(w), BALANCE.staff.orderCost + A.weakExtra);
  assign(w, holder(w, "klyuchnik")!.id, null);
  assert.equal(assignCost(w, free, "klyuchnik").cost, 0, "на пустую должность — бесплатно и при слабом слове");
  p.agreed = true;
  assert.equal(assignCost(w, p, null).cost, 0, "уговорённого снять — бесплатно");
});

test("не хватает авторитета — трата не проходит, остаётся уговор", () => {
  const w = calm();
  const p = holder(w, "pisar")!;
  w.authority = 0;
  assert.equal(assign(w, p.id, null), false);
  assert.equal(p.post, "pisar");
  assert.equal(giveOrder(w, p.id, "dolg"), false);
  assert.equal(p.order, undefined);
  assert.equal(w.authority, 0);
  assert.deepEqual(w.auth.cur, []);
  p.loyalty = 10;
  persuade(w, p.id);
  assert.equal(assign(w, p.id, null), true, "уговорил — снял без авторитета");
  assert.equal(p.post, undefined);
});

test("спор соперников и саботаж кладут жалобы на стол", () => {
  let n = 0;
  for (let i = 0; i < 12 && !n; i++) {
    const w = newWorld(`жалобы-${i}`);
    const council = w.people.filter((p) => p.post);
    for (const a of council) for (const b of council) if (a.id < b.id) setRel(w, a.id, b.id, BALANCE.rel.enemy);
    for (let s = 0; s < 6; s++) runSeason(w);
    n = w.auth.nextId - 1;
    if (n) assert.ok(w.log.some((e) => e.lines.some((l) => l.includes("Жалоб"))));
  }
  assert.ok(n > 0, "во враждующем совете жалобы появляются");
});

// ---------- обычаи и пиры ----------

test("обычай или пир: личное дело за еду или серебро; второй раз за год — вдвое меньше, в новом году — снова полностью", () => {
  assert.deepEqual(FEASTS.map((f) => f.pay), ["eda", "serebro"]);
  const w = calm();
  assert.ok(feast(w, "prazdnik"));
  assert.equal(w.authority, START + A.feast);
  assert.equal(w.eco.stock.eda, E.start.eda - A.feastFood);
  assert.equal(w.deedsLeft, BALANCE.season.deeds - 1);
  assert.ok(w.eco.cur.some((l) => l.cat === "eda" && l.text.includes("праздник")), "трата видна в ведомости хозяйства");
  assert.equal(feastGain(w), A.feast * A.feastRepeat);
  assert.ok(feast(w, "pir"));
  assert.equal(w.authority, START + A.feast + A.feast * A.feastRepeat);
  assert.equal(w.eco.stock.serebro, E.start.serebro - A.feastSilver);
  assert.equal(feastsThisYear(w), 2);
  w.season = 5;
  assert.equal(feastsThisYear(w), 0);
  assert.equal(feastGain(w), A.feast);
  w.eco.stock.eda = 0;
  assert.ok(!feast(w, "prazdnik"), "не на что");
  w.eco.stock.serebro = 5; w.deedsLeft = 0;
  assert.ok(!feast(w, "pir"), "нет личных дел");
});

// ---------- приказ против мнения советника ----------

// «Свадьба в деревне» решает ключник: «Выкатить бочку» (Забота: деревни +2, еда −1), «Продать» (Выгода: серебро +1, деревни −1), «Отказать» (Долг: деревни −1).
function desk(w: World, id = "svadba") {
  w.desk = { event: id };
  return deskView(w)!;
}

test("дело на столе: событие будущего сезона, советник и его мнение", () => {
  const w = calm();
  assert.ok(w.desk && EVENTS.some((e) => e.id === w.desk!.event), "дело есть с начала партии");
  const d = desk(w);
  assert.equal(d.advisor!.id, holder(w, "klyuchnik")!.id);
  assert.equal(d.opinion!.id, "otkazat", "ключник со склонностью к Долгу отказал бы");
  runSeason(w);
  assert.ok(w.log.some((e) => e.title === "Свадьба в деревне"), "дело со стола пришло в этом сезоне");
  assert.ok(w.desk && !w.desk.order, "на следующий сезон — новое дело");
});

test("оказался прав: приказ против мнения советника, вышло хорошо — авторитет и уважение", () => {
  const w = calm();
  const k = holder(w, "klyuchnik")!;
  desk(w);
  assert.ok(command(w, "dat"));
  assert.equal(w.deedsLeft, BALANCE.season.deeds - 1);
  assert.ok(lastText(w).includes("советует иначе"));
  assert.ok(!command(w, "prodat"), "приказ по делу один");
  runSeason(w);
  const e = w.log.find((x) => x.title === "Свадьба в деревне — по приказу")!;
  assert.deepEqual(e.effects, { derevni: 1.6, pripasy: -0.8 }, "советник без доверия исполняет без огонька");
  assert.ok(said(e.lines, "оказался прав"));
  assert.equal(w.auth.totals.order, A.rightGain);
  assert.equal(k.loyalty, A.rightLoyalty);
  assert.equal(k.decisions, 0, "решение было не его");
});

test("приказ против мнения советника, вышло плохо — авторитет падает; приказ по его же мнению ничего не меняет", () => {
  const w = calm();
  desk(w);
  holder(w, "klyuchnik")!.loyalty = BALANCE.loyalty.trusts;
  command(w, "prodat");            // серебро +1, деревни −1 — в сумме ноль
  runSeason(w);
  assert.equal(w.auth.totals.order, 0, "ни хорошо, ни плохо");
  desk(w);
  holder(w, "klyuchnik")!.star.zabota = 10; holder(w, "klyuchnik")!.star.dolg = 0;
  command(w, "otkazat");           // деревни −1
  runSeason(w);
  assert.equal(w.auth.totals.order, -A.rightLoss);
  assert.ok(w.log.some((e) => e.lines.some((l) => l.includes("Вышло плохо"))));
  desk(w);
  command(w, deskView(w)!.opinion!.id);
  runSeason(w);
  assert.equal(w.auth.totals.order, -A.rightLoss);
  assert.ok(w.log.some((e) => e.lines.some((l) => l.includes("того же мнения"))));
});

// ---------- уговор вместо снятия ----------

test("медленный путь: уговорил разговорами — снимаешь без потери авторитета и без обиды", () => {
  const w = calm();
  const p = holder(w, "pisar")!;
  p.tenure = 16;
  assert.ok(assignCost(w, p, null).cost > 0);
  assert.equal(persuadeStep(p), A.persuadeBase);
  assert.ok(persuade(w, p.id));
  assert.ok(!p.agreed && lastText(w).includes("нужен ещё разговор"));
  assert.ok(persuade(w, p.id));
  assert.ok(p.agreed && lastText(w).includes("уйти сам"));
  assert.equal(w.deedsLeft, BALANCE.season.deeds - 2);
  assert.ok(!persuade(w, p.id), "уже согласен");
  assert.equal(assignCost(w, p, null).cost, 0);
  assign(w, p.id, null);
  assert.equal(w.authority, START);
  assert.equal(p.loyalty, 0, "обиды нет");
  assert.ok(lastText(w).includes("по уговору"));
  assert.ok(!p.agreed, "согласие — на одну должность");
});

test("уговор: кто доверяет — соглашается с одного разговора, кто недоволен — не уговорить; замена на должности тоже без обиды", () => {
  const w = calm();
  const p = holder(w, "pisar")!, q = holder(w, "klyuchnik")!;
  p.loyalty = 10;
  persuade(w, p.id);
  assert.ok(p.agreed);
  q.loyalty = -10;
  assert.equal(persuadeStep(q), 0);
  persuade(w, q.id);
  assert.ok(!q.agreed && lastText(w).includes("не уговорить"));
  const free = w.people.find((x) => !x.post)!;
  const before = w.authority;
  assign(w, free.id, "pisar");
  assert.equal(w.authority, before);
  assert.equal(p.loyalty, 10);
  assert.ok(w.log[w.log.length - 1].lines.some((l) => l.includes("по уговору")));
});

// ---------- траты и целое ----------

test("траты авторитета идут в ведомость: перестановка и наказ", () => {
  const w = calm();
  const p = holder(w, "pisar")!;
  const cost = assignCost(w, p, null).cost;
  assign(w, p.id, null);
  giveOrder(w, 0, "dolg");
  assert.equal(w.authority, START - cost - BALANCE.staff.orderCost);
  assert.deepEqual(w.auth.cur.map((l) => [l.v, l.kind]), [[-cost, "staff"], [-BALANCE.staff.orderCost, "staff"]]);
  assert.ok(w.auth.cur[0].text.includes(p.name));
});

test("партия с действиями игрока детерминирована; отчёт считает авторитет к концу", () => {
  const play = () => {
    const w = newWorld("авторитет-партия");
    for (let s = 0; s < 12; s++) {
      if (s % 3 === 0) feast(w, s % 2 ? "pir" : "prazdnik");
      if (s % 2 === 0) command(w, deskView(w)!.ev.options[s % 3].id);
      if (w.auth.complaints[0]) judge(w, w.auth.complaints[0].id);
      if (s === 4) persuade(w, holder(w, "pisar")!.id);
      runSeason(w);
      assert.ok(w.authority <= authorityCap(), `сезон ${s}: ${w.authority}`);
    }
    return w;
  };
  assert.equal(dump(play()), dump(play()));
  const m = economyMetrics(6, 12, PAYERS[0]).authority;
  assert.ok(m.min <= m.mean && m.mean <= m.max && m.max <= A.cap);
  assert.ok(m.by.support > 0);
});
