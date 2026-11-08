import { beforeEach, describe, expect, it, vi } from "vitest";
import RollwrightPlugin, { type HistoryEntry } from "../src/main";
import { HISTORY_VIEW, RollHistoryView } from "../src/ui/history-view";
import { notices } from "./obsidian-stub";

// Klus 5 en 5b (Daan): het paneel heet "Roll log", worpen staan onder een kopje per notitie en dag,
// een worp uit het paneel zelf komt ook in het logboek, en de link toont de notitienaam zonder .md.

interface Node {
	tag: string;
	cls: string[];
	text: string;
	attrs: Record<string, string>;
	listeners: Record<string, (event: { preventDefault: () => void }) => void>;
	children: Node[];
	value: string;
}
function node(tag: string, options: { cls?: string | string[]; text?: string } = {}): Node {
	const made: Node = { tag, cls: options.cls === undefined ? [] : ([] as string[]).concat(options.cls), text: options.text ?? "", attrs: {}, listeners: {}, children: [], value: "" };
	const create = (childTag: string, opts?: { cls?: string | string[]; text?: string }) => {
		const c = node(childTag, opts);
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
		addEventListener: (name: string, listener: Node["listeners"][string]) => (made.listeners[name] = listener),
	});
	return made;
}
const all = (n: Node): Node[] => [n, ...n.children.flatMap(all)];
const withClass = (n: Node, cls: string) => all(n).filter((c) => c.cls.includes(cls));

function viewFor(plugin: unknown, activeFile: { path: string; extension: string } | null = null) {
	const view = new RollHistoryView({} as never, plugin as never);
	const root = node("div");
	Object.assign(view, { contentEl: root, app: { workspace: { getActiveFile: () => activeFile, openLinkText: vi.fn() } } });
	view.refresh();
	return { view, root };
}

const entry = (source: string, time: number, result = "7"): HistoryEntry => ({ time, source, result, formula: "1d20", details: "" });

describe("the roll log panel", () => {
	beforeEach(() => {
		notices.length = 0;
	});

	it("is called Roll log and its button Clear log", () => {
		const { view, root } = viewFor({ settings: { formulas: [], history: [entry("A.md", 1)] } });
		expect(view.getDisplayText()).toBe("Roll log");
		expect(view.getViewType()).toBe(HISTORY_VIEW);
		expect(HISTORY_VIEW).toBe("rollwright-history");
		expect(withClass(root, "rollwright-history-clear")[0]?.text).toBe("Clear log");
	});

	it("puts items under a heading per note, newest group first, with the item classes as before", () => {
		const day = new Date(2026, 10, 7, 21, 40).getTime();
		const history = [entry("Camp/The Rusty Flagon.md", day + 120_000, "9"), entry("Camp/The Rusty Flagon.md", day, "3"), entry("", day - 60_000, "5")];
		const { root } = viewFor({ settings: { formulas: [], history } });
		const groups = withClass(root, "rollwright-history-group");
		expect(groups).toHaveLength(2);
		const titles = groups.map((g) => withClass(g, "rollwright-history-group-title")[0]);
		expect(titles[0]?.text).toMatch(/^The Rusty Flagon · /);
		expect(titles[0]?.text).not.toContain(".md");
		expect(titles[0]?.attrs.title).toBe("Camp/The Rusty Flagon.md");
		expect(titles[1]?.text).toMatch(/^Other rolls · /);
		expect(groups.map((g) => withClass(g, "rollwright-history-item").length)).toEqual([2, 1]);
		const items = withClass(root, "rollwright-history-item");
		expect(items.map((i) => withClass(i, "rollwright-history-result")[0]?.text)).toEqual(["9", "3", "5"]);
		// Only the newest roll gets the big d20.
		expect(items.map((i) => i.cls.includes("rollwright-history-latest"))).toEqual([true, false, false]);
	});

	it("makes the heading the link to the note and keeps the card free of name and seconds (klus 9c)", () => {
		const time = new Date(2026, 10, 8, 3, 44, 38).getTime();
		const { view, root } = viewFor({ settings: { formulas: [], history: [entry("Camp/The Rusty Flagon.md", time)] } });
		const [title] = withClass(root, "rollwright-history-group-title");
		expect(title?.cls).toContain("rollwright-history-note");
		expect(title?.attrs.role).toBe("link");
		expect(title?.attrs.title).toBe("Camp/The Rusty Flagon.md");
		title?.listeners.click?.({ preventDefault: () => {} });
		const open = (view as unknown as { app: { workspace: { openLinkText: ReturnType<typeof vi.fn> } } }).app.workspace.openLinkText;
		expect(open).toHaveBeenCalledWith("Camp/The Rusty Flagon.md", "");
		const [meta] = withClass(root, "rollwright-history-meta");
		expect(all(meta!).some((n) => n.text.includes("Rusty Flagon"))).toBe(false);
		const [shown] = withClass(root, "rollwright-history-time");
		expect(shown?.text).not.toContain("38");
		expect(shown?.text).toMatch(/44/);
	});

	it("gives a heading without a note no link", () => {
		const { root } = viewFor({ settings: { formulas: [], history: [entry("", 1)] } });
		const [title] = withClass(root, "rollwright-history-group-title");
		expect(title?.cls).not.toContain("rollwright-history-note");
		expect(title?.attrs.role).toBeUndefined();
	});

	it("marks results that are no number as text (klus 9a)", () => {
		const history = [entry("A.md", 5, "17"), entry("A.md", 4, "A dwarf counting her coins twice"), entry("A.md", 3, "-2"), entry("A.md", 2, "4, 6, 1"), entry("A.md", 1, "3.5")];
		const { root } = viewFor({ settings: { formulas: [], history } });
		const items = withClass(root, "rollwright-history-item");
		expect(items.map((i) => i.cls.includes("rollwright-history-text"))).toEqual([false, true, false, true, false]);
	});
});

