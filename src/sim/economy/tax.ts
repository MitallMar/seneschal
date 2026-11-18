// Урок года: новый год подати, плата по умолчанию осенью и сборщица.
import { BALANCE as B } from "../balance";
import { addAuthority } from "../authority";
import { PROBE } from "../probe";
import { clamp, round1, round2 } from "../util";
import { STAR_MAX } from "../state";
import type { World } from "../state";
import { zoneMult, patienceWord } from "./zones";
import { taxLeft, payTax } from "./pay";

export function lessonOf(year: number): number {
  return year <= B.economy.tax.trialYears ? B.economy.tax.trial : B.economy.tax.normal;
}
export function newTaxYear(w: World): string {
  const t = w.eco.tax;
  t.year++;
  t.lesson = lessonOf(t.year);
  t.due = round1(t.lesson + t.carried);
  t.paid = 0; t.early = false; t.by = {};
  const trial = t.year <= B.economy.tax.trialYears ? " (испытание)" : "";
  return `Герцог объявил урок на год${trial}: ${t.lesson} мер${t.carried ? ` и недоимка ${t.carried}` : ""} — к осени ${t.due}.`;
}
// Плательщик по умолчанию: остаток урока закрывает серебром из казны, потом зерном из амбара — не ниже нижних черт.
export function autoPayTax(w: World, lines: string[]): number {
  const e = w.eco, E = B.economy;
  let paid = 0;
  paid += payTax(w, "serebro", (e.stock.serebro - e.floor.serebro) / E.rate.serebro, lines);
  paid += payTax(w, "eda", (e.stock.eda - e.floor.eda) / E.rate.eda, lines);
  return round1(paid);
}

// Осень: сборщица считает урок. Закрыт — терпение растёт; нет — недоимка с надбавкой уходит на следующий год.
export function collect(w: World, lines: string[]): void {
  const T = B.economy.tax, t = w.eco.tax, left = taxLeft(w);
  if (left > 0 && w.eco.autoPay) {
    const sub: string[] = [];
    const auto = autoPayTax(w, sub);
    PROBE.autoPaid += auto;
    if (auto) lines.push(`Совет сам закрывает урок, не трогая нижних черт. ${sub.filter((x) => !x.startsWith("Осталось") && !x.startsWith("Урок")).join(" ")}`);
  }
  const rest = taxLeft(w), closed = rest <= 0;
  if (closed) {
    t.carried = 0;
    t.patience = round2(clamp(t.patience + (t.early ? T.early : T.onTime), 0, STAR_MAX));
    lines.push(`📜 Сборщица податей приняла урок${t.early ? " — внесён досрочно" : ""}: ${t.paid} мер из ${t.due}. Герцог ${patienceWord(t.patience)}.`);
    addAuthority(w, t.early ? B.authority.taxEarly : B.authority.taxOnTime, t.early ? "подать закрыта досрочно" : "подать закрыта в срок", "tax");
  } else {
    t.carried = round1(rest * (1 + T.arrears));
    addAuthority(w, -B.authority.taxArrears, "недоимка: слово Герцогу не сдержано", "tax");
    const loss = T.arrearsPatience * Math.max(0, 1 + T.dvor * (1 - zoneMult(w, "dvor")));
    t.patience = round2(clamp(t.patience - loss, 0, STAR_MAX));
    lines.push(`📜 Сборщица податей уехала с недобором: внесено ${t.paid} мер из ${t.due}. Недоимка ${rest} с надбавкой — ${t.carried} — ляжет на следующий год.`);
    lines.push(`${patienceWord(t.patience) === "на исходе" ? "⚠ Терпение Герцога на исходе." : `Герцог ${patienceWord(t.patience)}.`}`);
  }
  t.history.push({ year: t.year, due: t.due, paid: t.paid, closed, early: closed && t.early, by: { ...t.by } });
}
