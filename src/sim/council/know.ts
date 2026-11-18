// Знание о людях и слова для экрана: что Сенешаль знает о человеке, годность словом, мнение главного, слова об отношениях, лояльности и опыте.
import type { Axis, PostId, Trait } from "../../data/types";
import { AXES, AXIS_DAT, POSTS } from "../../data/core";
import { BALANCE as B } from "../balance";
import { round1 } from "../util";
import { getRel, fitness } from "../state";
import type { Person, World } from "../state";
import { dative } from "./people";

export function relWord(v: number): string {
  if (v >= B.rel.ally) return "заодно";
  if (v >= B.rel.friendly) return "ладят";
  if (v > B.rel.rival) return "терпят";
  if (v > B.rel.enemy) return "соперники";
  return "враги";
}

export function loyaltyWord(v: number): string {
  if (v >= B.loyalty.devoted) return "предан";
  if (v >= B.loyalty.trusts) return "доверяет";
  if (v > B.loyalty.unhappy) return "служит";
  if (v > B.loyalty.bitter) return "недоволен";
  return "озлоблен";
}

export function expWord(p: Person): string {
  if (!p.post) return "—";
  if (p.exp >= B.exp.master) return "мастер";
  if (p.exp >= B.exp.settled) return "освоился";
  return "новичок";
}

// Прогноз словами — только из того, что Сенешаль знает: самая сильная из известных склонностей.
export function forecast(p: Person): string {
  const known = AXES.filter((a) => axisKnown(p, a));
  if (!known.length) return "пока непонятно, как поступит";
  const best = known.reduce((x, a) => (p.star[a] > p.star[x] ? a : x), known[0]);
  if (p.star[best] < B.know.strong) return "сильных склонностей пока не видно";
  return `скорее всего, будет действовать по ${AXIS_DAT[best]}`;
}

// Сводка: читается ли персонаж как личность
export function consistency(p: Person): number {
  return p.decisions ? Math.round((p.matchedTop / p.decisions) * 100) : 0;
}

// Всё, что экран показывает игроку о человеке, идёт через эти функции: числа звезды наружу не выходят.

export function axisWord(v: number): string {
  return v >= B.know.strong ? "сильно" : v >= B.know.notable ? "заметно" : "слабо";
}

// Ось известна: рассказал сам (третий разговор) или насмотрелись в деле.
export function axisKnown(p: Person, a: Axis): boolean {
  return p.know.axes || p.know.seen[a] >= B.know.seenToKnow;
}

export function traitLabel(w: World, g: { trait: Trait; target?: number }): string {
  return g.trait.targeted && g.target != null ? `${g.trait.name} ${dative(w.people[g.target].name)}` : g.trait.name;
}

// Молва проверяется, когда становится известно то, о чём она: черта или склонность.
export function rumorCheck(p: Person): "" | "подтвердилась" | "не подтвердилась" {
  const r = p.rumor;
  if (!r) return "";
  if (r.trait) return !p.know.trait ? "" : r.trait === p.trait.id ? "подтвердилась" : "не подтвердилась";
  if (!r.axis || !axisKnown(p, r.axis)) return "";
  return p.star[r.axis] >= B.know.notable ? "подтвердилась" : "не подтвердилась";
}

// Годность словом — по тому, что известно: известные оси должности, метка (видна всегда), известное стремление.
export function fitWord(p: Person, post: PostId): "подходит" | "сомнительно" | "не знаю" {
  const def = POSTS.find((x) => x.id === post)!;
  const known = def.axes.filter((a) => axisKnown(p, a));
  const good = p.mark?.goodPost === post, bad = p.mark?.badPost === post;
  if (!known.length && !good && !bad) return "не знаю";
  let f = known.length ? known.reduce((s, a) => s + p.star[a], 0) / known.length : B.star.center;
  if (good) f += B.exp.fitMarkGood;
  if (bad) f -= B.exp.fitMarkBad;
  if (p.know.aspiration && p.aspiration?.post === post) f += B.exp.fitAspiration;
  return f >= B.know.fitGood ? "подходит" : "сомнительно";
}

// Мнение главного о человеке: куда бы он его поставил. С пристрастием: друга похвалит, соперника очернит.
export function headOpinion(w: World, p: Person): { head: Person; text: string; bias: number } | undefined {
  const head = w.head != null ? w.people[w.head] : undefined;
  if (!head || head.id === p.id) return undefined;
  const bias = round1(getRel(w, head.id, p.id) * B.know.opinionBias);
  const best = POSTS.reduce((x, d) => (fitness(p, d.id) > fitness(p, x.id) ? d : x), POSTS[0]);
  const text = fitness(p, best.id) + bias >= B.know.fitGood ? `годится в ${best.into}` : "ни на одну должность не годится";
  return { head, text, bias };
}
