import { describe, expect, it, vi } from "vitest";
import type { TFile as ObsidianFile } from "obsidian";
import { MarkdownView, TFile, WorkspaceWindow } from "./obsidian-stub";
import { DEFAULT_SETTINGS } from "../src/plugin-data";
import { cssClassList, noteHasRoll, noteWorldMode, NoteWorld, visibleMarkdown, wantsWorld, WORLD_CLASS } from "../src/ui/note-world";

// Bouwplan notitiesfeer, eis 9: wanneer een notitie een worp heeft, en wie de wereld krijgt.

describe("noteHasRoll: a roll the reader can see", () => {
	it.each([
		["Attack `dice: 1d20+5` now", true],
		["`dice+: 2d6`", true],
		["`dice-: 1d4`", true],
		["`dice-mod: 3d6`", true],
		["`DICE: 1d6`", true],
		["> [!note]\n> Loot `dice: [[Loot]]`", true],
		["| a | `dice: 1d8` |", true],
		["No rolls here, only `code`.", false],
		["``dice: 1d6``", false],
		["", false],
	])("%j gives %s", (text, expected) => {
		expect(noteHasRoll(text)).toBe(expected);
	});

	it("not in frontmatter", () => {
		expect(noteHasRoll("---\nnote: \"`dice: 1d6`\"\n---\nBody")).toBe(false);
		expect(noteHasRoll("---\na: 1\n---\nBody `dice: 1d6`")).toBe(true);
	});

	it("an unclosed frontmatter is just text", () => {
		expect(noteHasRoll("---\nBody `dice: 1d6`")).toBe(true);
	});

	it("not in fenced code with ``` or ~~~, also longer fences and inside a quote", () => {
		expect(noteHasRoll("```\n`dice: 1d6`\n```")).toBe(false);
		expect(noteHasRoll("~~~md\n`dice: 1d6`\n~~~")).toBe(false);
		expect(noteHasRoll("````\n```\n`dice: 1d6`\n```\n````")).toBe(false);
		expect(noteHasRoll("> ```\n> `dice: 1d6`\n> ```")).toBe(false);
		expect(noteHasRoll("```\ncode\n```\nAfter `dice: 1d6`")).toBe(true);
		expect(noteHasRoll("~~~\n```\n`dice: 1d6`")).toBe(false);
	});

	it("not in %% %% or HTML comments, also over lines and unclosed", () => {
		expect(noteHasRoll("%% `dice: 1d6` %%")).toBe(false);
		expect(noteHasRoll("%%\n`dice: 1d6`\n%%\n")).toBe(false);
		expect(noteHasRoll("<!-- `dice: 1d6` -->")).toBe(false);
		expect(noteHasRoll("<!--\n`dice: 1d6`")).toBe(false);
		expect(noteHasRoll("%% hidden %% and `dice: 1d6`")).toBe(true);
	});

	it("%% or <!-- inside a code span opens no comment (controleur)", () => {
		expect(noteHasRoll("Use `%%` for comments\n\n`dice: 1d20`")).toBe(true);
		expect(noteHasRoll("Type `<!--` here\n\n`dice: 1d20`")).toBe(true);
		expect(noteHasRoll("`%%` and %% `dice: 1d20` %%")).toBe(false);
	});

	it("a fence inside a list item, indented, also hides its rolls", () => {
		expect(noteHasRoll("- item\n    ```\n    `dice: 1d6`\n    ```")).toBe(false);
	});

	it("keeps the number of lines, so nothing shifts", () => {
		const text = "---\na: 1\n---\n```\nx\n```\n%%\ny\n%%\nz";
		expect(visibleMarkdown(text).split("\n")).toHaveLength(text.split("\n").length);
	});

	it("Windows line ends work the same", () => {
		expect(noteHasRoll("---\r\na: 1\r\n---\r\n`dice: 1d6`\r\n")).toBe(true);
		expect(noteHasRoll("```\r\n`dice: 1d6`\r\n```\r\n")).toBe(false);
	});
});

