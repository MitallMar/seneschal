// Хозяйство без экрана: события и запасы, нижняя черта, ведомость и прогноз, недодача (src/sim/economy/ledger.ts, view.ts, season.ts).
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { SIDES } from "../src/data/economy";
import { BALANCE, resetBalance, setAt } from "../src/sim/balance";
import { runSeason } from "../src/sim/season";
import { runEvent } from "../src/sim/council/council";
import { assign } from "../src/sim/council/staff";
import { holder } from "../src/sim/state";
import type { World } from "../src/sim/state";
import { setFloor } from "../src/sim/economy/doer";
import { planSeason } from "../src/sim/economy/plan";
import { forecastFork, ledgerOf } from "../src/sim/economy/view";
import { addLine } from "../src/sim/economy/ledger";
import { fix } from "./_world";
import { E, event, said, calm, pass, zoneAt } from "./_economy";

afterEach(() => resetBalance());

// ---------- события и запасы ----------

test("kazna и pripasy событий — это серебро и еда: запас меняется, строка идёт в ведомость", () => {
  const w = calm();
  fix(holder(w, "starosta")!, ["zabota"]);
  const e = runEvent(w, event("nedoimka"));
  assert.equal(e.effects!.pripasy, -2);
  assert.equal(w.eco.stock.eda, E.start.eda - 2);
  const l = w.eco.cur.find((x) => x.cat === "eda")!;
  assert.equal(l.v, -2);
  assert.ok(l.text.includes("Недоимка") && l.who!.includes(holder(w, "starosta")!.name), "в строке — событие и кто решил");
});

test("ниже нуля запас не опускается: в запись идёт то, что удалось взять", () => {
  const w = calm();
  assert.equal(addLine(w, { cat: "serebro", v: -100, text: "проба" }), -E.start.serebro);
  assert.equal(w.eco.stock.serebro, 0);
});

test("нижняя черта: совет сам из-под неё не тратит, а засидевшийся тратит — и это видно", () => {
  const w = calm();
  const tiun = fix(holder(w, "starosta")!, ["zabota"]);
  setFloor(w, "eda", E.start.eda - 1);        // «Простить» стоит 2 еды — уведёт под черту
  const e = runEvent(w, event("nedoimka"));
  assert.equal(e.effects!.pripasy, undefined, e.lines.join(" | "));
  assert.equal(w.eco.stock.eda, E.start.eda);
  tiun.tenure = BALANCE.exp.staleFrom;
  const stale = runEvent(w, event("nedoimka"));
  assert.equal(stale.effects!.pripasy, -2);
  assert.ok(said(stale.lines, "Нижняя черта нарушена"));
  assert.ok(w.eco.cur.some((l) => l.how?.includes("ниже нижней черты")));
});

// ---------- ведомость и прогноз ----------

test("ведомость: вороватый писарь прячет строку — игрок видит только «не сходится»", () => {
  const w = calm();
  setAt("season.theftChance", 1);
  const p = holder(w, "pisar")!;
  p.tenure = BALANCE.exp.staleFrom; p.star.vygoda = 10;
  runSeason(w);
  const l = w.eco.last!;
  const seen = ledgerOf(l, "serebro"), all = ledgerOf(l, "serebro", true);
  assert.ok(seen.mismatch);
  assert.ok(!seen.lines.some((x) => x.text.includes("утекло")));
  assert.equal(all.lines.find((x) => x.text.includes("утекло"))!.v, -BALANCE.season.theft);
  assert.ok(said(w.log[w.log.length - 1].lines, "не сходится"));
  // вор на другой должности счёт не ведёт: строка видна
  const k = calm();
  const kl = holder(k, "klyuchnik")!;
  kl.tenure = BALANCE.exp.staleFrom; kl.star.vygoda = 10;
  runSeason(k);
  assert.ok(ledgerOf(k.eco.last!, "serebro").lines.some((x) => x.text.includes("утекло")));
  assert.ok(!ledgerOf(k.eco.last!, "serebro").mismatch);
});

test("прогноз вилкой: у годного счетовода узкая, у негодного широкая, без счетовода — шире всех; правда внутри", () => {
  const width = (setup: (w: World) => void) => {
    const w = calm();
    setup(w);
    const f = forecastFork(w), truth = planSeason(w).stock;
    for (const x of f) assert.ok(x.lo <= truth[x.cat] + 0.05 && truth[x.cat] <= x.hi + 0.05, `${x.cat}: ${x.lo}–${x.hi}, выйдет ${truth[x.cat]}`);
    return f.find((x) => x.cat === "serebro")!.hi - f.find((x) => x.cat === "serebro")!.lo;
  };
  const good = width((w) => { holder(w, "pisar")!.star = { dolg: 10, vygoda: 10, zabota: 0, derzost: 0, obychai: 0 }; });
  const bad = width((w) => { holder(w, "pisar")!.star = { dolg: 0, vygoda: 0, zabota: 10, derzost: 10, obychai: 10 }; });
  const none = width((w) => assign(w, holder(w, "pisar")!.id, null));
  assert.ok(good < bad && bad < none, `${good} < ${bad} < ${none}`);
  assert.equal(Math.round(good * 10) / 10, E.fork.min * 2);
  const w = calm();
  w.eco.stock.eda = 1.5; w.eco.floor.eda = 4;
  assert.equal(forecastFork(w).find((x) => x.cat === "eda")!.word, "не хватит");
  w.eco.stock.eda = 12;
  assert.equal(forecastFork(w).find((x) => x.cat === "eda")!.word, "с запасом");
});

// ---------- недодача ----------

test("недодача: еды не хватило — последний в очереди обижен; очередь задаёт, кого кормим первым", () => {
  const short = (first: "zamok" | "derevni") => {
    const w = calm();
    w.eco.stock.eda = E.flow.upkeep * E.flow.castleShare;
    w.eco.feedFirst = first;
    const before = { ...w.factions }, lines = pass(w);
    assert.ok(said(lines, "Недодача"), lines.join(" | "));
    assert.equal(w.eco.shortages, 1);
    assert.equal(w.eco.stock.eda, 0);
    return SIDES.filter((s) => w.factions[s] < Math.round(before[s] * E.trust.fade * 10) / 10);
  };
  assert.deepEqual(short("zamok"), ["brod", "opushka"]);
  assert.deepEqual(short("derevni"), ["zamok"]);
});

test("недодача жалованья: люди замка обижены, порядок падает", () => {
  const w = calm();
  w.eco.stock.serebro = 0; w.eco.stock.tovary = 0;
  w.factions.kuptsy = zoneAt("отказывают");
  const before = w.factions.zamok, order = w.resources.poryadok;
  pass(w);
  assert.equal(w.factions.zamok, Math.round((before - E.trust.short * E.flow.salary) * E.trust.fade * 10) / 10);
  assert.equal(w.resources.poryadok, Math.round((order - E.trust.shortOrder * E.flow.salary) * 10) / 10);
});
