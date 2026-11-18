// Событие в совете: кто решает, спор двоих и его исходы, что из поступка узнал Сенешаль.
import type { Effect, Deed, GameEvent, EventOption } from "../../data/types";
import { AXIS_NAMES } from "../../data/core";
import { BALANCE as B } from "../balance";
import { clamp, round1 } from "../util";
import { STAR_MAX, getRel, topAxis, postName, holder } from "../state";
import type { Person, Outcome, LogEntry, World } from "../state";
import { councilSteady, councilFeud, addComplaint } from "../authority";
import { elderSaw } from "../economy";
import { mod, addRel, lower } from "./people";
import { relWord, axisWord, axisKnown, traitLabel } from "./know";
import { trace, resetTrace, underFloor, scoreOptions, decide } from "./decide";
import { applyEffects, toneOf } from "./effects";
import { gainTrait } from "./traits";

export let outcome: Outcome = "alone";

let bypassed = false;

// Решение состоялось: счётчики, дрейф звезды, запись для привычки и наблюдение — Сенешаль видел человека в деле.
function recordChoice(w: World, p: Person, opt: EventOption, lines: string[]) {
  const top = topAxis(p.star);
  p.decisions++;
  if (opt.axes.includes(top)) p.matchedTop++;
  p.recent.push({ season: w.season, axes: [...opt.axes] });
  if (p.post === "starosta") elderSaw(w, p, opt.axes);
  for (const a of opt.axes) {
    p.choices[a]++;
    p.star[a] = round1(clamp(p.star[a] + B.star.drift, 0, STAR_MAX));
    const was = axisKnown(p, a);
    p.know.seen[a]++;
    if (!was && axisKnown(p, a)) lines.push(`👁 Насмотрелись в деле: ${p.name}, ${AXIS_NAMES[a]} — ${axisWord(p.star[a])}.`);
  }
}

// Поступок выдаёт скрытую черту: ключевую и приобретённую.
function reveal(w: World, p: Person, deed: Deed, lines: string[]) {
  if (!p.know.trait && p.trait.hidden && p.trait.revealedBy === deed) {
    p.know.trait = true;
    p.know.traitAsked = true;
    lines.push(`👁 Поступок выдал черту: ${p.name} — «${p.trait.name}», ${lower(p.trait.desc)}.`);
  }
  for (const g of p.gained) {
    if (g.known || g.trait.revealedBy !== deed) continue;
    g.known = true;
    lines.push(`👁 Поступок выдал черту: ${p.name} — «${traitLabel(w, g)}», ${lower(g.trait.desc)}.`);
  }
}

// Обход: хитрый проиграл спор, для вида согласился, а сделал по-своему. Возвращает последствия, если обход случился.
function bypass(w: World, ev: GameEvent, win: Person, lose: Person, opt: EventOption, lines: string[]): Partial<Record<Effect, number>> | undefined {
  if (mod(lose, "sly", win) <= 0 || !w.rng.chance(B.traits.bypassChance)) return undefined;
  const f = lose.female;
  bypassed = true;
  lines.push(`Но ${lose.name} только для вида согласил${f ? "ась" : "ся"}, а сделал${f ? "а" : ""} по-своему, в обход: «${opt.text}».`);
  reveal(w, lose, "bypass", lines);
  addRel(w, win.id, lose.id, B.traits.bypassRel);
  recordChoice(w, lose, opt, lines);
  return applyEffects(w, ev, opt, B.traits.bypass, lose, lines);
}

