import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RandomInt } from "../src/engine";
import RollwrightPlugin from "../src/main";
import { LAND_MS } from "../src/ui/motion";
import { mountRoll, startTicking, TICK_ATTR, TICK_START_MS, TICK_STEPS, tickNumber, tickSequence } from "../src/ui/widget";

// Ontwerp-v2 klus 4, 4b en 4c: het getal telt na een klik door vanaf ±140 ms (als het vakje in beeld komt)
// en landt op LAND_MS (460 ms) op de echte uitkomst, op hetzelfde moment als goud of rood.
const LAND = TICK_START_MS + TICK_STEPS.reduce((a, b) => a + b, 0);

/** A value element that remembers its attribute, and every number it showed. */
function fakeValue() {
	const seen: string[] = [];
	const attrs = new Map<string, string>();
	return {
		seen,
		attrs,
		setAttribute: (name: string, value: string) => {
			attrs.set(name, value);
			if (name === TICK_ATTR) seen.push(value);
		},
		removeAttribute: (name: string) => attrs.delete(name),
	};
}

/** A roll element whose created value span is a fakeValue, with text. */
function fakeRoll() {
	const classes = new Set<string>();
	const listeners: Record<string, (event: unknown) => void> = {};
	const values: (ReturnType<typeof fakeValue> & { text: string })[] = [];
	const el = {
		classes,
		listeners,
		values,
		empty() {},
		addClass: (cls: string) => classes.add(cls),
		removeClass: (cls: string) => classes.delete(cls),
		setAttribute() {},
		removeAttribute() {},
		setText() {},
		createSpan: (options?: { cls?: string }) => {
			if (options?.cls !== "rollwright-value") return el;
			const value = Object.assign(fakeValue(), { text: "", setText: (text: string) => (value.text = text), parentElement: el });
			values.push(value);
			return value;
		},
		addEventListener: (name: string, listener: (event: unknown) => void) => (listeners[name] = listener),
		closest: () => null,
		isConnected: true,
	};
	return el;
}

