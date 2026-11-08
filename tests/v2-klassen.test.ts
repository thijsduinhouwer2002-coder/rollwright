import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RandomInt } from "../src/engine";
import RollwrightPlugin, { type HistoryEntry } from "../src/main";
import { stampText } from "../src/rollers/extreme";
import type { RollOutcome } from "../src/rollers/run";
import { RollHistoryView } from "../src/ui/history-view";
import { mountRoll } from "../src/ui/widget";

// Rollwright v2 (ontwerp-v2.md, klus 2, 2b, 3 en 3b): the classes and the stamp the CSS of Daan needs.

const highest: RandomInt = (_min, max) => max;
const lowest: RandomInt = (min) => min;
/** Answers in order; after the last value it keeps giving the lowest. */
function sequence(...values: number[]): RandomInt {
	let i = 0;
	return (min) => values[i++] ?? min;
}

/** A roll element that remembers its classes, the spans made in it, and the classes at each redraw. */
function fakeSpan() {
	const classes = new Set<string>();
	const listeners: Record<string, (event: unknown) => void> = {};
	const spans: { cls?: string; text?: string }[] = [];
	const classesAtRedraw: string[][] = [];
	const el = {
		classes,
		listeners,
		spans,
		classesAtRedraw,
		empty() {
			spans.length = 0;
			classesAtRedraw.push([...classes]);
		},
		addClass: (cls: string) => classes.add(cls),
		removeClass: (cls: string) => classes.delete(cls),
		setAttribute() {},
		setText() {},
		createSpan: (options?: { cls?: string; text?: string }) => {
			spans.push(options ?? {});
			return el;
		},
		addEventListener: (name: string, listener: (event: unknown) => void) => (listeners[name] = listener),
		closest: () => null,
	};
	return el;
}

const press = (keys: { altKey?: boolean } = {}) => ({ target: { instanceOf: () => false }, preventDefault() {}, stopPropagation() {}, ...keys });
const wait = () => new Promise((resolve) => setTimeout(resolve, 20));
const stamps = (span: ReturnType<typeof fakeSpan>) => span.spans.filter((s) => s.cls === "rollwright-stamp").map((s) => s.text);

function fakeApp() {
	return {
		workspace: { on: vi.fn(), getLeavesOfType: () => [], getActiveViewOfType: () => null, onLayoutReady: (callback: () => void) => callback(), iterateAllLeaves: () => {} },
		metadataCache: { getFirstLinkpathDest: () => null, getFileCache: () => ({}) },
		vault: { configDir: ".obsidian", cachedRead: async () => "", getMarkdownFiles: () => [], getAbstractFileByPath: () => null },
	};
}

