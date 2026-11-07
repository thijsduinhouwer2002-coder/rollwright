import { describe, expect, it } from "vitest";
import type { RandomInt } from "../src/engine";
import { noteLines } from "../src/rollers/markdown";
import { rollSpec } from "../src/rollers/run";

// |line trekt nooit een losse lijn (***, ---, ___): die toont een lege uitkomst met alleen een streep.
const BRON = "---\nsoort: x\n---\n# Kop\n\n- Punt\n\n***\n\n---\n___\n* * *\n - - -\nTekst\n";

describe("|line skips horizontal rules", () => {
	it("leaves out every kind of horizontal rule", () => {
		expect(noteLines(BRON)).toEqual(["# Kop", "- Punt", "Tekst"]);
	});

	it("keeps lines that only look a bit like a rule", () => {
		expect(noteLines("--\n**vet**\n- item\n***tekst\n-- x --\n    ***")).toEqual(["--", "**vet**", "- item", "***tekst", "-- x --", "    ***"]);
	});

	it("never draws a rule, also with many picks", async () => {
		let i = 0;
		const random: RandomInt = (min, max) => min + (i++ % (max - min + 1));
		const context = {
			sourcePath: "Hier.md",
			random,
			readNote: async () => ({ path: "Bron.md", markdown: BRON }),
			notesWithTag: async () => [],
		};
		const outcome = await rollSpec("9[[Bron]]|line", context);
		const lines = outcome.text.split("\n");
		expect(lines).toHaveLength(9);
		for (const line of lines) expect(["# Kop", "- Punt", "Tekst"]).toContain(line);
	});
});
