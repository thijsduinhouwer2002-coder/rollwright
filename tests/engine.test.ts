import { describe, expect, it } from "vitest";
import { averageOf, DiceError, roll, type RandomInt } from "../src/engine";

/** Hands out the given results in order, and fails if the formula asks for more. */
function fixed(...values: number[]): RandomInt {
	let i = 0;
	return (min, max) => {
		const value = values[i++];
		if (value === undefined) throw new Error("Test ran out of dice");
		if (value < min || value > max) throw new Error(`Test value ${value} is outside ${min}-${max}`);
		return value;
	};
}

const total = (formula: string, ...values: number[]) => roll(formula, { random: fixed(...values) }).total;
const shown = (formula: string, ...values: number[]) => roll(formula, { random: fixed(...values) }).breakdown;

describe("arithmetic", () => {
	it.each([
		["1 + 2 * 3", 7],
		["(1 + 2) * 3", 9],
		["2 ^ 3 ^ 2", 512],
		["-2 ^ 2", -4],
		["10 / 4", 2.5],
		["10 - 2 - 3", 5],
		["2 * -3", -6],
		["{1 + 1}", 2],
	])("%s = %d", (formula, expected) => {
		expect(roll(formula).total).toBe(expected);
	});
});

describe("basic dice", () => {
	it("rolls XdY", () => {
		expect(total("3d6", 1, 2, 3)).toBe(6);
		expect(shown("3d100 + 12", 75, 20, 75)).toBe("[75, 20, 75] + 12");
		expect(total("3d100 + 12", 75, 20, 75)).toBe(182);
	});

	it("ignores spaces", () => {
		expect(total(" 2 d 6 + 1 ", 3, 4)).toBe(8);
	});

	it("uses the defaults when parts are left out", () => {
		expect(total("d", 100)).toBe(100);
		expect(total("d6", 6)).toBe(6);
		expect(total("2d", 100, 1)).toBe(101);
		const options = { defaultSides: 20, defaultCount: 2, random: fixed(20, 1) };
		expect(roll("d", options).total).toBe(21);
	});

	it("handles Xd[a,b] as an inclusive range", () => {
		const asked: number[][] = [];
		const random: RandomInt = (min, max) => {
			asked.push([min, max]);
			return min;
		};
		expect(roll("2d[3, 5]", { random }).total).toBe(6);
		expect(asked[0]).toEqual([3, 5]);
		roll("1d[5,3]", { random });
		expect(asked[2]).toEqual([3, 5]);
		roll("1d[3-5]", { random });
		expect(asked[3]).toEqual([3, 5]);
		roll("1d[-2,2]", { random });
		expect(asked[4]).toEqual([-2, 2]);
	});

	it("treats three or more numbers as the faces", () => {
		const random: RandomInt = (min, max) => max;
		expect(roll("1d[1,3,5]", { random }).total).toBe(5);
	});

	it("rolls d% as a hundred-sided die", () => {
		expect(total("d%", 100)).toBe(100);
		expect(total("2d%", 50, 25)).toBe(75);
	});

	it("rolls XdY% digit by digit", () => {
		expect(total("1d66%", 6, 3)).toBe(63);
		expect(shown("1d66%", 6, 3)).toBe("[6,3]");
		expect(total("2d46%", 4, 6, 1, 1)).toBe(46 + 11);
	});

	it("rolls Fudge dice", () => {
		expect(total("4dF", 1, -1, 0, 1)).toBe(1);
		expect(shown("2dF", 1, -1)).toBe("[+, -]");
	});

	it("rolls the count first for (1d4)d6", () => {
		expect(total("(1d4)d6", 2, 5, 6)).toBe(11);
		expect(total("(1+1)d6", 2, 5)).toBe(7);
	});

	it("accepts 0d6", () => {
		expect(total("0d6")).toBe(0);
	});
});

