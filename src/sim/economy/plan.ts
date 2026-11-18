// План сезона: руки по зонам и все обычные потоки сезона на копии запасов, без случайности. По плану идут и сезон, и прогноз.
import type { Side, Stock, HandsFrom } from "../../data/types";
import type { Lever } from "../../data/handwriting";
import { VILLAGES, HANDS_FROM } from "../../data/economy";
import { BALANCE as B } from "../balance";
import { clamp, round1, round2 } from "../util";
import type { World, LedgerLine } from "../state";
import { seasonKind, AUTUMN, WINTER, SUMMER, SPRING, zoneOf, zoneMult } from "./zones";
import { courseStrength, doer, levers, whoOf } from "./doer";

// ---------- Люди: ёмкость на сезон ----------

export function handsNow(w: World): Record<HandsFrom, number> {
  const out = {} as Record<HandsFrom, number>;
  for (const f of HANDS_FROM) {
    const away = w.eco.recruits.filter((r) => r.from === f && w.season < r.until).reduce((s, r) => s + r.hands, 0);
    out[f] = round1(Math.max(0, B.economy.hands[f] * zoneMult(w, f) - away));
  }
  return out;
}
// Куда идут руки в этот сезон: поле берёт своё первым (зимой стоит), курс «Строимся» снимает руки с поля.
export function fieldHands(w: World): { total: number; field: number; free: number; build: number } {
  // почерк: расчистка новых полей и раненые в стычках отнимают руки
  const lost = Math.min(0, levers(w).hands) * B.economy.hand.hands;
  const h = handsNow(w), total = round1(Math.max(0, HANDS_FROM.reduce((s, f) => s + h[f], 0) + lost));
  if (seasonKind(w.season) === WINTER) return { total, field: 0, free: total, build: 0 };
  const build = w.eco.course === "stroimsya" ? Math.min(total, B.economy.course.buildHands) : 0;
  const field = round1(Math.min(B.economy.hands.field, total - build));
  return { total, field, free: round1(total - field), build };
}

// ---------- План сезона: потоки без случайности ----------

interface Short { side: Side; cat: Stock; v: number; what: string }
interface Plan { lines: LedgerLine[]; short: Short[]; stock: Record<Stock, number>; sown: number; harvest: number }

