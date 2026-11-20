// Падение «под чужой рукой» (задача И14, замысел — docs/design/hozyaystvo.md, раздел 10): когда баронство отдают другому,
// новый барон со свитой, его курс и двор, пути его падения (двор, земля, броня) и возвращение. Здесь же личные дела Сенешаля при бароне.
import type { CourseId, Side, Star } from "../../data/types";
import { AXES, OPPOSED, POSTS, TRAITS, ASPIRATIONS } from "../../data/core";
import { COURSES, SIDE_NAMES } from "../../data/economy";
import { BARONS, RETINUE, CRISIS_SIDES, BACK_NAMES, type BackHow, type RetinueEntry } from "../../data/fall";
import { NATURES } from "../../data/natura";
import { BALANCE as B } from "../balance";
import { clamp, round1, round2, mean } from "../util";
import { STAR_MAX, REL_MAX, relKey, topAxis, fitness, postName } from "../state";
import type { World, Person, Baron, Under } from "../state";
import { addAuthority } from "../authority";
import { addTrust } from "../economy/zones";
import { setCourse } from "../economy/doer";
import { addRel, noAxes } from "../council/people";
import { rollPerson } from "../natura";
import { crisisNow } from "./base";
import { crisisTick, maybeLevy, arrearsNow } from "./crisis";

// ---------- Когда баронство отдают другому ----------

// Почему Герцог отдаёт баронство другому прямо сейчас; пусто — не отдаёт. double — два кризиса сторон начались сразу.
export function fallReason(w: World, double = false): string {
  if (w.fall.levyFailed) return "внеочередной сбор не закрыт к сроку";
  if (w.eco.tax.patience <= B.fall.patienceOut) return "терпение Герцога исчерпано";
  if (arrearsNow(w) && crisisNow(w)) return "недоимка вместе с кризисом стороны";
  if (double) return "два кризиса сторон сразу";
  return "";
}

// Насколько курс по душе барону: его склонности «за» минус склонности «против» (нет таких — середина звезды).
function courseLean(star: Star, id: CourseId): number {
  const c = COURSES.find((x) => x.id === id)!, of = (axes: typeof AXES) => (axes.length ? mean(axes.map((a) => star[a])) : B.star.center);
  return of(c.pro) - of(c.contra);
}
export const baronCourse = (b: Baron): CourseId => COURSES.reduce((best, c) => (courseLean(b.star, c.id) > courseLean(b.star, best.id) ? c : best)).id;

// Пришлый из свиты барона: звезда — тем же способом, что у людей хозяйства; отношения с каждым — как на старте партии.
function stranger(w: World, r: RetinueEntry, baron: Baron): Person {
  const trait = TRAITS.find((t) => t.id === r.trait)!, star = {} as Star, id = w.people.length;
  for (const a of AXES) star[a] = B.star.base + w.rng.range(0, B.star.baseRandom) + (trait.star[a] ?? 0);
  const m = mean(AXES.map((a) => star[a]));
  for (const a of AXES) star[a] = round1(clamp(B.star.center + (star[a] - m) * B.star.spread, B.star.floor, STAR_MAX));
  const p: Person = {
    id, name: r.name, female: r.female, age: r.age, trait, gained: [], star, startStar: { ...star },
    bio: [`Приш${r.female ? "ла" : "ёл"} со двором барона: ${baron.name}, ${baron.who}.`], loyalty: B.fall.retinueLoyalty, tenure: 0, exp: 0, recent: [],
    know: { talks: 0, trait: !trait.hidden, traitAsked: !trait.hidden, aspiration: false, axes: false, links: false, seen: noAxes() },
    choices: noAxes(), decisions: 0, matchedTop: 0,
  };
  for (const o of w.people) {
    let v = w.rng.range(-B.rel.startSpread, B.rel.startSpread);
    for (const [x, y] of OPPOSED) {
      const from = B.rel.opposedFrom;
      if ((star[x] >= from && o.star[y] >= from) || (star[y] >= from && o.star[x] >= from)) v -= B.rel.opposedPenalty;
    }
    if (topAxis(star) === topAxis(o.star)) v += B.rel.sameTop;
    w.rel.set(relKey(id, o.id), clamp(round1(v), -REL_MAX, REL_MAX));
  }
  for (const el of w.eco.elders) el.rel[id] = round1(w.rng.range(-B.rel.startSpread, B.rel.startSpread));
  w.people.push(p);
  return p;
}