let reduce = false;
beforeEach(() => {
	reduce = false;
	vi.useFakeTimers();
	vi.stubGlobal("Element", class {});
	vi.stubGlobal("activeDocument", { body: { toggleClass() {}, removeClass() {} } });
	vi.stubGlobal("activeWindow", {
		matchMedia: () => ({ matches: reduce }),
		setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
		clearTimeout: (id: number) => clearTimeout(id),
	});
});
afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe("startTicking", () => {
	it("waits ±140 ms, shows 6 numbers within the range, slower each time, lands at LAND_MS, then takes the attribute away", () => {
		const value = fakeValue();
		const stop = startTicking(value as never, { min: 1, max: 20 });
		expect(stop).not.toBeNull();
		expect(TICK_STEPS).toHaveLength(6);
		expect(TICK_START_MS).toBe(140);
		expect(LAND).toBe(LAND_MS);
		for (let i = 1; i < TICK_STEPS.length; i++) expect(TICK_STEPS[i]).toBeGreaterThan(TICK_STEPS[i - 1] as number);
		vi.advanceTimersByTime(TICK_START_MS - 1);
		expect(value.seen).toEqual([]);
		vi.advanceTimersByTime(1);
		expect(value.seen).toHaveLength(1);
		vi.advanceTimersByTime(LAND - TICK_START_MS - 1);
		expect(value.attrs.has(TICK_ATTR)).toBe(true);
		vi.advanceTimersByTime(1);
		expect(value.attrs.has(TICK_ATTR)).toBe(false);
		expect(value.seen).toHaveLength(6);
		for (const n of value.seen) expect(Number(n)).toBeGreaterThanOrEqual(1);
		for (const n of value.seen) expect(Number(n)).toBeLessThanOrEqual(20);
		expect(vi.getTimerCount()).toBe(0);
	});

	it("starts at once with delay 0", () => {
		const value = fakeValue();
		startTicking(value as never, { min: 1, max: 20 }, { delay: 0 });
		expect(value.seen).toHaveLength(1);
	});

	it("never shows the same number twice in a row, and never ends on the real result, also with a fixed Math.random", () => {
		for (const fixed of [0, 0.5, 0.999]) {
			for (const actual of [1, 10, 20]) {
				const value = fakeValue();
				startTicking(value as never, { min: 1, max: 20 }, { actual }, () => fixed);
				vi.advanceTimersByTime(LAND);
				expect(value.seen).toHaveLength(6);
				for (let i = 1; i < value.seen.length; i++) expect(value.seen[i]).not.toBe(value.seen[i - 1]);
				expect(Number(value.seen[5])).not.toBe(actual);
				expect(vi.getTimerCount()).toBe(0);
			}
		}
	});

	it("the same holds with random draws, and on a range of only two numbers", () => {
		for (let run = 0; run < 200; run++) {
			const value = fakeValue();
			const two = run % 2 === 0;
			const range = two ? { min: 1, max: 2 } : { min: 2, max: 12 };
			const actual = two ? 1 + (run % 4 === 0 ? 1 : 0) : 2 + (run % 11);
			startTicking(value as never, range, { actual });
			vi.advanceTimersByTime(LAND);
			for (let i = 1; i < value.seen.length; i++) expect(value.seen[i]).not.toBe(value.seen[i - 1]);
			expect(Number(value.seen[5])).not.toBe(actual);
			for (const n of value.seen) expect(Number(n)).toBeGreaterThanOrEqual(range.min);
			for (const n of value.seen) expect(Number(n)).toBeLessThanOrEqual(range.max);
		}
	});

	it("tickNumber moves a number that does not fit up by one, wrapping round, within the range", () => {
		expect(tickNumber({ min: 1, max: 20 }, 0, null, null)).toBe(1);
		expect(tickNumber({ min: 1, max: 20 }, 0, 1, null)).toBe(2);
		expect(tickNumber({ min: 1, max: 20 }, 0.999, 20, null)).toBe(1);
		expect(tickNumber({ min: 1, max: 20 }, 0, 1, 2)).toBe(3);
		expect(tickNumber({ min: -3, max: 3 }, 0.999, 3, -3)).toBe(-2);
	});

	it("tickSequence on a range of two numbers alternates and ends on the other number", () => {
		expect(tickSequence({ min: 1, max: 2 }, 1, () => 0)).toEqual([1, 2, 1, 2, 1, 2]);
		expect(tickSequence({ min: 1, max: 2 }, 2, () => 0.9)).toEqual([2, 1, 2, 1, 2, 1]);
	});

	it("does nothing without a known range, for a fixed result, a range with a fraction, or with reduced motion", () => {
		expect(startTicking(fakeValue() as never, null)).toBeNull();
		expect(startTicking(fakeValue() as never, { min: 0.5, max: 10 })).toBeNull();
		expect(startTicking(fakeValue() as never, { min: 7, max: 7 })).toBeNull();
		reduce = true;
		const value = fakeValue();
		expect(startTicking(value as never, { min: 1, max: 20 })).toBeNull();
		expect(value.seen).toEqual([]);
		expect(vi.getTimerCount()).toBe(0);
	});

	it("stops at once: no timer keeps running", () => {
		const value = fakeValue();
		const stop = startTicking(value as never, { min: 2, max: 12 });
		vi.advanceTimersByTime(200);
		expect(value.attrs.has(TICK_ATTR)).toBe(true);
		stop?.();
		expect(vi.getTimerCount()).toBe(0);
		expect(value.attrs.has(TICK_ATTR)).toBe(false);
	});
});

async function load() {
	const plugin = new (RollwrightPlugin as unknown as new (app: unknown) => RollwrightPlugin)({
		workspace: { on: vi.fn(), getLeavesOfType: () => [], getActiveViewOfType: () => null, onLayoutReady: (callback: () => void) => callback(), iterateAllLeaves: () => {} },
		metadataCache: { getFirstLinkpathDest: () => null, getFileCache: () => ({}) },
		vault: { configDir: ".obsidian", cachedRead: async () => "", getMarkdownFiles: () => [], getAbstractFileByPath: () => null },
	});
	(plugin as unknown as { stored: unknown }).stored = null;
	await plugin.onload();
	const random: RandomInt = (_min, max) => max;
	const original = plugin.rollContext.bind(plugin);
	plugin.rollContext = (sourcePath) => ({ ...original(sourcePath), random });
	return plugin;
}

const press = () => ({ target: { instanceOf: () => false }, preventDefault() {}, stopPropagation() {} });
const settle = async () => {
	for (let i = 0; i < 20; i++) await Promise.resolve();
};

