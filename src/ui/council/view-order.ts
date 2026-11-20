// Порядок на экране: шкала строгости двумя цветами от нейтральной середины (тёплый край — вольность, холодный — строгость),
// ступень и её плюсы и минусы, норма, приказ страже затянуть или отпустить с ценой следующего шага.
import { BALANCE as B } from "../../sim/balance";
import { ORDER_MAX, STEPS, stepOf, gradeOf, orderNorm, orderMods, guardCost, guardHands, setGuard } from "../../sim/order";
import { $, esc } from "../dom";
import { app, fmt } from "./app";

export function renderOrder() {
  const o = app.w.order, step = stepOf(o.level), grade = gradeOf(o.level), n = orderNorm(app.w), O = B.order;
  const cells = Array.from({ length: ORDER_MAX + 1 }, (_, i) => {
    const s = stepOf(i), cls = [`ord-${s.id}`, i === o.level ? "now" : "", i === n.norm ? "norm" : ""].filter(Boolean).join(" ");
    return `<span class="${cls}" data-level="${i}" title="${s.name}${i === n.norm ? " — норма" : ""}">${i === o.level ? "●" : i === n.norm ? "▾" : ""}</span>`;
  }).join("");
  const names = STEPS.map((s) => `<span class="${s.id === step.id ? "on" : ""}" style="flex:${s.to - s.from + 1}">${s.name}</span>`).join("");
  const where = n.norm === o.level ? "шкала на норме" : `тянется к норме — к «${stepOf(n.norm).name}», по шагу за сезон`;
  const why = n.parts.length ? ` Норму задают: ${n.parts.join(", ")}.` : " Норму никто не двигает: стража по обычной цене.";
  const cost = guardCost(o.guard), up = guardCost(o.guard + 1) - cost;
  const price = cost > 0 ? `дозоры стоят ${fmt(cost)} серебра и ${fmt(guardHands(o.guard))} рук за сезон` : cost < 0 ? `казна сберегает ${fmt(-cost)} серебра за сезон` : "стража по обычной цене";
  const real = app.designer ? ` <small id="order-real">шкала ${o.level} из ${ORDER_MAX}, норма ${n.norm}, гниль ${fmt(o.rot)}, пошлины ×${fmt(orderMods(app.w).duty)}</small>` : "";
  $("order").innerHTML = `<div class="ord-names">${names}</div><div class="ord-scale" id="order-scale">${cells}</div>
    <p id="order-step"><b>${step.name}</b>${step.id === "tiho" ? "" : `, градация ${grade.word}`} — ${where}.${real}</p>
    <p class="hint" id="order-effects">Плюсы: ${esc(step.plus)}. Минусы: ${esc(step.minus)}.${esc(why)}</p>
    <div class="ord-guard" id="order-guard"><span>Стража: ${o.guard > 0 ? `затянута на ${o.guard}` : o.guard < 0 ? `распущена на ${-o.guard}` : "как обычно"} — ${price}</span>
      <button data-guard="${o.guard - 1}" ${o.guard <= O.guardMin ? "disabled" : ""} title="Отпустить ничего не стоит, но накопленная гниль всплывёт">Отпустить</button>
      <button data-guard="${o.guard + 1}" ${o.guard >= O.guardMax ? "disabled" : ""} title="Каждый шаг дороже предыдущего">Затянуть${o.guard >= 0 && o.guard < O.guardMax ? `: +${fmt(up)} серебра за сезон` : ""}</button></div>`;
  $("order").querySelectorAll<HTMLButtonElement>("button[data-guard]").forEach((b) =>
    b.addEventListener("click", () => { setGuard(app.w, Number(b.dataset.guard)); app.render(); }));
}
