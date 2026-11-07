import { describe, expect, it } from "vitest";
import { averageOf, formatNumber, roll } from "../src/engine";

describe("L6: very large numbers", () => {
	it("shows a large finite number, not Infinity", () => {
		expect(formatNumber(1e308)).toBe("1e+308");
		expect(formatNumber(-1e308)).toBe("-1e+308");
		expect(formatNumber(1.005)).toBe("1");
		expect(formatNumber(2.5)).toBe("2.5");
	});

	it("never spells out Infinity", () => {
		expect(formatNumber(Infinity)).toBe("∞");
		expect(formatNumber(-Infinity)).toBe("-∞");
	});

	it("reports dice whose sum overflows", () => {
		const big = `1${"0".repeat(308)}`;
		expect(() => roll(`1000d[${big},${big},${big}]`)).toThrow(/too large/);
	});

	it("keeps an average finite when the samples would overflow", () => {
		const { value } = averageOf("10^308 + 1d1k1");
		expect(Number.isFinite(value)).toBe(true);
	});
});
