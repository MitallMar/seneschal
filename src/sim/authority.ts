// Авторитет: откуда берётся и куда уходит (задача И15, замысел — docs/design/avtoritet.md). Без интерфейса.
// Опора каждый сезон от состояния земли, прибавки и потери за поступки, потолок по статусу, ведомость прошлого сезона.
// Порядок на опору пока не влияет (шкала строгости — И13); кризисы и возвращение из-под чужой руки — И14.
import { SIDES, SIDE_NAMES, CATEGORY_NAMES } from "../data/economy";
import { BALANCE as B } from "./balance";
import { round2 } from "./util";
import { getRel } from "./state";
import type { World, AuthKind, AuthLine, Complaint, AuthState } from "./state";

export type { AuthKind, AuthLine, Complaint, AuthState } from "./state";
import { zoneOf, patienceWord, seasonKind } from "./economy/zones";
import { addLine } from "./economy/ledger";

export const AUTH_KIND_NAMES: Record<AuthKind, string> = {
  support: "опора", tax: "подать", judge: "суд лично", complaint: "брошенные жалобы", feast: "обычаи и пиры",
  order: "приказы против совета", staff: "перестановки и наказы", burn: "сгорело сверх потолка",
};
export type FeastId = "prazdnik" | "pir";
export const FEASTS: { id: FeastId; name: string; pay: "eda" | "serebro"; text: string }[] = [
  { id: "prazdnik", name: "Праздник по обычаю", pay: "eda", text: "стол для деревень и обряд у опушки — из амбара" },
  { id: "pir", name: "Пир в замке", pay: "serebro", text: "пир для людей замка и гостей — из казны" },
];

export function initAuthority(): AuthState {
  const totals = { support: 0, tax: 0, judge: 0, complaint: 0, feast: 0, order: 0, staff: 0, burn: 0 };
  return { cur: [], last: null, lastSeason: 0, feasts: [], complaints: [], nextId: 1, totals };
}
// Потолок по статусу: пока один — Сенешаль на испытании. Излишек сверх потолка сгорает.
export const authorityCap = (): number => B.authority.cap;

// Авторитет ниже порога — слово Сенешаля весит меньше: каждая трата дороже на надбавку. Бесплатное остаётся бесплатным.
export const authorityWeak = (w: World): boolean => w.authority < B.authority.weakBelow;
export const priceOf = (w: World, base: number): number => (base > 0 && authorityWeak(w) ? base + B.authority.weakExtra : base);
// Сколько сезонов жалоба ещё ждёт разбора.
export const complaintLeft = (w: World, c: Complaint): number => c.season + B.authority.complaintSeasons - w.season;

// Любое изменение авторитета идёт через эту функцию: строка в ведомость, излишек сверх потолка сгорает, ниже нуля авторитет не уходит.
export function addAuthority(w: World, v: number, text: string, kind: AuthKind): number {
  if (!v) return 0;
  const a = w.auth, cap = authorityCap(), next = round2(w.authority + v);
  a.cur.push({ v: round2(v), text, kind });
  a.totals[kind] = round2(a.totals[kind] + v);
  if (next > cap && v > 0) {
    const burn = round2(next - Math.max(cap, w.authority));
    a.cur.push({ v: -burn, text: "сгорело сверх потолка", kind: "burn" });
    a.totals.burn = round2(a.totals.burn - burn);
    w.authority = Math.max(cap, w.authority);
  } else w.authority = Math.max(0, next);
  return v;
}

// Совет даёт опору, когда главный есть, признан всеми в совете и в совете нет открытой вражды.
export function councilSteady(w: World): { ok: boolean; why: string } {
  const council = w.people.filter((p) => p.post);
  const head = w.head != null ? w.people[w.head] : undefined;
  if (!head || !head.post) return { ok: false, why: "главного нет" };
  const against = council.find((p) => p.id !== head.id && getRel(w, head.id, p.id) < B.council.headMinRel);
  if (against) return { ok: false, why: `главного не признаёт ${against.name}` };
  for (const a of council) for (const b of council) if (a.id < b.id && getRel(w, a.id, b.id) <= B.rel.enemy) return { ok: false, why: `${a.name} и ${b.name} — враги` };
  return { ok: true, why: "главный признан, вражды нет" };
}

// В совете есть открытая вражда: хотя бы одна пара — враги.
export function councilFeud(w: World): boolean {
  const council = w.people.filter((p) => p.post);
  return council.some((a) => council.some((b) => a.id < b.id && getRel(w, a.id, b.id) <= B.rel.enemy));
}

