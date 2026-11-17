// Общее для тестов логики: отпечаток партии и подготовка спора двоих в совете.
import { createHash } from "node:crypto";
import type { Axis, PostId, Star, Trait } from "../src/data/types";
import { AXES } from "../src/data/core";
import { BALANCE } from "../src/sim/balance";
import { holder, setRel, type Person, type World } from "../src/sim/sim";

// Партия одним текстом: всё состояние, кроме генератора случайных чисел.
export function dump(w: World): string {
  return JSON.stringify({ ...w, rng: undefined, rel: [...w.rel] });
}
export const digest = (text: string): string => createHash("sha256").update(text).digest("hex").slice(0, 16);

export const star = (high: Axis[]): Star => Object.fromEntries(AXES.map((a) => [a, high.includes(a) ? 10 : 0])) as Star;

// Черта без поправок: решение считается только по звезде, без добавки к случайности и мягкости.
const PLAIN: Trait = { id: "plain", name: "Ровный", desc: "черта для тестов", star: {}, mods: {} };

// Человек, чьё решение известно заранее: звезда из десяток и нулей, мастер на должности, без метки, наказа и стремления.
export function fix(p: Person, high: Axis[]): Person {
  p.star = star(high);
  p.trait = PLAIN;
  p.mark = undefined;
  p.order = undefined;
  p.aspiration = undefined;
  p.exp = BALANCE.exp.master;
  p.tenure = BALANCE.exp.master;
  return p;
}

// Двое держателей должностей с заданными склонностями и отношениями; главного нет, пока тест его не назначит.
export function pair(w: World, postA: PostId, highA: Axis[], postB: PostId, highB: Axis[], rel: number): [Person, Person] {
  const a = fix(holder(w, postA)!, highA);
  const b = fix(holder(w, postB)!, highB);
  setRel(w, a.id, b.id, rel);
  w.head = null;
  return [a, b];
}
