// Сплавы и слой «Откуда и чей» (задача И27в). Замысел — docs/design/cherty-dannye.md, разделы 7.4 и 10. id не менять: под ними будут сохранения.
import type { PoleKey, Want, Hold, ThreadId, LinkKey, Rarity, TraitC3 } from "./types";
import type { PeopleId } from "./names";

// ---------- Сплавы: не черта мешка, а правило ----------
// Когда у человека сошлись все части сплава, у него появляется имя и одна особенность. Часть — полюс признака, одна из названных черт или то и другое на выбор.
// Условие: сошлись одни признаки — полюса сильные; хотя бы одна часть дана чертой — полюсам хватит заметного (пороги — natura.portrait).
export interface AlloyPart { pole?: PoleKey; traits?: string[] }
// text — особенность словами; c3 — то из неё, что ложится на ключи словаря: поверх признаков и черт, как у последней нажитой черты.
export interface AlloyDef { id: string; name: string; parts: AlloyPart[]; text: string; c3?: TraitC3 }

export const ALLOYS: AlloyDef[] = [
  {
    id: "pravedny_skupets", name: "Праведный скупец",
    parts: [{ pole: "vera+", traits: ["chtit_primety", "stal_nabozhen"] }, { pole: "shchedrost-", traits: ["zimoy_snega"] }],
    text: "храму даёт, людям нет: обычай и просьба жреца работают, просьба людей — нет; след: вклад в храм при пустом столе",
    c3: { approach: { da: ["obychay"], net: ["prosba"] } },
  },
  {
    id: "strog_da_svoy", name: "Строг, да свой", parts: [{ pole: "zhestkost+" }, { pole: "privyazannost+" }],
    text: "своих бьёт, но в обиду не даёт: дома сечёт, перед чужими выгораживает; свои его и боятся, и держатся",
    c3: { voice: { bias: "vygorazhivaet" } },
  },
  {
    id: "vesyoly_vor", name: "Весёлый вор", parts: [{ pole: "obshchitelnost+" }, { traits: ["nechist_na_ruku"] }],
    text: "все любят, все знают — и молчат: в молве про него шутят, а жалоб и доносов нет",
  },
  {
    id: "nabozhny_gulyaka", name: "Набожный гуляка", parts: [{ pole: "vera+" }, { traits: ["gulyaka"] }],
    text: "пьёт и кается: нить пьянства ходит по кругу — запой, покаяние, снова запой",
  },
  {
    id: "tikhiy_omut", name: "Тихий омут", parts: [{ pole: "obshchitelnost-" }, { pole: "chestnost-" }, { pole: "terpenie+" }],
    text: "следов почти нет (тень −2), но каждый след крупный и ясный",
    c3: { traces: { ten: -2, yasnost: 1 } },
  },
  {
    id: "chestny_upryamets", name: "Честный упрямец", parts: [{ pole: "chestnost+" }, { pole: "lyubopytstvo-" }],
    text: "скажет правду и не сдвинется: без пристрастия и в споре не уступает; берут его только с глазу на глаз и временем",
    c3: { voice: { bias: "bez", manner: "в споре не уступает" }, approach: { da: ["s_glazu_na_glaz", "vremya"] } },
  },
];

// ---------- «Откуда и чей»: происхождение, одно на человека ----------
// Сословная мера — кто с кем сидит, кого слушают, за кого вступятся. Ступени: челядь, деревня, служба, верх; «на отшибе» — вне лестницы.
export type Mera = "chelyad" | "derevnya" | "sluzhba" | "verkh" | "otshib";
export const MERA_NAMES: Record<Mera, string> = { chelyad: "челядь", derevnya: "деревня", sluzhba: "служба", verkh: "верх", otshib: "на отшибе" };
// Группа имён для генератора имени (src/sim/names.ts): крестьянин марок; замок, палата и пришлые; народ.
export type OriginNames = "peasant" | "castle" | PeopleId;

export interface OriginDef {
  id: string;
  name: string;
  mera: Mera;
  meraNote?: string;        // оговорка к мере: «ниже», «челядь → служба»
  wants: Want[];            // что его тянет
  holds?: Hold[];           // что его держит
  threads: ThreadId[];      // к каким нитям склонен
  ladit: LinkKey[];         // свои
  neLadit: LinkKey[];       // чужие
  note?: string;            // оговорки к желаниям, нитям и связям — словами автора
  often: string[];          // id черт, перков и облика, которые выпадают чаще (во сколько раз — ручка natura.originWeight)
  names: OriginNames[];     // из какого мешка имя; два — на выбор («человеческое или лесное»)
  rarity: Rarity;           // как часто встречается: вес — те же ручки редкости, что у черт
  lore: string;             // опора в лоре
}