describe("wantsWorld: who gets the world", () => {
	const ask = (paidSkin: boolean, mode: "rolls" | "all" | "off", cssclasses: string[], roll: boolean) => wantsWorld({ paidSkin, mode, cssclasses, hasRoll: () => roll });

	it("without a paid skin never, not even with rollwright-world", () => {
		expect(ask(false, "all", ["rollwright-world"], true)).toBe(false);
	});

	it("Notes with rolls: only with a roll", () => {
		expect(ask(true, "rolls", [], true)).toBe(true);
		expect(ask(true, "rolls", [], false)).toBe(false);
	});

	it("All notes and Off", () => {
		expect(ask(true, "all", [], false)).toBe(true);
		expect(ask(true, "off", [], true)).toBe(false);
	});

	it("rollwright-plain wins over everything, rollwright-world turns it on at Off and without a roll", () => {
		expect(ask(true, "all", ["rollwright-plain", "rollwright-world"], true)).toBe(false);
		expect(ask(true, "off", ["rollwright-world"], false)).toBe(true);
		expect(ask(true, "rolls", ["rollwright-world"], false)).toBe(true);
	});

	it("reads the note only when the answer depends on it", () => {
		const hasRoll = vi.fn(() => true);
		wantsWorld({ paidSkin: true, mode: "all", cssclasses: [], hasRoll });
		wantsWorld({ paidSkin: false, mode: "rolls", cssclasses: [], hasRoll });
		expect(hasRoll).not.toHaveBeenCalled();
	});
});

describe("settings values", () => {
	it("cssclasses as a list or as one text", () => {
		expect(cssClassList(["wide", " rollwright-plain "])).toEqual(["wide", "rollwright-plain"]);
		expect(cssClassList("wide rollwright-world")).toEqual(["wide", "rollwright-world"]);
		expect(cssClassList("a,b")).toEqual(["a", "b"]);
		expect(cssClassList(undefined)).toEqual([]);
		expect(cssClassList(3)).toEqual([]);
	});

	it("the default is Notes with rolls; an unknown stored value counts as that", () => {
		expect(DEFAULT_SETTINGS.noteWorld).toBe("rolls");
		expect(noteWorldMode("all")).toBe("all");
		expect(noteWorldMode("off")).toBe("off");
		expect(noteWorldMode("everything")).toBe("rolls");
		expect(noteWorldMode(undefined)).toBe("rolls");
	});
});

/** An element that only knows its classes. */
function fakeEl() {
	const classes = new Set<string>();
	return {
		classes,
		addClass: (name: string) => classes.add(name),
		removeClass: (name: string) => classes.delete(name),
	};
}

/** Like Obsidian: a pop-out leaf has its own root (not a WorkspaceWindow); its container is the window. */
function noteLeaf(path: string, root: unknown, container: unknown = root) {
	const file = Object.assign(new TFile(path), { stat: { mtime: 1 } });
	const view = Object.assign(Object.create(MarkdownView.prototype) as object, { file, containerEl: fakeEl() }) as { file: TFile & { stat: { mtime: number } }; containerEl: ReturnType<typeof fakeEl> };
	return { view, getRoot: () => root, getContainer: () => container };
}

function setup(texts: Record<string, string>, options: { skin?: string; licensed?: boolean; mode?: string; cssclasses?: Record<string, unknown>; cssclass?: Record<string, unknown> } = {}) {
	const leftSplit = {};
	const rightSplit = {};
	const rootSplit = {};
	const leaves = [noteLeaf("Roll.md", rootSplit), noteLeaf("Plain.md", rootSplit), noteLeaf("Side.md", rightSplit, rootSplit), noteLeaf("Popout.md", {}, new WorkspaceWindow()), noteLeaf("Hover.md", {}, {})];
	texts = { "Side.md": "`dice: 1d6`", "Popout.md": "`dice: 1d6`", "Hover.md": "`dice: 1d6`", ...texts };
	const read = vi.fn(async (file: ObsidianFile) => texts[file.path] ?? "");
	const plugin = {
		settings: { ...DEFAULT_SETTINGS, skin: options.skin ?? "parchment", noteWorld: options.mode ?? "rolls" },
		isLicensed: options.licensed ?? true,
		app: {
			workspace: { leftSplit, rightSplit, rootSplit, iterateAllLeaves: (callback: (leaf: unknown) => void) => leaves.forEach(callback) },
			metadataCache: { getFileCache: (file: ObsidianFile) => ({ frontmatter: { cssclasses: options.cssclasses?.[file.path], cssclass: options.cssclass?.[file.path] } }) },
			vault: { cachedRead: read },
		},
	};
	const world = new NoteWorld(plugin as never);
	const has = (index: number) => leaves[index]!.view.containerEl.classes.has(WORLD_CLASS);
	const settle = async () => {
		world.refresh();
		await vi.waitFor(() => expect(read).toHaveBeenCalled());
		await new Promise((resolve) => setTimeout(resolve, 0));
	};
	return { world, plugin, leaves, has, read, settle };
}

