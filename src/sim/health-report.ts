// Метрики здоровья (docs/design/zdorovye.md): сколько людей за партию слегает, выбывает и умирает, и до скольких лет живут.
// Зовут tools/health.ts, эмулятор и тесты. Цели — раздел health.goal в balance.ts.
import { HEALTH_TRAITS } from "../data/health";
import { BALANCE as B } from "./balance";
import { Rng } from "./rng";
import { birthHealth, makeFamily, liveThrough, healthTrait, SEASONS_IN_YEAR, type Health, type Family } from "./health";
import { mean, round3 } from "./util";

export interface HealthMetrics {
  people: number;
  years: number;
  removed: number;                       // доля умерших или выбывших со службы за партию
  dead: number;                          // из них умерло
  causes: Record<string, number>;        // доля людей по причине: болезнь, рана, старость, здоровье (выбыл)
  curve: number[];                       // по годам партии: доля тех, кто ещё служит
  byAge: { from: number; to: number; people: number; removed: number }[]; // по возрасту на начало партии
  sickEver: number;                      // доля тех, кто слёг хотя бы раз
  offShare: number;                      // доля сезонов в постели
  gained: number;                        // доля тех, кто нажил черту здоровья
  badBorn: number;                       // доля людей с дурной чертой здоровья с рождения (врождённой или наследственной)
  traitShare: Record<string, number>;    // по id черты: у какой доли людей она есть к концу партии
  kinShare: { withKin: number; base: number }; // наследственная черта: у родни того, у кого она есть, и в среднем
  life: { median: number; reachElder: number; reachLate: number; reachMax: number; hist: { age: number; share: number }[]; medianHealthy: number; medianBad: number }; // срок жизни взрослого
}

const median = (xs: number[]) => { const a = [...xs].sort((x, y) => x - y); return a.length ? a[Math.floor(a.length / 2)] : 0; };
const isBad = (h: Health) => h.traits.some((id) => !healthTrait(id).good && healthTrait(id).origin !== "gained");

// Люди на начало партии: семьи по familySize человек, возраст от ageMin до ageMax.
export function healthCohort(people: number, seed: string): { h: Health; age: number; family: Family }[] {
  const rng = new Rng(seed);
  const out: { h: Health; age: number; family: Family }[] = [];
  let family = makeFamily(rng, "семья-0");
  for (let i = 0; i < people; i++) {
    if (i % B.health.familySize === 0) family = makeFamily(rng, `семья-${i / B.health.familySize}`);
    out.push({ h: birthHealth(rng, family), age: rng.int(B.health.ageMin, Math.max(B.health.ageMin, B.health.ageMax)), family });
  }
  return out;
}

