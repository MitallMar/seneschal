// Люди совета: поправки черт (ключевой и нажитых), отношения пар, подстановки в текстах. Общее для остальных модулей совета.
import type { Axis, Star, Trait, TraitMods } from "../../data/types";
import { AXES } from "../../data/core";
import { clamp } from "../util";
import { REL_MAX, relKey, getRel } from "../state";
import type { Person, World } from "../state";

// Поправки черт человека: ключевая и приобретённые вместе. Черта с целью действует только против своей цели (vs).
type ModKey = Exclude<keyof TraitMods, "grudge" | "loyalty">;

export function activeTraits(p: Person, vs?: Person): Trait[] {
  return [p.trait, ...p.gained.filter((g) => !g.trait.targeted || g.target === vs?.id).map((g) => g.trait)];
}

export function mod(p: Person, key: ModKey, vs?: Person): number {
  return activeTraits(p, vs).reduce((s, t) => s + (t.mods[key] ?? 0), 0);
}

function grudge(p: Person, vs?: Person): number {
  return activeTraits(p, vs).reduce((s, t) => s * (t.mods.grudge ?? 1), 1);
}

export function addRel(w: World, a: number, b: number, d: number) {
  const pa = w.people[a], pb = w.people[b];
  const g = d < 0 ? Math.max(grudge(pa, pb), grudge(pb, pa)) : 1;
  w.rel.set(relKey(a, b), clamp(getRel(w, a, b) + d * g, -REL_MAX, REL_MAX));
}

export function gender(text: string, p: Person, other?: Person): string {
  return text
    .replace(/\{name\}/g, p.name)
    .replace(/\{other\}/g, other ? other.name : "соседом")
    .replace(/\{oа\}/g, other?.female ? "а" : "")
    .replace(/\{а\}/g, p.female ? "а" : "")
    .replace(/\{ся\}|\{ась\}/g, p.female ? "ась" : "ся")
    .replace(/\{он\}/g, p.female ? "она" : "он")
    .replace(/\{его\}/g, p.female ? "её" : "его")
    .replace(/\{ему\}/g, p.female ? "ей" : "ему");
}

export function addStar(star: Star, shift: Partial<Star>, k = 1) {
  for (const a of AXES) if (shift[a]) star[a] += shift[a]! * k;
}

export const noAxes = (): Record<Axis, number> => ({ dolg: 0, vygoda: 0, zabota: 0, derzost: 0, obychai: 0 });

// «к Остапу», «к Ведане»: дательный падеж имени для черты с целью
export const dative = (name: string) => (name.endsWith("а") ? `${name.slice(0, -1)}е` : `${name}у`);

export const lower = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);