describe("keep and drop", () => {
	it.each([
		["4d6k", [1, 2, 3, 4], 4, "[1d, 2d, 3d, 4]"],
		["4d6kh2", [1, 2, 3, 4], 7, "[1d, 2d, 3, 4]"],
		["4d6kl", [1, 2, 3, 4], 1, "[1, 2d, 3d, 4d]"],
		["4d6kl3", [1, 2, 3, 4], 6, "[1, 2, 3, 4d]"],
		["4d6dl", [1, 2, 3, 4], 9, "[1d, 2, 3, 4]"],
		["4d6dl2", [1, 2, 3, 4], 7, "[1d, 2d, 3, 4]"],
		["4d6dh", [1, 2, 3, 4], 6, "[1, 2, 3, 4d]"],
		["4d6dh3", [1, 2, 3, 4], 1, "[1, 2d, 3d, 4d]"],
	])("%s", (formula, dice, sum, text) => {
		expect(total(formula, ...dice)).toBe(sum);
		expect(shown(formula, ...dice)).toBe(text);
	});

	it("keeps all dice when asked for more than there are", () => {
		expect(total("2d6k5", 3, 4)).toBe(7);
	});

	it("reads 2d20kh1 as advantage", () => {
		expect(total("2d20kh1", 4, 17)).toBe(17);
	});
});

describe("exploding", () => {
	it("explodes once by default on the highest face", () => {
		expect(total("1d6!", 6, 6)).toBe(12);
		expect(shown("1d6!", 6, 6)).toBe("[6!, 6]");
	});

	it("does not explode below the highest face", () => {
		expect(total("1d6!", 5)).toBe(5);
	});

	it("explodes n times", () => {
		expect(total("1d6!2", 6, 6, 6)).toBe(18);
		expect(total("1d6!2", 6, 6, 1)).toBe(13);
	});

	it("explodes at most 100 times with i and never hangs", () => {
		const random: RandomInt = () => 1;
		const result = roll("1d1!i", { random });
		expect(result.total).toBe(101);
	});

	it("combines with !!", () => {
		expect(shown("1d10!!i", 10, 10, 8)).toBe("[28!]");
		expect(total("1d10!!i", 10, 10, 8)).toBe(28);
	});

	it("explodes on a condition", () => {
		expect(total("1d4!=3", 3, 1)).toBe(4);
		expect(total("1d4!=3", 4)).toBe(4);
		expect(total("1d4!i=!3", 4, 2, 3)).toBe(9);
		expect(total("1d6!>=5", 5, 2)).toBe(7);
	});
});

describe("rerolling", () => {
	it("rerolls the lowest face once by default and replaces it", () => {
		expect(total("1d6r", 1, 1)).toBe(1);
		expect(total("1d6r", 1, 4)).toBe(4);
		expect(shown("1d6r", 1, 4)).toBe("[4r]");
	});

	it("rerolls n times", () => {
		expect(total("1d6r2", 1, 1, 5)).toBe(5);
	});

	it("rerolls on conditions, also chained", () => {
		expect(total("1d4r<3", 2, 4)).toBe(4);
		expect(total("1d4r<2>3", 4, 2)).toBe(2);
		expect(total("1d4r<2>3", 1, 3)).toBe(3);
	});

	it("stops after 100 rerolls when every face matches", () => {
		const random: RandomInt = () => 1;
		expect(roll("1d4ri<5", { random }).total).toBe(1);
	});
});

describe("sorting and unique", () => {
	it("sorts for display and keeps the sum", () => {
		expect(shown("3d6s", 3, 1, 2)).toBe("[1, 2, 3]");
		expect(shown("3d6sa", 3, 1, 2)).toBe("[1, 2, 3]");
		expect(shown("3d6sd", 1, 3, 2)).toBe("[3, 2, 1]");
		expect(total("3d6sd", 1, 3, 2)).toBe(6);
	});

	it("rolls until all dice differ", () => {
		expect(total("3d6u", 2, 2, 2, 3, 5)).toBe(10);
		expect(shown("2d6u", 2, 2, 3)).toBe("[2, 3r]");
	});

	it("refuses unique dice that cannot exist", () => {
		expect(() => roll("7d6u")).toThrow(/only 6 results/);
	});

	it("chains modifiers from left to right", () => {
		expect(total("4d6dl1sd", 1, 2, 3, 4)).toBe(9);
		expect(shown("4d6dl1sd", 1, 2, 3, 4)).toBe("[4, 3, 2, 1d]");
	});
});

