// Кризисы сторон и внеочередной сбор (задача И14, замысел — docs/design/hozyaystvo.md, раздел 9).
// Сторона несколько сезонов подряд «отказывает» — кризис встаёт в очередь и ложится на стол Сенешаля как дело сезона:
// его решает совет (или приказ), а после остаётся шрам — поток стороны ниже, пока не заживёт.
import type { Side } from "../../data/types";
import { SIDE_NAMES } from "../../data/economy";
import { CRISES, CRISIS_SIDES, LEVY, type CrisisDef } from "../../data/fall";
import { BALANCE as B } from "../balance";
import { holder, postName } from "../state";
import type { World, Decree } from "../state";
import { addAuthority } from "../authority";
import { addTrust, zoneOf, patienceWord, seasonKind, AUTUMN } from "../economy/zones";
import { baronStep, scarOf, crisisNow } from "./base";

export const crisisDef = (side: Side): CrisisDef => CRISES.find((c) => c.side === side)!;
export const crisisByEvent = (eventId: string): CrisisDef | undefined => CRISES.find((c) => c.event.id === eventId);

// Сколько сезонов держится шрам после выхода: мягкий выход — короче.
export const scarSeasons = (light: boolean): number => Math.max(1, Math.ceil(B.fall.scarSeasons * (light ? B.fall.scarLight : 1)));

// Конец сезона: счёт отказов; дошёл до срока — кризис в очередь. Возвращает: случились ли два кризиса сразу.
export function crisisTick(w: World, lines: string[]): boolean {
  const f = w.fall, was = crisisNow(w);
  let started = 0;
  for (const side of CRISIS_SIDES) {
    f.refuse[side] = zoneOf(w, side) === "отказывают" ? (f.refuse[side] ?? 0) + 1 : 0;
    if (f.refuse[side]! < B.fall.refuseSeasons || f.queue.includes(side) || scarOf(w, side)) continue;
    f.queue.push(side);
    started++;
    lines.push(`⚠ ${SIDE_NAMES[side]}: «отказывают» ${f.refuse[side]}-й сезон подряд — кризис. Дело ляжет на стол Сенешаля.`);
  }
  return started >= 2 || (started === 1 && was);
}

// Кризис разрешился: выход optId (нет — делом никто не занялся). Шрам, цена выхода, доверие стороны выше порога отказа.
export function resolveCrisis(w: World, def: CrisisDef, optId: string | undefined, lines: string[]): void {
  const F = B.fall, f = w.fall, exit = optId ? def.exits[optId] : undefined, name = SIDE_NAMES[def.side];
  const seasons = scarSeasons(exit?.scar === "light");
  if (exit?.authority) {
    addAuthority(w, exit.authority, `кризис: ${name.toLowerCase()} — договаривались через голову Сенешаля`, "fall");
    lines.push(`Договорились, но не Сенешаль: авторитет ${exit.authority}.`);
  }
  if (exit?.dutyCut) { w.eco.dutyCutUntil = Math.max(w.eco.dutyCutUntil, w.season + F.scarSeasons); lines.push("Пошлины по новому договору ниже."); }
  if (!exit) {
    for (const s of CRISIS_SIDES) if (s !== def.side) addTrust(w, s, F.emptyTrust);
    lines.push("Кризис прошёл сам, как сумел: остальные стороны это видели и запомнили.");
  }
  // малое колесо отдаёт назад: о смуте в баронстве узнают при дворе
  if (def.side !== "dvor" && F.crisisDvor > 0) { addTrust(w, "dvor", -F.crisisDvor); lines.push("При дворе узнали о смуте в баронстве: двор доверяет меньше."); }
  if (w.factions[def.side] < F.afterTrust) w.factions[def.side] = F.afterTrust;
  f.queue = f.queue.filter((s) => s !== def.side);
  f.refuse[def.side] = 0;
  f.crises.push({ side: def.side, season: w.season, exit: optId ?? "", scarUntil: w.season + 1 + seasons, under: !!f.under });
  lines.push(`Шрам: ${def.scar}. Держится ${seasons} сез.`);
  if (f.under) {
    baronStep(w, "zemlya", F.stepCrisis);
    lines.push(`Земля не принимает барона ${f.under.baron.name}: его срок короче на ${F.stepCrisis} сез.`);
  }
}

// Внеочередной сбор: после недоимки, когда Герцог недоволен, проситель выбивает его при дворе. Ложится на стол как указ.
export function maybeLevy(w: World, lines: string[]): void {
  const F = B.fall, f = w.fall, word = patienceWord(w.eco.tax.patience);
  if (!arrearsNow(w) || F.levy <= 0 || (word !== "недоволен" && word !== "на исходе")) return;
  if ((f.levyAt && w.season - f.levyAt < F.levyGap) || w.world.decrees.some((d) => d.levy)) return;
  const pisar = holder(w, "pisar"), g = w.world;
  const d: Decree = {
    id: g.nextId++, def: LEVY.id, state: "", title: LEVY.title, text: LEVY.text, accepts: LEVY.accepts,
    due: F.levy, paid: 0, by: {}, council: 0, post: "pisar", note: pisar ? `${postName("pisar").toLowerCase()} ${pisar.name}` : "никто: писаря нет",
    issued: w.season, until: w.season + F.levyTerm, levy: true,
  };
  g.decrees.push(d);
  f.levyAt = w.season;
  lines.push(`📯 ${LEVY.title}: ${d.due} мер за ${F.levyTerm} сез. Проситель выбил его при дворе; не закрыть — баронство отдадут другому.`);
}

// Недоимка этой осенью: сборщица только что уехала с недобором.
export function arrearsNow(w: World): boolean {
  const t = w.eco.tax, last = t.history[t.history.length - 1];
  return seasonKind(w.season) === AUTUMN && !!last && !last.closed && last.year === t.year;
}
