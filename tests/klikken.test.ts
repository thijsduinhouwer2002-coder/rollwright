import { beforeEach, describe, expect, it, vi } from "vitest";
import RollwrightPlugin from "../src/main";
import { mountRoll, NO_SOURCE_NOTICE, SOURCE_GONE_NOTICE } from "../src/ui/widget";
import { notices, rendered, TFile } from "./obsidian-stub";

/** A small element: records listeners, the shown text and how often it was emptied. */
function fakeSpan() {
	const listeners: Record<string, (event: unknown) => void> = {};
	const el = {
		listeners,
		text: "",
		emptied: 0,
		empty: () => {
			el.emptied++;
			el.text = "";
		},
		addClass() {},
		removeClass() {},
		setAttribute() {},
		setText: (text: string) => (el.text = text),
		createSpan: () => el,
		addEventListener: (name: string, listener: (event: unknown) => void) => (listeners[name] = listener),
		closest: () => null,
	};
	return el;
}

const press = (keys: { ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean } = {}) => ({ target: { instanceOf: () => false }, preventDefault() {}, stopPropagation() {}, ...keys });
const wait = () => new Promise((resolve) => setTimeout(resolve, 20));

function fakeApp(files: Record<string, { text: string; tags?: string[] }>) {
	const tfiles = Object.keys(files).map((path) => new TFile(path));
	/** Each opened note as [path, pane], so a test sees what opens and where. */
	const opened: [string, unknown][] = [];
	const openLinkText = vi.fn(async () => {});
	const getLeaf = (pane: unknown) => ({ openFile: async (file: TFile) => void opened.push([file.path, pane]) });
	return {
		opened,
		openLinkText,
		workspace: { on: vi.fn(), getLeavesOfType: () => [], getActiveViewOfType: () => null, onLayoutReady: (callback: () => void) => callback(), iterateAllLeaves: () => {}, openLinkText, getLeaf },
		metadataCache: {
			getFirstLinkpathDest: (link: string) => tfiles.find((f) => f.path === `${link}.md`) ?? null,
			getFileCache: (file: TFile) => ({ tags: files[file.path]?.tags }),
		},
		vault: {
			configDir: ".obsidian",
			cachedRead: async (file: TFile) => files[file.path]?.text ?? "",
			getMarkdownFiles: () => tfiles,
			getAbstractFileByPath: (path: string) => tfiles.find((f) => f.path === path) ?? null,
		},
	};
}

const FILES = {
	"Lore/Sec.md": { text: "# Kop\n\nEen alinea\n" },
	"Lore/Tab.md": { text: "| Item |\n|---|\n| Zwaard |\n^t\n" },
	"Lijst.md": { text: "- een\n- twee\n^l\n" },
	"Npc1.md": { text: "Alice", tags: ["#npc"] },
	"Npc2.md": { text: "Bob", tags: ["#npc"] },
};

async function load() {
	const app = fakeApp(FILES);
	const plugin = new (RollwrightPlugin as unknown as new (app: unknown) => RollwrightPlugin)(app);
	await plugin.onload();
	const fresh = vi.spyOn(plugin, "freshResult");
	return { plugin, app, fresh };
}

function mount(plugin: RollwrightPlugin, formula: string, key = "k", keep = false, modify?: () => void) {
	const span = fakeSpan();
	mountRoll(plugin, span as never, formula, key, "A.md", { register() {} } as never, keep, modify);
	return span;
}

beforeEach(() => {
	notices.length = 0;
	rendered.length = 0;
	vi.stubGlobal("Element", class {});
	vi.stubGlobal("activeDocument", { body: { toggleClass() {}, removeClass() {} } });
});

