import { describe, expect, it } from "vitest";
import { DiceError, isNarrative, parseNarrative, roll, rollNarrative, type RandomInt } from "../src/engine";
import { rollSpec, type RollContext } from "../src/rollers/run";

/** Hands out the given results in order, and fails if the formula asks for more. A result is the face number, from 1. */
function fixed(...values: number[]): RandomInt {
	let i = 0;
	return (min, max) => {
		const value = values[i++];
		if (value === undefined) throw new Error("Test ran out of dice");
		if (value < min || value > max) throw new Error(`Test value ${value} is outside ${min}-${max}`);
		return value;
	};
}

const lowest: RandomInt = (min) => min;

function context(random: RandomInt, aliases: Record<string, string> = {}): RollContext {
	return { sourcePath: "A.md", random, aliases, readNote: async () => null, notesWithTag: async () => [] };
}

const kinds = (formula: string) => parseNarrative(formula)?.map((g) => `${g.count}${g.kind}`);

describe("narrative dice: letters", () => {
	it.each([
		["g", "ability"], ["a", "ability"],
		["y", "proficiency"], ["pro", "proficiency"],
		["d", "difficulty"], ["diff", "difficulty"],
		["r", "challenge"], ["c", "challenge"],
		["b", "boost"], ["boo", "boost"],
		["s", "setback"], ["sb", "setback"], ["blk", "setback"],
		["w", "force"], ["f", "force"],
	])("%s is %s, in small letters and capitals", (letter, kind) => {
		expect(kinds(`2${letter}`)).toEqual([`2${kind}`]);
		expect(kinds(`2${letter.toUpperCase()}`)).toEqual([`2${kind}`]);
	});

	it("p is Proficiency when the formula has an A, C or D die", () => {
		expect(kinds("2p1a")).toEqual(["2proficiency", "1ability"]);
		expect(kinds("2P1C")).toEqual(["2proficiency", "1challenge"]);
		expect(kinds("3g2p1d")).toEqual(["3ability", "2proficiency", "1difficulty"]);
		expect(kinds("1p1diff")).toEqual(["1proficiency", "1difficulty"]);
	});

	it("p without A, C or D is ambiguous and gives a clear message", () => {
		expect(() => parseNarrative("3g2p")).toThrow("P is ambiguous here: write Y for Proficiency or D for Difficulty");
		expect(() => parseNarrative("p")).toThrow(DiceError);
		expect(isNarrative("3g2p")).toBe(true);
	});

	it("the example 3g4d of the notation works", () => {
		expect(kinds("3g4d")).toEqual(["3ability", "4difficulty"]);
	});

	it("3g2p is recognised as narrative; with Y or D it rolls", () => {
		expect(isNarrative("3g2p")).toBe(true);
		expect(kinds("3g2y")).toEqual(["3ability", "2proficiency"]);
	});

	it("spaces are left out, letters without a count are one die, runs of letters split", () => {
		expect(kinds("3g 2d")).toEqual(["3ability", "2difficulty"]);
		expect(kinds("ggd")).toEqual(["1ability", "1ability", "1difficulty"]);
		expect(kinds("2boo1blk")).toEqual(["2boost", "1setback"]);
	});

	it("long runs of letters are read quickly, and too many dice give a message", () => {
		expect(isNarrative(`${"sb".repeat(400)}x`)).toBe(false);
		expect(isNarrative(`${"sb".repeat(400)}`)).toBe(true);
		expect(() => rollNarrative("1001g", lowest)).toThrow("At most 1000 dice");
	});

	it("pieces between spaces are read on their own: ordinary dice next to narrative dice are not narrative", async () => {
		for (const formula of ["2d6 2d", "1d20 d", "1d6 2d", "4dF 2d", "2d6s 1g", "1dS 2g", "1D6KH1 2d"]) {
			expect(isNarrative(formula)).toBe(false);
			await expect(rollSpec(formula, context(lowest))).rejects.toThrow(DiceError);
			await expect(rollSpec(formula, context(lowest))).rejects.not.toThrow(/ambiguous|Narrative/);
		}
		expect(kinds("3G 2D")).toEqual(["3ability", "2difficulty"]);
		expect(kinds("2d 3g")).toEqual(["2difficulty", "3ability"]);
	});

	it("anything else is not narrative", () => {
		for (const formula of ["", "3g+2d", "2d6", "x", "3", "str", "dex", "boost", "g2", "1d20kh1"]) {
			expect(isNarrative(formula)).toBe(false);
		}
	});
});

