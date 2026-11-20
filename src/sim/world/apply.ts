// Мир в партии: вести сезона доходят до баронства — местные отголоски бьют по сторонам и запасам, указы ложатся на стол Сенешаля.
// Сам генератор — gen.ts: он партии не знает. Здесь всё, что меняет партию; указ закрывается теми же способами «чем и с кого», что подать.
import type { PayId, WorldTag, Effect } from "../../data/types";
import { CATEGORY_NAMES, SEASON_NAMES, VILLAGES } from "../../data/economy";
import { WORLD_TAG_NAMES, WEATHER_WORDS } from "../../data/world";
import { BALANCE as B } from "../balance";
import { clamp, round1, round2 } from "../util";
import { STAR_MAX, postName } from "../state";
import type { World, Decree } from "../state";
import { addTrust, patienceWord, seasonKind, AUTUMN } from "../economy/zones";
import { payOptions, payTax, billLeft, type PayOption } from "../economy/pay";
import { addAuthority } from "../authority";
import { applyDirect } from "../council/effects";
import { axisKnown } from "../council/know";
import { addLine } from "../economy/ledger";
import { standOf, wayOf, wayShare, worldModsFor, type Stand } from "./answer";
import { HEAVY_YEARS } from "../../data/world";
import { baronStep } from "../fall/base";
import { initWorld, worldStep, worldMods, weatherWord, stateDef } from "./gen";

const seasonName = (n: number) => `${SEASON_NAMES[(n - 1) % SEASON_NAMES.length]}, год ${Math.floor((n - 1) / SEASON_NAMES.length) + 1}`;

// Вести сезона — в летопись и в партию: местный отголосок применяется, указ ложится на стол.
function deliver(w: World): void {
  const g = w.world, lines: string[] = [];
  for (const n of g.sim.news) {
    if (n.kind === "decree") {
      // указ встречает ответственная должность: сильный держатель выторговывает меньше, слабый — получает больше; почерк писаря даёт скидку или отсрочку
      const echo = stateDef(n.state!).echoes![n.echo!], def = echo.decree!, post = echo.post ?? stateDef(n.state!).post;
      const stand = standOf(w, post), size = wayOf(w, "decreeSize"), late = wayOf(w, "decreeTerm"), X = B.world.answer;
      const due = round1(Math.max(X.min, stand.k * wayShare(size, X.decreeSize)) * n.measures!);
      const term = n.term! + (late ? X.termAdd : 0);
      if (size) addTrust(w, "dvor", -X.decreeDvor * size.weight);
      if (late) addTrust(w, "dvor", -X.termDvor * late.weight);
      const ways = [size, late].filter((x) => x && axisKnown(x.p, x.answer.axis)).map((x) => `${x!.p.name}: «${x!.answer.name}» — ${x!.answer.good}; ${x!.answer.price}`);
      const note = `${stand.text}${due !== n.measures ? ` (${n.measures} → ${due} мер)` : ""}${ways.length ? `. ${ways.join(". ")}` : ""}`;
      const d: Decree = {
        id: g.nextId++, def: def.id, state: n.state!, title: def.title, text: def.text, accepts: def.accepts,
        due, paid: 0, by: {}, council: 0, post, note, issued: w.season, until: w.season + term - 1,
      };
      g.decrees.push(d);
      const what = d.accepts.map((c) => CATEGORY_NAMES[c].toLowerCase()).join(" или ");
      lines.push(`📯 ${n.text} ${d.title}: ${d.due} мер (${what}), срок — до конца сезона «${seasonName(d.until)}». Встречал ${note}.`);
    } else if (n.kind === "echo") {
      // местный отголосок: потери умножает сила ответственного; почерк тиуна бережёт деревни, лесничего — смягчает беды леса; прибавки идут как есть
      const def = stateDef(n.state!).echoes![n.echo!], post = def.post ?? stateDef(n.state!).post, X = B.world.answer;
      const stand = standOf(w, post), mercy = wayOf(w, "villages"), rites = post === "lesnichiy" ? wayOf(w, "forest") : undefined;
      const scaled: Partial<Record<Effect, number>> = {};
      let lost = false, spared = false;
      for (const [key, v] of Object.entries(def.effects ?? {}) as [Effect, number][]) {
        const soft = key === "derevni" ? wayShare(mercy, X.villages) : 1;
        scaled[key] = v < 0 ? v * stand.k * soft * wayShare(rites, X.forest) : v;
        lost = lost || v < 0;
        spared = spared || (v < 0 && key === "derevni" && !!mercy);
      }
      const text = `вести: ${def.text.charAt(0).toLowerCase()}${def.text.slice(1)}`;
      applyDirect(w, scaled, B.world.effect * n.strength! * B.world.strength, text, def.village);
      if (spared) addLine(w, { cat: "eda", v: -X.villagesFood * mercy!.weight, text: "пострадавшим из амбара", who: `${postName(mercy!.p.post!).toLowerCase()} ${mercy!.p.name}` });
      if (lost && rites) addLine(w, { cat: "eda", v: -X.forestFood * rites.weight, text: "дары лесу", who: `${postName(rites.p.post!).toLowerCase()} ${rites.p.name}` });
      const ways = [spared ? mercy : undefined, lost ? rites : undefined].filter((x) => x && axisKnown(x.p, x.answer.axis))
        .map((x) => ` ${x!.p.name}: «${x!.answer.name}» — ${x!.answer.good}; ${x!.answer.price}.`).join("");
      lines.push(lost ? `${n.text} Отвечал ${stand.text}.${ways}` : n.text);
    } else lines.push(n.text);
  }
  if (lines.length) w.log.push({ season: w.season, kind: "info", title: "Вести", lines });
}

