import { describe, expect, it } from "vitest";
import { rollSpec, type RollContext } from "../src/rollers/run";

function context(markdown: string): RollContext {
	return {
		sourcePath: "A.md",
		random: (min) => min,
		readNote: async () => ({ path: "T.md", markdown }),
		notesWithTag: async () => [],
	};
}

describe("L2: dice without backticks in a row with more columns", () => {
	it("rolls a first cell and keeps the others", async () => {
		const outcome = await rollSpec("[[T^t]]", context("| A | B |\n|---|---|\n| dice: 1d1 | x |\n^t\n"));
		expect(outcome.text).toBe("1 | x");
	});

	it("rolls a later cell too", async () => {
		const outcome = await rollSpec("[[T^t]]", context("| A | B |\n|---|---|\n| x | dice: 1d1 |\n^t\n"));
		expect(outcome.text).toBe("x | 1");
	});

	it("rolls cells of a lookup row", async () => {
		const outcome = await rollSpec("[[T^t]]", context("| dice: 1d1 | B | C |\n|---|---|---|\n| 1 | dice: 2d1 | y |\n^t\n"));
		expect(outcome.text).toBe("2 | y");
	});
});
