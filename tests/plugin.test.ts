import { beforeEach, describe, expect, it, vi } from "vitest";
import RollwrightPlugin from "../src/main";
import { notices, TFile } from "./obsidian-stub";

function fakeBody() {
	const classes = new Set<string>();
	return {
		classes,
		toggleClass: (name: string, on: boolean) => (on ? classes.add(name) : classes.delete(name)),
		removeClass: (name: string) => classes.delete(name),
	};
}

function fakeApp(files: Record<string, { text: string; tags?: string[] }>, otherPluginData?: string, openDocs: unknown[] = []) {
	const adapter = {
		exists: vi.fn(async () => otherPluginData !== undefined),
		read: vi.fn(async () => otherPluginData ?? ""),
		write: vi.fn(),
	};
	const tfiles = Object.keys(files).map((path) => new TFile(path));
	return {
		adapter,
		workspace: {
			on: vi.fn(),
			getLeavesOfType: () => [],
			getActiveViewOfType: () => null,
			onLayoutReady: (callback: () => void) => callback(),
			iterateAllLeaves: (callback: (leaf: unknown) => void) => openDocs.forEach((doc) => callback({ view: { containerEl: { doc } } })),
		},
		metadataCache: {
			getFirstLinkpathDest: (link: string) => tfiles.find((f) => f.path === `${link}.md`) ?? null,
			getFileCache: (file: TFile) => ({ tags: files[file.path]?.tags }),
		},
		vault: {
			configDir: ".custom-config",
			adapter,
			cachedRead: async (file: TFile) => files[file.path]?.text ?? "",
			getMarkdownFiles: () => tfiles,
		},
	};
}

async function load(app: ReturnType<typeof fakeApp>) {
	const plugin = new (RollwrightPlugin as unknown as new (app: unknown) => RollwrightPlugin)(app);
	await plugin.onload();
	return plugin;
}

const FILES = {
	"Loot.md": { text: "| Item |\n|---|\n| Sword |\n^t\n" },
	"Npc.md": { text: "Body npc", tags: ["#npc/guard"] },
	"Other.md": { text: "Body other", tags: ["#npcs"] },
};

beforeEach(() => {
	notices.length = 0;
	vi.stubGlobal("activeDocument", { body: fakeBody() });
});

describe("plugin glue, with a stand-in for the app", () => {
	it("registers everything on load", async () => {
		const plugin = await load(fakeApp(FILES));
		const { registered } = plugin as unknown as { registered: { views: string[]; commands: { id: string; name: string }[]; processors: number; extensions: number; tabs: number } };
		expect(registered.views).toEqual(["rollwright-history"]);
		expect(registered.processors).toBe(1);
		expect(registered.extensions).toBe(1);
		expect(registered.tabs).toBe(1);
		expect(registered.commands.map((c) => c.name)).toEqual(["Open roll history", "Roll a formula"]);
	});

	it("keeps a result in place until a fresh roll, and logs only fresh rolls with their source", async () => {
		const plugin = await load(fakeApp(FILES));
		const first = await plugin.firstResult("k", "1d1000000", "A.md");
		const again = await plugin.firstResult("k", "1d1000000", "A.md");
		expect(again).toBe(first);
		expect(plugin.settings.history).toHaveLength(0);
		const fresh = await plugin.freshResult("k", "1d1000000", "A.md");
		expect(await plugin.firstResult("k", "1d1000000", "A.md")).toBe(fresh);
		expect(plugin.settings.history[0]).toMatchObject({ formula: "1d1000000", source: "A.md" });
	});

	it("limits the history to 200 entries", async () => {
		const plugin = await load(fakeApp(FILES));
		for (let i = 0; i < 205; i++) await plugin.freshResult(null, "1", "A.md");
		expect(plugin.settings.history).toHaveLength(200);
	});

	it("reads tables through the metadata cache and the vault", async () => {
		const plugin = await load(fakeApp(FILES));
		expect((await plugin.freshResult(null, "[[Loot^t]]", "A.md")).text).toBe("Sword");
		await expect(plugin.freshResult(null, "[[Gone^t]]", "A.md")).rejects.toThrow(/not found/);
	});

	it("matches a tag and its children, not a longer tag", async () => {
		const plugin = await load(fakeApp(FILES));
		const outcome = await plugin.freshResult(null, "#npc", "A.md");
		expect(outcome.text).toBe("Body npc");
	});

	it("uses saved formulas by name", async () => {
		const plugin = await load(fakeApp(FILES));
		plugin.settings.formulas = [{ name: "bonus", formula: "4" }];
		expect((await plugin.freshResult(null, "bonus + 1", "A.md")).total).toBe(5);
	});

	it("uses the default die from the settings", async () => {
		const plugin = await load(fakeApp(FILES));
		plugin.settings.defaultSides = 1;
		expect((await plugin.freshResult(null, "3d", "A.md")).total).toBe(3);
	});

	it("imports from the config folder of this vault and never writes there", async () => {
		const app = fakeApp(FILES, JSON.stringify({ formulas: [{ alias: "atk", formula: "1d20" }] }));
		const plugin = await load(app);
		await plugin.importSavedFormulas();
		expect(app.adapter.read).toHaveBeenCalledWith(".custom-config/plugins/obsidian-dice-roller/data.json");
		expect(app.adapter.write).not.toHaveBeenCalled();
		expect(plugin.settings.formulas).toEqual([{ name: "atk", formula: "1d20" }]);
		expect(notices[0]).toBe("Imported 1 of 1 saved formulas.");
	});

	it("says so when there is nothing to import", async () => {
		const plugin = await load(fakeApp(FILES));
		await plugin.importSavedFormulas();
		expect(notices[0]).toMatch(/No saved formulas/);
	});

	it("does not apply a paid skin without a valid key", async () => {
		const plugin = await load(fakeApp(FILES));
		const body = (activeDocument as unknown as { body: ReturnType<typeof fakeBody> }).body;
		plugin.settings.skin = "arcane";
		plugin.applySkin();
		expect([...body.classes]).toEqual(["rollwright-skin-classic"]);
		plugin.onunload();
		expect(body.classes.size).toBe(0);
	});

	it("also skins windows that were already open (L6)", async () => {
		const popout = { body: fakeBody() };
		const plugin = await load(fakeApp(FILES, undefined, [popout]));
		expect([...popout.body.classes]).toEqual(["rollwright-skin-classic"]);
		plugin.onunload();
		expect(popout.body.classes.size).toBe(0);
	});
});
