// Метрики хозяйства (docs/design/hozyaystvo.md): закрывается ли испытание, чем и с кого платят, как часто срабатывает недодача.
// Зовут tools/economy.ts и тесты. Партии играют боты (PAYERS).
import type { PayId, Side, Stock } from "../data/types";
import { SIDES, STOCKS, PAY } from "../data/economy";
import { BALANCE as B } from "./balance";
import { newWorld } from "./council/generate";
import type { World, AuthKind, Zone } from "./state";
import { bot, playBot, type Bot } from "./bots";
import { authorityCap } from "./authority";
import { economySeason } from "./economy/season";
import { zoneOf, patienceWord } from "./economy/zones";
import { mean, round2 } from "./util";

// Кто играет партии отчёта: боты (src/sim/bots.ts). «Ничего не трогает» — совет платит сам; «Хозяин» платит руками; дальше — его варианты платы.
export const PAYERS: Bot[] = ["idle", "master", "Х11", "Х13", "Х14"].map(bot);

export interface EconomyMetrics {
  seeds: number;
  seasons: number;
  years: number;
  closedByYear: number[];                 // доля партий, где урок года закрыт в срок
  closedAll: number;                      // доля партий, где закрыты все годы
  measuresBy: Partial<Record<PayId, number>>; // в среднем мер за партию по способам
  paidShare: number;                      // доля назначенного (без надбавок), что внесена
  shortages: number;                      // сезонов с недодачей на партию в среднем
  shortParties: number;                   // доля партий хотя бы с одной недодачей
  patience: Record<string, number>;       // доля партий по зонам терпения к концу
  zones: Record<Side, Record<Zone, number>>; // доля партий по зонам сторон к концу
  stock: Record<Stock, number>;           // запасы к концу, в среднем
  carried: number;                        // недоимка, перенесённая за конец, в среднем
  authority: { mean: number; min: number; max: number; atCap: number; low: number; by: Record<AuthKind, number> }; // авторитет к концу
}

const KINDS: AuthKind[] = ["support", "tax", "judge", "complaint", "feast", "order", "staff", "burn"];

export function economyMetrics(seeds: number, seasons: number, payer: Bot = PAYERS[0], prefix = "хозяйство"): EconomyMetrics {
  const worlds = Array.from({ length: seeds }, (_, i) => playBot(`${prefix}-${i}`, payer, seasons).w);
  const years = Math.floor((seasons + 1) / 4);  // сборщица приезжает на третий сезон года
  const hist = worlds.map((w) => w.eco.tax.history);
  const share = (f: (w: World) => boolean) => round2(worlds.filter(f).length / Math.max(1, seeds));
  const measuresBy: Partial<Record<PayId, number>> = {};
  for (const def of PAY) {
    const v = round2(mean(hist.map((h) => h.reduce((s, y) => s + (y.by[def.id] ?? 0), 0))));
    if (v) measuresBy[def.id] = v;
  }
  const lessons = Array.from({ length: years }, (_, y) => (y < B.economy.tax.trialYears ? B.economy.tax.trial : B.economy.tax.normal)).reduce((s, v) => s + v, 0);
  const zoneNames: Zone[] = ["заодно", "ладят", "терпят", "отказывают"];
  return {
    seeds, seasons, years,
    closedByYear: Array.from({ length: years }, (_, y) => round2(hist.filter((h) => h[y]?.closed).length / Math.max(1, seeds))),
    closedAll: share((w) => w.eco.tax.history.length > 0 && w.eco.tax.history.every((y) => y.closed)),
    measuresBy,
    paidShare: round2(mean(hist.map((h) => h.reduce((s, y) => s + y.paid, 0))) / Math.max(1, lessons)),
    shortages: round2(mean(worlds.map((w) => w.eco.shortages))),
    shortParties: share((w) => w.eco.shortages > 0),
    patience: Object.fromEntries(["благоволит", "ждёт", "недоволен", "на исходе"].map((z) => [z, share((w) => patienceWord(w.eco.tax.patience) === z)])),
    zones: Object.fromEntries(SIDES.map((s) => [s, Object.fromEntries(zoneNames.map((z) => [z, share((w) => zoneOf(w, s) === z)]))])) as EconomyMetrics["zones"],
    stock: Object.fromEntries(STOCKS.map((c) => [c, round2(mean(worlds.map((w) => w.eco.stock[c])))])) as Record<Stock, number>,
    carried: round2(mean(worlds.map((w) => w.eco.tax.carried))),
    authority: {
      mean: round2(mean(worlds.map((w) => w.authority))), min: Math.min(...worlds.map((w) => w.authority)), max: Math.max(...worlds.map((w) => w.authority)),
      atCap: share((w) => w.authority >= authorityCap(w)), low: share((w) => w.authority <= B.staff.authorityStart / 2),
      by: Object.fromEntries(KINDS.map((k) => [k, round2(mean(worlds.map((w) => w.auth.totals[k])))])) as Record<AuthKind, number>,
    },
  };
}

