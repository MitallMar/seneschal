// Разговор и уговор: что человек рассказывает о себе и как Сенешаль уговаривает его уйти с должности.
import { AXES, AXIS_NAMES } from "../../data/core";
import { BALANCE as B } from "../balance";
import { clamp, round1 } from "../util";
import { REL_MAX, postName } from "../state";
import type { Person, World } from "../state";
import { mod, lower } from "./people";
import { axisWord, traitLabel } from "./know";

// Разговор — личное дело. Открывает по порядку: стремление → склонности словами → черты (ключевую и нажитые, кроме скрытых).
// Скрытный о главном в себе молчит, и личное дело на это не уходит: «молчит» он говорит в разговоре о склонностях.
type Topic = "черты" | "стремление" | "склонности";

const untold = (p: Person) => p.gained.filter((g) => !g.known && !g.trait.hidden);

function restTalk(p: Person): Exclude<Topic, "черты"> | null {
  if (!p.know.aspiration) return "стремление";
  return p.know.axes ? null : "склонности";
}

// Порядок тем: стремление → склонности → черты. Склонности раньше черт: по ним Сенешаль судит о годности, а с неё начинаются перестановки.
export function nextTalk(p: Person): Topic | null {
  return restTalk(p) ?? (!p.know.traitAsked || untold(p).length ? "черты" : null);
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
