// Разговор и уговор: что человек рассказывает о себе и как Сенешаль уговаривает его уйти с должности.
import { AXES, AXIS_NAMES } from "../../data/core";
import { BALANCE as B } from "../balance";
import { clamp, round1 } from "../util";
import { REL_MAX, postName, getRel } from "../state";
import type { Person, World } from "../state";
import { mod, lower } from "./people";
import { axisWord, traitLabel } from "./know";
import { patronOf, patronText } from "./generate";

// Разговор — личное дело. Открывает по порядку: стремление → склонности словами → черты (ключевую и нажитые, кроме скрытых).
// Скрытный о главном в себе молчит, и личное дело на это не уходит: «молчит» он говорит в разговоре о склонностях.
type Topic = "черты" | "стремление" | "склонности" | "связи";

const untold = (p: Person) => p.gained.filter((g) => !g.known && !g.trait.hidden);

function restTalk(p: Person): Exclude<Topic, "черты" | "связи"> | null {
  if (!p.know.aspiration) return "стремление";
  return p.know.axes ? null : "склонности";
}

// Порядок тем: стремление → склонности → черты. Склонности раньше черт: по ним Сенешаль судит о годности, а с неё начинаются перестановки.
// Связи человека: кто за него стоит, с кем он ладит и на кого держит обиду. В деле этого не увидеть — только из разговора.
// По ним видно, кого заденет перестановка и кто с кем поссорится.
export function linksOf(w: World, p: Person): { patron?: string; friends: Person[]; foes: Person[] } {
  const l = patronOf(w, p), others = w.people.filter((q) => q.id !== p.id);
  return {
    patron: l ? patronText(w, l) : undefined,
    friends: others.filter((q) => getRel(w, p.id, q.id) >= B.rel.friendly),
    foes: others.filter((q) => getRel(w, p.id, q.id) <= B.rel.rival),
  };
}
export function linksText(w: World, p: Person): string {
  const x = linksOf(w, p), names = (list: Person[]) => list.map((q) => q.name).join(", ");
  const parts = [
    x.patron ? lower(x.patron).replace(/\.$/, "") : "",
    x.friends.length ? `ладит: ${names(x.friends)}` : "",
    x.foes.length ? `в обиде: ${names(x.foes)}` : "",
  ].filter(Boolean);
  return parts.length ? parts.join("; ") : "ни покровителей, ни близких, ни обид";
}
export function nextTalk(p: Person): Topic | null {
  // связи — последним: о них человек говорит, когда остальное уже сказано
  return restTalk(p) ?? (!p.know.traitAsked || untold(p).length ? "черты" : p.know.links ? null : "связи");
}

export function talk(w: World, id: number): boolean {
  const p = w.people[id];
  const topic = nextTalk(p);
  if (w.deedsLeft <= 0 || !topic) return false;
  w.deedsLeft--;
  p.know.talks++;
  p.loyalty = clamp(p.loyalty + B.staff.talkLoyalty, -REL_MAX, REL_MAX);
  const lines = [`Сенешаль говорил с ${p.name}.`], silent = `О главном в себе ${p.female ? "она" : "он"} молчит: такую черту выдаст только поступок.`;
  if (topic === "черты") {
    if (!p.know.trait && !p.trait.hidden) {
      p.know.trait = true;
      lines.push(`Ключевая черта: «${p.trait.name}» — ${lower(p.trait.desc)}.`);
    } else if (!p.know.trait && !p.know.traitAsked) lines.push(silent);
    p.know.traitAsked = true;
    for (const g of untold(p)) {
      g.known = true;
      lines.push(`Нажитая черта: «${traitLabel(w, g)}» — ${lower(g.trait.desc)}.`);
    }
  }
  if (topic === "стремление") {
    p.know.aspiration = true;
    lines.push(`Стремление: ${p.aspiration ? p.aspiration.text : "ничего особенного не хочет"}.`);
  } else if (topic === "склонности") {
    p.know.axes = true;
    lines.push(`Склонности: ${AXES.map((x) => `${AXIS_NAMES[x]} — ${axisWord(p.star[x])}`).join(", ")}.`);
    // скрытный: о чертах спрашивать нечего, и отдельного личного дела на «молчит» не уходит
    if (p.trait.hidden && !p.know.trait && !p.know.traitAsked && !untold(p).length) { p.know.traitAsked = true; lines.push(silent); }
  }
  if (topic === "связи") {
    p.know.links = true;
    lines.push(`Связи: ${linksText(w, p)}.`);
  }
  w.log.push({ season: w.season, kind: "info", title: "Разговор", lines });
  return true;
}

// Медленный путь вместо авторитета: уговорить держателя должности уйти самому — личное дело, одно или два.
// Чем лучше он относится к Сенешалю и чем послушнее, тем быстрее; кто недоволен — не уговорить.
export function persuadeStep(p: Person): number {
  const A = B.authority;
  return clamp(A.persuadeBase + p.loyalty * A.persuadeLoyalty + mod(p, "obedience") * A.persuadeObedience, 0, 1);
}

export function persuade(w: World, id: number): boolean {
  const p = w.people[id];
  if (!p.post || p.agreed || w.deedsLeft <= 0) return false;
  w.deedsLeft--;
  const step = persuadeStep(p), f = p.female;
  p.persuade = round1((p.persuade ?? 0) + step);
  const lines = [`Сенешаль говорил с ${p.name} о том, чтобы оставить должность «${postName(p.post)}».`];
  if (p.persuade >= 1) { p.agreed = true; lines.push(`${p.name} согласил${f ? "ась" : "ся"} уйти сам${f ? "а" : ""}: снять можно без потери авторитета и без обиды.`); }
  else if (step <= 0) lines.push(`${p.name} и слушать не стал${f ? "а" : ""}: так ${f ? "её" : "его"} не уговорить.`);
  else lines.push(`${p.name} пока не согласен${f ? "на" : ""}, но задумал${f ? "ась" : "ся"}: нужен ещё разговор.`);
  w.log.push({ season: w.season, kind: "info", title: "Уговор", lines });
  return true;
}
