import { describe, expect, it } from "vitest";
import { rollSpec, type RollContext } from "../src/rollers/run";

const TABLE = "| Name | Round | Form | Text(x) |\n|---|---|---|---|\n| a | r1 | f1 | t1 |\n^t\n";
const context: RollContext = {
	sourcePath: "A.md",
	random: (min) => min,
	readNote: async () => ({ path: "T.md", markdown: TABLE }),
	notesWithTag: async () => [],
};

describe("L3: a column named like a flag", () => {
	it("picks a column named after an ignored flag", async () => {
		expect((await rollSpec("[[T^t]]|Round", context)).text).toBe("r1");
	});

	it("picks a column named after a display flag, without the flag", async () => {
		const outcome = await rollSpec("[[T^t]]|form", context);
		expect(outcome.text).toBe("f1");
		expect(outcome.flags.form).toBe(false);
	});

	it("picks a column named like text(x), without the label", async () => {
		const outcome = await rollSpec("[[T^t]]|text(x)", context);
		expect(outcome.text).toBe("t1");
		expect(outcome.flags.text).toBeUndefined();
	});

	it("keeps a real flag next to the column", async () => {
		const outcome = await rollSpec("[[T^t]]|Name|nodice", context);
		expect(outcome.text).toBe("a");
		expect(outcome.flags.nodice).toBe(true);
	});

	it("takes a flag word without such a column as a flag", async () => {
		const outcome = await rollSpec("[[T^t]]|avg", context);
		expect(outcome.text).toBe("a | r1 | f1 | t1");
		expect(outcome.flags.avg).toBe(true);
	});

	it("takes the first of several columns, also when that one is a flag word", async () => {
		expect((await rollSpec("[[T^t]]|Round|Name", context)).text).toBe("r1");
	});
});