function fakeApp(activeFile: { path: string; extension: string } | null) {
	const views: RollHistoryView[] = [];
	return {
		views,
		workspace: {
			on: vi.fn(),
			getLeavesOfType: (type: string) => (type === HISTORY_VIEW ? views.map((view) => ({ view })) : []),
			getActiveViewOfType: () => null,
			getActiveFile: () => activeFile,
			onLayoutReady: (callback: () => void) => callback(),
			iterateAllLeaves: () => {},
		},
		metadataCache: { getFirstLinkpathDest: () => null, getFileCache: () => ({}) },
		vault: { configDir: ".obsidian", adapter: { exists: vi.fn(async () => false) }, cachedRead: async () => "", getMarkdownFiles: () => [] },
	};
}

async function realPanel(activeFile: { path: string; extension: string } | null) {
	vi.stubGlobal("activeDocument", { body: { toggleClass: () => {}, removeClass: () => {} } });
	const app = fakeApp(activeFile);
	const plugin = new (RollwrightPlugin as unknown as new (app: unknown) => RollwrightPlugin)(app);
	await plugin.onload();
	const view = new RollHistoryView({} as never, plugin);
	const root = node("div");
	Object.assign(view, { contentEl: root, app });
	app.views.push(view);
	view.refresh();
	return { plugin, root };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("a roll from the panel itself", () => {
	beforeEach(() => {
		notices.length = 0;
	});

	it("freshResult with key null puts the roll in the log", async () => {
		const { plugin } = await realPanel(null);
		await plugin.freshResult(null, "3", "A.md");
		expect(plugin.settings.history[0]).toMatchObject({ formula: "3", result: "3", source: "A.md" });
	});

	it("a formula typed in the panel lands in the log, in the panel, and as a notice; the note open last is the source", async () => {
		const { plugin, root } = await realPanel({ path: "Camp/The Rusty Flagon.md", extension: "md" });
		const form = all(root).find((n) => n.tag === "form") as Node;
		const input = all(form).find((n) => n.tag === "input") as Node;
		input.value = " 4 ";
		form.listeners.submit?.({ preventDefault: () => {} });
		await settle();
		expect(plugin.settings.history).toHaveLength(1);
		expect(plugin.settings.history[0]).toMatchObject({ formula: "4", result: "4", source: "Camp/The Rusty Flagon.md" });
		expect(notices).toContain("4: 4");
		// The panel redrew itself: the roll is an item under the heading of its note.
		const titles = withClass(root, "rollwright-history-group-title").map((t) => t.text);
		expect(titles[0]).toMatch(/^The Rusty Flagon · /);
		expect(withClass(root, "rollwright-history-item").map((i) => withClass(i, "rollwright-history-result")[0]?.text)).toEqual(["4"]);
	});

	it("a saved formula button and Roll again also land in the log; without a note the source is empty", async () => {
		const { plugin, root } = await realPanel(null);
		plugin.settings.formulas = [{ name: "Six", formula: "6" }];
		// A first roll redraws the panel, now with the saved formula button and a Roll again button.
		await plugin.freshResult(null, "2", "");
		const saved = withClass(root, "rollwright-history-saved")[0] as Node;
		saved.children[0]?.listeners.click?.({ preventDefault: () => {} });
		await settle();
		expect(plugin.settings.history[0]).toMatchObject({ formula: "6", result: "6", source: "" });
		const again = all(root).find((n) => n.attrs["aria-label"] === "Roll again") as Node;
		again.listeners.click?.({ preventDefault: () => {} });
		await settle();
		expect(plugin.settings.history.map((h) => h.formula)).toEqual(["6", "6", "2"]);
		expect(withClass(root, "rollwright-history-group-title")[0]?.text).toMatch(/^Other rolls · /);
	});

	it("ignores a non-markdown file as source", async () => {
		const { plugin, root } = await realPanel({ path: "map.png", extension: "png" });
		const form = all(root).find((n) => n.tag === "form") as Node;
		(all(form).find((n) => n.tag === "input") as Node).value = "1";
		form.listeners.submit?.({ preventDefault: () => {} });
		await settle();
		expect(plugin.settings.history[0]?.source).toBe("");
	});
});