export function initWorldGame(w: World): void {
  w.world = { sim: initWorld(w.seed), decrees: [], past: [], nextId: 1, harvests: [] };
}
// Вести первого сезона (погода года) — в летопись после записи о начале партии.
export const worldAnnounce = (w: World): void => deliver(w);

// Начало нового сезона: мир делает шаг, вести доходят до баронства.
export function worldArrive(w: World): void {
  worldStep(w.world.sim, w.season);
  deliver(w);
}

// ---------- Указы ----------

export const decreeLeft = (d: Decree): number => billLeft(d);
// Чем и с кого можно закрыть указ прямо сейчас: те же способы, что у подати, но только принятых указом категорий.
export const decreeOptions = (w: World, d: Decree): PayOption[] => payOptions(w, d);

function finish(w: World, d: Decree, lines: string[]): void {
  const D = B.world.decree, t = w.eco.tax, left = decreeLeft(d);
  if (left <= 0) {
    d.closed = d.council > 0 ? "закрыт советом" : "закрыт";
    addTrust(w, "dvor", D.dvorGain);
    lines.push(`📯 Указ «${d.title}» исполнен: ${d.paid} мер из ${d.due}.`);
  } else if (w.fall.under) {
    // под чужой рукой за указ отвечает барон: неисполненный указ приближает его падение (путь двора)
    d.closed = "не закрыт";
    baronStep(w, "dvor", B.fall.stepDecree);
    lines.push(`📯 Срок указа «${d.title}» вышел: исполнено ${d.paid} мер из ${d.due}. Отвечает барон ${w.fall.under.baron.name}: его срок короче на ${B.fall.stepDecree} сез.`);
  } else {
    const share = left / d.due;
    d.closed = "не закрыт";
    if (d.levy) w.fall.levyFailed = true;
    t.patience = round2(clamp(t.patience - D.patience * share, 0, STAR_MAX));
    addTrust(w, "dvor", -D.dvor * share);
    addAuthority(w, -D.authority, `указ не исполнен: «${d.title}»`, "tax");
    lines.push(`📯 Срок указа «${d.title}» вышел: исполнено ${d.paid} мер из ${d.due}. Двор недоволен, Герцог ${patienceWord(t.patience)}.`);
  }
  w.world.decrees = w.world.decrees.filter((x) => x !== d);
  w.world.past.push(d);
}

// Закрыть часть указа способом way. Возвращает, сколько мер ушло; закрыт целиком — уходит со стола сразу.
export function payDecree(w: World, decreeId: number, way: PayId, measures: number, lines?: string[]): number {
  const d = w.world.decrees.find((x) => x.id === decreeId);
  if (!d) return 0;
  const out: string[] = [];
  const m = payTax(w, way, measures, out, d);
  if (m > 0 && decreeLeft(d) <= 0) finish(w, d, out);
  if (lines) lines.push(...out);
  else if (out.length) w.log.push({ season: w.season, kind: "staff", title: `Указ: ${d.title}`, lines: out });
  return m;
}

