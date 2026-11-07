import { beforeEach, describe, expect, it, vi } from "vitest";
import RollwrightPlugin from "../src/main";

// Lezen en Live Preview vragen soms tegelijk de eerste worp voor dezelfde sleutel (run 42373862390:
// road en weather waren in de twee weergaven anders). Dan hoort er maar één worp te zijn.
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

async function load() {
	const plugin = new (RollwrightPlugin as unknown as new (app: unknown) => RollwrightPlugin)(fakeApp());
	await plugin.onload();
	return plugin;
}

// The roll still on its way per key; it must be gone once the roll is back, also after an error.
function pendingSize(plugin: RollwrightPlugin): number {
	return (plugin as unknown as { pending: Map<string, unknown> }).pending.size;
}

beforeEach(() => {
	vi.stubGlobal("activeDocument", { body: { toggleClass() {}, removeClass() {} } });
});

describe("first roll asked for twice at the same time", () => {
	it("gives both views the same result", async () => {
		const plugin = await load();
		const [a, b] = await Promise.all([
			plugin.firstResult("A.md|0:0|1d1000000", "1d1000000", "A.md"),
			plugin.firstResult("A.md|0:0|1d1000000", "1d1000000", "A.md"),
		]);
		expect(b.text).toBe(a.text);
		expect(pendingSize(plugin)).toBe(0);
		expect((await plugin.firstResult("A.md|0:0|1d1000000", "1d1000000", "A.md")).text).toBe(a.text);
	});

	it("also with dice+: one result, also on disk", async () => {
		const plugin = await load();
		const results = await Promise.all([1, 2, 3].map(() => plugin.firstResult("k", "1d1000000", "A.md", true)));
		expect(new Set(results.map((r) => r.text)).size).toBe(1);
		const onDisk = plugin.settings.keptResults.filter(([key]) => key === "k");
		expect(onDisk).toHaveLength(1);
		expect(onDisk[0]?.[1]?.text).toBe(results[0]?.text);
		expect(pendingSize(plugin)).toBe(0);
	});

	it("keeps the click when it comes in during the first roll", async () => {
		const plugin = await load();
		const first = plugin.firstResult("k", "1d1000000", "A.md");
		const click = await plugin.freshResult("k", "1d1000000", "A.md");
		await first;
		expect((await plugin.firstResult("k", "1d1000000", "A.md")).text).toBe(click.text);
	});

	it("does not bring back a result forgotten during the first roll", async () => {
		const plugin = await load();
		const first = plugin.firstResult("k", "1d1000000", "A.md");
		await plugin.forgetResult("k");
		await first;
		expect(plugin.hasResult("k")).toBe(false);
	});

	it("rolls again after a failed first roll", async () => {
		const plugin = await load();
		await expect(plugin.firstResult("k", "2d6 +", "A.md")).rejects.toThrow();
		await expect(plugin.firstResult("k", "2d6 +", "A.md")).rejects.toThrow();
		expect(pendingSize(plugin)).toBe(0);
		expect(plugin.hasResult("k")).toBe(false);
	});
});