describe("NoteWorld: the class on the open notes", () => {
	it("Notes with rolls: the note with a roll and the pop-out window, not the plain note, the sidebar or a leaf of another plugin", async () => {
		const { has, settle } = setup({ "Roll.md": "Hit `dice: 1d20`", "Plain.md": "Just text" });
		await settle();
		expect([has(0), has(1), has(2), has(3), has(4)]).toEqual([true, false, false, true, false]);
	});

	it("Classic or no key: nowhere", async () => {
		for (const options of [{ skin: "classic" }, { licensed: false }]) {
			const { world, has } = setup({ "Roll.md": "`dice: 1d20`" }, options);
			world.refresh();
			await new Promise((resolve) => setTimeout(resolve, 0));
			expect([has(0), has(1), has(2), has(3)]).toEqual([false, false, false, false]);
		}
	});

	it("All notes, Off and cssclasses", async () => {
		const all = setup({ "Roll.md": "`dice: 1d20`" }, { mode: "all", cssclasses: { "Roll.md": ["rollwright-plain"] } });
		all.world.refresh();
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect([all.has(0), all.has(1), all.has(2)]).toEqual([false, true, false]);

		const off = setup({ "Roll.md": "`dice: 1d20`" }, { mode: "off", cssclasses: { "Plain.md": "rollwright-world" } });
		off.world.refresh();
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect([off.has(0), off.has(1), off.has(2)]).toEqual([false, true, false]);
	});

	it("a saved change takes the class away and gives it back, without reading the file again", async () => {
		const { world, leaves, has, read, settle } = setup({ "Roll.md": "`dice: 1d20`", "Plain.md": "" });
		await settle();
		expect(has(0)).toBe(true);
		const calls = read.mock.calls.length;
		const file = leaves[0]!.view.file as unknown as ObsidianFile;
		file.stat.mtime = 2;
		world.noteChanged(file, "The roll is gone");
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(has(0)).toBe(false);
		file.stat.mtime = 3;
		world.noteChanged(file, "Back `dice: 1d6`");
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(has(0)).toBe(true);
		expect(read.mock.calls.length).toBe(calls);
	});

	it("the old key cssclass works too", async () => {
		const { world, has } = setup({ "Roll.md": "`dice: 1d20`" }, { mode: "off", cssclass: { "Plain.md": "rollwright-world" } });
		world.refresh();
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect([has(0), has(1)]).toEqual([false, true]);
	});

	it("a change in a note that is not open, or without a paid skin, does nothing", async () => {
		const free = setup({ "Roll.md": "" }, { licensed: false });
		const closed = Object.assign(new TFile("Closed.md"), { stat: { mtime: 5 } }) as unknown as ObsidianFile;
		const spy = vi.spyOn(free.world, "refresh");
		free.world.noteChanged(free.leaves[0]!.view.file as unknown as ObsidianFile, "`dice: 1d6`");
		const paid = setup({ "Roll.md": "" });
		const paidSpy = vi.spyOn(paid.world, "refresh");
		paid.world.noteChanged(closed, "`dice: 1d6`");
		expect(spy).not.toHaveBeenCalled();
		expect(paidSpy).not.toHaveBeenCalled();
	});

	it("clear takes it away everywhere (plugin off)", async () => {
		const { world, has, settle } = setup({ "Roll.md": "`dice: 1d20`" });
		await settle();
		world.clear();
		expect([has(0), has(1), has(2), has(3)]).toEqual([false, false, false, false]);
	});

	it("a skin switched to Classic takes it away again", async () => {
		const { world, plugin, has, settle } = setup({ "Roll.md": "`dice: 1d20`" });
		await settle();
		plugin.settings.skin = "classic";
		world.refresh();
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(has(0)).toBe(false);
	});
});