export const ORIGINS: OriginDef[] = [
  {
    id: "starozhil", name: "Здешний старожил", mera: "derevnya", wants: ["pokoy", "blizkie"], threads: [], ladit: ["starozhily"], neLadit: ["prishlye"],
    note: "старожилы — свои; пришлые — чужие", often: ["kak_dedy", "prikipel", "pomnit_rodstvo"], names: ["peasant"], rarity: "common", lore: "старые дворы марок",
  },
  {
    id: "prishly_na_lgotu", name: "Пришлый на льготу", mera: "derevnya", wants: [], threads: ["svoy_dvor", "uyti"], ladit: ["prishlye"], neLadit: [],
    note: "«уйти» — когда кончится льгота", often: ["stavit_svoy_dvor", "kopit_na_nadel"], names: ["peasant"], rarity: "common", lore: "льгота — десять лет",
  },
  {
    id: "vtoroy_syn", name: "Второй сын из тесного домена", mera: "derevnya", wants: [], threads: ["nadel"], ladit: ["prishlye"], neLadit: [],
    often: ["kopit_na_nadel", "metit_vysoko"], names: ["peasant"], rarity: "common", lore: "идут вторые сыновья из тесного домена и с храмовой земли",
  },
  {
    id: "beglyy_s_zakata", name: "Беглый с заката", mera: "derevnya", meraNote: "ниже", wants: [], threads: ["proshloe"], ladit: ["prishlye"], neLadit: ["palata"],
    note: "«прошлое» — ищут; палата косится", often: ["khlebnul_likha", "nikomu"], names: ["peasant"], rarity: "rare",
    lore: "беглые с заката сидели «по топору»; храм требует выдать беглых",
  },
  {
    id: "byvaly", name: "Бывалый", mera: "derevnya", wants: ["dengi"], threads: ["draka"], ladit: ["byvalye", "sluzhilye"], neLadit: ["palata"],
    often: ["ne_robkogo_desyatka", "gulyaka", "shram"], names: ["castle"], rarity: "common", lore: "артели бывалых на зиму к острожкам",
  },
  {
    id: "iz_chelyadi", name: "Выслужился из челяди", mera: "chelyad", meraNote: "челядь → служба", wants: ["mesto"], threads: [], ladit: ["chelyad"], neLadit: ["gordost+"],
    note: "челядь — свои; гордые смотрят свысока", often: ["privyk_podchinyatsya", "raspravil_plechi"], names: ["peasant"], rarity: "common", lore: "",
  },
  {
    id: "sluzhily_rod", name: "Из служилого рода", mera: "sluzhba", wants: ["pochet"], holds: ["pravilo"], threads: [], ladit: ["sluzhilye"], neLadit: [],
    often: ["sluzhaka", "derzhit_slovo"], names: ["castle"], rarity: "common", lore: "служилые воеводы, острожки",
  },
  {
    id: "khramovy_vyuchenik", name: "Храмовый выученик", mera: "sluzhba", wants: ["chistaya_sovest"], threads: [], ladit: ["khram"], neLadit: [],
    often: ["knizhnik", "chtit_primety"], names: ["castle"], rarity: "rare", lore: "храмовая земля в полосе",
  },
  {
    id: "polukrovka", name: "Полукровка лесной крови", mera: "otshib", wants: [], threads: ["metka"], ladit: ["lesnye"], neLadit: ["derevni"],
    note: "«метка» — в прилив почти наверняка меченый; лесные — свои, деревни насторожены", often: ["slushaet_les", "govorit_po_lesnomu", "belaya_vorona"],
    names: ["peasant", "forest"], rarity: "exceptional", lore: "срок жизни — лотерея, метка сильнее, пожирателем не станет",
  },
  {
    id: "zamkovy_sirota", name: "Замковый сирота", mera: "chelyad", wants: ["blizkie"], threads: [], ladit: ["chelyad"], neLadit: [],
    note: "близкие — Сенешаль: близость и верность на старте выше; годится в свои уши; «Пригрел сироту» — у тех, кто растил", often: [], names: ["castle"], rarity: "rare",
    lore: "подобранные Сенешалем",
  },
  {
    id: "iz_vadely", name: "Горожанин из Ваделы", mera: "sluzhba", wants: ["dengi", "novoe"], threads: [], ladit: ["kuptsy", "palata"], neLadit: ["derevni"],
    note: "деревням — чужак", often: ["knizhnik", "prodast_i_kupit", "povidal_svet"], names: ["castle"], rarity: "rare", lore: "Вадела — ближний город",
  },
  {
    id: "tull", name: "Тулл", mera: "otshib", meraNote: "свои деревни", wants: ["pokoy"], threads: [], ladit: [], neLadit: [],
    note: "торгуют с деревнями; держатся своих", often: ["slushaet_les", "govorit_s_lesom"], names: ["tull"], rarity: "exceptional",
    lore: "тулльи деревни на заливных лугах полосы; туллы уходят с заливного раньше зверя — вернейшая примета",
  },
];
// У «Беглого под чужим именем» настоящее происхождение — «Беглый с заката», а на людях — другое.
export const HIDDEN_ORIGIN = { trait: "beglyy_pod_imenem", real: "beglyy_s_zakata" };