describe("dice conditions", () => {
	it.each([
		["3d6=2", [2, 2, 3], 2],
		["3d6=!2", [2, 2, 3], 1],
		["3d6>2", [2, 2, 3], 1],
		["3d6<3", [2, 2, 3], 2],
		["3d6>=3", [2, 2, 3], 1],
		["3d6<=2", [2, 2, 3], 2],
		["3d6=<2", [2, 2, 3], 2],
		["3d6=>3", [2, 2, 3], 1],
		["3d6-=2", [2, 2, 3], -2],
		["3d6=-2", [2, 2, 3], -2],
	])("%s", (formula, dice, expected) => {
		expect(total(formula, ...dice)).toBe(expected);
	});

	it("counts hits and subtracts misses with 5d10>=8-=1", () => {
		expect(total("5d10>=8-=1", 9, 8, 1, 4, 10)).toBe(2);
		expect(shown("5d10>=8-=1", 9, 8, 1, 4, 10)).toBe("[9*, 8*, 1-, 4, 10*]");
	});

	it("accepts dice as threshold", () => {
		expect(total("3d6>1d6", 2, 5, 6, 4)).toBe(2);
	});

	it("skips dropped dice when counting", () => {
		expect(total("3d6kh1>=1", 1, 2, 3)).toBe(1);
	});

	it("uses arithmetic after a condition", () => {
		expect(total("2d6>=5 + 3", 5, 1)).toBe(4);
	});
});

describe("names", () => {
	it("uses named formulas as values", () => {
		const options = { random: fixed(4), names: { dex: "3", atk: "1d6 + dex" } };
		expect(roll("atk", options).total).toBe(7);
	});

	it("gives a name like ds priority over dice with a modifier", () => {
		expect(roll("ds", { names: { ds: "5" } }).total).toBe(5);
	});

	it("does not take built-in object keys for names", () => {
		expect(() => roll("constructor", { names: {} })).toThrow(/Unknown name "constructor"/);
	});

	it("reports a name that points to itself", () => {
		expect(() => roll("a", { names: { a: "a + 1" } })).toThrow(/refers to itself/);
	});
});

describe("broken formulas give a clear error", () => {
	it.each([
		["", /empty/],
		["1 +", /ends too early/],
		["(1 + 2", /closing bracket/],
		["1 2", /Unexpected "2"/],
		["1 $ 2", /Unexpected character "\$"/],
		["dex", /Unknown name "dex"/],
		["1/0", /divide by zero/],
		["2d6x", /Unknown modifier/],
		["1d[3]", /at least two/],
		["1d[a,b]", /custom dice/i],
		["1d60%", /zero sides/],
		["1d2.5", /whole number/],
		["1d0", /at least 1 side/],
		["(1-3)d6", /negative/],
		["(1/2)d6", /must be whole/],
		["2d6>", /number is missing/],
		["1d4!=", /number is missing/],
		["1d4!=-3", /only works for counting/],
		[")", /Unexpected "\)"/],
		["%", /Unexpected "%"/],
	])("%s", (formula, pattern) => {
		expect(() => roll(formula)).toThrow(DiceError);
		expect(() => roll(formula)).toThrow(pattern);
	});
});

describe("protection", () => {
	it.each([
		["1001d6", /At most 1000/],
		["1d9999999", /at most 1000000/],
		["1000d1!i", /more than 10000 dice/],
		["99999999999999999999", /too large/],
		["10^10^10", /too large/],
		["1d6!101", /at most 100/],
		["1d6r101", /at most 100/],
		["1d[1,2000000]", /at most 1000000/],
	])("%s", (formula, pattern) => {
		expect(() => roll(formula)).toThrow(DiceError);
		expect(() => roll(formula)).toThrow(pattern);
	});

	it("rejects very long and very deep formulas", () => {
		expect(() => roll("1+".repeat(600) + "1")).toThrow(/longer than/);
		expect(() => roll("(".repeat(200) + "1" + ")".repeat(200))).toThrow(/too deeply/);
		expect(() => roll("-".repeat(200) + "1")).toThrow(/too deeply/);
	});
});

describe("average", () => {
	it("is exact without modifiers", () => {
		expect(averageOf("2d6+1")).toEqual({ value: 8, exact: true });
		expect(averageOf("4dF").value).toBe(0);
		expect(averageOf("1d[2,4]").value).toBe(3);
		expect(averageOf("1d66%").value).toBe(38.5);
		expect(averageOf("(1d4)d6").value).toBe(8.75);
	});

	it("estimates with modifiers", () => {
		const { value, exact } = averageOf("2d20kh1");
		expect(exact).toBe(false);
		expect(value).toBeGreaterThan(12.8);
		expect(value).toBeLessThan(14.8);
	});
});
