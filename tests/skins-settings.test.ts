import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import RollwrightPlugin from "../src/main";
import type { LicenseRequest, LicenseResponse, PolarIds } from "../src/pro/license";
import { SKINS } from "../src/pro/skins";
import { COMING_SOON, RollwrightSettingTab } from "../src/ui/settings";
import { PREVIEW_CRIT, PREVIEW_RESULT, PREVIEW_STAMP } from "../src/ui/skin-preview";
import { allText, apiVersion, buttons, settingsMade, type FakeEl } from "./obsidian-stub";

const IDS: PolarIds = { organizationId: "org-1", benefitId: "ben-1", buyUrl: "https://buy.polar.sh/x" };
const EMPTY: PolarIds = { organizationId: "", benefitId: "", buyUrl: "" };
const START = Date.UTC(2026, 10, 6);

async function load(ids: PolarIds) {
	const app = { workspace: { on: vi.fn(), getLeavesOfType: () => [], onLayoutReady: (callback: () => void) => callback(), iterateAllLeaves: () => {} }, vault: {} };
	const plugin = new (RollwrightPlugin as unknown as new (app: unknown) => RollwrightPlugin)(app);
	plugin.polarIds = ids;
	plugin.licenseRequest = vi.fn(async (_request: LicenseRequest): Promise<LicenseResponse> => {
		throw new Error("no network in tests");
	});
	plugin.now = () => START;
	await plugin.onload();
	return { plugin, tab: new RollwrightSettingTab(plugin.app, plugin) };
}

/** The rows after the heading Skins, in the order display() draws them. */
function skinRows() {
	const start = settingsMade.findIndex((s) => s.name === "Skins");
	return settingsMade.slice(start + 1);
}

function byClass(el: FakeEl, cls: string): FakeEl[] {
	return [...(el.cls.includes(cls) ? [el] : []), ...el.children.flatMap((child) => byClass(child, cls))];
}

beforeEach(() => {
	vi.stubGlobal("activeDocument", { body: { toggleClass: () => {}, removeClass: () => {} } });
	settingsMade.length = 0;
	buttons.length = 0;
	apiVersion.current = "1.7.2";
});

afterEach(() => {
	apiVersion.current = "1.7.2";
});

