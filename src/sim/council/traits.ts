// Черты в течение жизни: привычка, должность, отношения, перелом; уход должностных черт.
import { AXES, LIFE_TRAITS } from "../../data/core";
import { BALANCE as B } from "../balance";
import { clamp, round1 } from "../util";
import { STAR_MAX, isStale } from "../state";
import type { Person, World } from "../state";
import { addStar, lower } from "./people";
import { traitLabel } from "./know";

// Человек приобретает черту: не больше B.traits.maxGained сверх ключевой, одна и та же (с той же целью) — один раз.
// Должностные черты (source "post") в предел не входят: они про место, а не про человека, и уходят вслед за должностью (dropPostTraits).
// Запись идёт в летопись (lines) и в биографию; сдвиг звезды черты применяется сразу.
// Сенешаль о новой черте знает: она нажита у него на глазах. Скрытую (hidden) выдаст только поступок, как ключевую.
export function gainTrait(w: World, p: Person, traitId: string, lines: string[], target?: number): boolean {
  const trait = LIFE_TRAITS.find((t) => t.id === traitId);
  if (!trait) throw new Error(`Нет приобретаемой черты ${traitId}`);
  const onPost = trait.source === "post";
  const had = p.gained.find((g) => g.trait.id === traitId && g.target === target);
  // та же должностная черта, нажитая уже на новом месте, пока старая не снята: она переходит на новую должность
  if (had && onPost) { had.post = p.post; had.away = 0; }
  if (had) return false;
  if (!onPost && p.gained.filter((g) => g.trait.source !== "post").length >= B.traits.maxGained) return false;
  p.gained.push({ trait, target, season: w.season, known: !trait.hidden, ...(onPost ? { post: p.post } : {}) });
  addStar(p.star, trait.star);
  for (const a of AXES) p.star[a] = round1(clamp(p.star[a], 0, STAR_MAX));
  const label = traitLabel(w, { trait, target });
  lines.push(`✦ Новая черта: ${p.name} — «${label}». ${trait.desc}.`);
  p.bio.push(`На службе у Сенешаля (сезон ${w.season}) нажил${p.female ? "а" : ""} черту «${label}»: ${lower(trait.desc)}.`);
  return true;
}

// Перелом: резкий сдвиг звезды и новая черта («Ожесточился», «Стал набожен»). Заготовка: событий-поводов пока нет, зовут её тесты и будущие сцены.
export function breakdown(w: World, id: number, traitId: string, why: string): boolean {
  const p = w.people[id];
  const lines = [why];
  if (LIFE_TRAITS.find((t) => t.id === traitId)?.source !== "break") throw new Error(`Черта ${traitId} — не перелом`);
  if (!gainTrait(w, p, traitId, lines)) return false;
  w.log.push({ season: w.season, kind: "info", title: `Перелом: ${p.name}`, lines });
  return true;
}

// Должностная черта держится на должности: ушёл — через B.traits.postTraitLag сезонов она снимается, вернулся раньше — остаётся.
function dropPostTraits(w: World, p: Person, lines: string[]) {
  p.gained = p.gained.filter((g) => {
    if (g.trait.source !== "post") return true;
    g.away = g.post === p.post ? 0 : (g.away ?? 0) + 1;
    if (g.away < B.traits.postTraitLag) return true;
    lines.push(`✧ Черта ушла: ${p.name} больше не «${g.trait.name}» — должность оставлена.`);
    p.bio.push(`Оставив должность (сезон ${w.season}), утратил${p.female ? "а" : ""} черту «${g.trait.name}».`);
    return false;
  });
}

// Раз в сезон: должностные черты уходят вслед за должностью, появляются черты из привычки и из должности.
export function lifeTraits(w: World, p: Person, lines: string[]) {
  dropPostTraits(w, p, lines);
  p.recent = p.recent.filter((r) => r.season > w.season - B.traits.habitSeasons);
  const n = p.recent.length;
  if (n >= B.traits.habitMinDecisions) {
    for (const t of LIFE_TRAITS) {
      if (t.source !== "habit" || !t.axis) continue;
      if (p.recent.filter((r) => r.axes.includes(t.axis!)).length / n >= B.traits.habitShare) gainTrait(w, p, t.id, lines);
    }
  }
  if (!p.post) return;
  if (p.exp >= B.exp.master) gainTrait(w, p, "master_dela", lines);
  if (isStale(p)) gainTrait(w, p, "obros_svyazyami", lines);
  const asp = p.aspiration?.post;
  if (asp && asp !== p.post && p.tenure >= B.traits.tiredFrom) gainTrait(w, p, "ustal_ot_sluzhby", lines);
}
