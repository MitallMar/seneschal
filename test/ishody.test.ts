// «Люди решают исходы» (задача И17, замысел — docs/design/lyudi-i-ishody.md): род вариантов, вложения, шкала исходов спора, дела двух сфер.
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { EVENTS } from "../src/data/events";
import { BALANCE, resetBalance, setAt } from "../src/sim/balance";
import { newWorld, runEvent, holder, setRel, type World } from "../src/sim/sim";
import { economySeason, handsNow } from "../src/sim/economy";
import { fix, pair } from "./_world";

afterEach(() => resetBalance());
const event = (id: string) => EVENTS.find((e) => e.id === id)!;
const said = (lines: string[], part: string) => lines.some((l) => l.includes(part));
const open = (seed = "исходы"): World => { const w = newWorld(seed); w.eco.floor = { eda: 0, serebro: 0 }; w.eco.stock = { eda: 9, tovary: 0, serebro: 9 }; return w; };

test("дела двух сфер: не меньше трети и не больше половины событий без приключенцев", () => {
  const plain = EVENTS.filter((e) => !e.adventurers), two = plain.filter((e) => e.posts.length === 2);
  assert.ok(two.length / plain.length >= 1 / 3 && two.length / plain.length <= 0.5, `${two.length} из ${plain.length}`);
  const pairs = new Set(two.map((e) => [...e.posts].sort().join("+")));
  assert.equal(pairs.size, 10, "есть дело на каждую пару должностей");
});

test("род вариантов: смелый и осторожный не совпадают; у большинства событий есть и тот и другой", () => {
  const opts = EVENTS.flatMap((e) => e.options);
  assert.ok(!opts.some((o) => o.risky && o.careful));
  const plain = EVENTS.filter((e) => !e.adventurers);
  assert.ok(plain.filter((e) => e.options.some((o) => o.risky)).length >= plain.length * 0.6, "смелый вариант — у большинства событий");
  assert.ok(plain.filter((e) => e.options.some((o) => o.careful)).length >= plain.length * 0.8, "осторожный — почти у всех");
  for (const e of EVENTS) for (const o of e.options) if (o.later) assert.ok(o.later.seasons >= 1 && o.later.seasons <= 3 && o.later.text, `${e.id}.${o.id}`);
  assert.ok(opts.filter((o) => o.later).length >= 10, "вложений не меньше десяти");
});

test("осторожный вариант — и выигрыш, и цена меньше; смелый при удаче даёт больше, при провале бьёт", () => {
  // «Ссора челяди» у одного ключника: «Помирить» (Забота, осторожный: люди замка +1), «Выгнать зачинщика» (Долг, Дерзость, смелый: порядок +2, люди замка −1)
  const run = (high: Parameters<typeof fix>[1], riskBase: number) => {
    const w = open();
    setAt("exp.riskBase", riskBase); setAt("exp.riskSkill", 0);
    fix(holder(w, "klyuchnik")!, high);
    w.posts.desyatnik = null; holder(w, "klyuchnik"); w.people.find((p) => p.post === "desyatnik")!.post = undefined;
    return runEvent(w, event("chelyad"));
  };
  assert.deepEqual(run(["zabota"], 1).effects, { zamok: BALANCE.exp.carefulGain });
  assert.deepEqual(run(["dolg", "derzost"], 1).effects, { poryadok: 2 * BALANCE.exp.boldGain, zamok: -1 }, "удача: выигрыш в полтора раза, цена прежняя");
  const fail = run(["dolg", "derzost"], 0);
  assert.deepEqual(fail.effects, { poryadok: -2 * BALANCE.exp.failBackfire, zamok: -1 });
  assert.ok(said(fail.lines, "провалилось"));
});

test("смелый вариант чаще берёт дерзкий, осторожный — тот, у кого Дерзости мало", () => {
  const picks = (derzost: number) => {
    let bold = 0;
    for (let i = 0; i < 60; i++) {
      const w = open(`род-${i}`);
      const p = fix(holder(w, "klyuchnik")!, []);
      p.star = { dolg: 5, vygoda: 5, zabota: 5.5, derzost, obychai: 5 };
      w.posts.desyatnik = null; w.people.find((q) => q.post === "desyatnik")!.post = undefined;
      if (said(runEvent(w, event("chelyad")).lines, "Выгнать зачинщика")) bold++;
    }
    return bold;
  };
  assert.ok(picks(9) > picks(1) + 10, `дерзкий ${picks(9)}, робкий ${picks(1)} из 60`);
});

