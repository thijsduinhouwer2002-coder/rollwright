import { beforeEach, describe, expect, it, vi } from "vitest";
import RollwrightPlugin, { KEPT_RESULTS_LIMIT } from "../src/main";
import { findInlineDice, formulaFromCode, readDiceCode } from "../src/rollers/inline";
import { rollSpec, type RollContext } from "../src/rollers/run";
import { lookupFormula, parseTable } from "../src/rollers/table";
import { processReadingView } from "../src/ui/reading-view";

function fakeApp() {
	return {
		workspace: {
			on: vi.fn(),
			getLeavesOfType: () => [],
			getActiveViewOfType: () => null,
			onLayoutReady: (callback: () => void) => callback(),
			iterateAllLeaves: () => {},
		},
		metadataCache: { getFirstLinkpathDest: () => null, getFileCache: () => null },
		vault: { configDir: ".obsidian", cachedRead: async () => "", getMarkdownFiles: () => [] },
	};
}

type Stored = { stored: unknown };

/** Loads a plugin; with "from" it starts with what an earlier plugin wrote to disk, like a restart. */
async function load(from?: RollwrightPlugin) {
	const plugin = new (RollwrightPlugin as unknown as new (app: unknown) => RollwrightPlugin)(fakeApp());
	if (from) (plugin as unknown as Stored).stored = (from as unknown as Stored).stored;
	await plugin.onload();
	return plugin;
}

beforeEach(() => {
	vi.stubGlobal("activeDocument", { body: { toggleClass() {}, removeClass() {} } });
});

describe("dice+: keeps a result across a restart", () => {
	it("gives back the same result after a restart", async () => {
		const before = await load();
		const first = await before.firstResult("A.md|0:0|1d1000000", "1d1000000", "A.md", true);
		const after = await load(before);
		expect(after.hasResult("A.md|0:0|1d1000000", true)).toBe(true);
		const again = await after.firstResult("A.md|0:0|1d1000000", "1d1000000", "A.md", true);
		expect(again.text).toBe(first.text);
	});

	it("keeps per note and key", async () => {
		const before = await load();
		await before.firstResult("A.md|0:0|1d6", "1d6", "A.md", true);
		const after = await load(before);
		expect(after.hasResult("B.md|0:0|1d6", true)).toBe(false);
		expect(after.hasResult("A.md|1:0|1d6", true)).toBe(false);
	});

	it("a click rolls again and keeps the new result", async () => {
		const before = await load();
		await before.firstResult("k", "1d1000000", "A.md", true);
		const fresh = await before.freshResult("k", "1d1000000", "A.md", true);
		const after = await load(before);
		expect((await after.firstResult("k", "1d1000000", "A.md", true)).text).toBe(fresh.text);
	});

	it(`keeps at most ${KEPT_RESULTS_LIMIT} results, the oldest go first`, async () => {
		const before = await load();
		for (let i = 0; i <= KEPT_RESULTS_LIMIT; i++) await before.firstResult(`k${i}`, "1", "A.md", true);
		expect(before.settings.keptResults).toHaveLength(KEPT_RESULTS_LIMIT);
		const after = await load(before);
		expect(after.hasResult("k0", true)).toBe(false);
		expect(after.hasResult("k1", true)).toBe(true);
		expect(after.hasResult(`k${KEPT_RESULTS_LIMIT}`, true)).toBe(true);
	});

	it("ignores broken kept data", async () => {
		const plugin = new (RollwrightPlugin as unknown as new (app: unknown) => RollwrightPlugin)(fakeApp());
		const good = { kind: "dice", text: "3", total: 3, formula: "1d6", details: "[3]", flags: {} };
		(plugin as unknown as Stored).stored = {
			keptResults: [["k", null], "x", ["j", { text: "3" }], ["f", { ...good, flags: "x" }], ["n", { ...good, kind: "nope" }], ["g", good]],
		};
		await plugin.onload();
		for (const key of ["k", "j", "f", "n"]) expect(plugin.hasResult(key, true)).toBe(false);
		expect(plugin.hasResult("g", true)).toBe(true);
	});
});

