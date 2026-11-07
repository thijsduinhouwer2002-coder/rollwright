import { describe, expect, it } from "vitest";
import { DiceError, roll } from "../src/engine";
import { rollSpec, type RollContext } from "../src/rollers/run";

/** Design point 2 (Daan): a message says what is wrong and what to type, with an example. */
const NOTES: Record<string, string> = {
	Tables: "| Name | Value |\n| --- | --- |\n| Ann | 1 |\n^people\n",
	E: "",
};

const context: RollContext = {
	sourcePath: "Here.md",
	random: (min) => min,
	readNote: async (link) => (NOTES[link] === undefined ? null : { path: `${link}.md`, markdown: NOTES[link] as string }),
	notesWithTag: async () => [],
};

function messageOf(formula: string): string {
	try {
		roll(formula);
	} catch (error) {
		expect(error).toBeInstanceOf(DiceError);
		return (error as DiceError).message;
	}
	throw new Error(`${formula} did not fail`);
}

async function specMessage(raw: string): Promise<string> {
	try {
		await rollSpec(raw, context);
	} catch (error) {
		expect(error).toBeInstanceOf(DiceError);
		return (error as DiceError).message;
	}
	throw new Error(`${raw} did not fail`);
}

/** A fix is a sentence with Add, Write, Check, Use, Remove, Put or Leave, and an example after "like" or "add". */
function expectFix(message: string, example: string): void {
	expect(message).toMatch(/\b(Add|Write|Check|Use|Remove|Put|Leave)\b/);
	expect(message).toMatch(/\b(like|add)\b/);
	expect(message).toContain(example);
	expect(message).not.toMatch(/[–—`]/);
}

describe("error messages name a fix", () => {
	it("a formula that ends too early shows where it stops", () => {
		const message = messageOf("2d6 +");
		expect(message).toBe("The formula ends too early: it ends with +. Add a number or a die after it, like 2d6 + 1.");
		expectFix(message, "2d6 + 1");
	});

	it("an empty formula asks for a formula", () => {
		const message = messageOf("");
		expect(message).toMatch(/^The formula is empty/);
		expectFix(message, "2d6 + 1");
	});

	it("a missing closing bracket", () => {
		const message = messageOf("(2d6 + 1");
		expect(message).toMatch(/^A closing bracket is missing/);
		expectFix(message, "(2d6 + 1) * 2");
	});

	it("an unexpected character", () => {
		const message = messageOf("2d6 & 1");
		expect(message).toMatch(/^Unexpected character "&" at position 5/);
		expectFix(message, "2d6 + 1");
	});

	it("an unexpected closing bracket", () => {
		const message = messageOf("2d6)");
		expect(message).toMatch(/^Unexpected "\)" at position 4/);
		expectFix(message, "(2d6 + 1) * 2");
	});

	it("an unknown modifier", () => {
		const message = messageOf("4d6x");
		expect(message).toMatch(/^Unknown modifier "x"/);
		expectFix(message, "4d6kh3");
	});

	it("dividing by zero", () => {
		const message = messageOf("10 / 0");
		expect(message).toMatch(/^Cannot divide by zero/);
		expectFix(message, "10 / 2");
	});

	it("an unknown name", () => {
		const message = messageOf("1d20 + dex");
		expect(message).toMatch(/^Unknown name "dex"/);
		expectFix(message, "dex: 2");
	});

	it("a number missing after a comparison", () => {
		const message = messageOf("5d10>=");
		expect(message).toMatch(/^A number is missing after ">="/);
		expectFix(message, "5d10>=8");
	});

	it("a die with zero sides", () => {
		const message = messageOf("1d0");
		expect(message).toMatch(/^A die needs at least 1 side, not 0/);
		expectFix(message, "1d6");
	});

	it("an unknown flag", async () => {
		const message = await specMessage("1d20|avgg");
		expect(message).toMatch(/^Unknown flag "avgg"/);
		expectFix(message, "1d20|avg");
	});

	it("a note that is not found", async () => {
		const message = await specMessage("[[Gone^t]]");
		expect(message).toMatch(/^Note "Gone" was not found/);
		expectFix(message, "[[Folder/Note]]");
	});

	it("a block that is not found", async () => {
		const message = await specMessage("[[Tables^nope]]");
		expect(message).toMatch(/^Block \^nope was not found in "Tables"/);
		expectFix(message, "^nope");
	});

	it("a table without the column", async () => {
		const message = await specMessage("[[Tables^people]]|Age");
		expect(message).toMatch(/^The table has no column "Age". It has: Name, Value/);
		expectFix(message, "|Name");
	});

	it("a number missing after a condition of r, ! or counting has an example of that kind", () => {
		expect(messageOf("1d6r<")).toBe('A number is missing after "<". Add one, like 1d6r<2.');
		expect(messageOf("1d6!>=")).toBe('A number is missing after ">=". Add one, like 1d6!>=5.');
		expect(messageOf("5d10>=")).toBe('A number is missing after ">=". Add one, like 5d10>=8.');
	});

	it("an unexpected token only gets the + - * / advice after a value", () => {
		expect(messageOf("2d6 3")).toMatch(/^Unexpected "3" at position 5\. Remove it or put \+ - \* \/ before it, like 2d6 \+ 3\.$/);
		expect(messageOf("2d6 + *")).toBe('Unexpected "*" at position 7. Remove it, like 2d6 + 3.');
		expect(messageOf(">=5")).toBe('Unexpected ">=" at position 1. Remove it, like 2d6 + 3.');
	});

	it("an empty note without block types says there is no text, without advice about |", async () => {
		const message = await specMessage("[[E]]");
		expect(message).toBe('"E" has no text to pick from. Add some text to it, like - Goblin.');
		expect(await specMessage("[[E]]|paragraph")).toMatch(/has no matching blocks\. Check the block types after \|/);
	});
});