test("вложение: сейчас цена, отдача через сезоны строкой в ведомости; занятые руки возвращаются", () => {
  const w = open();
  const [a, b] = pair(w, "desyatnik", ["dolg", "obychai"], "lesnichiy", ["dolg", "obychai"], 8);  // «Засека»: поставить по старой меже — руки сейчас, порядок и лес потом
  for (const p of w.people.filter((x) => x.post)) for (const q of w.people.filter((x) => x.post)) if (p.id < q.id && !(p.id === a.id && q.id === b.id)) setRel(w, p.id, q.id, 3);
  const hands = handsNow(w).zamok, order = w.resources.poryadok;
  const e = runEvent(w, event("zaseka"));
  assert.ok(said(e.lines, "Вложение: отдача через 2 сез."), e.lines.join(" | "));
  assert.equal(handsNow(w).zamok, hands - 1, "руки людей замка заняты");
  assert.equal(w.eco.pending.length, 1);
  assert.equal(w.eco.pending[0].due, w.season + 2);
  assert.equal(w.resources.poryadok, order, "порядок пока прежний");
  const mult = e.effects!.zamok! / -1;                                    // с какой силой сделано дело — с той же придёт отдача
  assert.ok(Math.abs(w.eco.pending[0].effects.poryadok! - 2 * mult) <= 0.11, `отдача ${w.eco.pending[0].effects.poryadok} при силе ${mult}`);
  economySeason(w, []); w.season++;
  assert.equal(handsNow(w).zamok, hands, "через сезон руки вернулись");
  economySeason(w, []); w.season++;
  assert.equal(w.eco.pending.length, 1, "ещё не срок");
  const lines: string[] = [];
  economySeason(w, lines);
  assert.ok(said(lines, "Вложение дало отдачу: новая засека держит межу"), lines.join(" | "));
  assert.deepEqual(w.eco.pending, []);
  assert.ok(w.resources.poryadok > order);
  // отдача в запасах — строкой в ведомости
  const s = open();
  fix(holder(s, "starosta")!, ["zabota"]); fix(holder(s, "klyuchnik")!, ["zabota"]);
  runEvent(s, event("semena"));
  for (let i = 0; i < 3; i++) { economySeason(s, []); s.season++; }
  assert.ok(s.eco.last!.lines.some((l) => l.text.startsWith("отдача вложения") && l.cat === "eda" && l.v > 0), s.eco.last!.lines.map((l) => l.text).join(" | "));
});

test("провал смелого вложения: цена уплачена, отдачи нет", () => {
  const w = open();
  setAt("exp.riskBase", 0); setAt("exp.riskSkill", 0);
  pair(w, "starosta", ["derzost", "dolg"], "lesnichiy", ["derzost", "dolg"], 8);  // «Делянка у опушки»: расчистить — смелое вложение
  const e = runEvent(w, event("delyanka"));
  assert.ok(said(e.lines, "Вложение пропало"), e.lines.join(" | "));
  assert.deepEqual(w.eco.pending, []);
  assert.ok(e.effects!.les! <= -2, "цена уплачена сполна");
});

test("шкала исходов: договорились сильнее, компромисс и соперничество слабее, слаженный совет — сильнее, вражда — слабее", () => {
  const C = BALANCE.council;
  assert.ok(C.sabotage < C.compromise && C.compromise < C.rivalGain && C.rivalGain < 1 && 1 < C.dealGain && C.dealGain < C.synergy);
  assert.ok(C.feud < 1 && C.cohesion > 1);
  const steady = (rel: number) => {
    const w = open();
    const council = w.people.filter((p) => p.post);
    for (const p of council) for (const q of council) if (p.id < q.id) setRel(w, p.id, q.id, 3);
    const [a, b] = pair(w, "starosta", ["zabota", "obychai"], "desyatnik", ["zabota", "obychai"], rel);
    w.head = holder(w, "pisar")!.id;
    return { e: runEvent(w, event("plotina")), a, b };
  };
  const calm = steady(8).e;                                   // сошлись и ладят, совет слажен
  assert.ok(said(calm.lines, "Совет слажен"));
  assert.equal(calm.effects!.derevni, Math.round(2 * C.synergy * C.cohesion * 10) / 10);
  const w = open();
  pair(w, "starosta", ["zabota", "obychai"], "desyatnik", ["zabota", "obychai"], 8);
  const other = w.people.filter((p) => p.post && p.post !== "starosta" && p.post !== "desyatnik");
  setRel(w, other[0].id, other[1].id, BALANCE.rel.enemy);
  const feud = runEvent(w, event("plotina"));
  assert.ok(said(feud.lines, "В совете вражда"));
  assert.equal(feud.effects!.derevni, Math.round(2 * C.synergy * C.feud * 10) / 10, "чужая вражда портит и это дело");
});
