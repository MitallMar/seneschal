// Последствия события: единственный вход в запасы, доверие сторон и порядок.
import type { Effect, GameEvent, EventOption, Village } from "../../data/types";
import { BALANCE as B } from "../balance";
import { round1 } from "../util";
import { postName } from "../state";
import type { Person, LogEntry, World } from "../state";
import { takeHands, invest, addLine, belowFloor } from "../economy/ledger";
import { addTrust, addVillages } from "../economy/zones";
import { lower } from "./people";
import { expWord } from "./know";
import { competence } from "./decide";

// Какой вариант исполнили последним: по нему кризис стороны узнаёт свой выход. Перед событием сбрасывается.
export let lastOpt: string | undefined;
export const resetLastOpt = (): void => { lastOpt = undefined; };

// Последствия варианта. Доверие сторон: derevni — той деревне, что названа в событии, целиком; общее — пополам между двумя (addVillages). kazna и pripasy — запасы серебра и еды
// со строкой в ведомости; ниже нуля запас не опускается, в запись идёт то, что вышло на деле.
// plus — доля пользы: множитель только к плюсам и к отдаче вложения. Саботаж срывает дело, а цена (минусы, руки) платится целиком.
export function applyEffects(w: World, ev: GameEvent, opt: EventOption, mult: number, doer: Person | undefined, lines: string[], plus = 1): Partial<Record<Effect, number>> {
  let k = mult;
  lastOpt = opt.id;
  if (doer) k *= competence(doer);
  if (opt.careful) k *= B.exp.carefulGain;
  let failed = false;
  if (opt.risky && doer) {
    const pSuccess = B.exp.riskBase + B.exp.riskSkill * competence(doer);
    if (!w.rng.chance(pSuccess)) failed = true;
  }
  // смелый вариант: при удаче выигрыш больше, цена та же
  const gain = opt.risky && !failed ? B.exp.boldGain : 1;
  const out: Partial<Record<Effect, number>> = {};
  for (const [key, v] of Object.entries(opt.effects) as [Effect, number][]) {
    let val = v * k * (v > 0 ? gain * plus : 1);
    if (failed && val > 0) val = -val * B.exp.failBackfire;
    val = round1(val);
    out[key] = val;
    const who = doer ? `${postName(doer.post!).toLowerCase()} ${doer.name}` : undefined;
    if (key === "poryadok") w.resources.poryadok = round1(w.resources.poryadok + val);
    else if (key === "kazna" || key === "pripasy") {
      const cat = key === "kazna" ? "serebro" : "eda";
      const under = belowFloor(w, cat, val) ? "по-своему: ниже нижней черты" : undefined;
      out[key] = addLine(w, { cat, v: val, text: `событие «${ev.title}»: ${lower(opt.text)}`, who, how: under });
      if (out[key] !== val) lines.push(`${cat === "eda" ? "Амбар" : "Казна"} не бездонны: взять удалось только ${-out[key]!}.`);
      if (under) lines.push(`Нижняя черта нарушена: ${doer?.name ?? "совет"} распорядил${doer?.female ? "ась" : "ся"} запасом по-своему.`);
    } else if (key === "derevni") addVillages(w, val, ev.village);
    else addTrust(w, key, val * B.economy.trust.event);
  }
  if (opt.hands) takeHands(w, opt.hands);
  if (opt.later && !failed) invest(w, ev, opt.later, k * gain * plus, lines);
  if (opt.later && failed) lines.push("Вложение пропало: отдачи не будет.");
  if (failed) lines.push(`Рискованное дело провалилось — не хватило опыта (${doer ? expWord(doer) : "?"}).`);
  return out;
}

export function toneOf(eff: Partial<Record<Effect, number>>): LogEntry["tone"] {
  const vals = Object.values(eff);
  const pos = vals.filter((v) => v! > 0).length, neg = vals.filter((v) => v! < 0).length;
  return pos && !neg ? "good" : neg && !pos ? "bad" : pos && neg ? "mixed" : "neutral";
}

// Последствия без события совета и без исполнителя: местный отголосок мира. Тот же вход в запасы, доверие и порядок; village — если про одну деревню.
export function applyDirect(w: World, effects: Partial<Record<Effect, number>>, k: number, text: string, village?: Village): Partial<Record<Effect, number>> {
  const out: Partial<Record<Effect, number>> = {};
  for (const [key, v] of Object.entries(effects) as [Effect, number][]) {
    const val = round1(v * k);
    out[key] = val;
    if (key === "poryadok") w.resources.poryadok = round1(w.resources.poryadok + val);
    else if (key === "kazna" || key === "pripasy") out[key] = addLine(w, { cat: key === "kazna" ? "serebro" : "eda", v: val, text });
    else if (key === "derevni") addVillages(w, val, village);
    else addTrust(w, key, val * B.economy.trust.event);
  }
  return out;
}