async function load() {
	const plugin = new (RollwrightPlugin as unknown as new (app: unknown) => RollwrightPlugin)(fakeApp());
	(plugin as unknown as { stored: unknown }).stored = null;
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

describe("rollwright-rolled (klus 2)", () => {
	it("is not there on opening, comes with a click before the redraw, and stays", async () => {
		const { plugin } = await load();
		const span = fakeSpan();
		mountRoll(plugin, span as never, "1d20", "r", "A.md", { register() {} } as never);
		await wait();
		expect(span.classes.has("rollwright-rolled")).toBe(false);

		span.listeners.click?.(press());
		await wait();
		expect(span.classes.has("rollwright-rolled")).toBe(true);
		// The redraw of the click already had the class.
		expect(span.classesAtRedraw[span.classesAtRedraw.length - 1]).toContain("rollwright-rolled");

		span.listeners.click?.(press());
		await wait();
		expect(span.classes.has("rollwright-rolled")).toBe(true);
	});

	it("comes with Alt-click too, and a new element for the same place (note opened again) has none", async () => {
		const { plugin } = await load();
		const first = fakeSpan();
		mountRoll(plugin, first as never, "2d6", "same", "A.md", { register() {} } as never);
		await wait();
		first.listeners.click?.(press({ altKey: true }));
		await wait();
		expect(first.classes.has("rollwright-rolled")).toBe(true);

		const again = fakeSpan();
		mountRoll(plugin, again as never, "2d6", "same", "A.md", { register() {} } as never);
		await wait();
		expect(again.classes.has("rollwright-rolled")).toBe(false);
	});
});

describe("rollwright-text (klus 2b)", () => {
	it("is on a result from a list or table, not on dice, and goes when dice come", async () => {
		const { plugin } = await load();
		const list: RollOutcome = { kind: "list", text: "Goblin", formula: "[[Monsters]]", details: "", flags: {} as RollOutcome["flags"] };
		const span = fakeSpan();
		const real = plugin.firstResult.bind(plugin);
		plugin.firstResult = async () => list;
		mountRoll(plugin, span as never, "[[Monsters]]", "t", "A.md", { register() {} } as never);
		await wait();
		expect(span.classes.has("rollwright-text")).toBe(true);
		expect(span.classes.has("rollwright-crit")).toBe(false);
		expect(stamps(span)).toEqual([]);

		plugin.firstResult = real;
		const dice = fakeSpan();
		mountRoll(plugin, dice as never, "1d20", "d", "A.md", { register() {} } as never);
		await wait();
		expect(dice.classes.has("rollwright-text")).toBe(false);
	});
});

describe("rollwright-crit and rollwright-fumble (klus 3)", () => {
	it("comes with the highest and lowest roll, next to the older max and min class", async () => {
		const { plugin, dice } = await load();
		const span = fakeSpan();
		mountRoll(plugin, span as never, "1d20+4", "c", "A.md", { register() {} } as never);
		await wait();
		expect(span.classes.has("rollwright-crit")).toBe(true);
		expect(span.classes.has("rollwright-roll-max")).toBe(true);
		expect(span.classes.has("rollwright-fumble")).toBe(false);

		dice.random = lowest;
		span.listeners.click?.(press());
		await wait();
		expect(span.classes.has("rollwright-fumble")).toBe(true);
		expect(span.classes.has("rollwright-roll-min")).toBe(true);
		expect(span.classes.has("rollwright-crit")).toBe(false);

		dice.random = sequence(10);
		span.listeners.click?.(press());
		await wait();
		expect(span.classes.has("rollwright-crit")).toBe(false);
		expect(span.classes.has("rollwright-fumble")).toBe(false);
	});

	// Controleur: only the dice that count; 1d20 + 1d4 only when both are highest or lowest.
	it.each([
		["4d6kh3", [6, 6, 6, 1], "rollwright-crit"],
		["4d6kh3", [6, 6, 5, 6], "rollwright-crit"],
		["4d6kh3", [6, 6, 5, 1], undefined],
		["4d6kh3", [1, 1, 1, 1], "rollwright-fumble"],
		["4d6kh3", [1, 1, 1, 2], undefined],
		["2d20kh1", [3, 20], "rollwright-crit"],
		["2d20kh1", [1, 19], undefined],
		["2d20kl1", [20, 1], "rollwright-fumble"],
		["1d20+1d4", [20, 4], "rollwright-crit"],
		["1d20+1d4", [20, 3], undefined],
		["1d20+1d4", [1, 1], "rollwright-fumble"],
		["1d20+1d4", [1, 4], undefined],
	] as const)("%s with %j gives %s", async (formula, values, expected) => {
		const { plugin, dice } = await load();
		dice.random = sequence(...values);
		const span = fakeSpan();
		mountRoll(plugin, span as never, formula, `e-${formula}-${values.join()}`, "A.md", { register() {} } as never);
		await wait();
		expect(span.classes.has("rollwright-crit")).toBe(expected === "rollwright-crit");
		expect(span.classes.has("rollwright-fumble")).toBe(expected === "rollwright-fumble");
	});

	it("goes away on an error", async () => {
		const { plugin, dice } = await load();
		const span = fakeSpan();
		mountRoll(plugin, span as never, "1d20", "err", "A.md", { register() {} } as never);
		await wait();
		dice.random = () => {
			throw new Error("broken");
		};
		span.listeners.click?.(press());
		await wait();
		expect(span.classes.has("rollwright-crit")).toBe(false);
		expect(stamps(span)).toEqual([]);
	});
});

describe("the stamp (klus 3b)", () => {
	it("says NAT 20 and NAT 1 only when exactly one d20 counts, otherwise MAX and MIN", () => {
		expect(stampText("1d20", "max")).toBe("NAT 20");
		expect(stampText("d20", "min")).toBe("NAT 1");
		expect(stampText("1d20 + 4", "max")).toBe("NAT 20");
		expect(stampText("1D20-1", "min")).toBe("NAT 1");
		expect(stampText("2d20kh1+3", "max")).toBe("NAT 20");
		expect(stampText("2d20kl1", "min")).toBe("NAT 1");
		expect(stampText("2d6", "max")).toBe("MAX");
		expect(stampText("2d6 + 3", "min")).toBe("MIN");
		expect(stampText("4d6kh3", "max")).toBe("MAX");
		expect(stampText("1d20+1d4", "max")).toBe("MAX");
		expect(stampText("4dF", "min")).toBe("MIN");
	});

	it("is on the roll for a crit or fumble only, and changes with the next roll", async () => {
		const { plugin, dice } = await load();
		const span = fakeSpan();
		mountRoll(plugin, span as never, "1d20+2", "s", "A.md", { register() {} } as never);
		await wait();
		expect(stamps(span)).toEqual(["NAT 20"]);

		dice.random = lowest;
		span.listeners.click?.(press());
		await wait();
		expect(stamps(span)).toEqual(["NAT 1"]);

		dice.random = sequence(7);
		span.listeners.click?.(press());
		await wait();
		expect(stamps(span)).toEqual([]);

		dice.random = highest;
		const damage = fakeSpan();
		mountRoll(plugin, damage as never, "2d6+3", "s2", "A.md", { register() {} } as never);
		await wait();
		expect(stamps(damage)).toEqual(["MAX"]);
	});
});

/** A small element for the history view: classes, children and text. */
interface Node {
	tag: string;
	cls: string[];
	text: string;
	children: Node[];
	[key: string]: unknown;
}
function node(tag: string, options: { cls?: string | string[]; text?: string } = {}): Node {
	const made: Node = {
		tag,
		cls: options.cls === undefined ? [] : ([] as string[]).concat(options.cls),
		text: options.text ?? "",
		children: [],
	};
	const create = (child: string, opts?: { cls?: string | string[]; text?: string }) => {
		const c = node(child, opts);
		made.children.push(c);
		return c;
	};
	Object.assign(made, {
		createEl: create,
		createDiv: (opts?: { cls?: string | string[]; text?: string }) => create("div", opts),
		createSpan: (opts?: { cls?: string | string[]; text?: string }) => create("span", opts),
		empty: () => (made.children.length = 0),
		addClass: (cls: string) => made.cls.push(cls),
		setAttribute() {},
		addEventListener() {},
	});
	return made;
}
const all = (n: Node): Node[] => [n, ...n.children.flatMap(all)];

function historyOf(history: HistoryEntry[]) {
	const view = new RollHistoryView({} as never, { settings: { formulas: [], history } } as never);
	const root = node("div");
	(view as unknown as { contentEl: Node }).contentEl = root;
	view.refresh();
	return all(root).filter((n) => n.cls.includes("rollwright-history-item"));
}

describe("crit and fumble in the history (klus 3 and 3b)", () => {
	it("a roll puts extreme and stamp in the history entry, and nothing for a roll in between", async () => {
		const { plugin, dice } = await load();
		await plugin.freshResult(null, "1d20+5", "A.md");
		expect(plugin.settings.history[0]).toMatchObject({ extreme: "max", stamp: "NAT 20" });
		dice.random = lowest;
		await plugin.freshResult(null, "2d6", "A.md");
		expect(plugin.settings.history[0]).toMatchObject({ extreme: "min", stamp: "MIN" });
		dice.random = sequence(9);
		await plugin.freshResult(null, "1d20", "A.md");
		expect(plugin.settings.history[0]?.extreme).toBeUndefined();
		expect(plugin.settings.history[0]?.stamp).toBeUndefined();
	});

	it("the item gets the class and the stamp; an ordinary or older entry gets neither", () => {
		const base = { time: 0, details: "", source: "" };
		const [crit, fumble, plain] = historyOf([
			{ ...base, formula: "1d20+5", result: "25", extreme: "max", stamp: "NAT 20" },
			{ ...base, formula: "2d6", result: "2", extreme: "min", stamp: "MIN" },
			{ ...base, formula: "1d20", result: "9" },
		]);
		expect(crit?.cls).toContain("rollwright-crit");
		expect(crit?.cls).not.toContain("rollwright-fumble");
		expect(all(crit as Node).filter((n) => n.cls.includes("rollwright-stamp")).map((n) => n.text)).toEqual(["NAT 20"]);
		expect(fumble?.cls).toContain("rollwright-fumble");
		expect(all(fumble as Node).filter((n) => n.cls.includes("rollwright-stamp")).map((n) => n.text)).toEqual(["MIN"]);
		expect(plain?.cls).not.toContain("rollwright-crit");
		expect(plain?.cls).not.toContain("rollwright-fumble");
		expect(all(plain as Node).some((n) => n.cls.includes("rollwright-stamp"))).toBe(false);
	});
});

describe("the stamp with names filled in, and other ways to write advantage (controleur, ronde 2)", () => {
	const ctx = (random: RandomInt, aliases: Record<string, string>) => ({ sourcePath: "Here.md", random, aliases, readNote: async () => null, notesWithTag: async () => [] });

	it("1d20 + dex (a note field) and a saved formula save = 1d20+4 say NAT 20 and NAT 1, not MAX and MIN", async () => {
		const { rollSpec } = await import("../src/rollers/run");
		expect(await rollSpec("1d20 + dex", ctx(highest, { dex: "3" }))).toMatchObject({ extreme: "max", stamp: "NAT 20" });
		expect(await rollSpec("1d20 + dex", ctx(lowest, { dex: "3" }))).toMatchObject({ extreme: "min", stamp: "NAT 1" });
		expect(await rollSpec("save", ctx(highest, { save: "1d20+4" }))).toMatchObject({ extreme: "max", stamp: "NAT 20" });
		expect(await rollSpec("save + 1", ctx(lowest, { save: "1d20+4" }))).toMatchObject({ extreme: "min", stamp: "NAT 1" });
		// A name that hides a second die is no natural 20.
		expect(await rollSpec("1d20 + bless", ctx(highest, { bless: "1d4" }))).toMatchObject({ extreme: "max", stamp: "MAX" });
	});

	it("the roll and the history show that stamp for a saved formula", async () => {
		const { plugin } = await load();
		plugin.settings.formulas.push({ name: "save", formula: "4" } as never);
		const span = fakeSpan();
		mountRoll(plugin, span as never, "1d20 + save", "named", "A.md", { register() {} } as never);
		await wait();
		expect(stamps(span)).toEqual(["NAT 20"]);
		await plugin.freshResult(null, "1d20 + save - 4", "A.md");
		expect(plugin.settings.history[0]).toMatchObject({ extreme: "max", stamp: "NAT 20" });
	});

	it("2d20k1 and 2d20dl1 (advantage) and 2d20dh1 (disadvantage) count one d20", () => {
		expect(stampText("2d20k1", "max")).toBe("NAT 20");
		expect(stampText("2d20dl1 + 5", "min")).toBe("NAT 1");
		expect(stampText("2d20dh1", "max")).toBe("NAT 20");
		expect(stampText("2d20dh1-2", "min")).toBe("NAT 1");
		expect(stampText("1d20kh1", "max")).toBe("NAT 20");
		// Not one d20 that counts, or not the face itself.
		expect(stampText("3d20kh1", "max")).toBe("MAX");
		expect(stampText("2d20", "max")).toBe("MAX");
		expect(stampText("1d20*2", "max")).toBe("MAX");
		// 10 - 1d20 is highest when the die shows 1.
		expect(stampText("10 - 1d20", "max")).toBe("NAT 1");
	});
});