// Одно событие: решают держатели задетых должностей. Запись уходит в летопись; возвращается она же.
export function runEvent(w: World, ev: GameEvent): LogEntry {
  const holders = ev.posts.map((post) => holder(w, post)).filter((x): x is Person => !!x);
  const lines: string[] = [ev.text];
  let effects: Partial<Record<Effect, number>> = {};
  resetTrace(); bypassed = false;
  outcome = holders.length === 0 ? "empty" : "alone";

  if (holders.length === 0) {
    lines.push("Должности пусты — делом никто не занялся.");
    w.resources.poryadok -= B.council.emptyOrder;
    effects = { poryadok: -B.council.emptyOrder };
  } else if (holders.length === 1) {
    const p = holders[0];
    const d = decide(w, p, ev);
    lines.push(`${p.name} (${postName(p.post!)}): «${d.opt.text}» — ${d.why}${d.surprise ? ", неожиданно для себя" : ""}.`);
    if (ev.posts.length === 2) lines.push(`Вторая должность пуста — ${p.name} решал${p.female ? "а" : ""} в одиночку.`);
    recordChoice(w, p, d.opt, lines);
    effects = applyEffects(w, ev, d.opt, 1, p, lines);
  } else {
    effects = council(w, ev, holders[0], holders[1], lines);
  }
  const title = `${ev.title}${ev.adventurers ? " ⚔" : ""}`;
  const entry: LogEntry = { season: w.season, kind: "event", title, lines, effects, tone: toneOf(effects), weights: trace, outcome, ...(bypassed ? { bypass: true } : {}) };
  w.log.push(entry);
  return entry;
}

