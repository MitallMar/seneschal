// Здоровье: черты здоровья и то, как на него действуют нажитые черты натуры (задача И10). Замысел — docs/design/zdorovye.md.
// Правила и числа — src/sim/health.ts и раздел health в balance.ts. К совету здоровье пока не подключено.
import type { HealthTrait } from "./types";

export const HEALTH_TRAITS: HealthTrait[] = [
  // --- врождённые ---
  { id: "krepok", name: "Крепок как дуб", desc: "Сроду не хворал дольше трёх дней", origin: "born", good: true, weight: 3, krepost: 1, risk: 0.6,
    effect: "Реже слегает; дольше держится на должности в старости" },
  { id: "zhivuch", name: "Живуч как кошка", desc: "Выкарабкивался оттуда, откуда не возвращаются", origin: "born", good: true, weight: 2, death: 0.5,
    effect: "Тяжёлую болезнь и рану переживает чаще" },
  { id: "ne_beryot", name: "Хворь не берёт", desc: "Вся деревня лежала в горячке, а он носил воду", origin: "born", good: true, weight: 1, risk: 0.4,
    effect: "Мор и поветрия обходят стороной" },
  { id: "slaboe", name: "Слабое здоровье", desc: "С детства то одно, то другое", origin: "born", weight: 3, krepost: -1, risk: 1.8, death: 1.5,
    effect: "Слегает чаще, болеет тяжелее; должность при нём пустует чаще" },
  { id: "khily", name: "Хилый", desc: "Кожа да кости, тяжёлой работы не тянет", origin: "born", weight: 2, krepost: -2, risk: 1.3,
    effect: "Раньше других выбывает со службы" },
  { id: "merzlyak", name: "Мерзляк", desc: "Первые холода — и он уже кашляет", origin: "born", weight: 2, winter: 1.8,
    effect: "Зимой слегает почти каждый год" },
  // --- наследственные ---
  { id: "slabaya_grud", name: "Слабая грудь", desc: "В роду половина померла от кашля", origin: "hereditary", weight: 3, winter: 2, death: 1.4,
    effect: "Зимние хвори опасны; у родни то же" },
  { id: "paduchaya", name: "Падучая", desc: "Родовая болезнь: падает и бьётся, потом не помнит", origin: "hereditary", weight: 2, krepost: -1, risk: 1.2,
    effect: "В решающий день может оказаться не в строю" },
  { id: "durnaya_krov", name: "Дурная кровь", desc: "Раны у них в роду заживают плохо", origin: "hereditary", weight: 2, death: 2,
    effect: "Тяжёлая болезнь или рана чаще кончается смертью" },
  { id: "lomota", name: "Родовая ломота", desc: "Суставы крутит у всей семьи, у кого раньше, у кого позже", origin: "hereditary", weight: 3, krepost: -1, risk: 1.2,
    effect: "К перемене погоды работник из него никакой" },
  { id: "rano_stareyut", name: "Рано стареют", desc: "В их роду седеют к семидесяти", origin: "hereditary", weight: 2, aging: 1.5,
    effect: "Старость приходит на десятки лет раньше" },
  { id: "dolgozhiteli", name: "Род долгожителей", desc: "Прадед в сто девяносто ещё ходил за плугом", origin: "hereditary", good: true, weight: 2, aging: 0.6,
    effect: "Стареет медленнее, служит дольше" },
  // --- нажитые ---
  { id: "staraya_rana", name: "Старая рана", desc: "Заросла, а ноет", origin: "gained", cause: "wound", weight: 3, krepost: -1.5, winter: 1.3,
    effect: "В холода и в дороге — обуза" },
  { id: "khromota", name: "Хромота", desc: "Нога срослась криво", origin: "gained", cause: "wound", weight: 3, krepost: -1,
    effect: "Дозоры и объезды даются тяжело" },
  { id: "nadorvalsya", name: "Надорвался", desc: "Поднял больше, чем мог, — и что-то внутри лопнуло", origin: "gained", cause: "wound", weight: 2, krepost: -1.5, risk: 1.2,
    effect: "Тяжёлой работы больше не тянет" },
  { id: "zastuzhen", name: "Застуженная грудь", desc: "Кашель остался с той зимы", origin: "gained", cause: "illness", weight: 3, krepost: -1, winter: 1.6,
    effect: "Каждая зима теперь испытание" },
  { id: "serdtse", name: "Сердце шалит", desc: "После горячки задыхается на лестнице", origin: "gained", cause: "illness", weight: 2, krepost: -1, death: 1.8,
    effect: "Следующая тяжёлая болезнь может стать последней" },
  { id: "perebolel", name: "Переболел и окреп", desc: "Что не убило, то закалило", origin: "gained", cause: "illness", good: true, weight: 3, risk: 0.7,
    effect: "Слегает реже" },
  { id: "dryakhleet", name: "Дряхлеет", desc: "Годы взяли своё: силы уходят", origin: "gained", cause: "age", weight: 3, krepost: -2,
    effect: "Со службы пора на покой" },
  { id: "tryasuchka", name: "Трясутся руки", desc: "Перо и ложку держит с трудом", origin: "gained", cause: "age", weight: 2, krepost: -1,
    effect: "Писарем и ключником — хуже" },
  { id: "slepnet", name: "Слабеет глазами", desc: "Буквы плывут, лица вдалеке не различает", origin: "gained", cause: "age", weight: 2, krepost: -0.5,
    effect: "Бумаги и дозоры — хуже" },
];

// Как нажитые черты натуры сказываются на здоровье: id черты из мешка (src/data/natura.ts) → поправки, как у черт здоровья.
export const NATURA_HEALTH: Record<string, { krepost?: number; risk?: number; death?: number }> = {
  charka: { krepost: -1, risk: 1.4 },
  gulyaka: { risk: 1.2 },
  razmyak: { risk: 1.2 },
  zamaterel: { krepost: 0.5, risk: 0.85 },
  khlebnul_likha: { risk: 0.9 },
  zarok: { risk: 0.9 },
};