describe("Ctrl- or Cmd-click opens the source note and rolls nothing", () => {
	it.each([
		["[[Lore/Sec]]", "Lore/Sec.md"],
		["[[Lore/Tab^t]]", "Lore/Tab.md"],
		["[[Lijst^l]]", "Lijst.md"],
		["[[Lore/Sec]]|line", "Lore/Sec.md"],
	])("Ctrl on %s opens %s in a new tab", async (formula, source) => {
		const { plugin, app, fresh } = await load();
		const span = mount(plugin, formula);
		await wait();
		span.listeners.click?.(press({ ctrlKey: true }));
		await wait();
		expect(app.opened).toEqual([[source, "tab"]]);
		expect(fresh).not.toHaveBeenCalled();
		expect(plugin.settings.history).toHaveLength(0);
	});

	it("Cmd (meta) does the same", async () => {
		const { plugin, app, fresh } = await load();
		const span = mount(plugin, "[[Lore/Tab^t]]");
		await wait();
		span.listeners.click?.(press({ metaKey: true }));
		await wait();
		expect(app.opened).toEqual([["Lore/Tab.md", "tab"]]);
		expect(fresh).not.toHaveBeenCalled();
	});

	it("a tag with one drawn note opens that note; with more notes only a notice", async () => {
		const { plugin, app } = await load();
		const one = mount(plugin, "#npc|-", "k1");
		const link = mount(plugin, "#npc|link", "k2");
		const many = mount(plugin, "#npc", "k3");
		await wait();
		one.listeners.click?.(press({ ctrlKey: true }));
		link.listeners.click?.(press({ ctrlKey: true }));
		await wait();
		const opened = app.opened.map(([path]) => path);
		expect(opened).toHaveLength(2);
		for (const path of opened) expect(["Npc1.md", "Npc2.md"]).toContain(path);
		many.listeners.click?.(press({ ctrlKey: true }));
		await wait();
		expect(app.opened).toHaveLength(2);
		expect(notices).toContain(NO_SOURCE_NOTICE);
	});

	it("on a dice roll, Ctrl-click rolls as a plain click does", async () => {
		const { plugin, app, fresh } = await load();
		const span = mount(plugin, "1d1000000");
		await wait();
		span.listeners.click?.(press({ ctrlKey: true }));
		await wait();
		expect(fresh).toHaveBeenCalledTimes(1);
		expect(app.opened).toEqual([]);
	});

	it("on dice-mod a section opens its source; dice still open the replace window", async () => {
		const { plugin, app } = await load();
		const modify = vi.fn();
		const section = mount(plugin, "[[Lore/Sec]]", "k1", false, modify);
		const dice = mount(plugin, "1d6", "k2", false, modify);
		await wait();
		section.listeners.click?.(press({ ctrlKey: true }));
		dice.listeners.click?.(press({ ctrlKey: true }));
		dice.listeners.click?.(press({ altKey: true }));
		await wait();
		expect(app.opened).toEqual([["Lore/Sec.md", "tab"]]);
		expect(modify).toHaveBeenCalledTimes(2);
		expect(modify.mock.calls.every((call) => (call[0] as { kind: string }).kind === "dice")).toBe(true);
	});
});

describe("Alt-click shows the average", () => {
	it("on dice: the average as |avg, remembered, not in the history", async () => {
		const { plugin, fresh } = await load();
		const span = mount(plugin, "2d6");
		await wait();
		span.listeners.click?.(press({ altKey: true }));
		await wait();
		expect(span.text).toBe("7");
		expect(fresh).not.toHaveBeenCalled();
		expect(plugin.settings.history).toHaveLength(0);
		const again = await plugin.firstResult("k", "2d6", "A.md");
		expect(again.average).toBe(true);
		expect(again.total).toBe(7);
	});

	it("an estimate gets ~", async () => {
		const { plugin } = await load();
		const span = mount(plugin, "1d6!");
		await wait();
		span.listeners.click?.(press({ altKey: true }));
		await wait();
		expect(span.text.startsWith("~")).toBe(true);
	});

	it("on a section: a plain new roll, into the history", async () => {
		const { plugin } = await load();
		const span = mount(plugin, "[[Lijst^l]]");
		await wait();
		span.listeners.click?.(press({ altKey: true }));
		await wait();
		expect(plugin.settings.history).toHaveLength(1);
	});
});

