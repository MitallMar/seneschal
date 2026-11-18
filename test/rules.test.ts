// Договорённости, которые ломают игру молча: направление зависимостей между слоями, случайность только с семенем,
// числа только в balance.ts и у каждого числа — ручка с диапазоном.
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { BALANCE, KNOBS, getAt, setAt, snapshotBalance, restoreBalance, resetBalance } from "../src/sim/balance";

const src = resolve(dirname(fileURLToPath(import.meta.url)), "../src");
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? files(join(dir, f)) : [join(dir, f)]));
const layerFiles = (layer: string) => files(join(src, layer)).filter((f) => f.endsWith(".ts"));
const name = (f: string) => relative(src, f);
const noComments = (text: string) => text.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
const imports = (text: string) =>
  [...text.matchAll(/(?:import|export)[^'"]*?from\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]/g)].map((m) => m[1] || m[2]);

afterEach(() => resetBalance());

// какому слою что можно импортировать: src/ui → src/sim → src/data
const ALLOWED: Record<string, string[]> = { data: ["data"], sim: ["sim", "data"], ui: ["ui", "sim", "data"] };

test("зависимости идут в одну сторону: ui → sim → data", () => {
  const bad: string[] = [];
  for (const [layer, allowed] of Object.entries(ALLOWED)) {
    for (const f of layerFiles(layer)) {
      for (const target of imports(readFileSync(f, "utf8"))) {
        const to = relative(src, resolve(dirname(f), target)).split(/[\\/]/)[0];
        if (!target.startsWith(".") || !allowed.includes(to)) bad.push(`${name(f)} → ${target}`);
      }
    }
  }
  assert.deepEqual(bad, []);
});

test("в src/ нет папок вне слоёв data, sim, ui", () => {
  assert.deepEqual(readdirSync(src).sort(), Object.keys(ALLOWED).sort());
});

test("src/sim и src/data не трогают DOM, часы и Math.random", () => {
  const bad: string[] = [];
  for (const f of [...layerFiles("sim"), ...layerFiles("data")]) {
    const code = noComments(readFileSync(f, "utf8"));
    if (/\b(document|window|localStorage|sessionStorage|navigator|requestAnimationFrame)\b/.test(code)) bad.push(`${name(f)}: трогает DOM`);
    if (/Math\.random/.test(code)) bad.push(`${name(f)}: Math.random вместо rng.ts`);
    if (/\bDate\b|performance\.now/.test(code)) bad.push(`${name(f)}: часы — партия перестаёт зависеть только от семени`);
  }
  assert.deepEqual(bad, []);
});

test("Math.random нет и на экране: случайность партии идёт только через rng.ts", () => {
  const bad = layerFiles("ui").filter((f) => /Math\.random/.test(noComments(readFileSync(f, "utf8")))).map(name);
  assert.deepEqual(bad, []);
});

test("числа баланса лежат только в balance.ts: старого config.ts нет, дробных чисел в остальной логике нет", () => {
  assert.equal(existsSync(join(src, "sim/config.ts")), false);
  const bad: string[] = [];
  for (const f of layerFiles("sim").filter((x) => !/(balance|rng)\.ts$/.test(x))) {
    const code = noComments(readFileSync(f, "utf8")).replace(/"(?:[^"\\\n]|\\.)*"/g, '""');
    for (const m of code.matchAll(/(?<![\w.$])\d+\.\d+/g)) bad.push(`${name(f)}: ${m[0]}`);
  }
  assert.deepEqual(bad, []);
});

test("у каждого числа баланса есть ручка", () => {
  const leaves: string[] = [];
  const walk = (o: object, p: string) => {
    for (const [key, v] of Object.entries(o)) {
      if (typeof v === "number") leaves.push(p + key);
      else walk(v, `${p}${key}.`);
    }
  };
  walk(BALANCE, "");
  assert.deepEqual(leaves.sort(), KNOBS.map((q) => q.path).sort());
  assert.ok(KNOBS.length > 0);
  assert.equal(new Set(KNOBS.map((q) => q.label)).size, KNOBS.length, "подписи ручек не повторяются");
});

test("ручка: значение по умолчанию в диапазоне и на шаге, шаг и подпись есть", () => {
  const bad = KNOBS.filter((q) => !(q.min <= q.def && q.def <= q.max && q.min < q.max && q.step > 0 && q.label.trim()));
  assert.deepEqual(bad.map((q) => q.path), []);
  const offGrid = KNOBS.filter((q) => setAt(q.path, q.def, structuredClone(BALANCE)) !== q.def);
  assert.deepEqual(offGrid.map((q) => q.path), [], "значение по умолчанию не лежит на шаге ползунка");
  for (const q of KNOBS) assert.equal(getAt(q.path), q.def, q.path);
});

test("ручка меняет число в BALANCE на месте, зажимает в диапазон и округляет до шага", () => {
  assert.equal(setAt("decide.noise", 2.5), 2.5);
  assert.equal(BALANCE.decide.noise, 2.5);
  assert.equal(setAt("decide.noise", 1e9), 4);
  assert.equal(setAt("decide.noise", -5), 0);
  assert.equal(setAt("decide.noise", 1.234), 1.2);
  assert.equal(setAt("rel.rival", -3.3), -3.5);
  assert.throws(() => setAt("decide.netTakoy", 1), /нет ручки/);
});

test("«было / стало»: снимок возвращает значения, сброс возвращает значения по умолчанию", () => {
  const before = snapshotBalance();
  setAt("council.sabotage", 0.9);
  setAt("season.events", 5);
  const after = snapshotBalance();
  restoreBalance(before);
  assert.equal(BALANCE.council.sabotage, 0.3);
  assert.equal(after["council.sabotage"], 0.9);
  restoreBalance(after);
  assert.equal(BALANCE.season.events, 5);
  resetBalance();
  assert.deepEqual(snapshotBalance(), Object.fromEntries(KNOBS.map((q) => [q.path, q.def])));
});

test("пороги слов идут по порядку: враги < соперники < ладят < заодно", () => {
  assert.ok(BALANCE.rel.enemy < BALANCE.rel.rival && BALANCE.rel.rival < BALANCE.rel.friendly && BALANCE.rel.friendly < BALANCE.rel.ally);
  const L = BALANCE.loyalty;
  assert.ok(L.bitter < L.unhappy && L.unhappy < L.trusts && L.trusts < L.devoted);
  assert.ok(BALANCE.exp.settled < BALANCE.exp.master && BALANCE.exp.master <= BALANCE.exp.staleFrom);
  assert.ok(BALANCE.staff.startTenureMin <= BALANCE.staff.startTenureMax);
  assert.ok(BALANCE.know.notable < BALANCE.know.strong, "слабо < заметно < сильно");
});

// Циклы импортов: модуль не должен тянуть сам себя через соседей. Импорты только типов (import type, export type) не в счёт: в сборку они не попадают.
test("в src/ нет циклов импортов", () => {
  const all = Object.keys(ALLOWED).flatMap(layerFiles);
  const runtime = (text: string) => imports(noComments(text).replace(/(?:import|export)\s+type\b[^;]*;/g, ""));
  const graph = new Map(all.map((f) => [f, runtime(readFileSync(f, "utf8")).map((t) => `${resolve(dirname(f), t)}.ts`).filter((t) => all.includes(t))]));
  const reach = (from: string, seen = new Set<string>()): Set<string> => {
    for (const to of graph.get(from)!) if (!seen.has(to)) reach(to, seen.add(to));
    return seen;
  };
  assert.deepEqual(all.filter((f) => reach(f).has(f)).map(name), []);
});

// Фасадов «всё из одного файла» в ядре нет: каждый импортирует нужный модуль. Такой файл тянет всё сразу и первым замыкает цикл.
test("в ядре нет фасадов: файлов из одних реэкспортов", () => {
  assert.equal(existsSync(join(src, "sim/sim.ts")), false);
  assert.equal(existsSync(join(src, "sim/economy.ts")), false);
  const bad = layerFiles("sim").filter((f) => /^\s*export\s*\*\s*from/m.test(noComments(readFileSync(f, "utf8")))).map(name);
  assert.deepEqual(bad, []);
});
