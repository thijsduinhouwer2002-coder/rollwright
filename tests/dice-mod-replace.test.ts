import { describe, expect, it } from "vitest";
import { findInlineDice } from "../src/rollers/inline";
import { replaceCodeInLine, replaceCodeInNote, replacementInLine } from "../src/rollers/modify";

describe("replacing the code", () => {
	const line = "Hit `dice-mod: 1d6` and `dice-mod: 1d6` and `dice: 2d6`";

	it("replaces the right one of two codes on a line", () => {
		expect(replaceCodeInLine(line, 1, "1d6", "1d6 -> [4] -> 4")).toBe("Hit `dice-mod: 1d6` and 1d6 -> [4] -> 4 and `dice: 2d6`");
		expect(replaceCodeInLine(line, 0, "1d6", "X")).toBe("Hit X and `dice-mod: 1d6` and `dice: 2d6`");
	});

	it("refuses when the code changed, is gone or is not dice-mod", () => {
		expect(replaceCodeInLine(line, 0, "1d8", "X")).toBeNull();
		expect(replaceCodeInLine(line, 2, "2d6", "X")).toBeNull();
		expect(replaceCodeInLine(line, 3, "1d6", "X")).toBeNull();
		expect(replaceCodeInLine("Hit `dice: 1d6`", 0, "1d6", "X")).toBeNull();
	});

	it("replaces in a note on the right line and keeps line endings", () => {
		const note = "a\r\n`dice-mod: 1d6`\r\nb `dice-mod: 1d6`\r\n";
		expect(replaceCodeInNote(note, 2, 0, "1d6", "X")).toBe("a\r\n`dice-mod: 1d6`\r\nb X\r\n");
		expect(replaceCodeInNote(note, 0, 0, "1d6", "X")).toBeNull();
		expect(replaceCodeInNote(note, 9, 0, "1d6", "X")).toBeNull();
	});

	it("keeps a table row whole", () => {
		expect(replaceCodeInLine("| a | `dice-mod: [[T^t]]` |", 0, "[[T^t]]", "x | y")).toBe("| a | x \\| y |");
	});

	it("gives the change for the editor by the number of the code on the line", () => {
		expect(replacementInLine("| a | `dice-mod: 1d6` |", 0, "1d6", "p|q")).toEqual({ from: 6, to: 21, insert: "p\\|q" });
		expect(replacementInLine("| a | `dice-mod: 1d6` |", 1, "1d6", "x")).toBeNull();
	});
});

describe("repairs after the review of dice-mod: the text fits its place", () => {
	it("1: escapes | in a table row inside a quote, and on a row without a leading |", () => {
		expect(replaceCodeInLine("> | a | `dice-mod: [[T^t]]` |", 0, "[[T^t]]", "x | y")).toBe("> | a | x \\| y |");
		expect(replaceCodeInLine("a | `dice-mod: [[T^t]]`", 0, "[[T^t]]", "x | y")).toBe("a | x \\| y");
		expect(replaceCodeInLine("a `dice-mod: [[T^t]]`", 0, "[[T^t]]", "x | y")).toBe("a x | y");
		expect(replaceCodeInLine("a \\| b `dice-mod: [[T^t]]`", 0, "[[T^t]]", "x | y")).toBe("a \\| b x | y");
		expect(replaceCodeInLine("| a | `dice-mod: [[T^t]]` |", 0, "[[T^t]]", "x \\| y")).toBe("| a | x \\| y |");
	});

	it("2: a backtick in the replacement never pairs with the rest of the line", () => {
		const line = "`dice-mod: [[T^t]]` dice: 1d4 `x`";
		const out = replaceCodeInLine(line, 0, "[[T^t]]", "Sword `") ?? "";
		expect(out).toBe("Sword \\` dice: 1d4 `x`");
		expect(findInlineDice(out)).toEqual([]);
		expect(findInlineDice("\\`dice: 1d6`")).toEqual([]);
		expect(findInlineDice("\\\\`dice: 2`").map((f) => f.formula)).toEqual(["2"]);
		expect(replaceCodeInLine("a `dice-mod: 1d6`", 0, "1d6", "p \\` q")).toBe("a p \\` q");
		expect(replaceCodeInLine("a `dice-mod: 1d6`", 0, "1d6", "p \\\\` q")).toBe("a p \\\\\\` q");
	});

	it.each([
		["# x", "\\# x"],
		["---", "\\---"],
		["===", "\\==="],
		["> x", "\\> x"],
		["- x", "\\- x"],
		["* x", "\\* x"],
		["+ x", "\\+ x"],
		["1. x", "1\\. x"],
		["2) x", "2\\) x"],
		["~~~", "\\~~~"],
		["<div>", "\\<div>"],
		["[a]: b", "\\[a]: b"],
	])("5a: %s at the start of a line is made plain", (text, safe) => {
		expect(replaceCodeInLine("`dice-mod: [[T^t]]`", 0, "[[T^t]]", text)).toBe(safe);
		expect(replaceCodeInLine("> - `dice-mod: [[T^t]]`", 0, "[[T^t]]", text)).toBe(`> - ${safe}`);
		expect(replaceCodeInLine("a `dice-mod: [[T^t]]`", 0, "[[T^t]]", text)).toBe(`a ${text}`);
	});

	it("5a: a dice result at the start of a line stays as it is", () => {
		expect(replaceCodeInLine("`dice-mod: 1d6`", 0, "1d6", "[4] -> 4")).toBe("[4] -> 4");
		expect(replaceCodeInLine("`dice-mod: 1d6`", 0, "1d6", "1d6 -> [4] -> 4")).toBe("1d6 -> [4] -> 4");
	});

});
