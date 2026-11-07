import { describe, expect, it } from "vitest";
import { extractSavedFormulas, mergeFormulas } from "../src/import/dice-roller-data";
import { availableSkins, resolveSkin, SKINS } from "../src/pro/skins";

describe("skins", () => {
	it("has one free and two paid skins", () => {
		expect(SKINS.filter((s) => !s.paid)).toHaveLength(1);
		expect(SKINS.filter((s) => s.paid)).toHaveLength(2);
	});

	it("unlocks paid skins with a license only", () => {
		expect(availableSkins(false).map((s) => s.id)).toEqual(["classic"]);
		expect(availableSkins(true)).toHaveLength(3);
	});

	it("falls back to the free skin", () => {
		expect(resolveSkin("arcane", false).id).toBe("classic");
		expect(resolveSkin("arcane", true).id).toBe("arcane");
		expect(resolveSkin("gone", true).id).toBe("classic");
	});
});

describe("import of saved formulas", () => {
	it("reads a list of objects", () => {
		const text = JSON.stringify({ formulas: [{ alias: "atk", formula: "1d20+5" }, { name: "dmg", dice: "2d6" }], other: 1 });
		expect(extractSavedFormulas(text)).toEqual([{ name: "atk", formula: "1d20+5" }, { name: "dmg", formula: "2d6" }]);
	});

	it("reads a map", () => {
		expect(extractSavedFormulas(JSON.stringify({ customFormulas: { atk: "1d20", bad: 3 } }))).toEqual([{ name: "atk", formula: "1d20" }]);
	});

	it("skips what it does not understand and survives broken files", () => {
		expect(extractSavedFormulas("{not json")).toEqual([]);
		expect(extractSavedFormulas("null")).toEqual([]);
		expect(extractSavedFormulas(JSON.stringify({ formulas: [1, { alias: "no formula" }] }))).toEqual([]);
		expect(extractSavedFormulas(JSON.stringify({ settings: { atk: "1d20" } }))).toEqual([]);
	});

	it("never overwrites an existing name", () => {
		const { merged, added } = mergeFormulas([{ name: "atk", formula: "mine" }], [{ name: "atk", formula: "theirs" }, { name: "new", formula: "1d4" }]);
		expect(added).toBe(1);
		expect(merged).toEqual([{ name: "atk", formula: "mine" }, { name: "new", formula: "1d4" }]);
	});
});
