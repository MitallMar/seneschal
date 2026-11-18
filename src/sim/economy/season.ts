// Начало партии и сезон хозяйства: применяет план, недодача, осенний сбор, курс и старосты двигают доверие, зимой новый урок.
import type { Axis, Star } from "../../data/types";
import { AXES, OPPOSED, TRAITS } from "../../data/core";
import { SIDES, VILLAGES, SIDE_NAMES, CATEGORY_NAMES, ELDERS, STOCKS } from "../../data/economy";
import { BALANCE as B } from "../balance";
import { PROBE } from "../probe";
import { clamp, round1, round2 } from "../util";
import { holder, topAxis, STAR_MAX, REL_MAX } from "../state";
import type { World, Person, Elder, Economy } from "../state";
import { seasonKind, AUTUMN, WINTER, SPRING, zoneWord, zoneOf, addTrust } from "./zones";
import { levers } from "./doer";
import { fieldHands, planSeason } from "./plan";
import { settle } from "./ledger";
import { newTaxYear, collect } from "./tax";

// ---------- Начало партии ----------

export function initEconomy(w: World): Economy {
  const S = B.economy.start;
  const elders: Elder[] = ELDERS.map((e) => {
    const trait = TRAITS.find((t) => t.id === e.trait)!;
    const star = {} as Star;
    for (const a of AXES) star[a] = B.star.base + w.rng.range(0, B.star.baseRandom) + (trait.star[a] ?? 0);
    const mean = AXES.reduce((t, a) => t + star[a], 0) / AXES.length;
    for (const a of AXES) star[a] = round1(clamp(B.star.center + (star[a] - mean) * B.star.spread, B.star.floor, STAR_MAX));
    // отношения старосты с каждым, кто может стать тиуном: как у людей хозяйства на старте — трение осей и общая ведущая ось
    const rel = w.people.map((p) => {
      let v = w.rng.range(-B.rel.startSpread, B.rel.startSpread);
      for (const [x, y] of OPPOSED) {
        const from = B.rel.opposedFrom;
        if ((star[x] >= from && p.star[y] >= from) || (star[y] >= from && p.star[x] >= from)) v -= B.rel.opposedPenalty;
      }
      if (topAxis(star) === topAxis(p.star)) v += B.rel.sameTop;
      return round1(v);
    });
    return { side: e.side, name: e.name, female: e.female, age: e.age, trait, star, rel };
  });
  const eco: Economy = {
    stock: { eda: S.eda, tovary: S.tovary, serebro: S.serebro },
    floor: { eda: S.floorEda, serebro: S.floorSerebro }, feedFirst: "zamok",
    course: null, courseSeasons: 0, shaky: false, sown: 1, recruits: [], dutyCutUntil: 0, debts: [], autoPay: true,
    tax: { year: 0, lesson: 0, carried: 0, due: 0, paid: 0, early: false, by: {}, patience: S.patience, history: [] },
    elders, last: null, cur: [], shortages: 0, fc: { eda: 0, tovary: 0, serebro: 0 }, zoneWas: {}, pending: [],
  };
  for (const s of SIDES) eco.zoneWas[s] = zoneWord(w.factions[s]);
  w.eco = eco;
  newTaxYear(w);
  rollForecast(w);
  return eco;
}

// ---------- Сезон ----------

// Староста деревни видел решение тиуна: по его ведущей склонности — отношения лучше, против неё — хуже.
export function elderSaw(w: World, tiun: Person, axes: Axis[]): void {
  for (const el of w.eco.elders) {
    const top = topAxis(el.star);
    const against = OPPOSED.some(([x, y]) => (x === top && axes.includes(y)) || (y === top && axes.includes(x)));
    const d = axes.includes(top) ? B.economy.trust.elderStep : against ? -B.economy.trust.elderStep : 0;
    el.rel[tiun.id] = round1(clamp(el.rel[tiun.id] + d, -REL_MAX, REL_MAX));
  }
}

