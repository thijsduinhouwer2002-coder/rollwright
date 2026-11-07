import { describe, expect, it } from "vitest";
import { roll } from "../src/engine";

describe("L6: capitals in dice", () => {
	const lowest = (min: number) => min;

	it.each([
		["1D6KH1", 1],
		["2D6KL1", 1],
		["3D6DH1", 2],
		["1D6 KH1", 1],
		["(1+1)D6KH1", 1],
		["2D6R1", 2],
		["1DKH1", 1],
		["2D6S", 2],
		["2D6>=2D1", 0],
	])("rolls %s", (formula, total) => {
		expect(roll(formula, { random: lowest, defaultSides: 6 }).total).toBe(total);
	});

	it("takes I as the highest repeat", () => {
		expect(roll("1D1!I", { random: lowest }).total).toBe(101);
	});

	it("keeps saved formulas with capitals and digits", () => {
		expect(roll("K2 + 1", { names: { K2: "3" } }).total).toBe(4);
		expect(roll("KH1 * R2", { names: { KH1: "3", R2: "2" } }).total).toBe(6);
	});
});
