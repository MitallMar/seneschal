// Стороны и зоны: слово и множитель потока по доверию стороны, терпение Герцога словом, время года.
import type { Side } from "../../data/types";
import { BALANCE as B } from "../balance";
import { clamp, round1 } from "../util";
import type { World, Zone } from "../state";
import { orderMods } from "../order";

export const seasonKind = (season: number) => (season - 1) % 4;   // 0 весна, 1 лето, 2 осень, 3 зима
export const AUTUMN = 2, WINTER = 3, SUMMER = 1, SPRING = 0;


export function zoneWord(v: number): Zone {
  const T = B.economy.trust;
  return v >= T.ally ? "заодно" : v >= T.friendly ? "ладят" : v > T.refuse ? "терпят" : "отказывают";
}
export const zoneOf = (w: World, side: Side): Zone => zoneWord(w.factions[side]);
export function zoneMult(w: World, side: Side): number {
  const Z = B.economy.zone, z = zoneOf(w, side);
  return z === "заодно" ? Z.ally : z === "ладят" ? Z.friendly : z === "терпят" ? Z.tolerate : Z.refuse;
}
export function addTrust(w: World, side: Side, d: number): number {
  const max = B.economy.trust.max, was = w.factions[side];
  // порядок: на вольном краю доверие деревень растёт легче, на строгом — медленнее; при твёрдой руке деревни не выше «ладят»
  const village = side === "brod" || side === "opushka", O = village && d > 0 ? orderMods(w) : undefined;
  const top = O?.villageCap ? Math.max(was, Math.floor(B.economy.trust.ally * 10 - 1) / 10) : max;
  w.factions[side] = round1(clamp(was + d * (O?.villageGain ?? 1), -max, Math.min(max, top)));
  return round1(w.factions[side] - was);
}
export function patienceWord(v: number): "благоволит" | "ждёт" | "недоволен" | "на исходе" {
  const T = B.economy.tax;
  return v >= T.favor ? "благоволит" : v >= T.waits ? "ждёт" : v >= T.displeased ? "недоволен" : "на исходе";
}
