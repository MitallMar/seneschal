// Сезон: дело на столе Сенешаля и приказ, события сезона, опыт, «засиделся», лояльность, стремления. Порядок фаз сезона — в runSeason и upkeep.
import type { GameEvent, EventOption } from "../data/types";
import { EVENTS } from "../data/events";
import { BALANCE as B } from "./balance";
import { clamp, round1 } from "./util";
import { REL_MAX, isStale, postName, holder } from "./state";
import type { Person, LogEntry, World } from "./state";
import { addAuthority, authoritySeason } from "./authority";
import { economySeason, rollForecast } from "./economy/season";
import { addLine } from "./economy/ledger";
import { mod, addRel } from "./council/people";
import { scoreOptions } from "./council/decide";
import { applyEffects, toneOf } from "./council/effects";
import { runEvent } from "./council/council";
import { lifeTraits } from "./council/traits";
import { eventWeight } from "./world/gen";
import { orderMods } from "./order";
import { orderSeason } from "./order-season";
import { worldArrive, decreesDue } from "./world/apply";

// События строгого края (казнокрад, логово…) приходят только со ступени «Строгость».
const eventPool = (w: World) => EVENTS.filter((e) => (!e.adventurers || w.labOpen) && (!e.strict || w.order.level >= B.order.strictFrom));

// Дело на столе: одно из событий будущего сезона Сенешаль видит заранее.
export function pickDesk(w: World) {
  w.desk = { event: draw(w, eventPool(w), 1, true)[0].id };
}

// Какие события придут: по весам меток мира. В спокойном мире веса равны — и выбор идёт прежним путём, той же случайностью.
function draw(w: World, pool: GameEvent[], n: number, one = false): GameEvent[] {
  const strict = orderMods(w).strictWeight;
  const weights = pool.map((e) => eventWeight(w.world.sim, e) * (e.strict ? strict : 1));
  if (weights.every((x) => x === 1)) return one ? [w.rng.pick(pool)] : w.rng.shuffle(pool).slice(0, n);
  // взвешенный выбор без возврата: у каждого события свой бросок, тяжёлые чаще оказываются впереди
  return pool.map((e, i) => ({ e, key: Math.pow(w.rng.next(), 1 / weights[i]) })).sort((a, b) => b.key - a.key).slice(0, n).map((x) => x.e);
}

// Что лежит на столе: событие, советник (держатель первой задетой должности, какая занята) и его мнение — что бы он выбрал сам.
export function deskView(w: World): { ev: GameEvent; advisor?: Person; opinion?: EventOption; order?: EventOption } | undefined {
  const ev = w.desk ? eventPool(w).find((e) => e.id === w.desk!.event) : undefined;
  if (!ev) return undefined;
  const advisor = ev.posts.map((post) => holder(w, post)).find((x): x is Person => !!x);
  const opinion = advisor ? scoreOptions(w, advisor, ev, false, true).reduce((a, b) => (b.base > a.base ? b : a)).opt : undefined;
  return { ev, advisor, opinion, order: ev.options.find((o) => o.id === w.desk!.order) };
}

// Приказ при Сенешале дома — личное дело: по делу на столе исполнить этот вариант. Отменить нельзя.
export function command(w: World, optionId: string): boolean {
  const d = deskView(w);
  if (!d || d.order || w.deedsLeft <= 0 || !d.ev.options.some((o) => o.id === optionId)) return false;
  w.deedsLeft--;
  w.desk!.order = optionId;
  const opt = d.ev.options.find((o) => o.id === optionId)!;
  const against = d.opinion && d.opinion.id !== opt.id ? ` ${d.advisor!.name} советует иначе: «${d.opinion.text}».` : "";
  w.log.push({ season: w.season, kind: "staff", title: "Приказ", lines: [`По делу «${d.ev.title}» Сенешаль приказал: «${opt.text}».${against}`] });
  return true;
}

