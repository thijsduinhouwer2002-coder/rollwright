import { describe, expect, it } from "vitest";
import { averageOf, DiceError } from "../src/engine";
import { rollSpec } from "../src/rollers/run";

const noNotes = { sourcePath: "A.md", readNote: async () => null, notesWithTag: async () => [] };

describe("L4: the average is right, or marked as an estimate", () => {
	it.each([
		["(1d4)^2", 7.5],
		["2^1d4", 7.5],
		["12/1d2", 9],
		["(1d2)/(1d2)", 1.125],
	])("%s is an estimate near the true mean", (formula, mean) => {
		const { value, exact } = averageOf(formula);
		expect(exact).toBe(false);
		expect(Math.abs(value - mean)).toBeLessThan(1);
	});

	it.each([
		["1d6/2", 1.75],
		["1d4*1d4", 6.25],
		["2^3 + 1d6", 11.5],
		["1d6/1d1", 3.5],
		["-(1d6)", -3.5],
		["(1d2-1)d6", 1.75],
		["1000d6", 3500],
	])("%s stays exact", (formula, mean) => {
		expect(averageOf(formula)).toEqual({ value: mean, exact: true });
	});

	it("follows names", () => {
		expect(averageOf("a*a", { names: { a: "1d4" } })).toEqual({ value: 6.25, exact: true });
		expect(averageOf("a^2", { names: { a: "1d4" } }).exact).toBe(false);
	});

	it("does not invent a mean for what can never roll", () => {
		expect(() => averageOf("1.5d6")).toThrow(DiceError);
		expect(() => averageOf("(1d2-3)d6")).toThrow(/negative/);
		expect(() => averageOf("1d6/0")).toThrow(/divide by zero/);
	});

	it("shows the mark in a roll with |avg", async () => {
		expect((await rollSpec("(1d4)^2|avg", noNotes, { firstRoll: true })).estimated).toBe(true);
		expect((await rollSpec("1d6/2|avg", noNotes, { firstRoll: true })).estimated).toBe(false);
	});

	it("stays within the budget on large groups", () => {
		const start = Date.now();
		for (const formula of ["1000d6k1", "1000d1000000u", "1000d6!", "(1000d6k1)^2"]) {
			expect(averageOf(formula).exact).toBe(false);
		}
		expect(Date.now() - start).toBeLessThan(1000);
	});
});