export function council(w: World, ev: GameEvent, a: Person, b: Person, lines: string[]): Partial<Record<Effect, number>> {
  // слаженность совета: при признанном главном и без вражды дела двух сфер идут сильнее, при открытой вражде — слабее
  const co = councilFeud(w) ? B.council.feud : councilSteady(w).ok ? B.council.cohesion : 1;
  if (co !== 1) lines.push(co > 1 ? "Совет слажен: дело двух сфер спорится." : "В совете вражда: дело двух сфер идёт хуже.");
  const da = decide(w, a, ev), db = decide(w, b, ev);
  const r = getRel(w, a.id, b.id);
  const word = relWord(r);
  lines.push(`${a.name} (${postName(a.post!)}) хочет «${da.opt.text}» — ${da.why}.`);
  lines.push(`${b.name} (${postName(b.post!)}) хочет «${db.opt.text}» — ${db.why}.`);

  if (da.opt.id === db.opt.id) {
    const mult = r >= B.rel.friendly ? B.council.synergy : 1;
    outcome = "agree";
    lines.push(mult > 1 ? `Сошлись сразу, и раз они ${word}, вышло лучше обычного.` : `Сошлись во мнении.`);
    recordChoice(w, a, da.opt, lines); recordChoice(w, b, db.opt, lines);
    addRel(w, a.id, b.id, B.council.agreeRel);
    const doer = a.exp >= b.exp ? a : b;
    return applyEffects(w, ev, da.opt, mult * co, doer, lines);
  }

  // Главный, если он третий, может рассудить
  const head = w.head != null ? w.people[w.head] : undefined;
  if (head && head.id !== a.id && head.id !== b.id) {
    const ra = getRel(w, head.id, a.id), rb = getRel(w, head.id, b.id);
    if (ra >= B.council.headMinRel && rb >= B.council.headMinRel) {
      const sa = scoreOptions(w, head, ev, false).find((s) => s.opt.id === da.opt.id)!.base;
      const sb = scoreOptions(w, head, ev, false).find((s) => s.opt.id === db.opt.id)!.base;
      const [win, lose, opt] = sa >= sb ? [a, b, da.opt] : [b, a, db.opt];
      outcome = "judge";
      lines.push(`Спорили (${word}). Рассудил главный, ${head.name}: делать как хочет ${win.name}.`);
      addRel(w, head.id, lose.id, B.council.headJudgeRel);
      recordChoice(w, win, opt, lines);
      return applyEffects(w, ev, opt, co, head.post ? head : win, lines);   // решение берёт главный: в силу идёт его опыт
    }
    lines.push(`Главного, ${head.name}, не признали — у него с кем-то из них плохие отношения.`);
  }

  const soft = mod(a, "softness", b) + mod(b, "softness", a);
  // кто сильнее в споре: главный, затем стаж и дерзость
  const power = (p: Person) => (w.head === p.id ? B.council.powerHead : 0) + p.tenure / B.council.powerTenureDiv
    + p.star.derzost / B.council.powerDerzostDiv + mod(p, "clout") + w.rng.range(0, B.council.powerRandom);
  const [win, lose, wd] = power(a) >= power(b) ? [a, b, da] : [b, a, db];
  const ld = win === a ? db : da;

  if (r >= B.rel.friendly) {
    // ладят — договариваются о лучшем для обоих
    const all = scoreOptions(w, a, ev, false).map((s, i) => ({ opt: s.opt, v: s.base + scoreOptions(w, b, ev, false)[i].base }));
    const kept = all.filter((x) => !underFloor(w, x.opt));
    const both = kept.length ? kept : all;
    const opt = both.reduce((x, y) => (y.v > x.v ? y : x)).opt;
    outcome = "deal";
    lines.push(`Они ${word} — договорились: «${opt.text}».`);
    recordChoice(w, a, opt, lines); recordChoice(w, b, opt, lines);
    addRel(w, a.id, b.id, B.council.dealRel);
    return applyEffects(w, ev, opt, B.council.dealGain * co, win, lines);
  }
  if (r > B.rel.rival) {
    // терпят — компромисс или кто-то продавил
    if (w.rng.chance(B.council.compromiseChance + soft * B.council.softness)) {
      outcome = "compromise";
      lines.push(`Они ${word} друг друга — сделали наполовину, как хотел ${win.name}, но вполсилы.`);
      recordChoice(w, win, wd.opt, lines);
      return applyEffects(w, ev, wd.opt, B.council.compromise * co, win, lines);
    }
    outcome = "push";
    lines.push(`Они ${word} друг друга. ${win.name} продавил${win.female ? "а" : ""} своё; ${lose.name} затаил${lose.female ? "а" : ""} обиду.`);
    addRel(w, a.id, b.id, B.council.pushRel);
    const around = bypass(w, ev, win, lose, ld.opt, lines);
    if (around) return around;
    recordChoice(w, win, wd.opt, lines);
    return applyEffects(w, ev, wd.opt, co, win, lines);
  }
  if (r > B.rel.enemy) {
    outcome = "rival";
    lines.push(`Они соперники. ${win.name} настоял${win.female ? "а" : ""} на своём, ${lose.name} не простит.`);
    addRel(w, a.id, b.id, B.council.rivalRel);
    const around = bypass(w, ev, win, lose, ld.opt, lines);
    if (around) return around;
    recordChoice(w, win, wd.opt, lines);
    if (lose.loyalty < B.council.complaintLoyalty || w.rng.chance(B.council.complaintChance)) {
      lines.push(`📜 Жалоба: ${lose.name} ждёт Сенешаля с жалобой на ${win.name}.`);
      addComplaint(w, lose.id, win.id);
    }
    return applyEffects(w, ev, wd.opt, B.council.rivalGain * co, win, lines);
  }
  // враги
  if (w.rng.chance(B.council.sabotageChance)) {
    outcome = "sabotage";
    lines.push(`Они враги. ${win.name} сделал${win.female ? "а" : ""} по-своему, а ${lose.name} мешал${lose.female ? "а" : ""} назло: «${ld.opt.text}» — вот чего ${lose.female ? "она" : "он"} хотел${lose.female ? "а" : ""}. Саботаж.`);
    addRel(w, a.id, b.id, B.council.sabotageRel);
    reveal(w, lose, "sabotage", lines);
    gainTrait(w, win, "zlopamyatny_k", lines, lose.id);
    recordChoice(w, win, wd.opt, lines);
    const eff = applyEffects(w, ev, wd.opt, 1, win, lines, B.council.sabotage * co);
    w.resources.poryadok = round1(w.resources.poryadok - B.council.sabotageOrder);
    eff.poryadok = round1((eff.poryadok ?? 0) - B.council.sabotageOrder);
    lines.push(`📜 Жалобы с обеих сторон ждут Сенешаля.`);
    addComplaint(w, lose.id, win.id); addComplaint(w, win.id, lose.id);
    return eff;
  }
  outcome = "silent";
  lines.push(`Они враги, но ${lose.name} на этот раз смолчал${lose.female ? "а" : ""}. ${win.name} сделал${win.female ? "а" : ""} по-своему.`);
  addRel(w, a.id, b.id, B.council.silentRel);
  recordChoice(w, win, wd.opt, lines);
  return applyEffects(w, ev, wd.opt, B.council.rivalGain * co, win, lines);
}