describe("dice: and dice-: never keep", () => {
	it("writes nothing to disk and rolls again after a restart", async () => {
		const before = await load();
		await before.firstResult("k", "1d1000000", "A.md");
		await before.freshResult("k", "1d1000000", "A.md");
		expect(before.settings.keptResults).toEqual([]);
		const after = await load(before);
		expect(after.hasResult("k")).toBe(false);
		expect(after.hasResult("k", false)).toBe(false);
	});

	it("dice-: is read as not kept", () => {
		expect(readDiceCode("dice-: 1d6")).toEqual({ formula: "1d6", keep: false });
		expect(readDiceCode("dice: 1d6")).toEqual({ formula: "1d6", keep: false });
		expect(readDiceCode("dice+: 1d6")).toEqual({ formula: "1d6", keep: true });
	});
});

describe("every place that reads dice: knows the prefixes", () => {
	it("formulaFromCode and findInlineDice read dice+:, dice-: and (since punt 3) dice-mod:", () => {
		expect(formulaFromCode("dice+: 2d6")).toBe("2d6");
		expect(formulaFromCode("DICE-:2d6")).toBe("2d6");
		expect(formulaFromCode("dice-mod: 2d6")).toBe("2d6");
		expect(formulaFromCode("dice+mod: 2d6")).toBeNull();
		const found = findInlineDice("`dice+: 1d6` `dice-: 1d8` `dice-mod: 1d4`");
		expect(found.map((f) => [f.formula, f.keep, f.modify])).toEqual([["1d6", true, false], ["1d8", false, false], ["1d4", false, true]]);
	});

	it("a lookup table header reads dice+: and dice-:, and dice-mod: makes a normal table", () => {
		expect(lookupFormula(parseTable("| dice+: 1d20 | x |\n|---|---|"))).toBe("1d20");
		expect(lookupFormula(parseTable("| `dice-: 1d4` | x |\n|---|---|"))).toBe("1d4");
		expect(lookupFormula(parseTable("| dice-mod: 1d20 | x |\n|---|---|"))).toBeNull();
	});

	it("nested cells roll dice+: and dice-:, and leave dice-mod: as text", async () => {
		const notes: Record<string, string> = {
			T: "| What |\n|---|\n| `dice+: 3` and `dice-: 4` and dice-mod |\n^t\n",
			W: "| Whole |\n|---|\n| dice+: 5 |\n^t\n",
			M: "| What |\n|---|\n| `dice-mod: 6` |\n^t\n",
		};
		const context: RollContext = {
			sourcePath: "A.md",
			defaultSides: 100,
			defaultCount: 1,
			aliases: {},
			readNote: async (link) => (notes[link] === undefined ? null : { path: `${link}.md`, markdown: notes[link] as string }),
			notesWithTag: async () => [],
		};
		expect((await rollSpec("[[T^t]]", context)).text).toBe("3 and 4 and dice-mod");
		expect((await rollSpec("[[W^t]]", context)).text).toBe("5");
		expect((await rollSpec("[[M^t]]", context)).text).toBe("`dice-mod: 6`");
	});
});

describe("dice+: without a known place works as dice:", () => {
	it("keeps nothing when a table cell is drawn five times", async () => {
		const plugin = await load();
		const self: Record<string, unknown> = { empty() {}, addClass() {}, removeClass() {}, setAttribute() {}, addEventListener() {}, setText() {}, createSpan: () => self };
		vi.stubGlobal("activeDocument", { body: { toggleClass() {}, removeClass() {} }, createElement: () => self });
		const ctx = { sourcePath: "A.md", getSectionInfo: () => null, addChild() {} };
		for (let i = 0; i < 5; i++) {
			const code = { textContent: "dice+: 1d6", parentElement: { tagName: "TD" }, replaceWith() {} };
			processReadingView(plugin, { closest: () => null, querySelectorAll: () => [code] } as never, ctx as never);
		}
		await new Promise((resolve) => setTimeout(resolve, 20));
		expect(plugin.settings.keptResults).toEqual([]);
		expect((plugin as unknown as { kept: Map<string, unknown> }).kept.size).toBe(0);
	});
});
