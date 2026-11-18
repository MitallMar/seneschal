// Генерация партии: звезда, предыстория, молва, отношения на старте, расстановка и наследство прежних баронов с покровителями.
import type { Axis, Star, PostId, Side } from "../../data/types";
import { AXES, OPPOSED, POSTS, TRAITS, LIFE_TRAITS, MARKS, ASPIRATIONS, ROSTER } from "../../data/core";
import { RUMORS_AXIS, RUMORS_TRAIT } from "../../data/rumors";
import { BACKSTORY, LEGACY } from "../../data/backstory";
import { BALANCE as B } from "../balance";
import { Rng } from "../rng";
import { clamp, round1 } from "../util";
import { STAR_MAX, REL_MAX, relKey, topAxis, postName, holder, fitness } from "../state";
import type { Rumor, Person, Legacy, World, Economy } from "../state";
import { SIDES, VILLAGES } from "../../data/economy";
import { initAuthority } from "../authority";
import { initEconomy } from "../economy";
import { gender, addStar, noAxes } from "./people";
import { pickDesk } from "../season";

export function newWorld(seed: string, labOpen = false): World {
  const rng = new Rng(seed);
  const w: World = {
    seed, rng, people: [], rel: new Map(),
    posts: { starosta: null, desyatnik: null, klyuchnik: null, pisar: null, lesnichiy: null },
    head: null, labOpen, season: 1,
    factions: Object.fromEntries(SIDES.map((s) => [s, B.economy.start.trust])) as Record<Side, number>,
    resources: { poryadok: 0 }, eco: undefined as unknown as Economy, auth: initAuthority(), desk: null,
    authority: B.staff.authorityStart, deedsLeft: B.season.deeds, legacy: [], log: [],
  };

  // 1. Персонажи: авторская черта и метка, базовая звезда
  ROSTER.forEach((r, i) => {
    const star = {} as Star;
    for (const a of AXES) star[a] = B.star.base + rng.range(0, B.star.baseRandom);
    const trait = TRAITS.find((t) => t.id === r.trait)!;
    const mark = r.mark ? MARKS.find((m) => m.id === r.mark) : undefined;
    addStar(star, trait.star);
    if (mark) addStar(star, mark.star);
    w.people.push({
      id: i, name: r.name, female: r.female, age: r.age, trait, gained: [], mark, star, startStar: star,
      bio: [], loyalty: B.loyalty.start + (trait.mods.loyalty ?? 0) + rng.range(-B.loyalty.startSpread, B.loyalty.startSpread),
      tenure: 0, exp: 0, recent: [],
      know: { talks: 0, trait: false, traitAsked: false, aspiration: false, axes: false, seen: noAxes() },
      choices: noAxes(), decisions: 0, matchedTop: 0,
    });
  });

  // 2. Отношения по характеру — считаются после предыстории, а личные связи копятся сразу
  const personal = new Map<string, number>();

  // 3. Прогон предыстории
  for (const p of w.people) {
    const pool = rng.shuffle(BACKSTORY).slice(0, B.star.backstoryCount);
    const aspirations: string[] = [];
    for (const ev of pool) {
      let other: Person | undefined;
      if (ev.link !== undefined) {
        other = rng.pick(w.people.filter((o) => o.id !== p.id));
        const k = relKey(p.id, other.id);
        personal.set(k, (personal.get(k) ?? 0) + ev.link);
      }
      addStar(p.star, ev.shift);
      p.bio.push(gender(ev.text, p, other));
      if (ev.aspiration) aspirations.push(ev.aspiration);
    }
    // Нормализация: важны относительные склонности, а не сумма событий
    const mean = AXES.reduce((t, a) => t + p.star[a], 0) / AXES.length;
    for (const a of AXES) p.star[a] = clamp(B.star.center + (p.star[a] - mean) * B.star.spread, B.star.floor, STAR_MAX);
    const bounds = ROSTER[p.id].bounds;
    if (bounds) for (const a of AXES) if (bounds[a]) p.star[a] = clamp(p.star[a], bounds[a]![0], bounds[a]![1]);
    for (const a of AXES) p.star[a] = round1(p.star[a]);
    p.startStar = { ...p.star };

    // Стремление: последнее родившееся в предыстории, иначе — по ведущей оси
    let aspId = aspirations.length ? aspirations[aspirations.length - 1] : undefined;
    if (!aspId) {
      const byAxis: Record<Axis, string[]> = {
        zabota: ["post_starosta", "nadel"], dolg: ["post_desyatnik", "post_klyuchnik"],
        vygoda: ["post_pisar", "gorod"], derzost: ["labirint", "post_desyatnik"], obychai: ["post_lesnichiy", "pokoy"],
      };
      aspId = rng.pick(byAxis[topAxis(p.star)]);
    }
    p.aspiration = ASPIRATIONS.find((a) => a.id === aspId);
  }

  for (let i = 0; i < w.people.length; i++) {
    for (let j = i + 1; j < w.people.length; j++) {
      const a = w.people[i], b = w.people[j];
      let v = rng.range(-B.rel.startSpread, B.rel.startSpread);
      for (const [x, y] of OPPOSED) {
        const from = B.rel.opposedFrom;
        if ((a.star[x] >= from && b.star[y] >= from) || (a.star[y] >= from && b.star[x] >= from)) v -= B.rel.opposedPenalty;
      }
      if (topAxis(a.star) === topAxis(b.star)) v += B.rel.sameTop;
      v += personal.get(relKey(i, j)) ?? 0;
      w.rel.set(relKey(i, j), clamp(round1(v), -REL_MAX, REL_MAX));
    }
  }

  autoAssign(w, true);
  inherit(w);
  // Кто сидит на должности до потолка опыта, тот уже мастер: черта нажита до начала партии, Сенешаль о ней пока не знает.
  for (const p of w.people) {
    if (p.exp >= B.exp.master) {
      p.gained.push({ trait: LIFE_TRAITS.find((t) => t.id === "master_dela")!, season: 0, known: false, post: p.post });
    }
  }
  // Первая посадка — обучающая: о каждом известна одна вещь. О члене совета — молва или ключевая черта, об остальных — молва.
  for (const p of w.people) {
    if (p.post && !p.trait.hidden && rng.chance(B.know.startTraitChance)) { p.know.trait = true; p.know.traitAsked = true; }
    else p.rumor = makeRumor(w, p);
  }
  initEconomy(w);
  pickDesk(w);
  const legacy = w.legacy.map((l) => {
    const p = holder(w, l.post)!;
    return `Наследство прежних баронов: ${postName(l.post).toLowerCase()} ${p.name} посажен${p.female ? "а" : ""} ${l.how}, а не по годности. ${patronText(w, l)}`;
  });
  const lines = [
    `Совет достался от прежних баронов. Должности заняты давно — у людей есть стаж. ${legacy.length ? "По годности сидят не все." : "Все сидят по годности."}`,
    ...legacy,
    "О каждом известно что-то одно: молва или черта. Остальное откроют разговоры и дела.",
    `Герцог назначил испытание: урок ${w.eco.tax.lesson} мер в год, ${B.economy.tax.trialYears} года подряд. Сборщица приезжает осенью.`,
  ];
  w.log.push({ season: 0, kind: "info", title: `Новая партия, семя «${seed}»`, lines });
  return w;
}