// Дело по приказу: исполняет советник. Приказ против его мнения — ответственность Сенешаля: вышло хорошо — авторитет и уважение, плохо — потеря.
function runOrdered(w: World, ev: GameEvent, opt: EventOption): LogEntry {
  const d = deskView(w)!, p = d.advisor, A = B.authority;
  const against = !!d.opinion && d.opinion.id !== opt.id;
  const lines = [ev.text, `Сенешаль приказал: «${opt.text}».`];
  let mult = 1;
  if (p && against) {
    lines.push(`${p.name} (${postName(p.post!)}) советовал${p.female ? "а" : ""} иначе: «${d.opinion!.text}».`);
    if (p.loyalty < B.loyalty.trusts) { mult = B.economy.doer.dull; lines.push(`Исполняет без огонька: и не согласен${p.female ? "на" : ""}, и Сенешалю не слишком верит.`); }
  } else if (p) lines.push(`${p.name} (${postName(p.post!)}) того же мнения.`);
  else lines.push("Должности пусты — исполнять пришлось кому попало.");
  const effects = applyEffects(w, ev, opt, p ? mult : B.economy.doer.empty, p, lines);
  const sum = Object.values(effects).reduce((s, v) => s + v!, 0);
  if (p && against && sum > 0) {
    addAuthority(w, A.rightGain, `оказался прав: «${ev.title}» против мнения ${p.name}`, "order");
    p.loyalty = round1(clamp(p.loyalty + A.rightLoyalty, -REL_MAX, REL_MAX));
    lines.push(`Вышло хорошо: Сенешаль оказался прав. ${p.name} это запомнит. Авторитет +${A.rightGain}.`);
  } else if (p && against && sum < 0) {
    addAuthority(w, -A.rightLoss, `приказ обернулся плохо: «${ev.title}» против мнения ${p.name}`, "order");
    lines.push(`Вышло плохо, а ${p.name} предупреждал${p.female ? "а" : ""}. Авторитет −${A.rightLoss}.`);
  }
  const entry: LogEntry = { season: w.season, kind: "event", title: `${ev.title} — по приказу`, lines, effects, tone: toneOf(effects), outcome: "ordered" };
  w.log.push(entry);
  return entry;
}

export function runSeason(w: World) {
  const pool = eventPool(w);
  const desk = deskView(w);
  const rest = draw(w, pool.filter((e) => e !== desk?.ev), B.season.events - (desk ? 1 : 0));
  if (desk?.order) runOrdered(w, desk.ev, desk.order);
  else if (desk) runEvent(w, desk.ev);
  for (const ev of rest) runEvent(w, ev);
  upkeep(w);
  w.season++;
  w.deedsLeft = B.season.deeds;
  worldArrive(w);
  rollForecast(w);
  pickDesk(w);
}

export function runEvents(w: World, n: number) {
  const pool = eventPool(w);
  for (let i = 0; i < n; i++) runEvent(w, w.rng.pick(pool));
}

function upkeep(w: World) {
  const lines: string[] = [];
  // старые обиды и симпатии понемногу сглаживаются
  for (const [k, v] of w.rel) w.rel.set(k, round1(v * B.rel.fade));
  for (const p of w.people) {
    if (p.post) {
      p.tenure++;
      p.exp = Math.min(p.exp + 1, B.exp.master);
      if (p.tenure === B.exp.settled) lines.push(`${p.name} освоил${p.female ? "ась" : "ся"} на должности.`);
      if (p.tenure === B.exp.staleFrom) lines.push(`${p.name} засидел${p.female ? "ась" : "ся"} на месте: оброс своими людьми и делает всё больше по-своему.`);
      if (isStale(p) && p.star.vygoda >= B.decide.staleGreedFrom && w.rng.chance(B.season.theftChance * orderMods(w).theft)) {
        // вороватый, который сам ведёт счёт серебру (писарь), прячет строку: пропажа видна только как «счёт не сходится»
        const hidden = p.post === "pisar";
        addLine(w, { cat: "serebro", v: -B.season.theft, text: "утекло из казны", who: `${postName(p.post).toLowerCase()} ${p.name}`, how: "по-своему", hidden });
        lines.push(hidden ? "Счёт серебра не сходится: чего-то недостаёт, а в книгах чисто." : `Из казны что-то утекает — следы ведут к людям ${p.name}.`);
      }
    }
    lifeTraits(w, p, lines);
    const asp = p.aspiration?.post;
    if (asp) {
      if (p.post === asp) p.loyalty += B.loyalty.desiredPost;
      else if (p.post) p.loyalty += B.loyalty.wrongPost * (1 + mod(p, "ambition") * B.loyalty.ambition) * (isStale(p) ? B.loyalty.staleWrong : 1);
      else if (w.posts[asp] != null) {
        p.loyalty += B.loyalty.blocked;
        const h = holder(w, asp)!;
        if (isStale(h)) addRel(w, p.id, h.id, B.loyalty.blockedStaleRel);
      }
    }
    p.loyalty = round1(clamp(p.loyalty, -REL_MAX, REL_MAX));
    if (p.loyalty <= B.loyalty.bitter && w.rng.chance(B.loyalty.leaveChance)) lines.push(`⚠ ${p.name} озлоблен${p.female ? "а" : ""} и подумывает уйти.`);
  }
  economySeason(w, lines);
  orderSeason(w, lines);
  decreesDue(w, lines);
  authoritySeason(w, lines);
  w.log.push({ season: w.season, kind: "season", title: `Итог сезона ${w.season}`, lines: lines.length ? lines : ["Ничего особенного."] });
}
