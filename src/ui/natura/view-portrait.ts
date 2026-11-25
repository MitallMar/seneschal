// Панель эмулятора натуры «Портрет»: что выходит из признаков и особенного черт, откуда каждая строка, сплав и происхождение.
import type { TraitNoteKey } from "../../data/types";
import { bagTrait, originById, type NaturaPerson } from "../../sim/natura";
import { MERA_NAMES } from "../../data/origins";
import { WANTS, HOLDS, APPROACHES, MEM_KEYS, MEM_SCALES, BIASES, CHANNELS, VIS_NAMES, THREADS, THREAD_HOW } from "../../data/portrait";
import { portrait, strengthWord, linkName, traitVis, type Portrait, type Src, type Part } from "../../sim/portrait";
import { esc } from "../dom";
import { f1 } from "./app";

// Портрет по Концепту 3: что выходит из признаков и особенного черт (правила — src/sim/portrait.ts).
// У каждой строки видно, откуда она: метка ◆ и имя — от черты, без метки — от признака (имя полюса — в подсказке).
const signed = (v: number) => `${v > 0 ? "+" : ""}${f1(v)}`;
const NOTE_NAMES: Record<TraitNoteKey, string> = {
  vesy: "весы", podkhod: "подход", pamyat: "память", golos: "голос", niti: "нити", svyazi: "связи", sledy: "следы", delo: "дело", likho: "лихо", derzhit: "кто держит", otdykh: "отдых", lore: "опора в лоре", prochee: "ещё",
};
const whence = (x: Src | undefined) => (x ? (x.trait ? `от черты «${x.from}»` : `от признака: ${x.from}`) : "");
const mark = (x: Src | undefined) => (x?.trait ? `<small class="by-trait">◆ ${esc(x.from)}</small>` : "");
const none = (text = "—") => `<span class="muted">${text}</span>`;
// Происхождение: мера, к чему тянет и с кем свой. В числа портрета не входит: с какой силой его складывать с признаками и чертами — не решено.
function originRow(p: NaturaPerson): string {
  const o = originById(p.origin), shownAs = originById(p.originShown);
  const word = <K extends string>(keys: K[], list: { id: K; name: string }[]) => keys.map((k) => list.find((x) => x.id === k)!.name);
  const bits = [
    [...word(o.wants, WANTS), ...word(o.holds ?? [], HOLDS)].length ? `тянет и держит: ${esc([...word(o.wants, WANTS), ...word(o.holds ?? [], HOLDS)].join(", "))}` : "",
    o.threads.length ? `нити: ${esc(word(o.threads, THREADS).map((x) => `«${x}»`).join(", "))}` : "",
    o.ladit.length ? `свои: ${esc(o.ladit.map(linkName).join(", "))}` : "", o.neLadit.length ? `чужие: ${esc(o.neLadit.map(linkName).join(", "))}` : "",
    o.often.length ? `чаще черты: ${esc(o.often.map((id) => bagTrait(id).name).join(", "))}` : "",
  ].filter(Boolean);
  return `<span class="tag role">${esc(o.name)}</span> мера — ${MERA_NAMES[o.mera]}${o.meraNote ? ` (${esc(o.meraNote)})` : ""}
    ${o !== shownAs ? `<span class="tag minus">на людях — ${esc(shownAs.name)}</span>` : ""}
    <div class="muted">${bits.join(" · ")}</div>${o.note ? `<div class="muted">${esc(o.note)}</div>` : ""}`;
}
export function portraitBlock(p: NaturaPerson): string {
  const P: Portrait = portrait(p), O = P.by;
  // число: слово, величина и из чего сложилось
  const sum = (parts: Part[]) => parts.map((x) => `${x.trait ? `черта «${x.from}»` : x.from} ${signed(x.v)}`).join(", ");
  const byTrait = (parts: Part[]) => { const t = parts.filter((x) => x.trait); return t.length ? `<small class="by-trait">◆ ${esc(t.map((x) => x.from).join(", "))}</small>` : ""; };
  const scale = <K extends string>(list: { id: K; name: string; desc: string }[], at: Record<K, number>, from: Record<K, Part[]>) => {
    const cells = list.filter((x) => strengthWord(at[x.id])).sort((a, b) => Math.abs(at[b.id]) - Math.abs(at[a.id])).map((x) =>
      `<span class="tag ${at[x.id] > 0 ? "plus" : "minus"}" title="${esc(`${x.desc}. Из чего: ${sum(from[x.id])}`)}">${esc(x.name)} — ${strengthWord(at[x.id])} (${signed(at[x.id])})${byTrait(from[x.id])}</span>`);
    return cells.length ? cells.join("") : none("как у всех");
  };
  const words = <K extends string>(keys: K[], list: { id: K; name: string; desc: string }[], cls: string, from: Partial<Record<K, Src>>) => {
    const cells = keys.map((k) => {
      const x = list.find((q) => q.id === k)!;
      return `<span class="tag ${cls}" title="${esc(`${x.desc}. ${whence(from[k])}`)}">${esc(x.name)}${mark(from[k])}</span>`;
    });
    return cells.length ? cells.join("") : none();
  };
  const linkTags = (keys: Portrait["links"]["ladit"], cls: string) => (keys.length
    ? keys.map((k) => `<span class="tag ${cls}" title="${esc(whence(O.links[k]))}">${esc(linkName(k))}${mark(O.links[k])}</span>`).join("") : none());
  const notes = (xs: string[]) => (xs.length ? `<div class="muted">${xs.map(esc).join("; ")}</div>` : "");
  const memory = MEM_SCALES.filter((m) => strengthWord(P.memory[m.id])).map((m) => {
    const v = P.memory[m.id];
    return `<span class="tag ${v > 0 ? "plus" : "minus"}" title="${esc(`Из чего: ${sum(O.memory[m.id])}`)}">${esc(m.name)}: ${v > 0 ? m.plus : m.minus} (${signed(v)})${byTrait(O.memory[m.id])}</span>`;
  });
  const sluchay = strengthWord(P.sluchay) ? `<span class="tag ${P.sluchay > 0 ? "plus" : "minus"}" title="${esc(`Из чего: ${sum(O.sluchay)}`)}">случай —
    ${P.sluchay > 0 ? "решения труднее предсказать" : "решения ровнее"} (${signed(P.sluchay)})${byTrait(O.sluchay)}</span>` : "";
  const bias = BIASES.find((b) => b.id === P.voice.bias)!;
  const manners = P.voice.manners.map((text, i) => `<span title="${esc(whence(O.manners[i]))}">${esc(text)}${mark(O.manners[i])}</span>`).join("; ");
  const shade = [P.traces.ten ? `о нём следов ${P.traces.ten > 0 ? "больше" : "меньше"} (${signed(P.traces.ten)})` : "",
    P.traces.tenSfery ? `о его делах следов ${P.traces.tenSfery > 0 ? "больше" : "меньше"} (${signed(P.traces.tenSfery)})` : "",
    P.traces.yasnost ? (P.traces.yasnost < 0 ? "следы путаные" : "следы ясные") : "",
    P.traces.razgovor ? `разговор открывает ${P.traces.razgovor > 0 ? "больше" : "меньше"}` : "",
    P.traces.chuzhie ? `чужие тайны ${{ boltaet: "выбалтывает", uznayot: "узнаёт", molchit: "держит" }[P.traces.chuzhie]}` : ""].filter(Boolean);
  const lines = P.traces.lines.map((l) => `<div class="trace tline"><span class="tag role">${esc(VIS_NAMES[l.vis])}</span>
    ${esc(l.gde.map((g) => CHANNELS.find((c) => c.id === g)!.name).join(", "))}: ${esc(l.text)}
    ${l.trait ? `<small class="by-trait">◆ ${esc(l.from)}</small>` : `<span class="muted">— ${esc(l.from)}</span>`}</div>`).join("");
  const scaleName = (k: string) => [...WANTS, ...HOLDS, ...MEM_SCALES].find((x) => x.id === k)?.name ?? "случай";
  const ifs = P.ifs.map((x) => `<div class="trace"><span class="tag ${x.v > 0 ? "plus" : "minus"}">${esc(scaleName(x.chto))} ${x.v > 0 ? "+" : "−"}${Math.abs(x.v)}</span>
    ${esc(x.kogda)} <small class="by-trait">◆ ${esc(x.from)}</small></div>`).join("");
  const threads = P.threads.map((x) => { const t = THREADS.find((q) => q.id === x.nit)!; return `<span class="tag role" title="${esc(`${t.desc}. От черты «${x.from}»`)}">${THREAD_HOW[x.kak]}
    «${esc(t.name)}»${x.step ? ` — «${esc(x.step)}»` : ""}${x.uDrugogo ? " (у другого)" : ""}<small class="by-trait">◆ ${esc(x.from)}</small></span>`; }).join("");
  const deed = P.deed.map((x) => `<span class="tag ${x.sila > 0 ? "plus" : "minus"}">${esc(x.gde)} ${x.sila > 0 ? "+" : "−"}${Math.abs(x.sila)}<small class="by-trait">◆ ${esc(x.from)}</small></span>`).join("");
  const skills = p.traits.filter((t) => t.posts || t.places).map((t) => `<div class="trace"><b>${esc(t.name)}</b>${t.posts ? ` · должность: ${esc(t.posts.join(", "))}` : ""}
    ${t.places ? ` · места и дела: ${esc(t.places.join(", "))}` : ""}</div>`).join("");
  const likho = [P.likho > 0 ? `прикрывает лихо в своей сфере (+${f1(P.likho)})` : "", P.likhoYasnost > 0 ? `следы лиха в его сфере ярче (ясность +${f1(P.likhoYasnost)})` : ""].filter(Boolean);
  const row = (title: string, body: string) => `<div class="prow"><div class="ptitle">${title}</div><div>${body}</div></div>`;
  const speed = P.links.start ? `<div class="muted">отношения складываются ${P.links.start > 0 ? "быстрее" : "медленнее"}</div>` : "";
  const special = p.traits.map((t) => {
    const own = P.notes.filter((n) => n.from === t.name).map((n) => `<div class="muted"><i>${NOTE_NAMES[n.key]}:</i> ${esc(n.text)}</div>`).join("");
    return `<div class="tnote"><span class="tag ${t.kind}">${esc(t.name)}</span><span class="tag role">${esc(VIS_NAMES[traitVis(t)])}</span> ${esc(t.effect)}${own}</div>`;
  }).join("");
  return `<h3>Портрет: что выходит из признаков и черт <small class="muted">— метка <span class="by-trait">◆ имя</span> значит «от черты», без метки — от признака (какого — в подсказке)</small></h3>
  <div id="portrait" class="portrait">
    ${row("Хочет", scale(WANTS, P.wants, O.wants))}
    ${row("Удерживает", scale(HOLDS, P.holds, O.holds) + sluchay + notes(P.holdNotes))}
    ${row("Подход: работает", words(P.approach.da, APPROACHES, "plus", O.approach))}
    ${row("Подход: не действует", words(P.approach.net, APPROACHES, "minus", O.approach) + notes(P.approach.notes))}
    ${row("Память", (memory.length ? memory.join("") : none("как у всех"))
      + (P.memory.pomnit.length ? ` помнит особо: ${words(P.memory.pomnit, MEM_KEYS, "role", O.memKeys)}` : "")
      + (P.memory.proshchaet.length ? ` прощает легко: ${words(P.memory.proshchaet, MEM_KEYS, "role", O.memKeys)}` : ""))}
    ${row("Говорит", `${manners || none("без особой манеры")}${notes(P.voice.notes)}`)}
    ${row("Доклад", `<span class="tag ${P.voice.bias === "bez" ? "plus" : "minus"}" title="${esc(`${bias.desc}. ${whence(O.bias ?? undefined)}`)}">${esc(bias.name)}${mark(O.bias ?? undefined)}</span>
      <span class="muted">${esc(bias.desc)}${O.bias && !O.bias.trait ? ` — ${esc(O.bias.from)}` : ""}</span>`)}
    ${row("Ладит", linkTags(P.links.ladit, "plus"))}
    ${row("Не ладит", linkTags(P.links.neLadit, "minus") + speed + notes(P.links.notes))}
    ${row("Следы", `${lines || none("следов нет")}${shade.length ? `<div class="muted">${shade.join("; ")}</div>` : ""}`)}
    ${ifs ? row("При условии", ifs) : ""}
    ${threads ? row("Нити", threads) : ""}
    ${deed || skills ? row("Дело", deed + skills) : ""}
    ${likho.length ? row("Лихо", likho.join("; ")) : ""}
    ${P.alloys.length ? row("Сплав", P.alloys.map((a) => `<div class="trace"><span class="tag perk">${esc(a.name)}</span> ${esc(a.text)}</div>`).join("")) : ""}
    ${p.traits.some((t) => t.seneschal) ? "" : row("Откуда и чей", originRow(p))}
  </div>
  <h3>Особенное черт: действие и слова автора по полям</h3><div id="portrait-traits">${special}</div>`;
}