// Все обычные потоки сезона по состоянию на сейчас. Запасы не трогает: считает на копии.
// По этому же плану строится прогноз, поэтому случайного здесь нет (воровство и события совета идут мимо плана).
export function planSeason(w: World): Plan {
  const E = B.economy, F = E.flow, e = w.eco, kind = seasonKind(w.season);
  const stock = { ...e.stock }, lines: LedgerLine[] = [], short: Short[] = [];
  const add = (cat: Stock, v: number, text: string, extra: Partial<LedgerLine> = {}) => {
    const val = round2(v);
    stock[cat] = round2(stock[cat] + val);
    lines.push({ cat, v: val, text, ...extra });
  };
  // обязательный расход: не хватило — недодали, и сторона обижена
  const spend = (cat: Stock, v: number, text: string, side: Side, extra: Partial<LedgerLine> = {}) => {
    const need = round2(v), got = Math.min(need, stock[cat]);
    if (need <= 0) return;
    if (got > 0) add(cat, -got, text, { side, ...extra });
    if (need - got > 0) short.push({ side, cat, v: round2(need - got), what: text });
  };
  const tiun = doer(w, "starosta"), pisar = doer(w, "pisar"), les = doer(w, "lesnichiy"), klyuch = doer(w, "klyuchnik");
  const hands = fieldHands(w), fieldShare = clamp(hands.field / E.hands.field, 0, 1);
  // почерки совета: множитель потока по рычагу (не ниже нуля)
  const L = levers(w), by = (lever: Lever) => Math.max(0, 1 + L[lever] * E.hand.flow);
  const sown = kind === SPRING ? fieldShare : e.sown;

  // товары, что лежали на складе, уходят купцам
  const seasonPrice = [E.year.priceSpring, E.year.priceSummer, E.year.priceAutumn, E.year.priceWinter][kind];
  const price = F.scale * F.price * seasonPrice * zoneMult(w, "kuptsy") * pisar.mult * (1 + courseStrength(w, "torguem")) * by("price");
  if (stock.tovary > 0) {
    const sold = stock.tovary, how = pisar.note;
    if (price > 0) {
      add("tovary", -sold, "продано купцам", { side: "kuptsy", who: whoOf(pisar, "pisar"), how });
      add("serebro", sold * price, `за товары, ${round2(price)} за воз`, { side: "kuptsy", who: whoOf(pisar, "pisar"), how });
    } else lines.push({ cat: "tovary", v: 0, text: "купцы отказывают: товары лежат на складе", side: "kuptsy" });
  }
  // пошлины
  const seasonDuty = [E.year.dutySpring, E.year.dutySummer, E.year.dutyAutumn, E.year.dutyWinter][kind];
  const levy = w.season < e.dutyCutUntil ? E.pay.levyDuty : 1;
  const duties = F.scale * F.duties * seasonDuty * zoneMult(w, "kuptsy") * pisar.mult * (1 + courseStrength(w, "dorogi")) * levy * by("duties");
  const dutyText = `пошлины${levy < 1 ? " (ниже после особого сбора)" : ""}`;
  if (duties > 0) add("serebro", duties, dutyText, { side: "kuptsy", who: whoOf(pisar, "pisar"), how: pisar.note });
  else lines.push({ cat: "serebro", v: 0, text: "пошлин нет: купцы отказывают", side: "kuptsy" });
  // лес
  const zl = zoneMult(w, "les");
  if (e.course === "les") lines.push({ cat: "tovary", v: 0, text: "брёвен нет: бережём лес", side: "les" });
  else if (zl > 0) add("tovary", F.scale * F.forestGoods * zl * les.mult * by("forestGoods"), "шкуры, мёд, брёвна из леса", { side: "les", who: whoOf(les, "lesnichiy"), how: les.note });
  if (kind === SUMMER && zl > 0) {
    const rites = zoneOf(w, "opushka") === "отказывают" ? E.zone.noRites : 1;
    const gifts = F.scale * F.forestFood * zl * les.mult * (1 + courseStrength(w, "les")) * rites * by("forestFood");
    add("eda", gifts, `дары леса${rites < 1 ? " (обрядов нет: деревня у опушки отказывает)" : ""}`, { side: "les", who: whoOf(les, "lesnichiy"), how: les.note });
  }
  // осень: урожай и оброк
  let harvest = 0;
  if (kind === AUTUMN) {
    const quit = 1 + courseStrength(w, "kopim") - courseStrength(w, "polegche"), how = tiun.note;
    for (const v of VILLAGES) {
      const z = zoneMult(w, v), who = whoOf(tiun, "starosta"), share = v === "brod" ? F.brodShare : 1 - F.brodShare;
      if (z <= 0) { lines.push({ cat: "eda", v: 0, text: "ни урожая, ни оброка: деревня отказывает", side: v }); continue; }
      const crop = F.scale * (F.harvest / VILLAGES.length) * z * tiun.mult * sown * fieldShare * by("harvest");
      harvest += crop;
      const field = sown < 1 || fieldShare < 1 ? ` (посеяно ${Math.round(sown * 100)}%, сжато ${Math.round(fieldShare * 100)}%)` : "";
      add("eda", crop, `урожай${field}`, { side: v, who, how: tiun.note });
      add("serebro", F.scale * F.quitrentSilver * share * z * tiun.mult * quit * by("quitrent") * by("quitrentSilver"), "оброк серебром", { side: v, who, how });
      add("tovary", F.scale * F.quitrentGoods * share * z * tiun.mult * quit * by("quitrent"), "оброк товарами", { side: v, who, how });
    }
  }
  // расходы: долги, жалованье, прокорм
  const debt = e.debts.filter((d) => d.due <= w.season).reduce((s, d) => s + d.sum, 0);
  if (debt > 0) spend("serebro", debt, "возврат займа с лихвой", "kuptsy");
  // почерк: «дорожный сбор» десятника и проценты по долгам писаря
  const purse = L.silver * E.hand.silver;
  if (purse > 0) add("serebro", purse, "дорожный сбор", { side: "kuptsy" });
  if (purse < 0) add("serebro", -Math.min(stock.serebro, -purse), "проценты по старым долгам");
  spend("serebro", F.salary * (1 + courseStrength(w, "dorogi")) * by("salary"), "жалованье страже и челяди", "zamok");
  const upkeep = (kind === WINTER ? F.upkeepWinter : F.upkeep) * by("upkeep");
  const feed: [Side, number, string][] = [["zamok", upkeep * F.castleShare, "прокорм замка"]];
  for (const v of VILLAGES) feed.push([v, (upkeep * (1 - F.castleShare)) / VILLAGES.length, "прокорм работников на барщине"]);
  if (e.feedFirst === "derevni") feed.push(feed.shift()!);
  for (const [side, v, text] of feed) spend("eda", v, text, side);
  if (zoneOf(w, "les") === "отказывают") spend("eda", E.zone.lesHarm, "потравы и твари из леса", "les");
  if (kind === WINTER && stock.eda > 0) {
    const spoil = stock.eda * F.spoil * (1 - courseStrength(w, "stroimsya")) * by("spoil") / klyuch.mult;
    add("eda", -Math.min(stock.eda, spoil), "испорчено за зиму", { who: whoOf(klyuch, "klyuchnik"), how: klyuch.note });
  }
  // курс «Торгуем»: излишек еды сверх нижней черты тоже уходит купцам
  const spare = stock.eda - e.floor.eda - F.upkeepWinter;
  if (e.course === "torguem" && spare > 0 && zoneMult(w, "kuptsy") > 0) {
    add("eda", -spare, "излишек продан купцам", { side: "kuptsy", who: whoOf(pisar, "pisar"), how: pisar.note });
    add("serebro", spare * F.foodPrice * zoneMult(w, "kuptsy") * pisar.mult, "за излишек еды", { side: "kuptsy", who: whoOf(pisar, "pisar"), how: pisar.note });
  }
  // почерк ключника по Выгоде: часть излишка еды сверх черты и зимнего прокорма продаёт сам
  const extra = (stock.eda - e.floor.eda - F.upkeepWinter) * clamp(L.sellFood * E.hand.sell, 0, 1);
  if (extra > 0 && zoneMult(w, "kuptsy") > 0) {
    add("eda", -extra, "излишек продан ключником", { side: "kuptsy", who: whoOf(klyuch, "klyuchnik"), how: klyuch.note });
    add("serebro", extra * F.foodPrice * zoneMult(w, "kuptsy"), "за излишек еды", { side: "kuptsy", who: whoOf(klyuch, "klyuchnik"), how: klyuch.note });
  }
  return { lines, short, stock, sown, harvest: round2(harvest) };
}
