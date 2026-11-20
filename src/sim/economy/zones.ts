// Стороны и зоны: слово и множитель потока по доверию стороны, терпение Герцога словом, время года.
import type { Side, Village } from "../../data/types";
import { VILLAGES } from "../../data/economy";
import { BALANCE as B } from "../balance";
import { clamp, round1 } from "../util";
import type { World, Zone } from "../state";
import { orderMods } from "../order";
import { scarMult } from "../fall/base";

export const seasonKind = (season: number) => (season - 1) % 4;   // 0 весна, 1 лето, 2 осень, 3 зима
export const AUTUMN = 2, WINTER = 3, SUMMER = 1, SPRING = 0;


export function zoneWord(v: number): Zone {
  const T = B.economy.trust;
  return v >= T.ally ? "заодно" : v >= T.friendly ? "ладят" : v > T.refuse ? "терпят" : "отказывают";
}
export const zoneOf = (w: World, side: Side): Zone => zoneWord(w.factions[side]);
export function zoneMult(w: World, side: Side): number {
  const Z = B.economy.zone, z = zoneOf(w, side);
  // шрам кризиса: поток стороны ниже, пока не заживёт
  return (z === "заодно" ? Z.ally : z === "ладят" ? Z.friendly : z === "терпят" ? Z.tolerate : Z.refuse) * scarMult(w, side);
}
export function addTrust(w: World, side: Side, d: number): number {
  const max = B.economy.trust.max, was = w.factions[side];
  // порядок: на вольном краю доверие деревень растёт легче, на строгом — медленнее; при твёрдой руке деревни не выше «ладят»
  const village = side === "brod" || side === "opushka", O = village && d > 0 ? orderMods(w) : undefined;
  const top = O?.villageCap ? Math.max(was, Math.floor(B.economy.trust.ally * 10 - 1) / 10) : max;
  w.factions[side] = round1(clamp(was + d * (O?.villageGain ?? 1), -max, Math.min(max, top)));
  return round1(w.factions[side] - was);
}
// Последствие «деревни» из события, вложения или вестей: названной деревне — целиком, общее — каждой из двух её долю (ручка trust.both).
export function addVillages(w: World, v: number, village?: Village): void {
  const T = B.economy.trust;
  if (village) addTrust(w, village, v * T.event);
  else for (const side of VILLAGES) addTrust(w, side, v * T.event * T.both);
}
export function patienceWord(v: number): "благоволит" | "ждёт" | "недоволен" | "на исходе" {
  const T = B.economy.tax;
  return v >= T.favor ? "благоволит" : v >= T.waits ? "ждёт" : v >= T.displeased ? "недоволен" : "на исходе";
}