describe("narrative dice: rolling", () => {
	it("Success and Failure cancel, Advantage and Threat cancel", () => {
		// Ability: S S (face 4), S A (face 7). Difficulty: F (face 2), T (face 4).
		const result = rollNarrative("2g2d", fixed(4, 7, 2, 4));
		expect(result.summary).toBe("2 Success");
		expect(result.breakdown).toBe("Ability [S S, S A]; Difficulty [F, T]");
	});

	it("more Failure and Threat show as such", () => {
		// Ability blank; Difficulty F F, T T.
		expect(rollNarrative("1g2d", fixed(1, 3, 7)).summary).toBe("2 Failure, 2 Threat");
	});

	it("everything cancelled shows No result", () => {
		expect(rollNarrative("1g1d", fixed(2, 2)).summary).toBe("No result");
		expect(rollNarrative("1b1s", fixed(1, 1)).breakdown).toBe("Boost [blank]; Setback [blank]");
	});

	it("Triumph counts as a Success, Despair as a Failure, both stay shown", () => {
		expect(rollNarrative("1y", fixed(12)).summary).toBe("1 Success, 1 Triumph");
		expect(rollNarrative("1c", fixed(12)).summary).toBe("1 Failure, 1 Despair");
		expect(rollNarrative("1y1c", fixed(12, 12)).summary).toBe("1 Triumph, 1 Despair");
		// Triumph against a Failure: no net Success, the Triumph stays.
		expect(rollNarrative("1y1d", fixed(12, 2)).summary).toBe("1 Triumph");
	});

	it("Force gives light and dark, which do not cancel", () => {
		const result = rollNarrative("3w", fixed(1, 7, 10));
		expect(result.summary).toBe("2 Light, 3 Dark");
		expect(result.breakdown).toBe("Force [D, D D, L L]");
	});

	it("each die has the number of faces of the game", () => {
		const sides: Record<string, number> = { b: 6, s: 6, g: 8, d: 8, y: 12, c: 12, w: 12 };
		for (const [letter, count] of Object.entries(sides)) {
			const seen: number[] = [];
			rollNarrative(`1${letter}`, (min, max) => {
				seen.push(min, max);
				return min;
			});
			expect(seen).toEqual([1, count]);
		}
	});

	it("a narrative formula through dice: shows the text, has no number, and |avg gives a message", async () => {
		const outcome = await rollSpec("3g4d", context(fixed(2, 2, 2, 1, 1, 1, 4)));
		expect(outcome.kind).toBe("dice");
		expect(outcome.total).toBeUndefined();
		expect(outcome.text).toBe("3 Success, 1 Threat");
		expect(outcome.details).toBe("Ability [S, S, S]; Difficulty [blank, blank, blank, T]");
		await expect(rollSpec("3g4d|avg", context(lowest), { firstRoll: true })).rejects.toThrow("Narrative dice have no average");
		await expect(rollSpec("3g4d", context(lowest), { average: true })).rejects.toThrow("Narrative dice have no average");
		await expect(rollSpec("3g2p", context(lowest))).rejects.toThrow("P is ambiguous");
	});

	it("a broken formula that is not narrative keeps its own message", async () => {
		await expect(rollSpec("3g+2d", context(lowest))).rejects.toThrow(/Unknown name|Unexpected/);
		await expect(rollSpec("boost", context(lowest))).rejects.toThrow('Unknown name "boost"');
	});
});

describe("ordinary notation always wins (condition 9)", () => {
	it.each(["2d", "d", "3d", "1dS", "4dF", "2D6", "1d20kh1", "1D6KH1", "2d6s", "d%", "ds", "1ds", "4df", "2d6 + 2", "1DS"])("%s rolls as before", async (formula) => {
		const plain = roll(formula, { random: lowest });
		const outcome = await rollSpec(formula, context(lowest));
		expect(outcome.total).toBe(plain.total);
		expect(outcome.details).toBe(plain.breakdown);
	});

	it("saved formulas and note fields named like letters stay what they are", async () => {
		const names = { str: "3", dex: "1d4", gp: "15", boost: "2", g: "7", dd: "5", sb: "1d6 + 1" };
		for (const [name, formula] of Object.entries(names)) {
			const plain = roll(formula, { random: lowest, names });
			const outcome = await rollSpec(name, context(lowest, names));
			expect(outcome.total).toBe(plain.total);
			expect(typeof outcome.total).toBe("number");
		}
		const sum = await rollSpec("1d20 + str + gp + boost", context(lowest, names));
		expect(sum.total).toBe(1 + 3 + 15 + 2);
	});
});
