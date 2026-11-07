import { describe, expect, it } from "vitest";
import { defuseRolls } from "../src/rollers/defuse";
import { findInlineDice, formulaFromCode } from "../src/rollers/inline";

describe("L9: dice+:, dice-: and dice-mod: in a result do not roll again", () => {
	it.each([
		["`dice+: 1d6`", "dice+​: 1d6"],
		["`dice-: 1d6`", "dice-​: 1d6"],
		["`dice-mod: 1d6`", "dice-mod​: 1d6"],
		["`DICE+: 1d6`", "DICE+​: 1d6"],
		["`` dice-mod: 1d6 ``", "dice-mod​: 1d6"],
		["<code>dice+: 1d6</code>", "dice+​: 1d6"],
		["<code>dice-mod: 1d6</code>", "dice-mod​: 1d6"],
		["it`s\n\n`dice-: 1d6`", "dice-​: 1d6"],
		["> `\n> dice+: 1d6`", "dice+​: 1d6"],
	])("defuses %s", (text, safe) => {
		const out = defuseRolls(text);
		expect(out).toContain(safe);
		expect(findInlineDice(out)).toEqual([]);
	});

	it("a defused code is no dice code any more", () => {
		for (const prefix of ["dice", "dice+", "dice-", "dice-mod"]) {
			const out = defuseRolls(`\`${prefix}: 1d6\``).replace(/`/g, "");
			expect(formulaFromCode(out)).toBeNull();
		}
	});

	it("leaves plain text with these words alone", () => {
		const text = "dice+: plain and dice-mod: plain";
		expect(defuseRolls(text)).toBe(text);
	});
});
