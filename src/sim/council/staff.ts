// Перестановки: цена в авторитете, назначение и снятие, главный совета, наказ, обида покровителя.
import type { Axis, PostId } from "../../data/types";
import { AXIS_DAT } from "../../data/core";
import { BALANCE as B } from "../balance";
import { clamp, round1 } from "../util";
import { REL_MAX, postName, holder } from "../state";
import type { Person, World } from "../state";
import { addAuthority, priceOf, authorityWeak } from "../authority";
import { addTrust } from "../economy/zones";
import { addRel } from "./people";
import { PATRON_SIDE } from "./generate";
import { staffBlock } from "../fall/base";

// Сняли посаженного: покровитель обижен — падает доверие стороны или отношение человека к Сенешалю; по уговору — мягче.
function offendPatron(w: World, p: Person, post: PostId, agreed: boolean, lines: string[]) {
  const l = w.legacy.find((x) => x.post === post);
  if (!l) return;
  w.legacy = w.legacy.filter((x) => x !== l);
  const soft = agreed ? B.staff.patronAgreed : 1, how = agreed ? " Ушёл по уговору — обида мягче." : "";
  if (l.person != null) {
    const o = w.people[l.person], v = round1(B.staff.patronLoyalty * soft);
    if (!v) return;
    o.loyalty = clamp(o.loyalty - v, -REL_MAX, REL_MAX);
    lines.push(`За ${p.name} стоял${o.female ? "а" : ""} ${o.name}, родня: отношение к Сенешалю −${v}.${how}`);
  } else if (l.side) {
    const v = round1(B.staff.patronTrust * soft);
    if (!v) return;
    addTrust(w, l.side, -v);
    lines.push(`За ${p.name} стоял${l.side === "dvor" ? "" : l.side === "zamok" ? "и" : "а"} ${PATRON_SIDE[l.side]}: доверие −${v}.${how}`);
  }
}

export function assignCost(w: World, p: Person, post: PostId | null): { cost: number; why: string } {
  const current = post ? holder(w, post) : undefined;
  let cost = 0;
  const why: string[] = [];
  // снимаем того, кто сейчас на должности
  if (current && current.id !== p.id) {
    const c = removeCost(current);
    cost += c.cost;
    if (c.cost) why.push(c.why);
  }
  // снимаем самого p с его должности, если переводим против воли
  if (p.post && p.post !== post) {
    const wants = post && p.aspiration?.post === post;
    if (!wants) {
      const c = removeCost(p);
      cost += c.cost;
      if (c.cost) why.push(c.why);
    }
  }
  if (cost > 0 && authorityWeak(w)) why.push(`слово весит меньше: +${B.authority.weakExtra}`);
  return { cost: priceOf(w, cost), why: why.join("; ") || "бесплатно" };
}

function removeCost(p: Person): { cost: number; why: string } {
  if (!p.post || p.agreed) return { cost: 0, why: "" };
  const cost = B.staff.removeBase + Math.floor(p.tenure / B.staff.removePerSeasons);
  return { cost, why: `снять ${p.name} против воли (${p.tenure} сез. на месте) — ${cost}` };
}

// Возвращает false, если на перестановку не хватает авторитета: тогда ничего не меняется (остаётся медленный путь — уговорить).
// Под чужой рукой — ещё и если барон не дал согласия или задет его человек (staffBlock).
export function assign(w: World, personId: number, post: PostId | null): boolean {
  const p = w.people[personId];
  if (post && w.posts[post] === personId) return true;
  if (staffBlock(w, p, post)) return false;
  const { cost, why } = assignCost(w, p, post);
  if (cost > w.authority) return false;
  addAuthority(w, -cost, `перестановка: ${why}`, "staff");
  const lines: string[] = [];
  if (post) {
    const prev = holder(w, post);
    if (prev) {
      prev.post = undefined; prev.tenure = 0; prev.exp = Math.floor(prev.exp * B.staff.removedExpKeep);
      offendPatron(w, prev, post, !!prev.agreed, lines);
      if (prev.agreed) lines.push(`${prev.name} оставил${prev.female ? "а" : ""} должность «${postName(post)}» по уговору, без обиды.`);
      else {
        prev.loyalty = clamp(prev.loyalty + (prev.aspiration?.post === post ? B.staff.removedDesiredLoyalty : B.staff.removedLoyalty), -REL_MAX, REL_MAX);
        lines.push(`${prev.name} снят${prev.female ? "а" : ""} с должности «${postName(post)}» и обижен${prev.female ? "а" : ""}.`);
      }
      prev.agreed = false; prev.persuade = 0;
    }
  }
  if (p.post) { w.posts[p.post] = null; offendPatron(w, p, p.post, !!p.agreed || p.aspiration?.post === post, lines); }
  if (p.post && !post && p.agreed) lines.push(`${p.name} оставил${p.female ? "а" : ""} должность по уговору, без обиды.`);
  p.post = post ?? undefined; p.tenure = 0; p.exp = 0; p.agreed = false; p.persuade = 0;
  if (post) {
    w.posts[post] = p.id;
    if (p.aspiration?.post === post) {
      p.loyalty = clamp(p.loyalty + B.staff.desiredLoyalty, -REL_MAX, REL_MAX);
      p.know.aspiration = true;
      lines.push(`${p.name} получил${p.female ? "а" : ""} желанную должность «${postName(post)}» — благодарен${p.female ? "на" : ""}.`);
    } else lines.push(`${p.name} теперь «${postName(post)}».`);
    // обойдённые, кто хотел эту должность
    for (const o of w.people) {
      if (o.id !== p.id && o.aspiration?.post === post) {
        addRel(w, o.id, p.id, B.staff.bypassedRel);
        o.know.aspiration = true;
        lines.push(`${o.name} сам${o.female ? "а" : ""} метил${o.female ? "а" : ""} на это место — отношения с ${p.name} хуже.`);
      }
    }
  }
  if (cost) lines.push(`Авторитет −${cost}.`);
  if (w.head === p.id && !post) w.head = null;
  w.log.push({ season: w.season, kind: "staff", title: "Перестановка", lines });
  return true;
}

export function setHead(w: World, id: number | null) {
  w.head = id;
  if (id != null) w.log.push({ season: w.season, kind: "staff", title: "Главный на время отлучки", lines: [`За главного — ${w.people[id].name}.`] });
}

// Цена нового наказа сейчас (сменить и снять — бесплатно).
export const orderCost = (w: World): number => priceOf(w, B.staff.orderCost);

// Возвращает false, если на новый наказ не хватает авторитета.
export function giveOrder(w: World, id: number, axis: Axis | null): boolean {
  const p = w.people[id], cost = axis && !p.order ? orderCost(w) : 0;
  if (cost > w.authority) return false;
  addAuthority(w, -cost, `наказ: ${p.name}`, "staff");
  p.order = axis ?? undefined;
  if (axis) w.log.push({ season: w.season, kind: "staff", title: "Наказ", lines: [`${p.name}: «действуй по ${AXIS_DAT[axis]}».${cost ? ` Авторитет −${cost}.` : ""}`] });
  return true;
}
