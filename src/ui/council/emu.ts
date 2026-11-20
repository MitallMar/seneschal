// Эмулятор совета: панель ручек баланса, наборы «было / стало», сброс и выгрузка.
import { KNOBS, getAt, setAt, snapshotBalance, restoreBalance } from "../../sim/balance";
import type { KnobInfo } from "../../sim/balance";
import { $, esc } from "../dom";
import { app, syncUrl } from "./app";

const SECTION_NAMES: Record<string, string> = {
  star: "Звезда склонностей", decide: "Решение человека", exp: "Опыт и исход дела", rel: "Отношения", council: "Спор в совете",
  loyalty: "Отношение к Сенешалю", staff: "Перестановки и наказ", know: "Знание о людях", traits: "Черты в течение жизни",
  economy: "Хозяйство и подать", authority: "Авторитет", world: "Мир вокруг", order: "Порядок", season: "Сезон", report: "Цели отчёта осей",
};

const SUB_NAMES: Record<string, string> = {
  start: "старт партии", trust: "доверие сторон", zone: "зоны и потоки", doer: "исполнитель", hands: "руки", flow: "потоки", year: "множители по сезонам",
  hand: "почерк", course: "курс", tax: "урок и терпение Герцога", rate: "курсы подати", pay: "способы платить", goal: "цели отчёта", budget: "бюджет давления", weather: "погода года", tags: "метки событий", decree: "указы", fork: "прогноз",
};

// Натура и здоровье к совету не подключены: их ручки — в эмуляторе натуры.
const EMU_KNOBS = KNOBS.filter((q) => q.path.split(".")[0] in SECTION_NAMES);

export const knobId = (q: KnobInfo) => `k-${q.path.replace(/\./g, "-")}`;

const DEFAULTS: Record<string, number> = Object.fromEntries(KNOBS.map((q) => [q.path, q.def]));

// Два набора значений: «было» (1) и «стало» (2). Правка ручки меняет тот набор, что включён.
export const sets: Record<string, number>[] = [{ ...DEFAULTS }, { ...DEFAULTS }];

export let active = 1;

export const changedKnobs = () => EMU_KNOBS.filter((q) => getAt(q.path) !== q.def);

export function renderKnobs() {
  const sections = [...new Set(EMU_KNOBS.map((q) => q.path.split(".")[0]))];
  $("knobs").innerHTML = sections.map((sec) => {
    const mine = EMU_KNOBS.filter((q) => q.path.split(".")[0] === sec);
    let sub = "";
    const rows = mine.map((q) => {
      const v = getAt(q.path), parts = q.path.split(".");
      const head = parts.length > 2 && parts[1] !== sub ? `<div class="knob-sub">${SUB_NAMES[parts[1]] ?? parts[1]}</div>` : "";
      if (parts.length > 2) sub = parts[1];
      return `${head}<div class="knob${v !== q.def ? " changed" : ""}" id="${knobId(q)}" title="${q.path}">
        <div class="knob-label">${esc(q.label)}</div>
        <div class="knob-row">
          <input type="range" data-knob="${q.path}" min="${q.min}" max="${q.max}" step="${q.step}" value="${v}">
          <span class="knob-val">${v}</span><span class="knob-def">по умолч. ${q.def}</span>
        </div>
      </div>`;
    }).join("");
    const n = mine.filter((q) => getAt(q.path) !== q.def).length;
    const open = n || ($("knobs").querySelector<HTMLDetailsElement>(`details[data-sec="${sec}"]`)?.open ?? false);
    return `<details class="knob-group" data-sec="${sec}"${open ? " open" : ""}><summary>${SECTION_NAMES[sec]} <small>${mine.length}${n ? `, изменено ${n}` : ""}</small></summary>${rows}</details>`;
  }).join("");
  $("ab1").classList.toggle("on", active === 0);
  $("ab2").classList.toggle("on", active === 1);
  const n = changedKnobs().length;
  $("knobs-state").textContent = `Включён набор «${active ? "стало" : "было"}». ${n ? `Изменено ручек: ${n}.` : "Все ручки по умолчанию."} Ручка действует со следующего решения; чтобы сравнить партию целиком — R.`;
}

export function setKnob(path: string, value: number): number {
  const v = setAt(path, value);
  sets[active] = snapshotBalance();
  return v;
}

export function switchSet(i: number) {
  if (i === active) return;
  sets[active] = snapshotBalance();
  active = i;
  restoreBalance(sets[active]);
  renderKnobs(); app.render();
}

export function dumpKnobs(): string {
  const list = changedKnobs();
  const text = list.length ? list.map((q) => `${q.path}: ${q.def} → ${getAt(q.path)}  // ${q.label}`).join("\n") : "Все ручки по умолчанию.";
  const out = $("dump-out") as HTMLTextAreaElement;
  out.hidden = false; out.value = text;
  out.select();
  return text;
}

export function toggleKnobs(show = $("knobs-panel").hasAttribute("hidden")) {
  $("knobs-panel").hidden = !show;
  document.body.classList.toggle("knobs-open", show);
  if (show) renderKnobs();
  syncUrl();
}
