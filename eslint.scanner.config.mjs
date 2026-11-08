// Scannerinstelling van de Obsidian-communitygids, nagebouwd voor lokaal gebruik.
// Bron: docs/configuration.md van obsidianmd/eslint-plugin, sectie
// "Community plugin scanner configuration" (opgehaald 6 nov 2026, plugin 0.5.1).
// Overgenomen: de volledige scanner-equivalente configuratie, plus de strengste
// laag (voor een plugin die vandaag wordt ingediend) uit "Rule severity adjustments".
// Draaien vanuit de productmap: npm run lint:scanner
import { defineConfig, globalIgnores } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

export default defineConfig([
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  ...obsidianmd.configs.recommended,

  {
    files: ["**/*.{ts,cts,mts,tsx,js,cjs,mjs,jsx}"],
    rules: {
      // Security — keep as errors
      "no-eval": "error",
      "no-unsanitized/method": "error",
      "no-unsanitized/property": "error",
      "obsidianmd/regex-lookbehind": "error",
      "obsidianmd/no-forbidden-elements": "error",

      // Covered by TypeScript or too noisy
      "no-undef": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/restrict-template-expressions": "off",
      "@typescript-eslint/no-base-to-string": "off",
      "import/no-unresolved": "off",

      // Old plugins should not change their command ids
      "obsidianmd/commands/no-command-in-command-id": "off",
      "obsidianmd/commands/no-plugin-id-in-command-id": "off",
    },
  },

  {
    // Security — implied eval, once per call: the core rule in JavaScript,
    // typescript-eslint's in TypeScript, where the recommended config turns the
    // core rule off. An "error" for the core rule in the block above would turn
    // it back on in TypeScript and report each call twice.
    files: ["**/*.{js,cjs,mjs,jsx}"],
    rules: {
      "no-implied-eval": "error",
    },
  },
  {
    files: ["**/*.{ts,cts,mts,tsx}"],
    rules: {
      "@typescript-eslint/no-implied-eval": "error",
    },
  },

  {
    // Aanbevelingen uit de echte keuring van 0.3.0 (community.obsidian.md, 8 nov 2026):
    // geen promise aan een callback die niets terug verwacht, en elementen via createEl of
    // createSpan in plaats van document.createElement. Hier nagebouwd zodat het lokaal opvalt.
    files: ["src/**/*.{ts,cts,mts,tsx}"],
    rules: {
      "@typescript-eslint/no-misused-promises": ["error", { checksVoidReturn: true }],
      "no-restricted-syntax": [
        "error",
        {
          selector: "CallExpression[callee.property.name='createElement']",
          message: "Use createEl, createDiv or createSpan (Obsidian review of 0.3.0).",
        },
      ],
    },
  },

  {
    // Scanner handles this separately. It must be switched off under the glob
    // the rule actually runs on -- manifest.json matches no source glob, so an
    // "off" in the block above would not reach it.
    files: ["manifest.json"],
    rules: {
      "obsidianmd/validate-manifest": "off",
    },
  },

  {
    // Scanner handles this separately. It must be switched off under the glob
    // the rule actually runs on -- LICENSE matches no source glob, so an "off"
    // in the block above would not reach it.
    files: ["LICENSE", "LICENSE.md", "LICENSE.txt"],
    rules: {
      "obsidianmd/validate-license": "off",
    },
  },

  {
    // Nieuwste, strengste laag van de scanner (plugin die vandaag wordt ingediend).
    files: ["**/*.{ts,cts,mts,tsx,js,cjs,mjs,jsx}"],
    rules: {
      "@typescript-eslint/no-unsafe-member-access": "warn",
      "@typescript-eslint/no-unsafe-assignment": "warn",
      "@typescript-eslint/no-unsafe-argument": "warn",
      "@typescript-eslint/no-unsafe-call": "warn",
      "@typescript-eslint/no-unsafe-return": "warn",
      "obsidianmd/commands/no-command-in-command-id": "warn",
      "obsidianmd/commands/no-plugin-id-in-command-id": "warn",
      "obsidianmd/settings-tab/no-manual-html-headings": "error",
      "obsidianmd/settings-tab/no-problematic-settings-headings": "error",
      "obsidianmd/sample-names": "error",
      "obsidianmd/no-sample-code": "error",
      "obsidianmd/platform": "error",
      "obsidianmd/no-plugin-as-component": "error",
      "obsidianmd/detach-leaves": "error",
      "obsidianmd/no-static-styles-assignment": "error",
      "obsidianmd/no-view-references-in-plugin": "error",
      "obsidianmd/no-unsupported-api": "error",
      // Alleen de ernst; de opties van de recommended-instelling blijven staan.
      "eslint-comments/require-description": "error",
      "eslint-comments/disable-enable-pair": "error",
      "eslint-comments/no-restricted-disable": "error",
    },
  },

  {
    // The scanner honours disable comments but does not report unused ones
    linterOptions: {
      reportUnusedDisableDirectives: "off",
      reportUnusedInlineConfigs: "off",
    },
  },

  globalIgnores([
    // Not in the scanner's list: the scanner recognises bundled and minified
    // JavaScript by its name and, in a TypeScript project, by its content.
    // These names stand in for that here. Drop "main.js" if your plugin is
    // written in JavaScript and main.js is its source.
    "main.js",
    "**/*.min.js",
    "**/{dist,build,out,release}/**/*.{js,cjs,mjs,jsx}",
    "node_modules",
    "dist",
    "build",
    "pkg",
    "test-vault",
    ".obsidian",
    "**/.obsidian/**",
    "esbuild.config.mjs",
    "version-bump.mjs",
    "**/*.test.*",
    "**/*.tests.*",
    "**/*.spec.*",
    "**/*.specs.*",
    "**/test/**",
    "**/tests/**",
    "**/__tests__/**",
    "**/mocks/**",
    "**/__mocks__/**",
    "**/*.cjs",
    "**/*.mjs",
    "**/*.cts",
    "**/*.mts",
    "**/vite*",
    "**/scripts/**",
    "**/docs/**",
    "**/i18n/**",
    "**/i18next/**",
    "**/locale/**",
    "**/locales/**",
    "**/translations/**",
    "**/l10n/**",
    ".pnpm-store",
    "**/*.spec.ts",
    "**/testUtils**",
    "automation/**",
    "**/e2e/**",
    "**/e2e-tests/**",
    "**/*.e2e.*",
    "**/wdio.conf.*",
    "**/wdio.*.conf.*",
    "**/playwright.config.*",
    "**/{astro,babel,commitlint,docusaurus,esbuild,eslint,jest,oxlint,postcss,prettier,rolldown,rollup,stylelint,svelte,tailwind,tsdown,tsup,uno,webpack}.config.*",
    "**/{eslint,jest}.*.config.*",
    "**/jest.setup.*",
    "**/.{babelrc,eslintrc,mocharc,prettierrc}.*",
  ]),
]);