// Совет исполняет указ сам, как подать: запасом не ниже нижних черт; людей — сначала вольными из корчмы, потом рекрутами той деревни, что доверяет больше.
function autoPayDecree(w: World, d: Decree, lines: string[]): number {
  const e = w.eco, R = B.economy.rate;
  let paid = 0;
  const pay = (way: PayId, measures: number) => { paid += payTax(w, way, measures, lines, d); };
  for (const cat of d.accepts) {
    if (cat === "eda") pay("eda", (e.stock.eda - e.floor.eda) / R.eda);
    else if (cat === "serebro") pay("serebro", (e.stock.serebro - e.floor.serebro) / R.serebro);
    else if (cat === "tovary") pay("tovary", e.stock.tovary / R.tovary);
    else {
      // почерк десятника по Долгу: людей даёт стража и челядь, деревенских не трогают
      if (wayOf(w, "castleRecruits")) pay("rekruty_zamok", decreeLeft(d));
      pay("volnye", decreeLeft(d));
      for (const v of [...VILLAGES].sort((a, b) => w.factions[b] - w.factions[a])) pay(v === "brod" ? "rekruty_brod" : "rekruty_opushka", decreeLeft(d));
    }
  }
  return round1(paid);
}

// Сколько мер указа совет закрыл бы сам прямо сейчас: запасом сверх нижних черт, людей — вольными и рекрутами деревень (стражей — при почерке десятника).
// Меньше остатка — совет указ не исполнит, и это видно на столе заранее: решать игроку.
export function decreeCouncilCan(w: World, d: Decree): number {
  const e = w.eco, R = B.economy.rate, opts = decreeOptions(w, d), max = (way: PayId) => opts.find((o) => o.def.id === way)?.max ?? 0;
  let can = 0;
  for (const cat of d.accepts) {
    if (cat === "eda") can += Math.max(0, (e.stock.eda - e.floor.eda) / R.eda);
    else if (cat === "serebro") can += Math.max(0, (e.stock.serebro - e.floor.serebro) / R.serebro);
    else if (cat === "tovary") can += e.stock.tovary / R.tovary;
    else can += max("volnye") + max("rekruty_brod") + max("rekruty_opushka") + (wayOf(w, "castleRecruits") ? max("rekruty_zamok") : 0);
  }
  return round1(Math.min(decreeLeft(d), can));
}

// Конец сезона: у кого вышел срок — совет закрывает сам (если ему это оставлено), остаток бьёт по терпению Герцога и двору.
export function decreesDue(w: World, lines: string[]): void {
  if (seasonKind(w.season) === AUTUMN) {
    const raw = worldMods(w.world.sim).harvest, stock = wayOf(w, "harvest");
    w.world.harvests.push(raw);
    // «Запас впрок» сработал в худой год — ключник закупал за серебро
    if (stock && raw < 1) addLine(w, { cat: "serebro", v: -B.world.answer.harvestSilver * stock.weight, text: "запас впрок на худой год", who: `ключник ${stock.p.name}` });
  }
  for (const d of w.world.decrees.filter((x) => x.until <= w.season)) {
    if (decreeLeft(d) > 0 && w.eco.autoPay) {
      const sub: string[] = [];
      const auto = autoPayDecree(w, d, sub);
      d.council = round1(d.council + auto);
      if (auto) lines.push(`Совет сам исполняет указ «${d.title}». ${sub.filter((x) => !x.startsWith("Осталось") && !x.startsWith("Указ")).join(" ")}`);
    }
    finish(w, d, lines);
  }
}

// ---------- Что видит игрок ----------

export interface WorldView {
  weather: string;                                                   // погода года словом
  states: { id: string; name: string; text: string; tags: WorldTag[]; since: number; until: number; strength: number; bad: boolean; stand?: Stand }[];
  heavy: string;                                                     // тяжёлый год: «засуха», «градобой» или пусто
  tiun?: Stand;                                                      // кто отвечает за худую погоду и как справляется
  line: string;                                                      // строка «что в мире»
  mods: ReturnType<typeof worldMods>;
}
export function worldView(w: World): WorldView {
  const ws = w.world.sim, mods = worldModsFor(w);
  const states = ws.active.map((a) => {
    const d = stateDef(a.id), bad = d.cost > 0;
    return { id: a.id, name: d.name, text: d.text, tags: d.tags, since: a.from, until: a.until, strength: a.strength, bad, stand: bad ? standOf(w, d.post) : undefined };
  });
  const heavy = HEAVY_YEARS.find((x) => x.id === ws.heavy)?.name ?? "";
  const weather = heavy || WEATHER_WORDS[weatherWord(mods.harvest)];
  const names = states.map((s) => s.name.toLowerCase()).join("; ");
  return { weather, states, mods, heavy, tiun: B.world.on && ws.weather < 1 ? standOf(w, "starosta") : undefined, line: B.world.on ? `${weather}${names ? `; ${names}` : "; в герцогстве тихо"}` : "тихо" };
}
export const tagNames = (tags: WorldTag[]): string => tags.map((t) => WORLD_TAG_NAMES[t]).join(", ");