// Падение: баронство отдано другому. Барон приводит свиту, сгоняет людей с должностей, задаёт курс; авторитет Сенешаля ограничен.
export function fallNow(w: World, why: string, lines: string[] = []): Under {
  const F = B.fall, f = w.fall, n = f.falls.length, entry = BARONS[Math.min(n, BARONS.length - 1)];
  const nature = w.rng.pick(NATURES), np = rollPerson(`${w.seed}|барон|${n}`, nature, entry.age);
  const baron: Baron = { def: entry.id, name: entry.name, female: entry.female, age: entry.age, who: entry.who, nature: nature.name, star: { ...np.star } };
  const u: Under = { since: w.season + 1, why, baron, armor: F.armor, steps: { dvor: 0, zemlya: 0 }, retinue: [], displaced: [], consent: 0, jump: false };
  const out = [`Герцог отдал баронство другому: ${why}. Новый барон — ${baron.name}, ${baron.who}; по натуре ${baron.nature.toLowerCase()}.`,
    "Сенешаль остаётся сенешалем: ключи, архивы и хозяйство на нём — без него барон не справится."];
  // свита: кто ещё не приходил; каждый берёт должность, к которой годен больше всего
  const names = new Set(w.people.map((p) => p.name)), fresh = RETINUE.filter((r) => !names.has(r.name));
  const count = Math.min(fresh.length, w.rng.int(F.retinueMin, Math.max(F.retinueMin, F.retinueMax)));
  for (const r of fresh.slice(0, count)) {
    const p = stranger(w, r, baron), taken = u.retinue.map((id) => w.people[id].post);
    const post = POSTS.filter((d) => !taken.includes(d.id)).reduce((a, b) => (fitness(p, b.id) > fitness(p, a.id) ? b : a)).id;
    const prev = w.posts[post] != null ? w.people[w.posts[post]!] : undefined;
    if (prev) {
      const legacy = w.legacy.find((l) => l.post === post);
      u.displaced.push({ person: prev.id, post, tenure: prev.tenure, exp: prev.exp, legacy });
      w.legacy = w.legacy.filter((l) => l !== legacy);
      prev.post = undefined; prev.tenure = 0; prev.agreed = false; prev.persuade = 0; prev.order = undefined;
      prev.loyalty = round1(clamp(prev.loyalty + F.displacedLoyalty, -REL_MAX, REL_MAX));
      addRel(w, prev.id, p.id, F.strangerRel);
      if (w.head === prev.id) w.head = null;
    }
    w.posts[post] = p.id; p.post = post;
    p.aspiration = ASPIRATIONS.find((a) => a.post === post);   // за этим местом он и пришёл
    u.retinue.push(p.id);
    out.push(`${p.name} из свиты барона теперь «${postName(post)}»${prev ? `; ${prev.name} согнан${prev.female ? "а" : ""} с места и этого не простит — ни барону, ни пришл${p.female ? "ой" : "ому"}` : ""}.`);
  }
  f.under = u;
  f.falls.push({ season: w.season, why });
  f.levyFailed = false;
  // авторитет: потеря за падение, сверх нового потолка — сгорает
  addAuthority(w, -F.fallAuthority, `падение: ${why}`, "fall");
  if (w.authority > F.capUnder) addAuthority(w, -(w.authority - F.capUnder), "под чужой рукой слово Сенешаля весит меньше", "fall");
  const course = baronCourse(baron);
  setCourse(w, course, true);
  out.push(`Курс теперь задаёт барон: «${COURSES.find((c) => c.id === course)!.name}». Его двор ест из амбара и казны, подать и терпение Герцога — на нём.`,
    `Потолок авторитета — ${F.capUnder}. Перестановки — только с согласия барона. Если ничего не делать, лес выживет его за ${F.armor} сез.`);
  lines.push(`⚠ Падение: ${why}. Баронство отдано другому — Сенешаль под чужой рукой.`);
  w.log.push({ season: w.season, kind: "info", title: "Падение: под чужой рукой", lines: out, tone: "bad" });
  return u;
}