describe("the group Skins (Daan, points 3, 11 and 12)", () => {
	it("order with Polar ids: Skin, the preview, Get the paid skins, License key", async () => {
		const { tab } = await load(IDS);
		tab.display();
		expect(skinRows().map((s) => s.name)).toEqual(["Skin", "", "Get the paid skins", "License key"]);
	});

	it("Get the paid skins has the Buy button and one line about what you get", async () => {
		const { tab } = await load(IDS);
		tab.display();
		const buy = settingsMade.find((s) => s.name === "Get the paid skins");
		expect(buy?.desc).toBe("Parchment and Arcane. One payment, yours to keep.");
		expect(buttons.map((b) => b.text)).toContain("Buy for $6");
	});

	it("the key text without a key says where the key is and how often it is checked, without Polar", async () => {
		const { tab } = await load(IDS);
		tab.display();
		const key = settingsMade.find((s) => s.name === "License key");
		expect(key?.desc).toBe("Paste the key from your purchase email and press Activate. It is checked online at most once every 30 days.");
		expect(settingsMade.some((s) => /Polar/.test(s.desc))).toBe(false);
	});

	it("without Polar ids: still coming soon, no Buy, but the preview is there", async () => {
		const { tab } = await load(EMPTY);
		tab.display();
		expect(skinRows().map((s) => s.name)).toEqual(["Skin", "", "License key"]);
		expect(settingsMade.find((s) => s.name === "License key")?.desc).toBe(COMING_SOON);
		expect(buttons.some((b) => /^Buy/.test(b.text))).toBe(false);
	});

	it.each([["with Polar ids", IDS], ["without Polar ids", EMPTY]])(
		"without a key the preview shows three tiles in the look of each skin, %s",
		async (_label, ids) => {
			const { plugin, tab } = await load(ids);
			expect(plugin.isLicensed).toBe(false);
			tab.display();
			const preview = skinRows()[1];
			const tiles = byClass(preview!.infoEl, "rollwright-skin-preview-tile");
			expect(tiles).toHaveLength(3);
			expect(tiles.map((tile) => tile.cls.find((c) => c.startsWith("rollwright-skin-") && c !== "rollwright-skin-preview-tile"))).toEqual(
				SKINS.map((skin) => skin.cssClass),
			);
			for (const [index, tile] of tiles.entries()) {
				// Klus 7 (Daan, ontwerp-v2): a crit with its stamp and a small ordinary roll, was one roll "17".
				expect(byClass(tile, "rollwright-roll")).toHaveLength(2);
				expect(byClass(tile, "rollwright-icon")).toHaveLength(2);
				// Notitiesfeer stap 2 (Daan, 9 nov): a paid tile adds one line on what it does to the note.
				const skin = SKINS[index]!;
				expect(allText(tile)).toEqual([PREVIEW_CRIT, PREVIEW_STAMP, PREVIEW_RESULT, skin.name, ...(skin.tagline ? [skin.tagline] : [])]);
			}
			expect(SKINS.map((skin) => skin.name)).toEqual(["Classic", "Parchment", "Arcane"]);
			expect(SKINS.map((skin) => skin.tagline)).toEqual([
				undefined,
				"Turns the whole note into old parchment",
				"Turns the whole note into a torch-lit dungeon",
			]);
		},
	);

	it("every tile shows a crit like a real one: crit and roll-max classes, NAT 20 stamp, and a small ordinary roll", async () => {
		const { tab } = await load(IDS);
		tab.display();
		for (const tile of byClass(skinRows()[1]!.infoEl, "rollwright-skin-preview-tile")) {
			const [crit, plain] = byClass(tile, "rollwright-roll");
			expect(crit!.cls).toEqual(expect.arrayContaining(["rollwright-crit", "rollwright-roll-max"]));
			expect(byClass(crit!, "rollwright-stamp").map((el) => el.text)).toEqual([PREVIEW_STAMP]);
			expect(byClass(crit!, "rollwright-value").map((el) => el.text)).toEqual([PREVIEW_CRIT]);
			expect(plain!.cls).toContain("rollwright-skin-preview-small");
			expect(plain!.cls).not.toContain("rollwright-crit");
			expect(byClass(plain!, "rollwright-stamp")).toHaveLength(0);
		}
	});

	it("without a key the paid skins carry a lock, Classic does not", async () => {
		const { tab } = await load(IDS);
		tab.display();
		const tiles = byClass(skinRows()[1]!.infoEl, "rollwright-skin-preview-tile");
		expect(tiles.map((tile) => byClass(tile, "rollwright-skin-preview-lock").length)).toEqual(SKINS.map((skin) => (skin.paid ? 1 : 0)));
		expect(SKINS.map((skin) => skin.paid)).toEqual([false, true, true]);
	});

	it("with an active key no tile carries a lock", async () => {
		const { plugin, tab } = await load(IDS);
		plugin.settings.licenseKey = "KEY-1";
		plugin.settings.licenseCheckedAt = START;
		expect(plugin.isLicensed).toBe(true);
		tab.display();
		const preview = settingsMade.slice(settingsMade.map((s) => s.name).lastIndexOf("Skins") + 1)[1]!;
		const tiles = byClass(preview.infoEl, "rollwright-skin-preview-tile");
		expect(tiles).toHaveLength(3);
		expect(tiles.flatMap((tile) => byClass(tile, "rollwright-skin-preview-lock"))).toHaveLength(0);
	});

	it("choosing still needs a key: without one the Skin list only has Classic", async () => {
		const { tab } = await load(IDS);
		tab.display();
		expect(settingsMade.find((s) => s.name === "Skin")?.options).toEqual(["classic"]);
	});

	it("the preview is the same with the settings search of Obsidian 1.13", async () => {
		apiVersion.current = "1.13.0";
		const { tab } = await load(IDS);
		const sections = tab.sections();
		const preview = sections[sections.length - 1]!.rows[1]!;
		expect(preview.name).toBe("");
		const definitions = tab.getSettingDefinitions();
		const group = definitions[definitions.length - 1] as { items: { searchable?: boolean }[] };
		expect(group.items.map((item) => item.searchable)).toEqual([true, false, true, true]);
	});
});
