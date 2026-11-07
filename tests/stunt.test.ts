import { describe, expect, it } from "vitest";
import { averageOf, DiceError, formatResult, roll, type RandomInt } from "../src/engine";
import { modifiedText } from "../src/rollers/modify";
import { rollSpec, type RollContext } from "../src/rollers/run";

/** Hands out the given results in order, and fails if the formula asks for more. */
function fixed(...values: number[]): RandomInt {
	let i = 0;
	return (min, max) => {
		const value = values[i++];
		if (value === undefined) throw new Error("Test ran out of dice");
		if (value < min || value > max) throw new Error(`Test value ${value} is outside ${min}-${max}`);
		return value;
	};
}

const rolled = (formula: string, ...values: number[]) => roll(formula, { random: fixed(...values) });

function context(values: number[], notes: Record<string, string> = {}): RollContext {
	return {
		sourcePath: "A.md",
		random: fixed(...values),
		readNote: async (link) => (notes[link] === undefined ? null : { path: `${link}.md`, markdown: notes[link] as string }),
		notesWithTag: async () => [],
	};
}

describe("1dS, the stunt die", () => {
	it("without a double: the sum, no stunt points", () => {
		const result = rolled("1dS", 3, 5, 4);
		expect(result.total).toBe(12);
		expect(result.breakdown).toBe("[3, 5, S:4]");
	});

	it("a double with the stunt die in it gives the stunt die as points", () => {
		const result = rolled("1dS", 3, 5, 3);
		expect(result.total).toBe(11);
		expect(result.breakdown).toBe("[3, 5, S:3] (3 stunt points)");
	});

	it("a double without the stunt die still gives the stunt die as points", () => {
		const result = rolled("1dS", 4, 4, 2);
		expect(result.total).toBe(10);
		expect(result.breakdown).toBe("[4, 4, S:2] (2 stunt points)");
	});

	it("three the same is a double too", () => {
		const result = rolled("1dS", 6, 6, 6);
		expect(result.total).toBe(18);
		expect(result.breakdown).toBe("[6, 6, S:6] (6 stunt points)");
	});

	it("one stunt point is singular", () => {
		expect(rolled("1dS", 1, 2, 1).breakdown).toBe("[1, 2, S:1] (1 stunt point)");
	});

	it("rolls three six-sided dice, the third is the stunt die", () => {
		const asked: string[] = [];
		roll("1dS", { random: (min, max) => (asked.push(`${min}-${max}`), 2) });
		expect(asked).toEqual(["1-6", "1-6", "1-6"]);
	});

	it("dS without a count is 1dS, also with another default count", () => {
		expect(roll("dS", { random: fixed(1, 2, 3), defaultCount: 4 }).total).toBe(6);
	});

	it("works in arithmetic: 1dS + 2", () => {
		const result = rolled("1dS + 2", 4, 4, 2);
		expect(result.total).toBe(12);
		expect(result.breakdown).toBe("[4, 4, S:2] (2 stunt points) + 2");
	});

	it("can be the count of other dice", () => {
		expect(rolled("(1dS)d1", 1, 1, 1, 1, 1, 1).total).toBe(3);
	});

	it.each(["2dS", "0dS", "3dS + 1", "(1d4)dS", "1dSkh1", "1dSs"])("refuses %s with a clear message", (formula) => {
		expect(() => roll(formula, { random: fixed(1, 1, 1, 1, 1, 1) })).toThrow(DiceError);
	});

	it("says how to write it", () => {
		expect(() => rolled("2dS")).toThrow("Only one stunt die can be rolled: write 1dS, not 2dS");
	});

	it("has an exact average of 10.5", () => {
		expect(averageOf("1dS")).toEqual({ value: 10.5, exact: true });
		expect(averageOf("1dS + 2")).toEqual({ value: 12.5, exact: true });
	});
});

describe("1dS in the rollers", () => {
	it("|avg shows 10.5 as exact", async () => {
		const outcome = await rollSpec("1dS|avg", context([]), { firstRoll: true });
		expect(outcome.text).toBe("10.5");
		expect(outcome.estimated).toBe(false);
	});

	it("|form, |nodice and the number flags work as for other dice", async () => {
		const outcome = await rollSpec("1dS|form|nodice|signed", context([4, 4, 2]));
		expect(outcome.total).toBe(10);
		expect(outcome.text).toBe("+10");
		expect(outcome.details).toBe("[4, 4, S:2] (2 stunt points)");
		expect(outcome.kind === "dice" && outcome.flags.form && outcome.flags.nodice).toBe(true);
	});

	it("dice-mod writes the stunt points along", async () => {
		const outcome = await rollSpec("1dS", context([3, 5, 3]));
		expect(modifiedText(outcome, true)).toBe("1dS -> [3, 5, S:3] (3 stunt points) -> 11");
	});

	it("works as the head of a lookup table", async () => {
		const notes = { Tables: "| dice: 1dS | Result |\n|---|---|\n| 3-10 | low |\n| 11-18 | high |\n\n^look\n" };
		expect((await rollSpec("[[Tables^look]]", context([4, 4, 2], notes))).text).toBe("low");
		expect((await rollSpec("[[Tables^look]]", context([6, 5, 1], notes))).text).toBe("high");
	});
});

describe("what does not change", () => {
	it("1ds with a small s still sorts a hundred-sided die", () => {
		expect(rolled("1ds", 40).breakdown).toBe("[40]");
		expect(rolled("3ds", 30, 10, 20).breakdown).toBe("[10, 20, 30]");
	});

	it("2d6s sorts, 2d6", () => {
		expect(rolled("2d6s", 5, 2).breakdown).toBe("[2, 5]");
		expect(rolled("3d6sd", 1, 3, 2).breakdown).toBe("[3, 2, 1]");
		expect(rolled("2d6", 5, 2).total).toBe(7);
		expect(rolled("2d6", 5, 2).breakdown).toBe("[5, 2]");
	});

	it("1d20kh1 and 4dF", () => {
		expect(rolled("1d20kh1", 17).total).toBe(17);
		expect(rolled("4dF", 1, -1, 0, 1).breakdown).toBe("[+, -, 0, +]");
		expect(rolled("4dF", 1, -1, 0, 1).total).toBe(1);
	});

	it("2d6|avg stays exact 7", () => {
		expect(averageOf("2d6")).toEqual({ value: 7, exact: true });
	});
});

describe("ceil and floor after a float error", () => {
	it("(0.1+0.2)*10|ceil shows 3", async () => {
		expect((await rollSpec("(0.1+0.2)*10|ceil", context([]))).text).toBe("3");
		expect(formatResult((0.1 + 0.2) * 10, { round: "ceil" })).toBe("3");
	});

	it("floor of a number just under a whole one", () => {
		expect(formatResult(0.1 * 3 * 10 - 0.0000000000000004, { round: "floor" })).toBe("3");
		expect(formatResult(-((0.1 + 0.2) * 10), { round: "floor" })).toBe("-3");
	});

	it("a real fraction still rounds", () => {
		expect(formatResult(3.01, { round: "ceil" })).toBe("4");
		expect(formatResult(2.99, { round: "floor" })).toBe("2");
	});
});
