import { defineConfig, globalIgnores } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

export default defineConfig([
	globalIgnores(["node_modules", "dist", "main.js", "esbuild.config.mjs", "eslint.config.mjs", "eslint.scanner.config.mjs", "vitest.config.mjs", "tests", "e2e", "package-lock.json"]),
	...obsidianmd.configs.recommended,
	{
		languageOptions: {
			parserOptions: {
				projectService: {
					allowDefaultProject: ["eslint.config.*"],
				},
			},
		},
	},
]);
