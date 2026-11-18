// Заготовки ситуаций для эмулятора совета (задача И2): партия по семени, в которой сразу есть что смотреть.
// Заготовка правит готовую партию после newWorld; ручки баланса не трогает. Зовут экран (?preset=…), тесты и боты.
import type { PostId } from "../data/types";
import { LIFE_TRAITS, POSTS } from "../data/core";
import { BALANCE as B } from "./balance";
import { newWorld, holder, setRel, fitness, STAR_MAX, type World, type Person } from "./sim";

export interface Preset { id: string; name: string; desc: string; apply: (w: World) => void }

const council = (w: World): Person[] => w.people.filter((p) => p.post);
// Засидевшийся: стаж за порогом и должностная черта, как если бы сидел давно.
function stale(w: World, post: PostId): Person | undefined {
  const p = holder(w, post);
  if (!p) return undefined;
  p.tenure = B.exp.staleFrom + B.exp.settled; p.exp = B.exp.master;
  if (!p.gained.some((g) => g.trait.id === "obros_svyazyami")) p.gained.push({ trait: LIFE_TRAITS.find((t) => t.id === "obros_svyazyami")!, season: 0, known: true, post });
  return p;
}
function vacate(w: World, post: PostId) {
  const p = holder(w, post);
  if (!p) return;
  if (w.head === p.id) w.head = null;
  w.posts[post] = null; p.post = undefined; p.tenure = 0; p.exp = 0;
}

export const PRESETS: Preset[] = [
  { id: "vragi", name: "Враги в совете", desc: "все в совете — враги друг другу: саботаж, жалобы, опоры от совета нет", apply: (w) => {
    for (const a of council(w)) for (const b of council(w)) if (a.id < b.id) setRel(w, a.id, b.id, B.rel.enemy - 1);
  } },
  { id: "pisar", name: "Засидевшийся писарь", desc: "писарь сидит давно: оброс связями, наказы слушает хуже, ведёт дело по-своему", apply: (w) => { stale(w, "pisar"); } },
  { id: "novichki", name: "Все новички", desc: "весь совет только что назначен: опыта нет, дела идут хуже", apply: (w) => {
    for (const p of council(w)) { p.tenure = 0; p.exp = 0; p.gained = p.gained.filter((g) => g.trait.source !== "post"); }
  } },
  { id: "pusto", name: "Пустая должность", desc: "ключника нет: поток вполсилы, еду считать некому, дела двух сфер решает один", apply: (w) => vacate(w, "klyuchnik") },
  { id: "glavny", name: "Главный без признания", desc: "главного не признают двое из совета: споры он не рассудит, опоры от совета нет", apply: (w) => {
    const c = council(w);
    w.head ??= c[0].id;
    for (const p of c.filter((x) => x.id !== w.head).slice(0, 2)) setRel(w, w.head, p.id, B.council.headMinRel - 2);
  } },
  { id: "ambar", name: "Испытание с пустым амбаром", desc: "первый год испытания, а еды и серебра почти нет", apply: (w) => {
    w.eco.stock = { eda: B.economy.flow.upkeep, tovary: 0, serebro: 0 };
  } },
  { id: "kuptsy", name: "Купцы отказывают", desc: "купцы не торгуют и не платят пошлин: товары лежат, серебру взяться неоткуда", apply: (w) => {
    w.factions.kuptsy = B.economy.trust.refuse - 1;
    w.eco.zoneWas.kuptsy = "отказывают";
  } },
  { id: "vor", name: "Вороватый писарь на счёте", desc: "писарь засиделся и жаден: берёт откат, серебро утекает, а строку он прячет", apply: (w) => {
    const p = stale(w, "pisar");
    if (p) p.star.vygoda = STAR_MAX - 1;
  } },
  { id: "nedoimka", name: "Недоимка и терпение на исходе", desc: "прошлый урок не закрыт: недоимка с надбавкой лежит на этом году, Герцог на пределе", apply: (w) => {
    const t = w.eco.tax;
    t.carried = Math.round(t.lesson * (1 + B.economy.tax.arrears) / 2);
    t.due = t.lesson + t.carried;
    t.patience = Math.max(0, B.economy.tax.displeased - 1);
  } },
  { id: "nasledstvo", name: "Наследство прежних баронов", desc: "совет собирали по родству и милости: на трёх должностях из пяти — люди не по годности", apply: (w) => {
    // три должности по жребию (генератор мира, до первого хода): на каждую — наименее годный из тех, кто без должности
    for (const d of w.rng.shuffle(POSTS).slice(0, Math.ceil(POSTS.length / 2))) {
      const free = w.people.filter((p) => !p.post);
      const next = free.reduce((a, b) => (fitness(b, d.id) < fitness(a, d.id) ? b : a));
      const tenure = w.rng.int(B.staff.startTenureMin, B.staff.startTenureMax);
      vacate(w, d.id);
      w.posts[d.id] = next.id; next.post = d.id; next.tenure = tenure; next.exp = Math.min(tenure, B.exp.master);
    }
    w.head ??= council(w).reduce((a, b) => (b.loyalty > a.loyalty ? b : a)).id;
  } },
];

// Новая партия по семени с заготовкой. Неизвестный id — обычная партия.
export function newPreset(seed: string, presetId: string | null, labOpen = false): World {
  const w = newWorld(seed, labOpen);
  const preset = PRESETS.find((x) => x.id === presetId);
  if (preset) {
    preset.apply(w);
    w.log.push({ season: 0, kind: "info", title: `Заготовка: ${preset.name}`, lines: [`${preset.desc[0].toUpperCase()}${preset.desc.slice(1)}.`] });
  }
  return w;
}