// Год без событий совета: все стороны в одной зоне, исполнители «как велено», подать не платится.
// Свободный доход в мерах — на сколько за год выросли запасы по курсам подати (товары — по цене купцов при «ладят»).
export function freeYear(zone: Zone, seed = "год"): { free: number; income: Record<Stock, number> } {
  const T = B.economy.trust, w = newWorld(seed);
  const trust = zone === "заодно" ? T.ally : zone === "ладят" ? T.friendly : zone === "терпят" ? (T.friendly + T.refuse) / 2 : T.refuse;
  for (const p of w.people) { p.loyalty = 0; p.aspiration = undefined; p.tenure = Math.min(p.tenure, B.exp.settled); }
  w.eco.autoPay = false;
  w.world.sim.weather = 1;   // год без событий — и без мира вокруг: погода ровная, состояний нет
  w.world.sim.active = [];
  const start = { ...w.eco.stock };
  let lack = 0;
  for (let s = 0; s < 4; s++) {
    for (const side of SIDES) w.factions[side] = trust;
    economySeason(w, []);
    // недоданное считается минусом: в прикидке запас может уйти ниже нуля
    for (const l of w.eco.last!.lines) if (l.text.startsWith("недодано")) lack += Number(l.text.match(/[\d.]+/)![0]) / (l.cat === "eda" ? B.economy.rate.eda : B.economy.rate.serebro);
    w.season++;
  }
  const income = Object.fromEntries(STOCKS.map((c) => [c, round2(w.eco.stock[c] - start[c])])) as Record<Stock, number>;
  const free = income.serebro / B.economy.rate.serebro + income.eda / B.economy.rate.eda + income.tovary * B.economy.flow.price / B.economy.rate.serebro - lack;
  return { free: round2(free), income };
}

// Замечания по хозяйству: то, что стоит показать автору.
export function economyNotes(base: EconomyMetrics, best: EconomyMetrics): string[] {
  const out: string[] = [];
  const G = B.economy.goal, ally = freeYear("заодно").free, friendly = freeYear("ладят").free;
  if (base.closedAll > G.plainMax) out.push(`испытание закрывается без жертв в ${Math.round(base.closedAll * 100)}% партий — по замыслу без жертв его не закрыть`);
  if (best.closedAll < G.bestMin) out.push(`даже с жертвами испытание закрыто целиком только в ${Math.round(best.closedAll * 100)}% партий`);
  if (ally > B.economy.tax.trial * G.allyFree) out.push(`«заодно со всеми» даёт ${ally} мер свободного дохода в год при уроке испытания ${B.economy.tax.trial}: товары множатся дважды — подумать о потолке`);
  if (friendly > B.economy.tax.normal) out.push(`при «ладят со всеми» свободный доход ${friendly} мер выше обычного урока ${B.economy.tax.normal}: обычный урок не давит`);
  return out;
}
