// Здоровье (задача И10): крепость при рождении, черты здоровья, проверка раз в сезон, исходы — слёг, хворь осталась, выбыл со службы, умер.
// Замысел — docs/design/zdorovye.md. Стоит отдельно от совета: sim.ts его не зовёт. Случайность только через Rng, числа — раздел health в balance.ts.
import type { HealthTrait, HealthCause } from "../data/types";
import { HEALTH_TRAITS, NATURA_HEALTH } from "../data/health";
import { BALANCE as B } from "./balance";
import { Rng } from "./rng";
import { clamp, round1 } from "./util";

// Шкала крепости (не баланс): 0…10.
export const KREPOST_MAX = 10;
export const SEASONS_IN_YEAR = 4, WINTER = 3; // сезон года: 0 — весна, 3 — зима

export type HealthState = "ok" | "out" | "dead"; // служит; выбыл со службы по здоровью; умер
export type HealthEventKind = "ill" | "hard" | "wound" | "trait" | "out" | "dead";
export interface HealthEvent { season: number; age: number; kind: HealthEventKind; text: string; trait?: string }

export interface Family { id: string; hereditary: string[] }
export interface Health {
  krepost: number;      // крепость при рождении
  traits: string[];     // id черт здоровья
  family?: string;      // id семьи: по ней идут наследственные черты
  vices: string[];      // id нажитых черт натуры, которые сказываются на здоровье
  off: number;          // сколько сезонов ещё в постели
  state: HealthState;
  cause?: "болезнь" | "рана" | "старость" | "здоровье"; // от чего умер или выбыл
  log: HealthEvent[];
}

export const healthTrait = (id: string): HealthTrait => {
  const t = HEALTH_TRAITS.find((x) => x.id === id);
  if (!t) throw new Error(`Нет черты здоровья ${id}`);
  return t;
};
function pickByWeight(rng: Rng, items: HealthTrait[]): HealthTrait | undefined {
  const total = items.reduce((s, t) => s + t.weight, 0);
  if (!items.length || total <= 0) return undefined;
  let r = rng.next() * total;
  for (const t of items) { r -= t.weight; if (r < 0) return t; }
  return items[items.length - 1];
}

// Семья: с шансом familyChance в ней ходит одна наследственная черта.
export function makeFamily(rng: Rng, id: string): Family {
  const t = rng.chance(B.health.familyChance) ? pickByWeight(rng, HEALTH_TRAITS.filter((x) => x.origin === "hereditary")) : undefined;
  return { id, hereditary: t ? [t.id] : [] };
}
// Здоровье при рождении: крепость, с шансом — врождённая черта, от семьи — наследственные (каждая с шансом inheritChance).
// vices — нажитые черты натуры человека: из них берутся те, что сказываются на здоровье.
export function birthHealth(rng: Rng, family?: Family, vices: string[] = []): Health {
  const krepost = round1(clamp(B.health.krepostMean + rng.gauss() * B.health.krepostSpread, 1, KREPOST_MAX));
  const traits: string[] = [];
  const born = rng.chance(B.health.bornChance) ? pickByWeight(rng, HEALTH_TRAITS.filter((x) => x.origin === "born")) : undefined;
  if (born) traits.push(born.id);
  for (const id of family?.hereditary ?? []) if (rng.chance(B.health.inheritChance)) traits.push(id);
  return { krepost, traits, family: family?.id, vices: vices.filter((id) => NATURA_HEALTH[id]), off: 0, state: "ok", log: [] };
}

// Все поправки человека: черты здоровья и нажитые черты натуры.
type Mods = { krepost: number; risk: number; winter: number; death: number; aging: number };
export function healthMods(h: Health): Mods {
  const m: Mods = { krepost: 0, risk: 1, winter: 1, death: 1, aging: 1 };
  const all: { krepost?: number; risk?: number; winter?: number; death?: number; aging?: number }[] = [...h.traits.map(healthTrait), ...h.vices.map((id) => NATURA_HEALTH[id])];
  for (const t of all) {
    m.krepost += t.krepost ?? 0; m.risk *= t.risk ?? 1; m.winter *= t.winter ?? 1; m.death *= t.death ?? 1; m.aging *= t.aging ?? 1;
  }
  return m;
}
// Крепость сейчас: при рождении, с поправками черт и с убылью в старости.
export function krepostNow(h: Health, age: number): number {
  const m = healthMods(h);
  const aged = (Math.max(0, age - B.health.oldFrom) / B.health.agingStep) * m.aging;
  return round1(clamp(h.krepost + m.krepost - aged, 0, KREPOST_MAX));
}
// Шанс заболеть в этот сезон.
export function illChance(h: Health, age: number, season: number): number {
  const m = healthMods(h);
  const weak = Math.max(0, 1 + (B.health.krepostMean - krepostNow(h, age)) * B.health.krepostRisk);
  const winter = season % SEASONS_IN_YEAR === WINTER ? B.health.winterMult * m.winter : 1;
  return clamp(B.health.illBase * m.risk * weak * winter, 0, 1);
}
// Шанс умереть от старости в этот сезон: ноль до глубокой старости, дальше растёт к пределу жизни.
export function ageDeathChance(h: Health, age: number): number {
  const span = Math.max(1, B.health.lifeMax - B.health.elderFrom);
  const x = (Math.max(0, age - B.health.elderFrom) / span) * healthMods(h).aging;
  return clamp(x * x * B.health.ageDeathMax, 0, 1);
}

