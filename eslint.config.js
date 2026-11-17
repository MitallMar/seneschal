// Линтер: ESLint с разбором TypeScript. Запуск: npm run lint (вместе с проверкой длины строк tools/long-lines.mjs).
import globals from "globals";
import tseslint from "typescript-eslint";

const unused = ["warn", { args: "none", caughtErrors: "none" }];

export default tseslint.config(
  { ignores: ["dist/", "node_modules/", "test/e2e/shots/"] },
  {
    files: ["**/*.ts"],
    extends: [tseslint.configs.recommended],
    languageOptions: { ecmaVersion: 2022, sourceType: "module", globals: { ...globals.browser, ...globals.node } },
    rules: {
      "@typescript-eslint/no-unused-vars": unused,
      // «!» после поиска по id в данных — принятый здесь приём: данные сверяет тест test/data.test.ts
      "@typescript-eslint/no-non-null-assertion": "off",
      "no-dupe-keys": "error",
      "prefer-const": "error",
      eqeqeq: ["error", "always", { null: "ignore" }],
    },
  },
  {
    files: ["**/*.js", "**/*.mjs"],
    languageOptions: { ecmaVersion: 2022, sourceType: "module", globals: { ...globals.node } },
    rules: { "no-undef": "error", "no-unused-vars": unused, "no-dupe-keys": "error" },
  },
  // логика и данные работают без браузера: имена DOM здесь — ошибка (то же правило сторожит test/rules.test.ts)
  {
    files: ["src/sim/**/*.ts", "src/data/**/*.ts"],
    languageOptions: { globals: { ...globals.es2021 } },
    rules: {
      "no-restricted-globals": ["error", "document", "window", "localStorage", "navigator", "requestAnimationFrame"],
      "no-restricted-properties": ["error", { object: "Math", property: "random", message: "Случайность только через src/sim/rng.ts с семенем." }],
    },
  },
);