// Молва о черте или о ведущей склонности; с шансом — неверная: тогда о чужой черте или о слабой склонности.
function makeRumor(w: World, p: Person): Rumor {
  const aboutTrait = w.rng.chance(B.know.rumorTraitChance);
  let wrong = w.rng.chance(B.know.rumorFalseChance);
  if (aboutTrait) {
    const id = wrong ? w.rng.pick(Object.keys(RUMORS_TRAIT).filter((x) => x !== p.trait.id)) : p.trait.id;
    return { text: gender(w.rng.pick(RUMORS_TRAIT[id]), p), trait: id, wrong };
  }
  const weak = AXES.filter((a) => p.star[a] < B.know.notable);
  if (!weak.length) wrong = false;
  const axis = wrong ? w.rng.pick(weak) : topAxis(p.star);
  return { text: gender(w.rng.pick(RUMORS_AXIS[axis]), p), axis, wrong };
}

export function autoAssign(w: World, initial = false) {
  for (const k of Object.keys(w.posts) as PostId[]) w.posts[k] = null;
  for (const p of w.people) { p.post = undefined; p.tenure = 0; p.exp = 0; }
  const pairs: { p: Person; post: PostId; f: number }[] = [];
  for (const p of w.people) for (const d of POSTS) pairs.push({ p, post: d.id, f: fitness(p, d.id) });
  pairs.sort((a, b) => b.f - a.f);
  for (const { p, post } of pairs) {
    if (w.posts[post] != null || p.post) continue;
    w.posts[post] = p.id;
    p.post = post;
    if (initial) { p.tenure = w.rng.int(B.staff.startTenureMin, B.staff.startTenureMax); p.exp = Math.min(p.tenure, B.exp.master); }
  }
  // главный — самый лояльный из совета
  const council = w.people.filter((p) => p.post);
  w.head = council.sort((a, b) => b.loyalty - a.loyalty)[0]?.id ?? null;
}