// Опора сезона по состоянию на сейчас: стороны, совет, терпение Герцога. В минус уходит только при терпении «на исходе».
export function authoritySupport(w: World): { lines: AuthLine[]; total: number } {
  const A = B.authority, lines: AuthLine[] = [];
  const ally = SIDES.filter((s) => zoneOf(w, s) === "заодно"), friendly = SIDES.filter((s) => zoneOf(w, s) === "ладят");
  const names = (list: typeof SIDES) => list.map((s) => SIDE_NAMES[s].toLowerCase()).join(", ");
  if (ally.length) lines.push({ v: round2(ally.length * A.sideAlly), text: `опора: заодно — ${names(ally)}`, kind: "support" });
  if (friendly.length) lines.push({ v: round2(friendly.length * A.sideFriendly), text: `опора: ладят — ${names(friendly)}`, kind: "support" });
  const c = councilSteady(w);
  if (c.ok) lines.push({ v: A.council, text: `опора: совет — ${c.why}`, kind: "support" });
  const duke = patienceWord(w.eco.tax.patience);
  const dv = duke === "благоволит" ? A.dukeFavor : duke === "недоволен" ? -A.dukeDispleased : duke === "на исходе" ? -A.dukeEdge : 0;
  if (dv) lines.push({ v: dv, text: `опора: Герцог ${duke}`, kind: "support" });
  const sum = round2(lines.reduce((s, l) => s + l.v, 0));
  if (sum < 0 && duke !== "на исходе") return { lines: [], total: 0 };
  return { lines, total: sum };
}

// Конец сезона: брошенные жалобы, опора, ведомость. Зовёт upkeep после хозяйства (подать уже посчитана).
export function authoritySeason(w: World, lines: string[]): void {
  const A = B.authority, a = w.auth;
  const old = a.complaints.filter((c) => complaintLeft(w, c) <= 0);
  for (const c of old) {
    const from = w.people[c.from];
    addAuthority(w, -A.complaintLeft, `жалоба ${from.name} не дождалась разбора`, "complaint");
    from.loyalty = Math.max(-10, Math.round((from.loyalty - A.leftLoyalty) * 10) / 10);
    lines.push(`📜 Жалоба ${from.name} на ${w.people[c.on].name} пролежала год: Сенешаль её так и не разобрал. Авторитет −${A.complaintLeft}.`);
  }
  a.complaints = a.complaints.filter((c) => complaintLeft(w, c) > 0);
  for (const l of authoritySupport(w).lines) addAuthority(w, l.v, l.text, "support");
  a.last = a.cur; a.lastSeason = w.season; a.cur = [];
}

export function addComplaint(w: World, from: number, on: number): void {
  w.auth.complaints.push({ id: w.auth.nextId++, from, on, season: w.season });
}
// Суд лично — личное дело: Сенешаль разбирает жалобу сам.
export function judge(w: World, id: number): boolean {
  const A = B.authority, c = w.auth.complaints.find((x) => x.id === id);
  if (!c || w.deedsLeft <= 0) return false;
  w.deedsLeft--;
  w.auth.complaints = w.auth.complaints.filter((x) => x.id !== id);
  const from = w.people[c.from], on = w.people[c.on];
  from.loyalty = Math.min(10, Math.round((from.loyalty + A.judgeLoyalty) * 10) / 10);
  addAuthority(w, A.judge, `суд лично: жалоба ${from.name} на ${on.name}`, "judge");
  w.log.push({ season: w.season, kind: "info", title: "Суд лично", lines: [`Сенешаль сам разобрал жалобу ${from.name} на ${on.name}. ${from.name} выслушан${from.female ? "а" : ""}. Авторитет +${A.judge}.`] });
  return true;
}

// Сколько пиров и обычаев уже было в этом году; каждый следующий даёт вдвое меньше.
export function feastsThisYear(w: World): number {
  const from = w.season - seasonKind(w.season);
  return w.auth.feasts.filter((s) => s >= from).length;
}
export function feastGain(w: World): number {
  return round2(B.authority.feast * Math.pow(B.authority.feastRepeat, feastsThisYear(w)));
}
export const feastCost = (id: FeastId): number => (id === "prazdnik" ? B.authority.feastFood : B.authority.feastSilver);
// Обычай или пир — личное дело за еду или серебро: излишек хозяйства превращается в авторитет.
export function feast(w: World, id: FeastId): boolean {
  const def = FEASTS.find((f) => f.id === id)!, cost = feastCost(id);
  if (w.deedsLeft <= 0 || w.eco.stock[def.pay] < cost) return false;
  const gain = feastGain(w);
  w.deedsLeft--;
  addLine(w, { cat: def.pay, v: -cost, text: `${def.name.toLowerCase()}: ${def.text}` });
  w.auth.feasts.push(w.season);
  addAuthority(w, gain, `обычай соблюдён: ${def.name.toLowerCase()}`, "feast");
  const line = `${def.name}: ${def.text}. ${CATEGORY_NAMES[def.pay]} −${cost}, авторитет +${gain}.`;
  w.log.push({ season: w.season, kind: "info", title: "Обычай соблюдён", lines: [line] });
  return true;
}
