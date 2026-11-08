import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RandomInt } from "../src/engine";
import RollwrightPlugin from "../src/main";
import { LAND_MS } from "../src/ui/motion";
import { CRIT_CLASS, FUMBLE_CLASS, mountRoll, ROLLED_CLASS, STAMP_CLASS } from "../src/ui/widget";

// Ontwerp-v2 klus 2c en 2d: bewegingen bij elke klik opnieuw, en goud en rood pas als het getal landt.

/** A roll element that logs every class change in order, and counts reflows (offsetWidth reads). */
function fakeRoll() {
	const classes = new Set<string>();
	const log: string[] = [];
	const listeners: Record<string, (event: unknown) => void> = {};
	const spans: { cls?: string; text?: string }[] = [];
	const el = {
		classes,
		log,
		listeners,
		spans,
		isConnected: true,
		reflows: 0,
		get offsetWidth() {
			el.reflows++;
			log.push("reflow");
			return 10;
		},
		empty: () => (spans.length = 0),
		addClass: (cls: string) => {
			classes.add(cls);
			log.push(`+${cls}`);
		},
		removeClass: (cls: string) => {
			if (classes.delete(cls)) log.push(`-${cls}`);
		},
		setAttribute() {},
		removeAttribute() {},
		setText() {},
		createSpan: (options?: { cls?: string; text?: string }) => {
			spans.push(options ?? {});
			return Object.assign(Object.create(el) as object, { parentElement: el, setAttribute() {}, removeAttribute() {} });
		},
		addEventListener: (name: string, listener: (event: unknown) => void) => (listeners[name] = listener),
		closest: () => null,
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
});

const settle = async () => {
	for (let i = 0; i < 20; i++) await Promise.resolve();
};
const press = () => ({ target: { instanceOf: () => false }, preventDefault() {}, stopPropagation() {} });
const highest: RandomInt = (_min, max) => max;
const lowest: RandomInt = (min) => min;
const middle: RandomInt = (min, max) => Math.floor((min + max) / 2);

async function load() {
	const plugin = new (RollwrightPlugin as unknown as new (app: unknown) => RollwrightPlugin)({
		workspace: { on: vi.fn(), getLeavesOfType: () => [], getActiveViewOfType: () => null, onLayoutReady: (callback: () => void) => callback(), iterateAllLeaves: () => {} },
		metadataCache: { getFirstLinkpathDest: () => null, getFileCache: () => ({}) },
		vault: { configDir: ".obsidian", cachedRead: async () => "", getMarkdownFiles: () => [], getAbstractFileByPath: () => null },
	});
	(plugin as unknown as { stored: unknown }).stored = null;
	await plugin.onload();
	const dice = { random: highest };
	const original = plugin.rollContext.bind(plugin);
	plugin.rollContext = (sourcePath) => ({ ...original(sourcePath), random: (min, max) => dice.random(min, max) });
	return { plugin, dice };
}

async function mount(formula = "1d20") {
	const { plugin, dice } = await load();
	const roll = fakeRoll();
	const cleanups: (() => void)[] = [];
	mountRoll(plugin, roll as never, formula, "k", "A.md", { register: (fn: () => void) => cleanups.push(fn) } as never);
	await settle();
	return { plugin, dice, roll, cleanups };
}

const click = async (roll: ReturnType<typeof fakeRoll>) => {
	roll.listeners.click?.(press());
	await settle();
};

describe("gold and red when the number lands (klus 2d)", () => {
	it("on opening a note the crit class is there at once, without a timer", async () => {
		const { roll } = await mount();
		expect(roll.classes.has(CRIT_CLASS)).toBe(true);
		expect(vi.getTimerCount()).toBe(0);
	});

	it("after a click: no crit class before 460 ms, then it comes; the stamp is there at once", async () => {
		const { roll } = await mount();
		await click(roll);
		expect(roll.classes.has(ROLLED_CLASS)).toBe(true);
		expect(roll.classes.has(CRIT_CLASS)).toBe(false);
		expect(roll.spans.some((s) => s.cls === STAMP_CLASS && s.text === "NAT 20")).toBe(true);
		vi.advanceTimersByTime(LAND_MS - 1);
		expect(roll.classes.has(CRIT_CLASS)).toBe(false);
		vi.advanceTimersByTime(1);
		expect(roll.classes.has(CRIT_CLASS)).toBe(true);
	});

	it("the same for a fumble, and the old gold goes at the click itself", async () => {
		const { roll, dice } = await mount();
		expect(roll.classes.has(CRIT_CLASS)).toBe(true);
		dice.random = lowest;
		roll.listeners.click?.(press());
		// Synchronously, before any result is back.
		expect(roll.classes.has(CRIT_CLASS)).toBe(false);
		await settle();
		expect(roll.classes.has(FUMBLE_CLASS)).toBe(false);
		vi.advanceTimersByTime(LAND_MS);
		expect(roll.classes.has(FUMBLE_CLASS)).toBe(true);
		expect(roll.classes.has(CRIT_CLASS)).toBe(false);
	});

	it("with reduced motion the class comes at once after a click", async () => {
		reduce = true;
		const { roll } = await mount();
		await click(roll);
		expect(roll.classes.has(CRIT_CLASS)).toBe(true);
		expect(vi.getTimerCount()).toBe(0);
	});

	it("a newer click within 460 ms: the old timer puts nothing, only the newest result lands", async () => {
		const { roll, dice } = await mount();
		await click(roll);
		vi.advanceTimersByTime(200);
		dice.random = middle;
		await click(roll);
		vi.advanceTimersByTime(LAND_MS * 2);
		expect(roll.classes.has(CRIT_CLASS)).toBe(false);
		expect(roll.log.filter((entry) => entry === `+${CRIT_CLASS}`).length).toBe(1);
		expect(vi.getTimerCount()).toBe(0);
	});

	it("puts nothing when the roll left the page, and unload clears the timer", async () => {
		const { roll, cleanups } = await mount();
		await click(roll);
		roll.isConnected = false;
		vi.advanceTimersByTime(LAND_MS);
		expect(roll.classes.has(CRIT_CLASS)).toBe(false);

		roll.isConnected = true;
		await click(roll);
		expect(vi.getTimerCount()).toBeGreaterThan(0);
		for (const fn of cleanups) fn();
		expect(vi.getTimerCount()).toBe(0);
		vi.advanceTimersByTime(LAND_MS);
		expect(roll.classes.has(CRIT_CLASS)).toBe(false);
	});
});

describe("motions start over on every click (klus 2c)", () => {
	it("the rolled class is taken off, a reflow happens, and it is set again", async () => {
		const { roll } = await mount();
		await click(roll);
		roll.log.length = 0;
		await click(roll);
		const at = roll.log.indexOf(`-${ROLLED_CLASS}`);
		expect(at).toBeGreaterThanOrEqual(0);
		expect(roll.log.slice(at, at + 3)).toEqual([`-${ROLLED_CLASS}`, "reflow", `+${ROLLED_CLASS}`]);
		expect(roll.classes.has(ROLLED_CLASS)).toBe(true);
	});

	it("Alt-click does the same", async () => {
		const { roll } = await mount("2d6");
		await click(roll);
		roll.log.length = 0;
		roll.listeners.click?.({ ...press(), altKey: true });
		await settle();
		expect(roll.log.slice(0, 3)).toEqual([`-${ROLLED_CLASS}`, "reflow", `+${ROLLED_CLASS}`]);
	});
});