// Наследство прежних баронов: одна-две должности заняты не по годности — по родству, по старшинству или по милости.
// Годный, которого обошли, остаётся в замке без должности; причина — строкой в биографии посаженного и в летописи старта.
function inherit(w: World) {
  const n = w.rng.int(B.staff.legacyMin, Math.max(B.staff.legacyMin, B.staff.legacyMax));
  const passed = new Set<number>();   // обойдённые: на другую должность их не сажают — там они могли бы оказаться и годнее
  for (const d of w.rng.shuffle(POSTS).slice(0, n)) {
    const free = w.people.filter((p) => !p.post && !passed.has(p.id)), prev = holder(w, d.id);
    if (!free.length || !prev) continue;
    const why = w.rng.pick(LEGACY);
    // по старшинству — самый старый из тех, кто без должности; по родству и по милости — кто придётся
    const next = why.id === "starshinstvo" ? free.reduce((a, b) => (b.age > a.age ? b : a)) : w.rng.pick(free);
    next.post = d.id; next.tenure = prev.tenure; next.exp = prev.exp;
    prev.post = undefined; prev.tenure = 0; prev.exp = 0;
    passed.add(prev.id);
    w.posts[d.id] = next.id;
    // покровитель: у родни — человек замка или деревня, у старшинства — люди замка, у милости — двор
    const l: Legacy = { post: d.id, how: why.how };
    if (why.id === "rodstvo" && w.rng.chance(B.staff.patronKin)) l.person = w.rng.pick(w.people.filter((p) => p.id !== next.id && p.id !== prev.id)).id;
    else l.side = why.id === "rodstvo" ? w.rng.pick(VILLAGES) : why.id === "starshinstvo" ? "zamok" : "dvor";
    next.bio.push(`${gender(why.text.replace("{post}", postName(d.id)), next)} ${patronText(w, l)}`);
    w.legacy.push(l);
  }
  if (w.legacy.length) w.head = w.people.filter((p) => p.post).reduce((a, b) => (b.loyalty > a.loyalty ? b : a)).id;
}

export const PATRON_SIDE: Partial<Record<Side, string>> = { brod: "родня в деревне у брода", opushka: "родня в деревне у опушки", zamok: "старшие слуги замка", dvor: "двор Герцога" };

const patronName = (w: World, l: Legacy): string => (l.person != null ? `${w.people[l.person].name}, родня` : PATRON_SIDE[l.side!] ?? "прежние люди барона");

export const patronText = (w: World, l: Legacy): string => `За ${holder(w, l.post)?.female ? "неё" : "него"} ${l.side === "zamok" ? "стоят" : "стоит"} ${patronName(w, l)}.`;

// Покровитель посаженного прежним бароном, пока тот на должности.
export function patronOf(w: World, p: Person): Legacy | undefined {
  return p.post ? w.legacy.find((l) => l.post === p.post) : undefined;
}
