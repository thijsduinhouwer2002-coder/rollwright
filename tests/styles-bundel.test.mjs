import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// styles.css wordt bij het bouwen samengesteld uit src/styles/*.css (esbuild.config.mjs).
// Deze test faalt als iemand styles.css direct wijzigt of een deel wijzigt zonder te bouwen.
const root = fileURLToPath(new URL("..", import.meta.url));
const dir = join(root, "src/styles");
const delen = readdirSync(dir).filter((f) => f.endsWith(".css")).sort();

describe("styles.css uit delen", () => {
	it("is precies de delen achter elkaar", () => {
		const som = delen.map((f) => readFileSync(join(dir, f), "utf8")).join("");
		expect(readFileSync(join(root, "styles.css"), "utf8")).toBe(som);
	});

	it("elk deel blijft onder de 400 regels en eindigt op een nieuwe regel", () => {
		expect(delen.length).toBeGreaterThan(1);
		for (const f of delen) {
			const tekst = readFileSync(join(dir, f), "utf8");
			expect(tekst.split("\n").length - 1, f).toBeLessThan(400);
			expect(tekst.endsWith("\n"), f).toBe(true);
		}
	});
});
