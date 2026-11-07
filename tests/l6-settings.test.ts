import { describe, expect, it } from "vitest";
import { parseWholeNumber } from "../src/ui/settings";

describe("L6: settings fields", () => {
	it.each(["", "   ", "x", "1.5", "-1"])("rejects %j", (value) => {
		expect(parseWholeNumber(value, 0)).toBeNull();
	});

	it("reads whole numbers from the minimum up", () => {
		expect(parseWholeNumber(" 6 ", 1)).toBe(6);
		expect(parseWholeNumber("0", 0)).toBe(0);
		expect(parseWholeNumber("0", 1)).toBeNull();
	});
});