describe("Ctrl-click on |none makes it empty again and forgets", () => {
	it("forgets the result in memory", async () => {
		const { plugin, app } = await load();
		const span = mount(plugin, "1d6|none");
		await wait();
		expect(span.text).toBe("");
		span.listeners.click?.({ ...press() });
		await wait();
		expect(span.text).not.toBe("");
		expect(plugin.hasResult("k")).toBe(true);
		span.listeners.click?.(press({ ctrlKey: true }));
		await wait();
		expect(span.text).toBe("");
		expect(plugin.hasResult("k")).toBe(false);
		expect(app.opened).toEqual([]);
		// Drawn again, it stays empty.
		const redrawn = mount(plugin, "1d6|none");
		await wait();
		expect(redrawn.text).toBe("");
	});

	it("also forgets the kept result of dice+:, on disk", async () => {
		const { plugin } = await load();
		const span = mount(plugin, "1d6|none", "k", true);
		await wait();
		span.listeners.click?.(press());
		await wait();
		expect(plugin.hasResult("k", true)).toBe(true);
		expect(plugin.settings.keptResults.some(([key]) => key === "k")).toBe(true);
		span.listeners.click?.(press({ metaKey: true }));
		await wait();
		expect(plugin.hasResult("k", true)).toBe(false);
		expect(plugin.settings.keptResults.some(([key]) => key === "k")).toBe(false);
	});

	it("a section with |none is emptied, not opened", async () => {
		const { plugin, app } = await load();
		const span = mount(plugin, "[[Lore/Sec]]|none");
		await wait();
		span.listeners.click?.(press());
		await wait();
		span.listeners.click?.(press({ ctrlKey: true }));
		await wait();
		expect(app.opened).toEqual([]);
		expect(plugin.hasResult("k")).toBe(false);
	});
});

describe("plain click and Enter are unchanged", () => {
	it("a plain click rolls again and goes into the history", async () => {
		const { plugin, app, fresh } = await load();
		const span = mount(plugin, "[[Lore/Sec]]");
		const dice = mount(plugin, "1d6", "k2");
		await wait();
		span.listeners.click?.(press());
		dice.listeners.click?.(press());
		dice.listeners.keydown?.({ key: "Enter", ctrlKey: true, preventDefault() {} });
		await wait();
		expect(fresh).toHaveBeenCalledTimes(3);
		expect(app.opened).toEqual([]);
		expect(plugin.settings.history).toHaveLength(3);
	});
});

describe("after the keuring", () => {
	it("a kept result whose source note is gone opens nothing and makes no new note", async () => {
		const { plugin, app } = await load();
		const flags = { nodice: false, form: false, avg: false, none: false };
		(plugin as unknown as { kept: Map<string, unknown> }).kept.set("k", { kind: "section", text: "Oud", details: "", formula: "[[Weg]]", flags, source: "Weg.md" });
		const span = mount(plugin, "[[Weg]]", "k", true);
		await wait();
		span.listeners.click?.(press({ ctrlKey: true }));
		await wait();
		expect(app.opened).toEqual([]);
		expect(app.openLinkText).not.toHaveBeenCalled();
		expect(notices).toContain(SOURCE_GONE_NOTICE);
	});

	it("two plugins do not share history or formulas", async () => {
		const first = await load();
		await first.plugin.freshResult("k", "1d6", "A.md");
		first.plugin.settings.formulas.push({ name: "x", formula: "1d6" });
		const second = await load();
		expect(second.plugin.settings.history).toEqual([]);
		expect(second.plugin.settings.formulas).toEqual([]);
		expect(second.plugin.settings.keptResults).toEqual([]);
	});
});
