import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Keuring 0.3.4 (scan community.obsidian.md, 9 nov 2026): 12 keer "Avoid !important" en 4 keer
// "css-clip-path is only partially supported by Obsidian 1.6.5", allemaal in de wereld-CSS.
// Daan loste ze op (79135b2). Deze test houdt ze eruit: in styles.css, zonder commentaar, komt
// geen !important en geen clip-path meer voor.
const root = fileURLToPath(new URL("..", import.meta.url));
const css = readFileSync(`${root}/styles.css`, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

describe("styles.css zonder keuringspunten", () => {
	it("geen !important", () => {
		expect(css.match(/!\s*important/gi) ?? []).toEqual([]);
	});

	it("geen clip-path", () => {
		expect(css.match(/clip-path/gi) ?? []).toEqual([]);
	});
});
