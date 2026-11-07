import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Setting as RealSetting, SettingDefinitionItem, SettingGroup } from "obsidian";
import RollwrightPlugin from "../src/main";
import type { LicenseRequest, LicenseResponse, PolarIds } from "../src/pro/license";
import { COMING_SOON, RollwrightSettingTab } from "../src/ui/settings";
import { apiVersion, buttons, Setting, settingsMade } from "./obsidian-stub";

const IDS: PolarIds = { organizationId: "org-1", benefitId: "ben-1", buyUrl: "https://buy.polar.sh/x" };
const EMPTY: PolarIds = { organizationId: "", benefitId: "", buyUrl: "" };
const START = Date.UTC(2026, 10, 6);

function granted(): LicenseResponse {
	return { status: 200, json: { id: "lk-1", organization_id: "org-1", benefit_id: "ben-1", status: "granted", key: "KEY-1" } };
}

async function load(ids: PolarIds, answer: LicenseResponse | Error = new Error("no network in tests")) {
	const app = { workspace: { on: vi.fn(), getLeavesOfType: () => [], onLayoutReady: (callback: () => void) => callback(), iterateAllLeaves: () => {} }, vault: {} };
	const plugin = new (RollwrightPlugin as unknown as new (app: unknown) => RollwrightPlugin)(app);
	plugin.polarIds = ids;
	plugin.licenseRequest = vi.fn(async (_request: LicenseRequest): Promise<LicenseResponse> => {
		if (answer instanceof Error) throw answer;
		return answer;
	});
	plugin.now = () => START;
	await plugin.onload();
	const tab = new RollwrightSettingTab(plugin.app, plugin);
	return { plugin, tab, stub: tab as unknown as { updates: number } };
}

/** Draw definitions the way Obsidian 1.13 would: every render gets a fresh Setting. Returns the headings. */
function renderDefinitions(items: SettingDefinitionItem[]): string[] {
	const headings: string[] = [];
	for (const item of items) {
		if ("type" in item && (item.type === "group" || item.type === "list")) {
			headings.push(item.heading ?? "");
			headings.push(...renderDefinitions(item.items ?? []));
		} else if ("render" in item && item.render) {
			item.render(new Setting() as unknown as RealSetting, {} as SettingGroup);
		}
	}
	return headings;
}

/** Name and description of every row made so far, headings left out. */
function rows(headings: string[]) {
	return settingsMade.filter((s) => !headings.includes(s.name)).map((s) => ({ name: s.name, desc: s.desc }));
}

beforeEach(() => {
	vi.stubGlobal("activeDocument", { body: { toggleClass: () => {}, removeClass: () => {} } });
	settingsMade.length = 0;
	buttons.length = 0;
	apiVersion.current = "1.13.0";
});

afterEach(() => {
	apiVersion.current = "1.7.2";
});

describe("settings search: getSettingDefinitions()", () => {
	it.each([["with Polar ids", IDS], ["without Polar ids", EMPTY]])("has the same rows as display() %s", async (_label, ids) => {
		const { tab } = await load(ids);
		tab.display();
		const shown = rows(["Saved formulas", "Skins"]);
		const shownButtons = buttons.map((b) => b.text);
		settingsMade.length = 0;
		buttons.length = 0;
		const headings = renderDefinitions(tab.getSettingDefinitions());
		expect(headings).toEqual(["Saved formulas", "Skins"]);
		expect(rows(headings)).toEqual(shown);
		expect(buttons.map((b) => b.text)).toEqual(shownButtons);
	});

	it("every named row can be found by its name and description", async () => {
		const { tab } = await load(IDS);
		const names: string[] = [];
		const walk = (items: SettingDefinitionItem[]) => {
			for (const item of items) {
				if ("type" in item) {
					if (item.type !== "page") walk(item.items ?? []);
				} else if (item.searchable !== false) names.push(item.name);
			}
		};
		walk(tab.getSettingDefinitions());
		expect(names).toEqual([
			"Default die", "Default number of dice", "Keep the formula when a dice-mod code is replaced",
			"Add a formula", "Import saved formulas", "Skin", "Get the paid skins", "License key",
		]);
	});

	it("without Polar ids: no Buy, no Activate, no key field, only coming soon", async () => {
		const { tab } = await load(EMPTY);
		renderDefinitions(tab.getSettingDefinitions());
		expect(buttons.some((b) => /^Buy/.test(b.text))).toBe(false);
		expect(buttons.map((b) => b.text)).not.toContain("Activate");
		const key = settingsMade.find((s) => s.name === "License key");
		expect(key?.desc).toBe(COMING_SOON);
		expect(key?.texts).toHaveLength(0);
	});

	it("with Polar ids: typing unlocks nothing, Activate does and redraws with update()", async () => {
		const { plugin, tab, stub } = await load(IDS, granted());
		renderDefinitions(tab.getSettingDefinitions());
		expect(buttons.map((b) => b.text)).toContain("Buy for $6");
		settingsMade.find((s) => s.name === "License key")?.texts[0]?.("KEY-1");
		expect(plugin.isLicensed).toBe(false);
		expect(plugin.settings.licenseKey).toBe("");
		buttons.find((b) => b.text === "Activate")?.press();
		await vi.waitFor(() => expect(plugin.isLicensed).toBe(true));
		await vi.waitFor(() => expect(stub.updates).toBe(1));
	});

	it("saves a field the same way as display()", async () => {
		const { plugin, tab } = await load(IDS);
		renderDefinitions(tab.getSettingDefinitions());
		settingsMade.find((s) => s.name === "Default die")?.texts[0]?.("8");
		await vi.waitFor(() => expect(plugin.settings.defaultSides).toBe(8));
		settingsMade.find((s) => s.name === "Default die")?.texts[0]?.("x");
		expect(plugin.settings.defaultSides).toBe(8);
	});

	it("adding a formula redraws with update() on 1.13 and with display() before", async () => {
		const { plugin, tab, stub } = await load(IDS);
		renderDefinitions(tab.getSettingDefinitions());
		buttons.find((b) => b.text === "Add")?.press();
		await vi.waitFor(() => expect(stub.updates).toBe(1));
		expect(plugin.settings.formulas).toHaveLength(1);

		apiVersion.current = "1.12.7";
		settingsMade.length = 0;
		buttons.length = 0;
		tab.display();
		const before = settingsMade.length;
		buttons.find((b) => b.text === "Add")?.press();
		await vi.waitFor(() => expect(settingsMade.length).toBeGreaterThan(before));
		expect(stub.updates).toBe(1);
		expect(plugin.settings.formulas).toHaveLength(2);
	});
});
