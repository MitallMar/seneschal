// Способы платить «чем и с кого»: курс, предел и что плата меняет в запасах, доверии и руках.
import type { Stock, Category, HandsFrom, PayId, PayDef } from "../../data/types";
import { SIDE_NAMES, CATEGORY_NAMES, PAY, SEASON_NAMES } from "../../data/economy";
import { BALANCE as B } from "../balance";
import { clamp, round1, round2 } from "../util";
import { STAR_MAX } from "../state";
import type { World } from "../state";
import { seasonKind, AUTUMN, zoneOf, zoneMult, addTrust } from "./zones";
import { levers } from "./doer";
import { handsNow } from "./plan";
import { floor1, addLine } from "./ledger";

export const taxLeft = (w: World): number => round1(Math.max(0, w.eco.tax.due - w.eco.tax.paid));

// Почерк писаря по Дерзости: заём больше и лихва меньше во столько раз.
const loanEase = (w: World): number => Math.max(1, 1 + levers(w).loan * B.economy.hand.flow * 2);

export interface PayOption { def: PayDef; rate: number; max: number; blocked?: string }
// Счёт в мерах: урок подати или указ Герцога. accepts — какие категории берут в уплату (нет — любые); title — как назвать в ведомости.
export interface Bill { due: number; paid: number; by: Partial<Record<PayId, number>>; accepts?: Category[]; title?: string }
export const billLeft = (b: Bill): number => round1(Math.max(0, b.due - b.paid));
// Чем и с кого можно закрыть остаток счёта прямо сейчас: курс (единиц за меру) и предел в мерах. Без счёта — урок подати.
export function payOptions(w: World, bill: Bill = w.eco.tax): PayOption[] {
  const E = B.economy, e = w.eco, left = billLeft(bill), hands = handsNow(w);
  const used = (id: PayId) => bill.by[id] ?? 0;
  return PAY.filter((def) => !bill.accepts || bill.accepts.includes(def.what)).map((def) => {
    let rate = E.rate[def.what === "lyudi" ? "lyudi" : def.what], max = 0, blocked: string | undefined;
    const refuses = def.side && zoneOf(w, def.side) === "отказывают";
    if (def.id === "serebro" || def.id === "eda" || def.id === "tovary") max = e.stock[def.what as Stock] / rate;
    else if (def.id === "sbor_kuptsy") max = E.pay.levyCap - used(def.id);
    else if (def.id === "zaem") {
      max = E.pay.loanCap * loanEase(w) - e.debts.reduce((s, d) => s + d.sum, 0) / (1 + E.pay.loanInterest);
      if (zoneMult(w, "kuptsy") < E.zone.friendly) blocked = "в долг дают только тем, с кем ладят";
    } else if (def.id === "sverh_brod" || def.id === "sverh_opushka") max = E.pay.extraCap - used(def.id);
    else if (def.id === "volnye") { rate = E.rate.volnye; max = E.pay.vagrantCap - used(def.id); }
    else max = hands[def.side as HandsFrom] / rate;
    if (refuses) blocked = `${SIDE_NAMES[def.side!].toLowerCase()}: отказывают`;
    max = blocked ? 0 : floor1(clamp(max, 0, left));
    return { def, rate, max, blocked };
  });
}

// Закрыть часть счёта: measures мер способом id. Без счёта — урок подати. Возвращает, сколько мер ушло на деле.
export function payTax(w: World, id: PayId, measures: number, lines?: string[], bill: Bill = w.eco.tax): number {
  const E = B.economy, e = w.eco, t = e.tax, isTax = bill === t;
  const opt = payOptions(w, bill).find((o) => o.def.id === id);
  const m = opt ? floor1(Math.min(Number(measures) || 0, opt.max)) : 0;
  if (!opt || m <= 0) return 0;
  const units = round2(m * opt.rate), def = opt.def, out: string[] = [];
  const toTax = isTax ? `в подать, ${m} мер` : `по указу «${bill.title}», ${m} мер`;
  if (id === "serebro" || id === "eda" || id === "tovary") addLine(w, { cat: def.what, v: -units, text: toTax, side: "dvor" });
  else if (id === "sbor_kuptsy") {
    addTrust(w, "kuptsy", -E.pay.levyTrust * m);
    e.dutyCutUntil = w.season + SEASON_NAMES.length;
    addLine(w, { cat: "serebro", v: 0, text: `особый сбор с купцов — ${toTax}`, side: "kuptsy" });
  } else if (id === "zaem") {
    const back = round2(units * (1 + E.pay.loanInterest / loanEase(w)));
    e.debts.push({ due: w.season + E.pay.loanTerm, sum: back });
    addLine(w, { cat: "serebro", v: 0, text: `заём у купцов — ${toTax}; вернуть ${back}`, side: "kuptsy" });
  } else if (id === "sverh_brod" || id === "sverh_opushka") {
    addTrust(w, def.side!, -E.pay.extraTrust * m);
    addLine(w, { cat: "eda", v: 0, text: `зерно сверх оброка — ${toTax}`, side: def.side });
  } else if (id === "volnye") {
    w.resources.poryadok = round1(w.resources.poryadok + E.pay.vagrantOrder * m);
    t.patience = round2(clamp(t.patience - E.pay.vagrantPatience * m, 0, STAR_MAX));
    addLine(w, { cat: "lyudi", v: 0, text: `вольные и бродяги из корчмы — ${toTax}` });
  } else {
    const from = def.side as HandsFrom;
    e.recruits.push({ from, hands: units, until: w.season + E.pay.recruitSeasons });
    if (from === "zamok") {
      addTrust(w, "zamok", -E.pay.castleTrust * units);
      w.resources.poryadok = round1(w.resources.poryadok - E.pay.castleOrder * units);
    } else addTrust(w, from, -E.pay.recruitTrust * units);
    addLine(w, { cat: "lyudi", v: -units, text: `рекруты на год — ${toTax}`, side: from });
  }
  bill.paid = round1(bill.paid + m);
  bill.by[id] = round1((bill.by[id] ?? 0) + m);
  out.push(`${def.name}: ${m} мер (${units} ${CATEGORY_NAMES[def.what].toLowerCase()}). Больно ${def.hurts}.`);
  if (billLeft(bill) <= 0) {
    if (isTax) t.early = seasonKind(w.season) < AUTUMN;
    out.push(!isTax ? "Указ исполнен." : t.early ? "Урок закрыт досрочно." : "Урок закрыт.");
  } else out.push(`Осталось ${billLeft(bill)} мер из ${bill.due}.`);
  if (lines) lines.push(...out);
  else w.log.push({ season: w.season, kind: "staff", title: isTax ? "Подать" : `Указ: ${bill.title}`, lines: out });
  return m;
}