function gain(rng: Rng, h: Health, cause: HealthCause, ev: (kind: HealthEventKind, text: string, trait?: string) => void, onlyBad = false) {
  const t = pickByWeight(rng, HEALTH_TRAITS.filter((x) => x.origin === "gained" && x.cause === cause && !h.traits.includes(x.id) && !(onlyBad && x.good)));
  if (!t) return;
  h.traits.push(t.id);
  ev("trait", `Осталось: «${t.name}» — ${t.desc.charAt(0).toLowerCase()}${t.desc.slice(1)}.`, t.id);
}
function die(h: Health, cause: Health["cause"], ev: (kind: HealthEventKind, text: string) => void, text: string) {
  h.state = "dead"; h.cause = cause; h.off = 0;
  ev("dead", text);
}

// Один сезон жизни. season — номер сезона по счёту (остаток от деления на четыре даёт время года), age — возраст в этот сезон.
// Меняет здоровье на месте и возвращает то, что случилось (пусто — ничего).
export function seasonCheck(rng: Rng, h: Health, age: number, season: number): HealthEvent[] {
  const out: HealthEvent[] = [];
  if (h.state !== "ok") return out;
  const ev = (kind: HealthEventKind, text: string, trait?: string) => { const e = { season, age: Math.floor(age), kind, text, trait }; out.push(e); h.log.push(e); };
  const m = healthMods(h);
  const weak = Math.max(0, 1 + (B.health.krepostMean - krepostNow(h, age)) * B.health.krepostDeath);
  // старость
  if (rng.chance(ageDeathChance(h, age))) { die(h, "старость", ev, "Умер от старости."); return out; }
  if (age >= B.health.oldFrom && rng.chance(B.health.ageTraitChance * m.aging)) gain(rng, h, "age", ev);
  if (h.off > 0) { h.off--; return out; }
  // рана или надрыв
  if (rng.chance(B.health.woundChance)) {
    if (rng.chance(clamp(B.health.woundDeath * m.death * weak, 0, 1))) { die(h, "рана", ev, "Тяжело ранен и не выжил."); return out; }
    h.off = rng.int(B.health.hardOffMin, Math.max(B.health.hardOffMin, B.health.hardOffMax));
    ev("wound", `Ранен или надорвался: в постели ${h.off} сез.`);
    if (rng.chance(B.health.woundChronic)) gain(rng, h, "wound", ev);
  } else if (rng.chance(illChance(h, age, season))) {
    // болезнь
    if (rng.chance(B.health.hardShare)) {
      if (rng.chance(clamp(B.health.hardDeath * m.death * weak, 0, 1))) { die(h, "болезнь", ev, "Тяжело заболел и умер."); return out; }
      h.off = rng.int(B.health.hardOffMin, Math.max(B.health.hardOffMin, B.health.hardOffMax));
      ev("hard", `Тяжело болен: в постели ${h.off} сез.`);
      if (rng.chance(B.health.illChronic)) gain(rng, h, "illness", ev, true);
    } else {
      h.off = 1;
      ev("ill", "Слёг на сезон.");
      if (rng.chance(B.health.lightStrong) && !h.traits.includes("perebolel")) { h.traits.push("perebolel"); ev("trait", "Осталось: «Переболел и окреп».", "perebolel"); }
    }
  }
  // сил служить больше нет
  if (krepostNow(h, age) <= B.health.incapAt) {
    h.state = "out"; h.cause = "здоровье";
    ev("out", "Здоровье не даёт служить: выбыл со службы.");
  }
  return out;
}

// Прожить столько сезонов, начиная с возраста age. Возвращает, в какой сезон человек умер или выбыл (если случилось) и сколько сезонов пролежал.
// track — если передан, в него по сезонам пишется состояние: служит, в постели, выбыл, умер (для ленты в эмуляторе).
export type SeasonState = "ok" | "bed" | "out" | "dead";
export interface Lived { removedAt?: number; deadAt?: number; offSeasons: number; lived: number }
export function liveThrough(rng: Rng, h: Health, age: number, seasons: number, track?: SeasonState[]): Lived {
  const r: Lived = { offSeasons: 0, lived: 0 };
  for (let s = 0; s < seasons && h.state !== "dead"; s++) {
    const wasOk = h.state === "ok";
    seasonCheck(rng, h, age + s / SEASONS_IN_YEAR, s);
    if (wasOk) { r.lived++; if (h.off > 0) r.offSeasons++; }
    if (wasOk && h.state !== "ok") r.removedAt = s;
    if ((h.state as HealthState) === "dead" && r.deadAt === undefined) r.deadAt = s;
    // выбывший со службы живёт дальше: стареет и может умереть от старости
    if (h.state === "out" && rng.chance(ageDeathChance(h, age + s / SEASONS_IN_YEAR))) { h.state = "dead"; r.deadAt = s; }
    track?.push((h.state as HealthState) === "dead" ? "dead" : h.state === "out" ? "out" : h.off > 0 ? "bed" : "ok");
  }
  return r;
}