describe("counting on the roll", () => {
	it("never on opening; after a click it counts while the real text is there all the time, and is gone when it lands", async () => {
		const plugin = await load();
		const roll = fakeRoll();
		const cleanups: (() => void)[] = [];
		// A fixed Math.random at the top: without the real result handed over, the last number would be 24.
		vi.spyOn(Math, "random").mockReturnValue(0.999);
		mountRoll(plugin, roll as never, "1d20+4", "k", "A.md", { register: (fn: () => void) => cleanups.push(fn) } as never);
		await settle();
		expect(roll.values[0]?.seen).toEqual([]);

		roll.listeners.click?.(press());
		await settle();
		const value = roll.values[roll.values.length - 1];
		expect(value?.text).toBe("24");
		vi.advanceTimersByTime(TICK_START_MS);
		expect(value?.attrs.has(TICK_ATTR)).toBe(true);
		vi.advanceTimersByTime(LAND - TICK_START_MS);
		expect(value?.attrs.has(TICK_ATTR)).toBe(false);
		expect(value?.seen.length).toBe(6);
		// The last counted number is not the real result.
		expect(value?.seen[5]).not.toBe("24");
		expect(value?.text).toBe("24");
		// 24 is a crit: its gold came with a timer of its own at 460 ms (klus 2d); now nothing runs.
		expect(vi.getTimerCount()).toBe(0);
	});

	it("klus 4c: when the gold of a crit comes, the counted number is gone in that same moment", async () => {
		const plugin = await load();
		const roll = fakeRoll();
		mountRoll(plugin, roll as never, "1d20+4", "k4", "A.md", { register() {} } as never);
		await settle();
		roll.listeners.click?.(press());
		await settle();
		const value = roll.values[roll.values.length - 1];
		// What the counted number was at the very moment the gold went on.
		let tickAtGold: string | undefined = "never";
		const addClass = roll.addClass;
		roll.addClass = (cls: string) => {
			if (cls === "rollwright-crit") tickAtGold = value?.attrs.get(TICK_ATTR);
			return addClass(cls);
		};
		vi.advanceTimersByTime(LAND_MS - 1);
		expect(roll.classes.has("rollwright-crit")).toBe(false);
		expect(value?.attrs.has(TICK_ATTR)).toBe(true);
		vi.advanceTimersByTime(1);
		expect(roll.classes.has("rollwright-crit")).toBe(true);
		expect(tickAtGold).toBeUndefined();
		expect(value?.attrs.has(TICK_ATTR)).toBe(false);
		expect(vi.getTimerCount()).toBe(0);
	});

	it("a new click stops the old counting, and so does the roll going away", async () => {
		const plugin = await load();
		const roll = fakeRoll();
		const cleanups: (() => void)[] = [];
		mountRoll(plugin, roll as never, "2d6", "k2", "A.md", { register: (fn: () => void) => cleanups.push(fn) } as never);
		await settle();
		roll.listeners.click?.(press());
		await settle();
		const first = roll.values[roll.values.length - 1];
		vi.advanceTimersByTime(200);
		expect(first?.attrs.has(TICK_ATTR)).toBe(true);
		roll.listeners.click?.(press());
		await settle();
		expect(first?.attrs.has(TICK_ATTR)).toBe(false);
		// The new counting, and the landing of its gold (12 is a crit, klus 2d); the old ones are gone.
		expect(vi.getTimerCount()).toBe(2);
		for (const fn of cleanups) fn();
		expect(vi.getTimerCount()).toBe(0);
	});

	it("does not count a table or list result", async () => {
		const plugin = await load();
		plugin.firstResult = async () => ({ kind: "list", text: "Goblin", formula: "[[M]]", details: "", flags: {} as never });
		plugin.freshResult = async () => ({ kind: "list", text: "Orc", formula: "[[M]]", details: "", flags: {} as never });
		const roll = fakeRoll();
		mountRoll(plugin, roll as never, "[[M]]", "k3", "A.md", { register() {} } as never);
		await settle();
		roll.listeners.click?.(press());
		await settle();
		expect(roll.values.every((v) => v.seen.length === 0)).toBe(true);
		expect(vi.getTimerCount()).toBe(0);
	});
});
