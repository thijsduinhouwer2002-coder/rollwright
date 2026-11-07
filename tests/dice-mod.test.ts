import { describe, expect, it } from "vitest";
import { defuseRolls } from "../src/rollers/defuse";
import { findInlineDice, readDiceCode } from "../src/rollers/inline";
import { modifiedText } from "../src/rollers/modify";
import { rollSpec, type RollOutcome } from "../src/rollers/run";
import { lookupFormula, parseTable } from "../src/rollers/table";
import { context, rolled } from "./dice-mod-helpers";

/** Every code that would roll when the text is rendered as markdown. */
function rollable(text: string): unknown[] {
	return text.split("\n").flatMap((line) => findInlineDice(line));
}

describe("dice-mod: is read in the note itself", () => {
	it("readDiceCode gives modify, in any case, and never keep", () => {
		expect(readDiceCode("dice-mod: 3d100 + 12")).toEqual({ formula: "3d100 + 12", keep: false, modify: true });
		expect(readDiceCode("DICE-MOD:1d6")).toEqual({ formula: "1d6", keep: false, modify: true });
		expect(readDiceCode("dice: 1d6")?.modify).toBeUndefined();
		expect(readDiceCode("dice-mod 1d6")).toBeNull();
		expect(readDiceCode("dice-mo: 1d6")).toBeNull();
	});

	it("is still refused in nested cells and as a lookup table header", async () => {
		expect(lookupFormula(parseTable("| `dice-mod: 1d20` | x |\n|---|---|"))).toBeNull();
		const notes = { M: "| What |\n|---|\n| `dice-mod: 6` and dice-mod: 7 |\n^t\n", W: "| Whole |\n|---|\n| dice-mod: 5 |\n^t\n" };
		expect((await rolled("[[M^t]]", [], notes)).text).toBe("`dice-mod: 6` and dice-mod: 7");
		expect((await rolled("[[W^t]]", [], notes)).text).toBe("dice-mod: 5");
	});
});

describe("modifiedText", () => {
	it("gives exactly the form of the design", async () => {
		const outcome = await rolled("3d100 + 12", [75, 20, 75]);
		expect(modifiedText(outcome, true)).toBe("3d100 + 12 -> [75, 20, 75] + 12 -> 182");
		expect(modifiedText(outcome, false)).toBe("[75, 20, 75] + 12 -> 182");
	});

	it("shows the total with the number flags", async () => {
		expect(modifiedText(await rolled("1d6 - 5|signed", [2]), true)).toBe("1d6 - 5 -> [2] - 5 -> -3");
		expect(modifiedText(await rolled("1d6|signed|paren", [4]), true)).toBe("1d6 -> [4] -> (+4)");
		expect(modifiedText(await rolled("1d6 / 4|ceil", [5]), false)).toBe("[5] / 4 -> 2");
	});

	it("leaves out the label of |text and the other display flags", async () => {
		expect(modifiedText(await rolled("1d6|text(Damage)|form|nodice", [3]), true)).toBe("1d6 -> [3] -> 3");
	});

	it("leaves out the breakdown of an average, with ~ for an estimate", async () => {
		const exact = await rollSpec("2d6|avg", context(), { firstRoll: true });
		expect(modifiedText(exact, true)).toBe("2d6 -> 7");
		expect(modifiedText(exact, false)).toBe("7");
		const estimate: RollOutcome = { ...exact, total: 3.5, estimated: true };
		expect(modifiedText(estimate, false)).toBe("~3.5");
	});

	it("gives only the result text for a table, on one line", async () => {
		const notes = { T: "| Item |\n|---|\n| Sword `dice: 1d6` |\n^t\n", S: "# One\n\nFirst `dice: 2d6`\nsecond\n\n![[Other]]\n" };
		const table = await rolled("[[T^t]]", [], notes);
		const text = modifiedText(table, true);
		expect(text).not.toContain("->");
		expect(text).toMatch(/^Sword 1$/);
		const section: RollOutcome = { kind: "section", text: notes.S, details: "", formula: "[[S]]", flags: table.flags };
		const written = modifiedText(section, true);
		expect(written).not.toContain("\n");
		expect(written).toContain("[[Other]]");
		expect(rollable(written)).toEqual([]);
	});

	it("never writes a code that rolls, for any prefix in a result", () => {
		for (const prefix of ["dice", "dice+", "dice-", "dice-mod", "DICE-MOD"]) {
			const outcome: RollOutcome = { kind: "list", text: `a \`${prefix}: 1d6\` b\nc`, details: "", formula: "[[L^l]]", flags: { nodice: false, form: false, avg: false, none: false } };
			expect(rollable(modifiedText(outcome, true))).toEqual([]);
		}
	});

	it("the text of a dice result holds no rollable code itself", async () => {
		const text = modifiedText(await rolled("1d6 + 2", [3]), true);
		expect(rollable(text)).toEqual([]);
		expect(rollable(`\`${text}\``)).toEqual([]);
	});
});

describe("defuse: a result with dice-mod: in it does not roll again (L9)", () => {
	it.each(["`dice-mod: 1d6`", "`` dice-mod: 1d6 ``", "<code>dice-mod: 1d6</code>", "it`s\n\n`dice-mod: 1d6`", "> `\n> dice-mod: 1d6`", "`dice - mod: 1d6`"])("%s", (text) => {
		const out = defuseRolls(text);
		expect(rollable(out)).toEqual([]);
		expect(readDiceCode(out.replace(/[`<>/]|code/g, "").trim())).toBeNull();
	});
});
