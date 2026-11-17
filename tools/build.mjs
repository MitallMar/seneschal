// Собирает прототип в один самодостаточный файл dist/index.html
import { build } from "esbuild";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const result = await build({
  entryPoints: ["src/ui/main.ts"],
  bundle: true,
  format: "iife",
  target: "es2020",
  minify: false,
  write: false,
});
const js = result.outputFiles[0].text.replace(/<\/script>/g, "<\\/script>");
const html = readFileSync("src/ui/index.html", "utf8");
const css = readFileSync("src/ui/style.css", "utf8");
const out = html
  .replace("/*__CSS__*/", () => css)
  .replace("/*__JS__*/", () => js);
mkdirSync("dist", { recursive: true });
writeFileSync("dist/index.html", out);
console.log("dist/index.html", (out.length / 1024).toFixed(1), "KB");