// ---------- Под чужой рукой ----------

// Сколько сезонов Сенешаль уже под чужой рукой (на конец текущего сезона).
export const underSeasons = (w: World): number => (w.fall.under ? w.season - w.fall.under.since + 1 : 0);

// Барон пал: свита уходит с должностей, согнанные возвращаются, курс снова за Сенешалем. Цена — по тому, сколько длилось и как вернулся.
export function comeBack(w: World, lines: string[] = []): BackHow {
  const F = B.fall, f = w.fall, u = f.under!, seasons = underSeasons(w);
  const own = u.steps.dvor + u.steps.zemlya;
  const how: BackHow = own >= F.ownSteps && own > 0 ? (u.steps.dvor >= u.steps.zemlya ? "dvor" : "zemlya") : "bronya";
  const out = [`Барон ${u.baron.name} пал: ${BACK_NAMES[how]}. Под чужой рукой прошло ${seasons} сез.`];
  for (const id of u.retinue) {
    const p = w.people[id];
    if (p.post) { w.posts[p.post] = null; p.post = undefined; p.tenure = 0; p.exp = 0; p.order = undefined; }
    if (w.head === id) w.head = null;
  }
  const backNames: string[] = [];
  for (const d of u.displaced) {
    const p = w.people[d.person];
    if (p.post || w.posts[d.post] != null) continue;
    w.posts[d.post] = p.id; p.post = d.post; p.tenure = d.tenure; p.exp = d.exp;
    if (d.legacy) w.legacy.push(d.legacy);
    backNames.push(p.name);
  }
  if (u.retinue.length) out.push(`Люди барона остались без должностей${backNames.length ? `; на свои места вернулись: ${backNames.join(", ")}` : ""}.`);
  // что барон успел сломать: чем дольше, тем дороже
  const ruin = round1(F.ruin * Math.min(seasons, F.ruinMax));
  if (ruin > 0) {
    for (const s of CRISIS_SIDES) addTrust(w, s, -ruin);
    out.push(`Барон успел наломать: доверие деревень, купцов и людей замка −${ruin}.`);
  }
  f.under = null;
  f.disgrace = 0;
  if (how === "bronya") {
    addAuthority(w, -F.backArmor, "вернулся, дождавшись леса: «тот, за кого лес»", "fall");
    out.push(`Сенешаль ничего не сделал сам: о нём говорят как о том, за кого лес. Авторитет −${F.backArmor}.`);
  } else {
    addAuthority(w, F.backOwn, "вернулся своими силами", "fall");
    out.push(`Вернулся своими силами — значит, сильный. Авторитет +${F.backOwn}.`);
  }
  w.eco.tax.patience = Math.max(w.eco.tax.patience, B.economy.tax.waits);
  w.eco.course = null; w.eco.courseSeasons = 0; w.eco.shaky = false;
  out.push("Герцог ждёт. Курс снова задаёт Сенешаль.");
  const rec = f.falls[f.falls.length - 1];
  rec.back = w.season; rec.how = how;
  lines.push(`Барон ${u.baron.name} пал — Сенешаль снова хозяин в замке.`);
  w.log.push({ season: w.season, kind: "info", title: "Возвращение", lines: out, tone: how === "bronya" ? "mixed" : "good" });
  return how;
}

