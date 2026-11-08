import { beforeEach, describe, expect, it, vi } from "vitest";
import RollwrightPlugin, { type HistoryEntry } from "../src/main";
import { historyLabel } from "../src/ui/history-label";
import { RollHistoryView } from "../src/ui/history-view";
import { mountRoll } from "../src/ui/widget";

// Klus 11 van Daan (beoordeling 9 in ontwerp.md): rustiger logboek, "Roll again" in de eigen notitie,
// en de verborgen komma tussen uitkomst en stempel ook in de worp in de tekst.

interface Node {
	cls: string[];
	text: string;
	children: Node[];
	listeners: Record<string, () => void>;
	attrs: Record<string, string>;
}
function node(options: { cls?: string | string[]; text?: string } = {}): Node {
	const made: Node = { cls: options.cls === undefined ? [] : ([] as string[]).concat(options.cls), text: options.text ?? "", children: [], listeners: {}, attrs: {} };
	const create = (_tag: string, opts?: { cls?: string | string[]; text?: string }) => {
		const c = node(opts);
		made.children.push(c);
		return c;
	};
	Object.assign(made, {
		createEl: create,
		createDiv: (opts?: { cls?: string | string[]; text?: string }) => create("div", opts),
		createSpan: (opts?: { cls?: string | string[]; text?: string }) => create("span", opts),
		empty: () => (made.children.length = 0),
		addClass: (cls: string) => made.cls.push(cls),
		setAttribute: (name: string, value: string) => (made.attrs[name] = value),
		addEventListener: (name: string, listener: () => void) => (made.listeners[name] = listener),
	});
	return made;
}
const all = (n: Node): Node[] => [n, ...n.children.flatMap(all)];
const textsOf = (item: Node, cls: string) => all(item).filter((n) => n.cls.includes(cls)).map((n) => n.text);

function viewWith(history: HistoryEntry[], options: { files?: string[]; open?: string } = {}) {
	const calls: { formula: string; source: string }[] = [];
	const plugin = {
		settings: { formulas: [], history },
		currentNotePath: () => options.open ?? "",
		freshResult: async (_key: null, formula: string, source: string) => {
			calls.push({ formula, source });
			return { text: "3" };
		},
	};
	const view = new RollHistoryView({} as never, plugin as never);
	const files = new Set(options.files ?? []);
	(view as unknown as { app: unknown }).app = { vault: { getFileByPath: (path: string) => (files.has(path) ? { path } : null) }, workspace: {} };
	const root = node();
	(view as unknown as { contentEl: Node }).contentEl = root;
	view.refresh();
	const items = all(root).filter((n) => n.cls.includes("rollwright-history-item"));
	return { items, calls };
}
const entry = (fields: Partial<HistoryEntry>): HistoryEntry => ({ time: 0, formula: "1d6", result: "3", details: "", source: "", ...fields });
const rollAgain = (item: Node) => all(item).find((n) => n.attrs["aria-label"] === "Roll again")?.listeners.click?.();
const wait = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("klus 11: the log says a fixed value once", () => {
	it("dice: 7 shows 7 once, no formula and no working that repeat it", () => {
		const { items } = viewWith([entry({ formula: "7", result: "7", details: "7" })]);
		expect(textsOf(items[0] as Node, "rollwright-history-result")).toEqual(["7"]);
		expect(textsOf(items[0] as Node, "rollwright-history-formula")).toEqual([]);
		expect(textsOf(items[0] as Node, "rollwright-history-details")).toEqual([]);
	});

	it("a real roll keeps its formula and working", () => {
		const { items } = viewWith([entry({ formula: "1d20+4", result: "14", details: "[10] + 4" })]);
		expect(textsOf(items[0] as Node, "rollwright-history-formula")).toEqual(["1d20+4"]);
		expect(textsOf(items[0] as Node, "rollwright-history-details")).toEqual(["[10] + 4"]);
	});

	it("a working equal to the formula is shown once", () => {
		const { items } = viewWith([entry({ formula: "2 + 3", result: "5", details: "2 + 3" })]);
		expect(textsOf(items[0] as Node, "rollwright-history-formula")).toEqual(["2 + 3"]);
		expect(textsOf(items[0] as Node, "rollwright-history-details")).toEqual([]);
	});
});

