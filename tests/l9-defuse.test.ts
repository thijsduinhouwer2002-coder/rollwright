import { describe, expect, it } from "vitest";
import { defuseRolls } from "../src/rollers/defuse";

const SAFE = "dice​: 1d6";

describe("L9: a stray backtick does not hide real code", () => {
	it.each([
		["an earlier block", "it`s\n\n`dice: 1d6`"],
		["an earlier list item", "- it`s\n- `dice: 1d6`"],
		["an earlier table row", "| it`s |\n| `dice: 1d6` |"],
		["an earlier heading", "# it`s\n`dice: 1d6`"],
		["a longer run", "``x\n\n`dice: 1d6`"],
		["a double-backtick code", "it`s\n\n`` dice: 1d6 ``"],
	])("defuses code after a stray backtick in %s", (_name, text) => {
		expect(defuseRolls(text)).toContain(SAFE);
	});

	it("still defuses an HTML code element after a stray backtick", () => {
		expect(defuseRolls("it`s\n\n<code>dice: 1d6</code>")).toContain(SAFE);
	});

	it("leaves plain text between two stray backticks alone", () => {
		const text = "a ` b\n\nDice: three of them\n\nc ` d";
		expect(defuseRolls(text)).toBe(text);
	});

	it("leaves an escaped backtick alone", () => {
		const text = "\\`dice: 1d6\\`";
		expect(defuseRolls(text)).toBe(text);
	});

	it("does not take an escaped backslash for an escaped backtick", () => {
		expect(defuseRolls("\\\\`dice: 1d6`")).toContain(SAFE);
	});
});

describe("L9: code over two lines in a quote or callout", () => {
	it.each([
		["a quote", "> `\n> dice: 1d6`"],
		["a quote without spaces", ">`\n>dice: 1d6`"],
		["a callout", "> [!note]\n> roll `\n> dice: 1d6`"],
		["a nested quote", "> > `\n> > dice: 1d6`"],
		["a quote in a list", "- > `\n  > dice: 1d6`"],
	])("defuses code in %s", (_name, text) => {
		expect(defuseRolls(text)).toContain("dice​:");
	});
});
