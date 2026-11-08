import { beforeEach, describe, expect, it, vi } from "vitest";
import { rangeOf, type RandomInt } from "../src/engine";
import RollwrightPlugin from "../src/main";
import { extremeOf } from "../src/rollers/extreme";
import { rollSpec, type RollContext, type RollOutcome } from "../src/rollers/run";
import { BLOCK_CLASS, MAX_CLASS, MIN_CLASS, mountRoll } from "../src/ui/widget";

const highest: RandomInt = (_min, max) => max;
const lowest: RandomInt = (min) => min;
/** Answers in order; after the last value it keeps giving the lowest. */
function sequence(...values: number[]): RandomInt {
	let i = 0;
	return (min) => values[i++] ?? min;
}

function context(random: RandomInt): RollContext {
	return { sourcePath: "Here.md", random, readNote: async () => null, notesWithTag: async () => [] };
}

describe("rangeOf: the lowest and highest result, only when known for sure", () => {
	it("knows dice, numbers and arithmetic", () => {
		expect(rangeOf("1d20+4")).toEqual({ min: 5, max: 24 });
		expect(rangeOf("2d6")).toEqual({ min: 2, max: 12 });
		expect(rangeOf("1d6-1d4")).toEqual({ min: -3, max: 5 });
		expect(rangeOf("4dF")).toEqual({ min: -4, max: 4 });
	});

	it("knows keep and drop out of a fixed number of dice", () => {
		expect(rangeOf("2d20kh1+3")).toEqual({ min: 4, max: 23 });
		expect(rangeOf("2d20kl1")).toEqual({ min: 1, max: 20 });
		expect(rangeOf("4d6dl1")).toEqual({ min: 3, max: 18 });
	});

	it("gives null for exploding dice, rerolls, a rolled count with keep, and broken formulas", () => {
		expect(rangeOf("1d6!")).toBeNull();
		expect(rangeOf("2d6r1")).toBeNull();
		expect(rangeOf("(1d4)d6kh1")).toBeNull();
		expect(rangeOf("2d6 +")).toBeNull();
	});

	it("leaves averageOf as it was: keep has no exact mean", async () => {
		const { averageOf } = await import("../src/engine");
		expect(averageOf("2d20kh1").exact).toBe(false);
	});
});

describe("extremeOf", () => {
	it("marks the highest, the lowest, and nothing in between", () => {
		expect(extremeOf(24, "1d20+4")).toBe("max");
		expect(extremeOf(5, "1d20+4")).toBe("min");
		expect(extremeOf(13, "1d20+4")).toBeUndefined();
		expect(extremeOf(2, "2d6")).toBe("min");
	});

	it("marks nothing for a formula that always gives the same, or that explodes", () => {
		expect(extremeOf(7, "3+4")).toBeUndefined();
		expect(extremeOf(1, "1d1")).toBeUndefined();
		expect(extremeOf(1, "1d6!")).toBeUndefined();
	});
});

describe("RollOutcome.extreme from rollSpec", () => {
	it("is max for a 20 on 1d20+4 and min for 2 on 2d6", async () => {
		const top = await rollSpec("1d20+4", context(highest));
		expect(top.total).toBe(24);
		expect(top.extreme).toBe("max");
		const bottom = await rollSpec("2d6", context(lowest));
		expect(bottom.total).toBe(2);
		expect(bottom.extreme).toBe("min");
	});

	it("is missing in between", async () => {
		const middle = await rollSpec("2d6", context(sequence(3, 4)));
		expect(middle.total).toBe(7);
		expect(middle.extreme).toBeUndefined();
	});

	it("works with keep highest and with Fudge dice", async () => {
		expect((await rollSpec("2d20kh1+3", context(sequence(20, 5)))).extreme).toBe("max");
		expect((await rollSpec("2d20kh1+3", context(sequence(1, 1)))).extreme).toBe("min");
		expect((await rollSpec("2d20kh1+3", context(sequence(1, 20)))).extreme).toBe("max");
		expect((await rollSpec("4dF", context(highest)))).toMatchObject({ total: 4, extreme: "max" });
		expect((await rollSpec("4dF", context(lowest)))).toMatchObject({ total: -4, extreme: "min" });
	});

	it("is missing for a constant, exploding dice, an average and an estimate", async () => {
		expect((await rollSpec("3+4", context(highest))).extreme).toBeUndefined();
		expect((await rollSpec("1d6!", context(sequence(1)))).extreme).toBeUndefined();
		expect((await rollSpec("1d20|avg", context(highest), { firstRoll: true })).extreme).toBeUndefined();
		expect((await rollSpec("1d20", context(highest), { average: true })).extreme).toBeUndefined();
		const estimate = await rollSpec("1d6!", context(sequence(1)), { average: true });
		expect(estimate.estimated).toBe(true);
		expect(estimate.extreme).toBeUndefined();
	});
});

/** Just enough of an element for the widget: classes and listeners. */
function fakeSpan() {
	const classes = new Set<string>();
	const listeners: Record<string, (event: unknown) => void> = {};
	const el = {
		classes,
		listeners,
		empty() {},
		addClass: (cls: string) => classes.add(cls),
		removeClass: (cls: string) => classes.delete(cls),
		setAttribute() {},
		setText() {},
		createSpan: () => el,
		addEventListener: (name: string, listener: (event: unknown) => void) => (listeners[name] = listener),
		closest: () => null,
	};
	return el;
}