export function healthMetrics(people: number, seed = "здоровье"): HealthMetrics {
  const years = B.health.years, seasons = years * SEASONS_IN_YEAR;
  const cohort = healthCohort(people, seed);
  const badBorn = cohort.filter((c) => isBad(c.h)).length / Math.max(1, people);
  // наследственность: у родни носителя и в среднем
  const hered = (h: Health) => h.traits.some((id) => healthTrait(id).origin === "hereditary");
  const kin = cohort.filter((c) => cohort.some((o) => o !== c && o.family === c.family && hered(o.h)));
  const kinShare = { withKin: round3(kin.filter((c) => hered(c.h)).length / Math.max(1, kin.length)), base: round3(cohort.filter((c) => hered(c.h)).length / Math.max(1, people)) };
  // партия
  const rng = new Rng(`${seed}-партия`);
  const lived = cohort.map((c) => liveThrough(rng, c.h, c.age, seasons));
  const causes: Record<string, number> = { "болезнь": 0, "рана": 0, "старость": 0, "здоровье": 0 };
  for (const c of cohort) if (c.h.state !== "ok" && c.h.cause) causes[c.h.cause] += 1 / Math.max(1, people);
  const removedAt = lived.map((l) => l.removedAt);
  const curve = Array.from({ length: years + 1 }, (_, y) => round3(removedAt.filter((s) => s === undefined || s >= y * SEASONS_IN_YEAR).length / Math.max(1, people)));
  const edges = [B.health.ageMin, B.health.oldFrom, B.health.elderFrom, B.health.lifeMax].filter((v, i, a) => i === 0 || v > a[i - 1]);
  const byAge = edges.slice(0, -1).map((from, i) => {
    const idx = cohort.map((c, k) => (c.age >= from && c.age < edges[i + 1] ? k : -1)).filter((k) => k >= 0);
    return { from, to: edges[i + 1], people: idx.length, removed: round3(idx.filter((k) => removedAt[k] !== undefined).length / Math.max(1, idx.length)) };
  }).filter((b) => b.people > 0);
  const start = new Map(cohort.map((c) => [c, c.h.traits.length]));
  // срок жизни: отдельные люди от взрослости до смерти
  const lifeRng = new Rng(`${seed}-жизнь`);
  const adult = B.natura.adultAge, maxSeasons = (B.health.lifeMax + 60 - adult) * SEASONS_IN_YEAR;
  const lives = Array.from({ length: people }, (_, i) => {
    const fam = makeFamily(lifeRng, `род-${i}`);
    const h = birthHealth(lifeRng, fam);
    const bad = isBad(h);
    const l = liveThrough(lifeRng, h, adult, maxSeasons);
    return { age: adult + (l.deadAt ?? maxSeasons) / SEASONS_IN_YEAR, bad };
  });
  const ages = lives.map((l) => l.age);
  const hist = Array.from({ length: Math.ceil((B.health.lifeMax + 20 - adult) / 10) }, (_, i) => {
    const from = adult + i * 10;
    return { age: from, share: round3(ages.filter((a) => a >= from && a < from + 10).length / Math.max(1, people)) };
  });
  return {
    people, years,
    removed: round3(removedAt.filter((s) => s !== undefined).length / Math.max(1, people)),
    dead: round3(cohort.filter((c) => c.h.state === "dead").length / Math.max(1, people)),
    causes: Object.fromEntries(Object.entries(causes).map(([key, v]) => [key, round3(v)])),
    curve, byAge,
    sickEver: round3(cohort.filter((c) => c.h.log.some((e) => e.kind === "ill" || e.kind === "hard" || e.kind === "wound")).length / Math.max(1, people)),
    offShare: round3(lived.reduce((s, l) => s + l.offSeasons, 0) / Math.max(1, lived.reduce((s, l) => s + l.lived, 0))),
    gained: round3(cohort.filter((c) => c.h.traits.length > (start.get(c) ?? 0) || c.h.log.some((e) => e.kind === "trait")).length / Math.max(1, people)),
    badBorn: round3(badBorn),
    traitShare: Object.fromEntries(HEALTH_TRAITS.map((t) => [t.id, round3(cohort.filter((c) => c.h.traits.includes(t.id)).length / Math.max(1, people))])),
    kinShare,
    life: {
      median: Math.round(median(ages)), reachElder: round3(ages.filter((a) => a >= B.health.elderFrom).length / Math.max(1, people)),
      reachLate: round3(ages.filter((x) => x >= B.health.goal.lateAge).length / Math.max(1, people)),
      reachMax: round3(ages.filter((a) => a >= B.health.lifeMax - 10).length / Math.max(1, people)), hist,
      medianHealthy: Math.round(median(lives.filter((l) => !l.bad).map((l) => l.age))), medianBad: Math.round(median(lives.filter((l) => l.bad).map((l) => l.age))),
    },
  };
}
export const healthMean = mean;

// Что не дотягивает до целей раздела health.goal: пусто — цели выполнены.
export function healthWarnings(m: HealthMetrics): string[] {
  const G = B.health.goal, out: string[] = [];
  if (m.removed < G.removedMin) out.push(`совет почти не меняется: за партию выбывает ${m.removed} при цели не меньше ${G.removedMin}`);
  if (m.removed > G.removedMax) out.push(`людей косит слишком быстро: за партию выбывает ${m.removed} при цели не больше ${G.removedMax}`);
  if (m.offShare < G.offMin) out.push(`болеют слишком редко: в постели ${m.offShare} сезонов при цели не меньше ${G.offMin}`);
  if (m.offShare > G.offMax) out.push(`болеют слишком часто: в постели ${m.offShare} сезонов при цели не больше ${G.offMax}`);
  if (m.life.median < G.medianLife) out.push(`живут мало: половина доживает до ${m.life.median} при цели не меньше ${G.medianLife}`);
  if (m.life.reachElder < G.reachElder) out.push(`до глубокой старости доживает ${m.life.reachElder} при цели не меньше ${G.reachElder}`);
  if (m.life.reachLate > G.lateMax) out.push(`слишком многие доживают до ${G.lateAge}: ${m.life.reachLate} при цели не больше ${G.lateMax}`);
  if (m.badBorn < G.badBornMin) out.push(`все одинаково здоровы: дурная черта с рождения у ${m.badBorn} при цели не меньше ${G.badBornMin}`);
  if (m.badBorn > G.badBornMax) out.push(`слишком много больных с рождения: ${m.badBorn} при цели не больше ${G.badBornMax}`);
  const never = HEALTH_TRAITS.filter((t) => !m.traitShare[t.id]).map((t) => t.name);
  if (never.length) out.push(`черты здоровья не встречаются: ${never.join(", ")}`);
  return out;
}