// Конец сезона: потоки, недодача, осенью сборщица, зимой новый урок. Заметное пишет в lines — итог сезона в летописи.
export function economySeason(w: World, lines: string[]): void {
  const E = B.economy, e = w.eco, kind = seasonKind(w.season);
  const before = e.last ? { ...e.last.after } : { eda: E.start.eda, tovary: E.start.tovary, serebro: E.start.serebro };
  settle(w, lines);
  const hands = fieldHands(w), plan = planSeason(w);
  e.stock = plan.stock;
  e.sown = plan.sown;
  e.cur.push({ cat: "lyudi", v: 0, text: `всего ${hands.total}: в поле ${hands.field} из ${E.hands.field}${hands.build ? `, на стройке ${hands.build}` : ""}, свободно ${round1(hands.free - hands.build)}` });
  e.cur.push(...plan.lines);
  if (kind === SPRING && plan.sown < 1) lines.push(`Посевная: рук в поле хватило на ${Math.round(plan.sown * 100)}% поля — урожай осенью будет меньше.`);
  if (kind === AUTUMN) lines.push(`Жатва: в амбар легло ${plan.harvest} еды.`);
  // недодача: сторона обижена
  if (plan.short.length) e.shortages++;
  if (plan.short.length) PROBE.short.seasons++;
  const L = levers(w), H = E.hand;
  for (const s of plan.short) {
    PROBE.short[s.cat === "eda" ? "food" : "silver"] += s.v;
    // почерк тиуна по Заботе: недодача деревням мягче
    const soft = s.side === "brod" || s.side === "opushka" ? Math.max(0, 1 + L.shortSoft * H.flow * 2) : 1;
    PROBE.short.trust += -addTrust(w, s.side, -E.trust.short * s.v * soft);
    let note = `⚠ Недодача: ${s.what} — не хватило ${s.v} (${CATEGORY_NAMES[s.cat].toLowerCase()}). ${SIDE_NAMES[s.side]}: доверие падает.`;
    if (s.cat === "serebro" && s.side === "zamok") {
      w.resources.poryadok = round1(w.resources.poryadok - E.trust.shortOrder * s.v);
      PROBE.short.order += E.trust.shortOrder * s.v;
      note += " Стража расходится — порядка меньше.";
    }
    if (s.side === "kuptsy") { addTrust(w, "kuptsy", -E.pay.loanDefault * s.v); note += " Долг не вернули — купцы этого не простят."; }
    lines.push(note);
    e.cur.push({ cat: s.cat, v: 0, text: `недодано ${s.v}: ${s.what}`, side: s.side });
  }
  e.debts = e.debts.filter((d) => d.due > w.season);
  e.recruits = e.recruits.filter((r) => r.until > w.season + 1);
  if (kind === AUTUMN) collect(w, lines);
  // курс и старосты двигают доверие сторон
  const ct = E.course.trust;
  if (e.course === "kopim") for (const v of VILLAGES) addTrust(w, v, -ct);
  if (e.course === "polegche") for (const v of VILLAGES) addTrust(w, v, ct);
  if (e.course === "les") addTrust(w, "les", ct);
  if (e.course === "torguem") addTrust(w, "kuptsy", ct);
  if (e.course === "stroimsya") { addTrust(w, "zamok", ct); for (const v of VILLAGES) addTrust(w, v, -ct); }
  if (e.course === "dorogi") w.resources.poryadok = round1(w.resources.poryadok + E.course.order);
  // почерки совета двигают доверие сторон, порядок и терпение Герцога
  for (const v of VILLAGES) addTrust(w, v, (L.villages + (v === "opushka" ? L.opushka : 0)) * H.trust);
  for (const side of ["zamok", "kuptsy", "les", "dvor"] as const) addTrust(w, side, L[side] * H.trust);
  w.resources.poryadok = round1(w.resources.poryadok + L.order * H.order);
  e.tax.patience = round2(clamp(e.tax.patience + L.patience * H.patience, 0, STAR_MAX));
  const tiun = holder(w, "starosta");
  if (tiun) for (const el of e.elders) addTrust(w, el.side, el.rel[tiun.id] * E.trust.elder);
  for (const s of SIDES) {
    w.factions[s] = round1(w.factions[s] * E.trust.fade);
    const now = zoneOf(w, s);
    if (e.zoneWas[s] !== now) lines.push(`${SIDE_NAMES[s]}: теперь «${now}» (было «${e.zoneWas[s]}»).`);
    e.zoneWas[s] = now;
  }
  e.last = { season: w.season, before, after: { ...e.stock }, lines: e.cur };
  e.cur = [];
  if (e.course) e.courseSeasons++;
  if (e.courseSeasons >= E.course.shaky) e.shaky = false;
  if (kind === WINTER) lines.push(`📜 ${newTaxYear(w)}`);
}
// Раз в сезон счетовод ошибается в свою сторону: вызывается, когда сезон уже сменился.
export function rollForecast(w: World): void {
  for (const c of STOCKS) w.eco.fc[c] = round2(w.rng.range(-1, 1));
}