const press = (keys: { ctrlKey?: boolean } = {}) => ({ target: { instanceOf: () => false }, preventDefault() {}, stopPropagation() {}, ...keys });
const wait = () => new Promise((resolve) => setTimeout(resolve, 20));

function fakeApp() {
	return {
		workspace: { on: vi.fn(), getLeavesOfType: () => [], getActiveViewOfType: () => null, onLayoutReady: (callback: () => void) => callback(), iterateAllLeaves: () => {} },
		metadataCache: { getFirstLinkpathDest: () => null, getFileCache: () => ({}) },
		vault: { configDir: ".obsidian", cachedRead: async () => "", getMarkdownFiles: () => [], getAbstractFileByPath: () => null },
	};
}

/** A plugin whose rolls use the random source set in `dice.random`. */
async function load(stored: unknown = null) {
	const plugin = new (RollwrightPlugin as unknown as new (app: unknown) => RollwrightPlugin)(fakeApp());
	(plugin as unknown as { stored: unknown }).stored = stored;
	await plugin.onload();
	const dice = { random: highest };
	const original = plugin.rollContext.bind(plugin);
	plugin.rollContext = (sourcePath) => ({ ...original(sourcePath), random: (min, max) => dice.random(min, max) });
	return { plugin, dice };
}

beforeEach(() => {
	vi.stubGlobal("Element", class {});
	vi.stubGlobal("activeDocument", { body: { toggleClass() {}, removeClass() {} } });
});

describe("the max and min class on the roll", () => {
	it("comes with a highest roll, changes with a lowest, and goes with one in between", async () => {
		const { plugin, dice } = await load();
		const span = fakeSpan();
		mountRoll(plugin, span as never, "2d6", "k", "A.md", { register() {} } as never);
		await wait();
		expect(span.classes.has(MAX_CLASS)).toBe(true);
		expect(span.classes.has(MIN_CLASS)).toBe(false);

		dice.random = lowest;
		span.listeners.click?.(press());
		await wait();
		expect(span.classes.has(MIN_CLASS)).toBe(true);
		expect(span.classes.has(MAX_CLASS)).toBe(false);

		dice.random = sequence(3, 4);
		span.listeners.click?.(press());
		await wait();
		expect(span.classes.has(MIN_CLASS)).toBe(false);
		expect(span.classes.has(MAX_CLASS)).toBe(false);
		expect(span.classes.has(BLOCK_CLASS)).toBe(false);
	});

	it("goes away on an error", async () => {
		const { plugin, dice } = await load();
		const span = fakeSpan();
		mountRoll(plugin, span as never, "1d20+4", "k", "A.md", { register() {} } as never);
		await wait();
		expect(span.classes.has(MAX_CLASS)).toBe(true);

		dice.random = () => {
			throw new Error("broken");
		};
		span.listeners.click?.(press());
		await wait();
		expect(span.classes.has("rollwright-error")).toBe(true);
		expect(span.classes.has(MAX_CLASS)).toBe(false);
		expect(span.classes.has(MIN_CLASS)).toBe(false);
	});

	it("goes away when Ctrl-click makes a |none code empty again", async () => {
		const { plugin, dice } = await load();
		for (const [random, cls] of [[highest, MAX_CLASS], [lowest, MIN_CLASS]] as const) {
			dice.random = random;
			const span = fakeSpan();
			mountRoll(plugin, span as never, "2d6|none", `none-${cls}`, "A.md", { register() {} } as never);
			await wait();
			expect(span.classes.has(cls)).toBe(false);
			span.listeners.click?.(press());
			await wait();
			expect(span.classes.has(cls)).toBe(true);
			span.listeners.click?.(press({ ctrlKey: true }));
			await wait();
			expect(span.classes.has(MAX_CLASS)).toBe(false);
			expect(span.classes.has(MIN_CLASS)).toBe(false);
		}
	});

	it("stays after a restart for dice+, and an older kept result without the field adds nothing", async () => {
		const first = await load();
		mountRoll(first.plugin, fakeSpan() as never, "1d20+4", "keep", "A.md", { register() {} } as never, true);
		await wait();
		const stored = (first.plugin as unknown as { stored: { keptResults: [string, RollOutcome][] } }).stored;
		expect(stored.keptResults[0]?.[1].extreme).toBe("max");

		const again = await load(stored);
		again.dice.random = lowest;
		const span = fakeSpan();
		mountRoll(again.plugin, span as never, "1d20+4", "keep", "A.md", { register() {} } as never, true);
		await wait();
		expect(span.classes.has(MAX_CLASS)).toBe(true);

		const old: RollOutcome = { kind: "dice", text: "24", total: 24, formula: "1d20+4", details: "1d20+4 = [20] + 4", flags: {} as RollOutcome["flags"] };
		const older = await load({ keptResults: [["keep", old]] });
		const oldSpan = fakeSpan();
		mountRoll(older.plugin, oldSpan as never, "1d20+4", "keep", "A.md", { register() {} } as never, true);
		await wait();
		expect(oldSpan.classes.has(MAX_CLASS)).toBe(false);
		expect(oldSpan.classes.has(MIN_CLASS)).toBe(false);
	});
});
