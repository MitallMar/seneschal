// Панель эмулятора натуры «Один человек»: древо черт с якорями и кустами, признаки и склонности, двенадцать рероллов; партия из десяти.
import type { BagTrait } from "../../data/types";
import { AXES, AXIS_NAMES } from "../../data/core";
import { SIGNS, NATURES } from "../../data/natura";
import { BALANCE } from "../../sim/balance";
import { growParty, rollPerson, growSeneschal, bagTrait, originById, type NaturaPerson } from "../../sim/natura";
import { MERA_NAMES } from "../../data/origins";
import { $, esc } from "../dom";
import { app, val, f1, KIND, TRIGGER, vecTags, traitTag, roleOf, storyText, track, starLine } from "./app";
import { portraitBlock } from "./view-portrait";
import { renderHealthPerson } from "./view-health";

function traitBlock(p: NaturaPerson, t: BagTrait) {
  const origin = t.seneschal ? "мешок Сенешаля" : t.kind === "look" ? (t.source.includes("birth") ? "облик, врождённый" : "облик, нажитой") : t.kind === "born" ? "врождённая" : p.inGame.includes(t.id) ? `в игре, повод — ${TRIGGER[t.trigger ?? ""]}` : `до игры: ${storyText(p.via[t.id])}`;
  return `<div class="trait">${traitTag(t)} ${vecTags(t.vec)}<small><b>${esc(origin)}</b></small><small>${esc(t.desc)}. ${esc(t.effect)}.</small></div>`;
}
function personHtml(p: NaturaPerson) {
  const grown = (anchor: string) => p.traits.filter((t) => p.from[t.id] === anchor && t.id !== p.contra);
  const has = (id: string) => p.traits.some((t) => t.id === id);
  const bush = (title: string, id: string) => `<div class="bush"><h4>${title}</h4>${has(id) ? traitBlock(p, bagTrait(id)) : ""}${grown(id).map((t) => traitBlock(p, t)).join("")}</div>`;
  const contra = p.contra && p.contra !== p.far && has(p.contra) ? `<div class="bush"><h4>Противоречие: против ядра</h4>${traitBlock(p, bagTrait(p.contra))}</div>` : "";
  const apart = (t: BagTrait) => t.kind === "look" || !!t.seneschal;
  const loose = p.traits.filter((t) => !apart(t) && !p.anchors.includes(t.id) && t.id !== p.far && t.id !== p.contra && !p.from[t.id]);
  const own = p.traits.filter((t) => t.seneschal), look = p.traits.filter((t) => t.kind === "look");
  const senBush = own.length ? `<div class="bush sen"><h4>Мешок Сенешаля: ядро, умения, черты на выбор</h4>${own.map((t) => traitBlock(p, t)).join("")}</div>` : "";
  const lookBush = look.length ? `<div class="bush"><h4>Облик: натурой не тянется</h4>${look.map((t) => traitBlock(p, t)).join("")}</div>` : "";
  const o = originById(p.origin), shownAs = originById(p.originShown);
  // происхождение Сенешаля задано сюжетом, а не генератором: у него строка не показывается
  const whose = own.length ? "происхождение задано сюжетом" : `откуда: <b id="origin-name">${esc(o.name)}</b> <span class="muted">(${MERA_NAMES[o.mera]}${o.meraNote ? `, ${esc(o.meraNote)}` : ""})</span>${
    o !== shownAs ? ` · на людях — <b id="origin-app.shown">${esc(shownAs.name)}</b>` : ""}`;
  const rest = loose.length ? `<div class="bush"><h4>Само по себе: след события, к якорям не тянется</h4>${loose.map((t) => traitBlock(p, t)).join("")}</div>` : "";
  const lost = p.lost.length ? `<p class="muted">Вытеснено новыми чертами: ${p.lost.map((id) => esc(bagTrait(id).name)).join(", ")}</p>` : "";
  const signs = SIGNS.map((s) => {
    const v = p.signs[s.id], core = (p.nature.core[s.id] ?? 0) * BALANCE.natura.coreScale;
    const w = Math.abs(v) * 10, left = v >= 0 ? 50 : 50 - w;
    const coreMark = core ? `<div class="corem" style="left:calc(${50 + Math.max(-5, Math.min(5, core)) * 10}% - 1px)"></div>` : "";
    return `<div class="num">${esc(s.minus)}</div><div class="bi"><div class="fill" style="left:${left}%;width:${w}%;background:${v >= 0 ? "#c9543c" : "#3f6fb0"}"></div>${coreMark}</div>
      <div>${esc(s.plus)}</div><div class="num">${v > 0 ? "+" : ""}${f1(v)}</div>`;
  }).join("");
  const star = AXES.map((a) => `<div>${AXIS_NAMES[a]}</div>${track(p.star[a] / 10, `var(--axis-${a})`)}<div class="num">${f1(p.star[a])}</div>`).join("");
  const kinds = (["born", "life", "perk", "look"] as const).map((k) => `${KIND[k]}: ${p.traits.filter((t) => t.kind === k).length}`).join(", ");
  return `<p>${own.length ? `<b id="is-seneschal">Сенешаль</b>, по натуре ` : ""}<b>${esc(p.nature.name)}</b>, ${p.age} лет · ${whose} · ядро: ${vecTags(p.nature.core)}
    · черт: ${p.traits.length} (${kinds})</p>${lost}
    <div class="tree">${senBush}${p.anchors.map((id, i) => bush(`Врождённый якорь ${i + 1} и его куст`, id)).join("")}
    ${p.far ? bush("Дальний якорь (нажит) и его куст", p.far) : ""}${contra}${rest}${lookBush}</div>
    <div class="split"><div><h3>Признаки (чёрная метка — ядро)</h3><div class="bipolar">${signs}</div></div>
    <div><h3>Деловые склонности из признаков</h3><div class="bars">${star}</div></div></div>`;
}

export function renderPerson() {
  const nature = NATURES.find((x) => x.id === val("nature")) ?? NATURES[0];
  const seed = `${val("seed")}-человек-${app.personRoll}`;
  const age = val("age") ? Number(val("age")) : undefined;
  app.shown = app.asSeneschal ? growSeneschal(seed, nature) : rollPerson(seed, nature, age);
  $("seneschal").textContent = app.asSeneschal ? "Обычный человек" : "Сенешаль";
  ($("age") as HTMLSelectElement).disabled = app.asSeneschal;
  $("person-view").innerHTML = personHtml(app.shown) + portraitBlock(app.shown);
  renderHealthPerson(seed);
  $("person-rerolls").innerHTML = Array.from({ length: 12 }, (_, i) => {
    const p = rollPerson(`${seed}-${i}`, nature, age);
    return `<div class="reroll"><span class="muted">${p.age} лет</span> ${p.traits.map((t) => traitTag(t, roleOf(p, t.id))).join("")}<div class="muted">${starLine(p.star)}</div></div>`;
  }).join("");
}
export function renderParty() {
  const party = growParty(val("seed"), 10);
  $("party-view").innerHTML = `<table><tr><th>Натура</th><th>Возраст</th><th>Черты</th><th>Склонности</th></tr>${party
    .map((p) => `<tr><td><b>${esc(p.nature.name)}</b></td><td class="c">${p.age}</td><td>${p.traits.map((t) => traitTag(t, roleOf(p, t.id))).join("")}</td><td>${starLine(p.star)}</td></tr>`).join("")}</table>`;
}
