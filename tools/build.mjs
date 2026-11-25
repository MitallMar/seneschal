// Собирает страницы в самодостаточные файлы: dist/index.html — прототип совета, dist/natura.html — эмулятор натуры.
import { build } from "esbuild";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const PAGES = [
  { entry: "src/ui/council/main.ts", html: "src/ui/index.html", css: "src/ui/style.css", out: "dist/index.html" },
  { entry: "src/ui/natura/main.ts", html: "src/ui/natura.html", css: "src/ui/natura.css", out: "dist/natura.html" },
];
mkdirSync("dist", { recursive: true });
for (const page of PAGES) {
  const result = await build({
    entryPoints: [page.entry],
    bundle: true,
    format: "iife",
    target: "es2020",
    minify: false,
    write: false,
  });
  const js = result.outputFiles[0].text.replace(/<\/script>/g, "<\\/script>");
  const out = readFileSync(page.html, "utf8")
    .replace("/*__CSS__*/", () => readFileSync(page.css, "utf8"))
    .replace("/*__JS__*/", () => js);
  writeFileSync(page.out, out);
  console.log(page.out, (out.length / 1024).toFixed(1), "KB");
}
