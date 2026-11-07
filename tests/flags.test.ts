import { describe, expect, it } from "vitest";
import { formatResult, roll } from "../src/engine";
import { rollSpec, type RollContext } from "../src/rollers/run";
import { parseSpec } from "../src/rollers/spec";

function context(side: "min" | "max"): RollContext {
	return {
		sourcePath: "A.md",
		random: (min, max) => (side === "min" ? min : max),
		readNote: async () => null,
		notesWithTag: async () => [],
	};
}

const low = context("min");
const high = context("max");

describe("number flags", () => {
	it("2d6|round shows a whole number", async () => {
		const outcome = await rollSpec("2d6|round", high);
		expect(outcome.text).toBe("12");
		expect(outcome.flags.round).toBe("round");
	});

	it("round goes to the nearest whole number, halves away from zero", async () => {
		expect((await rollSpec("1d6/4|round", high)).text).toBe("2");
		expect((await rollSpec("1d6/4|round", low)).text).toBe("0");
		expect(formatResult(2.5, { round: "round" })).toBe("3");
		expect(formatResult(-2.5, { round: "round" })).toBe("-3");
	});

	it("1d6/4|ceil rounds up", async () => {
		expect((await rollSpec("1d6/4|ceil", low)).text).toBe("1");
		expect((await rollSpec("1d6/4|ceil", high)).text).toBe("2");
	});

	it("1d6/4|floor rounds down", async () => {
		expect((await rollSpec("1d6/4|floor", low)).text).toBe("0");
		expect((await rollSpec("1d6/4|floor", high)).text).toBe("1");
	});

	it("1d6-3|signed always shows a sign", async () => {
		expect((await rollSpec("1d6-3|signed", high)).text).toBe("+3");
		expect((await rollSpec("1d6-3|signed", low)).text).toBe("-2");
		expect((await rollSpec("3-3|signed", low)).text).toBe("+0");
	});

	it("1d6|paren puts brackets around the result", async () => {
		expect((await rollSpec("1d6|paren", high)).text).toBe("(6)");
		expect((await rollSpec("1d6-3|signed|paren", high)).text).toBe("(+3)");
	});

	it("noround and noparen switch the flag off again, the last flag counts", async () => {
		expect((await rollSpec("1d6/4|round|noround", high)).text).toBe("1.5");
		expect((await rollSpec("1d6|paren|noparen", high)).text).toBe("6");
		expect((await rollSpec("1d6/4|ceil|floor", high)).text).toBe("1");
		expect((await rollSpec("1d6/4|noround|ceil", high)).text).toBe("2");
	});

	it("works together with |text(x) and |nodice", async () => {
		const outcome = await rollSpec("1d6/4|ceil|text(Schade)|nodice|signed|paren", high);
		expect(outcome.text).toBe("(+2)");
		expect(outcome.flags.text).toBe("Schade");
		expect(outcome.flags.nodice).toBe(true);
		const other = await rollSpec("1d20 - 25|nodice|text(Dexterity)|signed", high);
		expect(other.text).toBe("-5");
		expect(other.flags.text).toBe("Dexterity");
	});

	it("rounds the average too", async () => {
		const outcome = await rollSpec("1d6|avg|floor", high, { firstRoll: true });
		expect(outcome.text).toBe("3");
		expect(outcome.total).toBe(3.5);
	});

	it("keeps the real total, only the shown text changes", async () => {
		const outcome = await rollSpec("1d6/4|ceil", high);
		expect(outcome.total).toBe(1.5);
	});

	it("leaves 10 / 4 at 2.5 without a flag", async () => {
		expect((await rollSpec("10 / 4", low)).text).toBe("2.5");
		expect(roll("10 / 4").total).toBe(2.5);
		expect(formatResult(2.5)).toBe("2.5");
	});

	it("does not take the number flags as unknown words", () => {
		for (const flag of ["round", "noround", "ceil", "floor", "signed", "paren", "noparen", "ROUND"]) {
			expect(parseSpec(`1d6|${flag}`).args).toEqual([]);
		}
	});
});

describe("number flags next to a table column with the same name (L3)", () => {
	const TABLE = "| Name | Round | Signed |\n|---|---|---|\n| a | r1 | s1 |\n^t\n";
	const withTable: RollContext = { ...low, readNote: async () => ({ path: "T.md", markdown: TABLE }) };

	it("a column named Round still wins and the flag is dropped", async () => {
		const outcome = await rollSpec("[[T^t]]|Round", withTable);
		expect(outcome.text).toBe("r1");
		expect(outcome.flags.round).toBeUndefined();
	});

	it("a column named Signed still wins", async () => {
		const outcome = await rollSpec("[[T^t]]|signed", withTable);
		expect(outcome.text).toBe("s1");
		expect(outcome.flags.signed).toBeUndefined();
	});

	it("a flag word without such a column stays a flag", async () => {
		const outcome = await rollSpec("[[T^t]]|Name|paren", withTable);
		expect(outcome.text).toBe("a");
		expect(outcome.flags.paren).toBe(true);
	});
});