// Конец сезона под чужой рукой: броня тает; кончился акт — остаток заберёт прыжок; кончилась броня — барон пал.
function underSeason(w: World, lines: string[]): void {
  const u = w.fall.under!;
  u.armor = round2(u.armor - 1);
  if (u.armor <= 0) { comeBack(w, lines); return; }
  if (!u.jump && w.season >= B.fall.actSeasons) {
    u.jump = true;
    lines.push(`Акт кончается, а Сенешаль ещё под чужой рукой (барону осталось ${Math.ceil(u.armor)} сез.). Остаток заберёт прыжок: лес выживет барона за эти два года, но новый акт начнётся со шрамами и меньшим авторитетом.`);
  }
}

// Конец сезона: счёт отказов и новые кризисы, затем — падение, жизнь под чужой рукой или внеочередной сбор. Зовёт upkeep после подати и указов.
export function fallSeason(w: World, lines: string[]): void {
  if (!B.fall.on) return;
  const double = crisisTick(w, lines);
  if (w.fall.under) underSeason(w, lines);
  else {
    const why = fallReason(w, double);
    if (why) fallNow(w, why, lines);
    else maybeLevy(w, lines);
  }
  w.fall.levyFailed = false;
}

// ---------- Личные дела Сенешаля при бароне ----------

// Шанс склонить барона к курсу: по его звезде — к тому, что ему по душе, склонить легче.
export function swayChance(w: World, id: CourseId): number {
  const u = w.fall.under;
  return u ? round2(clamp(B.fall.swayBase + B.fall.swayStar * courseLean(u.baron.star, id), 0, 1)) : 0;
}
// Склонить барона к курсу — личное дело; решает всё равно барон.
export function sway(w: World, id: CourseId): boolean {
  const u = w.fall.under;
  if (!u || w.deedsLeft <= 0 || w.eco.course === id) return false;
  w.deedsLeft--;
  const c = COURSES.find((x) => x.id === id)!, ok = w.rng.chance(swayChance(w, id));
  if (ok) setCourse(w, id, true);
  const line = ok ? `Барон ${u.baron.name} выслушал Сенешаля и согласился: курс — «${c.name}».` : `Барон ${u.baron.name} выслушал Сенешаля и сделал по-своему: курс «${c.name}» ему не по душе.`;
  w.log.push({ season: w.season, kind: "staff", title: "Разговор с бароном", lines: [line] });
  return ok;
}
// Заручиться согласием барона на перестановки — личное дело; согласие действует до конца сезона. Людей барона не тронуть и с ним.
export function askConsent(w: World): boolean {
  const u = w.fall.under;
  if (!u || w.deedsLeft <= 0 || u.consent === w.season) return false;
  w.deedsLeft--;
  u.consent = w.season;
  w.log.push({ season: w.season, kind: "staff", title: "Разговор с бароном", lines: [`Барон ${u.baron.name} дал согласие на перестановки в этом сезоне. Своих людей трогать не велел.`] });
  return true;
}
// Раскачать сторону против барона — личное дело: её доверие падает (страдает и своя земля). Барон заметит — опала.
export function stir(w: World, side: Side): boolean {
  const F = B.fall, u = w.fall.under;
  if (!u || w.deedsLeft <= 0 || !CRISIS_SIDES.includes(side)) return false;
  w.deedsLeft--;
  const lost = -addTrust(w, side, -F.stir);
  const lines = [`Сенешаль тихо раскачивает сторону «${SIDE_NAMES[side]}» против барона: доверие −${lost}.`];
  if (w.rng.chance(F.stirNotice)) {
    w.fall.disgrace = w.season + F.disgraceSeasons;
    w.deedsLeft = 0;
    addAuthority(w, -F.disgraceAuthority, "опала: барон заметил, что Сенешаль мутит воду", "fall");
    lines.push(`⚠ Барон ${u.baron.name} заметил. Опала: Сенешаль отстранён от совета до конца сезона и ещё на ${F.disgraceSeasons} сез. — без личных дел. Авторитет −${F.disgraceAuthority}.`);
  }
  w.log.push({ season: w.season, kind: "staff", title: "Против барона", lines, tone: "bad" });
  return true;
}