describe("klus 11: a table result shows the table, not the code", () => {
	it("a formula saved with its prefix shows without it", () => {
		expect(historyLabel("dice: [[Herberg^tabel]]").formula).toBe("Herberg, tabel");
		expect(historyLabel("dice+: 1d20 + 4|text(Perception)")).toEqual({ name: "Perception", formula: "1d20 + 4" });
		expect(historyLabel("dice-mod: 2d6").formula).toBe("2d6");
	});

	it("only the prefix goes; text that is no link stays as written", () => {
		expect(historyLabel("dice: [[Herberg]]^tabel").formula).toBe("[[Herberg]]^tabel");
		expect(historyLabel("dicey: 1d6").formula).toBe("dicey: 1d6");
	});
});

describe("klus 11: Roll again rolls in the note the roll came from", () => {
	it("uses entry.source while that note exists", async () => {
		const { items, calls } = viewWith([entry({ formula: "1d20 + str", source: "Heroes/Ayla.md" })], { files: ["Heroes/Ayla.md"], open: "Other.md" });
		rollAgain(items[0] as Node);
		await wait();
		expect(calls).toEqual([{ formula: "1d20 + str", source: "Heroes/Ayla.md" }]);
	});

	it("falls back to the open note when that note is gone", async () => {
		const { items, calls } = viewWith([entry({ formula: "1d6", source: "Gone.md" })], { open: "Other.md" });
		rollAgain(items[0] as Node);
		await wait();
		expect(calls).toEqual([{ formula: "1d6", source: "Other.md" }]);
	});
});

describe("klus 11 (kan, controleur): hidden comma in the roll in the text", () => {
	beforeEach(() => {
		vi.stubGlobal("Element", class {});
		vi.stubGlobal("activeDocument", { body: { toggleClass() {}, removeClass() {} } });
	});

	it("a crit reads '20, NAT 20' for a screen reader: hidden comma right before the stamp", async () => {
		const app = {
			workspace: { on: vi.fn(), getLeavesOfType: () => [], getActiveViewOfType: () => null, onLayoutReady: (callback: () => void) => callback(), iterateAllLeaves: () => {} },
			metadataCache: { getFirstLinkpathDest: () => null, getFileCache: () => ({}) },
			vault: { configDir: ".obsidian", cachedRead: async () => "", getMarkdownFiles: () => [], getAbstractFileByPath: () => null },
		};
		const plugin = new (RollwrightPlugin as unknown as new (app: unknown) => RollwrightPlugin)(app);
		(plugin as unknown as { stored: unknown }).stored = null;
		await plugin.onload();
		const original = plugin.rollContext.bind(plugin);
		plugin.rollContext = (sourcePath) => ({ ...original(sourcePath), random: (_min, max) => max });
		const spans: { cls?: string; text?: string }[] = [];
		const el = {
			empty: () => (spans.length = 0),
			addClass() {},
			removeClass() {},
			setAttribute() {},
			setText() {},
			createSpan: (options?: { cls?: string; text?: string }) => {
				spans.push(options ?? {});
				return el;
			},
			addEventListener() {},
			closest: () => null,
		};
		mountRoll(plugin, el as never, "1d20", "k", "A.md", { register() {} } as never);
		await new Promise((resolve) => setTimeout(resolve, 20));
		const at = spans.findIndex((s) => s.cls === "rollwright-stamp");
		expect(spans[at]?.text).toBe("NAT 20");
		expect(spans[at - 1]).toEqual({ cls: "rollwright-sep", text: ", " });
	});
});
