import { beforeEach, describe, expect, it, vi } from "vitest";
import RollwrightPlugin from "../src/main";
import { fieldNames } from "../src/rollers/fields";
import { TFile } from "./obsidian-stub";

type Note = { text?: string; frontmatter?: Record<string, unknown> };

function fakeApp(files: Record<string, Note>) {
	const tfiles = Object.keys(files).map((path) => new TFile(path));
	return {
		workspace: { on: vi.fn(), getLeavesOfType: () => [], getActiveViewOfType: () => null, onLayoutReady: (callback: () => void) => callback(), iterateAllLeaves: () => {} },
		metadataCache: {
			getFirstLinkpathDest: (link: string) => tfiles.find((f) => f.path === `${link}.md`) ?? null,
			getFileCache: (file: TFile) => (files[file.path]?.frontmatter ? { frontmatter: files[file.path]?.frontmatter } : {}),
		},
		vault: {
			configDir: ".obsidian",
			cachedRead: async (file: TFile) => files[file.path]?.text ?? "",
			getMarkdownFiles: () => tfiles,
			getAbstractFileByPath: (path: string) => tfiles.find((f) => f.path === path) ?? null,
		},
	};
}

async function load(files: Record<string, Note>, formulas: { name: string; formula: string }[] = []) {
	const plugin = new (RollwrightPlugin as unknown as new (app: unknown) => RollwrightPlugin)(fakeApp(files));
	await plugin.onload();
	plugin.settings.formulas = formulas;
	return plugin;
}

const roll = (plugin: RollwrightPlugin, formula: string, path = "Held.md") => plugin.freshResult(null, formula, path);

beforeEach(() => {
	vi.stubGlobal("activeDocument", { body: { toggleClass() {}, removeClass() {} } });
});

describe("number fields from the frontmatter of the note itself", () => {
	it("`dice: str` gives the field", async () => {
		const plugin = await load({ "Held.md": { frontmatter: { str: 3 } } });
		const outcome = await roll(plugin, "str");
		expect(outcome.total).toBe(3);
		expect(outcome.details).toBe("3");
	});

	it("`1d20 + str` adds it, and the number shows in the breakdown", async () => {
		const plugin = await load({ "Held.md": { frontmatter: { str: 3 } } });
		const outcome = await roll(plugin, "1d20 + str");
		expect(outcome.details).toMatch(/^\[\d+\] \+ 3$/);
		const die = Number(/\[(\d+)\]/.exec(outcome.details)?.[1]);
		expect(outcome.total).toBe(die + 3);
	});

	it("a saved formula with the same name goes first", async () => {
		const plugin = await load({ "Held.md": { frontmatter: { str: 3 } } }, [{ name: "str", formula: "10" }]);
		expect((await roll(plugin, "str")).total).toBe(10);
		expect((await roll(plugin, "1 + str")).total).toBe(11);
	});

	it.each(["d", "dh", "k", "s", "F", "D", "dkh", "kh", "r"])("a field named %s stays notation", async (name) => {
		const plugin = await load({ "Held.md": { frontmatter: { [name]: 5 } } });
		expect(fieldNames({ [name]: 5 })).toEqual({});
		const outcome = await roll(plugin, "2d6");
		expect(outcome.details).toMatch(/^\[\d+, \d+\]$/);
	});

	it("`4d6dh` and `d20` still read as dice with fields d and dh", async () => {
		const plugin = await load({ "Held.md": { frontmatter: { d: 5, dh: 5 } } });
		expect((await roll(plugin, "d20")).details).toMatch(/^\[\d+\]$/);
		expect((await roll(plugin, "4d6dh1")).total).toBeLessThanOrEqual(18);
	});

	it("an unknown field gives the usual error", async () => {
		const plugin = await load({ "Held.md": { frontmatter: { str: 3 } } });
		await expect(roll(plugin, "1d20 + dex")).rejects.toThrow('Unknown name "dex"');
	});

	it('text "3" counts, text "drie" does not', async () => {
		const plugin = await load({ "Held.md": { frontmatter: { str: "3", dex: "drie", wis: " -1.5 " } } });
		expect((await roll(plugin, "str")).total).toBe(3);
		expect((await roll(plugin, "wis")).total).toBe(-1.5);
		await expect(roll(plugin, "dex")).rejects.toThrow('Unknown name "dex"');
	});

	it("other types do not count: lists, booleans, null, Infinity, formulas", () => {
		expect(fieldNames({ a: [3], b: true, c: null, e: Infinity, g: Number.NaN, h: "1d6", i: { x: 1 }, j: "", ok: 2 })).toEqual({ ok: "2" });
		expect(fieldNames(null)).toEqual({});
		expect(fieldNames({ "two words": 1, "a-b": 2, __proto__x: 1 })).toEqual({ __proto__x: "1" });
	});

	it("no frontmatter, or a note that is not there, gives the usual error", async () => {
		const plugin = await load({ "Held.md": { text: "str:: 3" } });
		await expect(roll(plugin, "str")).rejects.toThrow('Unknown name "str"');
		await expect(roll(plugin, "str", "Weg.md")).rejects.toThrow('Unknown name "str"');
	});

	it("inline fields such as `str:: 3` do not count", async () => {
		const plugin = await load({ "Held.md": { text: "str:: 3\n" } });
		await expect(roll(plugin, "1 + str")).rejects.toThrow('Unknown name "str"');
	});

	it("in a section or table from another note, the fields of the note with the code count", async () => {
		const plugin = await load({
			"Held.md": { frontmatter: { str: 3 } },
			"Tabel.md": { text: "| Wat |\n|---|\n| `dice: 10 + str` |\n^t\n", frontmatter: { str: 100 } },
		});
		expect((await roll(plugin, "[[Tabel^t]]")).text).toBe("13");
		await expect(roll(plugin, "[[Tabel^t]]", "Leeg.md")).rejects.toThrow('Unknown name "str"');
	});

	it("each note has its own fields", async () => {
		const plugin = await load({ "Held.md": { frontmatter: { str: 3 } }, "Ander.md": { frontmatter: { str: 7 } } });
		expect((await roll(plugin, "str")).total).toBe(3);
		expect((await roll(plugin, "str", "Ander.md")).total).toBe(7);
	});
});

describe("field numbers that print with an exponent", () => {
	it("leaves out 1e21 and 0.0000001, so the formula gives the usual unknown name", () => {
		expect(fieldNames({ big: 1e21, tiny: 0.0000001, ok: 12 })).toEqual({ ok: "12" });
	});
});
