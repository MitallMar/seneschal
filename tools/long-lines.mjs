// Проверка длины строк кода: node tools/long-lines.mjs (входит в npm run lint).
// Считается «плотность кода»: длина строки без русского текста. Тексты для игрока (события, биографии, подписи ручек)
// и русские комментарии пишутся одной длинной строкой, это нормально и в счёт не идёт. Длинной считается строка, в которой
// много именно кода или разметки: такую трудно читать и править. Предел — LIMIT знаков; новые строки лучше держать до 180.
// Аргументы: --top N — показать N самых плотных строк (посмотреть, что стоит разбить в файле, который всё равно правишь).
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const LIMIT = 250;
// длина строки без русских слов и знаков между ними
export const codeLength = (line) => line.replace(/[А-Яа-яЁё«»—–…№]+[ ,.:;!?()«»—–-]*/g, "").length;

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MASKS = ["src/*.ts", "src/*.css", "src/*.html", "test/*.ts", "test/*.py", "tools/*.mjs", "tools/*.ts", "*.js"];
// и новые файлы, которые git ещё не знает (--others): иначе только что написанный файл проходит проверку у автора и падает на GitHub
const list = execSync(`git ls-files --cached --others --exclude-standard ${MASKS.map((m) => `'${m}'`).join(" ")}`, { cwd: root });
const files = list.toString().trim().split("\n").filter(Boolean);
const rows = [];
for (const f of files) {
  let text;
  try { text = readFileSync(resolve(root, f), "utf8"); } catch { continue; } // файл удалён, но ещё числится в git
  text.split("\n").forEach((line, i) => rows.push({ at: `${f}:${i + 1}`, n: codeLength(line) }));
}
const top = process.argv.indexOf("--top");
if (top >= 0) {
  for (const r of rows.sort((a, b) => b.n - a.n).slice(0, +process.argv[top + 1] || 20)) console.log(String(r.n).padStart(4), r.at);
} else {
  const bad = rows.filter((r) => r.n > LIMIT);
  for (const r of bad) console.log(`${r.at}: в строке ${r.n} знаков кода, предел ${LIMIT}: разбей её на несколько`);
  if (bad.length) process.exit(1);
  console.log(`длина строк: ${rows.length} строк в ${files.length} файлах, длиннее ${LIMIT} знаков кода нет`);
}
