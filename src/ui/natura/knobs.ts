// Ручки эмулятора натуры: разделы natura и health из balance.ts по группам, правка действует сразу, выгрузка изменённых.
import { KNOBS, getAt, setAt, type KnobInfo } from "../../sim/balance";
import { $, esc } from "../dom";
import { app } from "./app";

const GROUPS: { title: string; open: boolean; has: (path: string) => boolean }[] = [
  { title: "Сколько черт и откуда", open: true, has: (p) => /^natura\.(innate|before|adultAge|eventList|lifeSteps|ageM|perkWeight)/.test(p) },
  { title: "Рост древа", open: true, has: (p) => /^natura\.[a-zA-Z]+$/.test(p) && !/innate|before|adultAge|eventList|lifeSteps|ageM|perkWeight|signSoft|coreScale|axisGain/.test(p) },
  { title: "Признаки и склонности", open: false, has: (p) => /^natura\.(signSoft|coreScale|axisGain)/.test(p) },
  { title: "Портрет: пороги признаков", open: false, has: (p) => p.startsWith("natura.portrait.") },
  { title: "Веса деловых склонностей", open: false, has: (p) => p.startsWith("natura.w.") },
  { title: "Поправки середины склонностей", open: false, has: (p) => p.startsWith("natura.shift.") },
  { title: "Цели отчёта о натуре", open: false, has: (p) => p.startsWith("natura.goal.") },
  { title: "Здоровье: рождение и семья", open: false, has: (p) => /^health\.(krepostMean|krepostSpread|bornChance|familyChance|inheritChance)/.test(p) },
  { title: "Здоровье: болезни и раны", open: false, has: (p) => /^health\.(ill|winterMult|krepostRisk|krepostDeath|hard|light|wound|incapAt)/.test(p) },
  { title: "Здоровье: старость", open: false, has: (p) => /^health\.(oldFrom|agingStep|ageTraitChance|elderFrom|lifeMax|ageDeathMax)/.test(p) },
  { title: "Здоровье: прогон", open: false, has: (p) => /^health\.(years|ageMin|ageMax|familySize)/.test(p) },
  { title: "Цели отчёта о здоровье", open: false, has: (p) => p.startsWith("health.goal.") },
];
const NATURA_KNOBS = KNOBS.filter((q) => q.path.startsWith("natura.") || q.path.startsWith("health."));
const knobId = (q: KnobInfo) => `k-${q.path.replace(/\./g, "-")}`;

export function renderKnobs() {
  $("knobs").innerHTML = GROUPS.map((g) => {
    const rows = NATURA_KNOBS.filter((q) => g.has(q.path)).map((q) => {
      const v = getAt(q.path);
      const label = esc(q.label.replace(/^(Натура|Здоровье)(, отчёт|, цель)?: /, ""));
      return `<div class="knob${v !== q.def ? " changed" : ""}" id="${knobId(q)}" title="${q.path}">
        <div class="knob-label">${label}</div>
        <div class="knob-row">
          <input type="range" data-knob="${q.path}" min="${q.min}" max="${q.max}" step="${q.step}" value="${v}">
          <span class="knob-val">${v}</span><span class="knob-def">было ${q.def}</span>
        </div></div>`;
    }).join("");
    return `<details class="knob-group"${g.open ? " open" : ""}><summary>${g.title}</summary>${rows}</details>`;
  }).join("");
}
let timer: ReturnType<typeof setTimeout> | undefined;
export function onKnob(path: string, raw: string) {
  const q = NATURA_KNOBS.find((x) => x.path === path)!;
  const v = setAt(path, Number(raw));
  const row = $(knobId(q));
  row.classList.toggle("changed", v !== q.def);
  row.querySelector(".knob-val")!.textContent = String(v);
  clearTimeout(timer);
  timer = setTimeout(() => app.run(), 200);
}
export function exportKnobs() {
  const changed = NATURA_KNOBS.filter((q) => getAt(q.path) !== q.def);
  const out = $("export-out") as HTMLTextAreaElement;
  out.hidden = false;
  out.value = changed.length ? changed.map((q) => `${q.path}: ${q.def} → ${getAt(q.path)}   // ${q.label}`).join("\n") : "Ручки не менялись.";
  out.select();
}
