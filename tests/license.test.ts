import { beforeEach, describe, expect, it, vi } from "vitest";
import RollwrightPlugin from "../src/main";
import {
	BUY_URL, LICENSE_MESSAGES, POLAR_BENEFIT_ID, POLAR_ORG_ID, RECHECK_INTERVAL_MS, VALIDATE_URL,
	paymentReady, shouldShowBuyButton, validateLicense, type LicenseRequest, type LicenseResponse, type PolarIds,
} from "../src/pro/license";
import { availableSkins } from "../src/pro/skins";
import { COMING_SOON, RollwrightSettingTab } from "../src/ui/settings";
import { buttons, settingsMade } from "./obsidian-stub";

const IDS: PolarIds = { organizationId: "org-1", benefitId: "ben-1", buyUrl: "https://buy.polar.sh/x" };
const DAY = 24 * 60 * 60 * 1000;
const START = Date.UTC(2026, 10, 6);

/** A granted key with a buyer, as Polar answers: the name and e-mail must never be kept. */
function granted(overrides: Record<string, unknown> = {}): LicenseResponse {
	return {
		status: 200,
		json: {
			id: "lk-1", organization_id: "org-1", benefit_id: "ben-1", status: "granted", key: "KEY-1",
			customer: { name: "Ada Buyer", email: "ada@example.com" }, ...overrides,
		},
	};
}

function fakeRequest(answer: LicenseResponse | Error) {
	return vi.fn(async (_request: LicenseRequest): Promise<LicenseResponse> => {
		if (answer instanceof Error) throw answer;
		return answer;
	});
}

function fakeApp() {
	return {
		workspace: { on: vi.fn(), getLeavesOfType: () => [], onLayoutReady: (callback: () => void) => callback(), iterateAllLeaves: () => {} },
		vault: {},
	};
}

async function load(options: { ids?: PolarIds; request?: ReturnType<typeof fakeRequest>; now?: number; stored?: unknown } = {}) {
	const plugin = new (RollwrightPlugin as unknown as new (app: unknown) => RollwrightPlugin)(fakeApp());
	plugin.polarIds = options.ids ?? IDS;
	plugin.licenseRequest = options.request ?? fakeRequest(new Error("no network in tests"));
	let now = options.now ?? START;
	plugin.now = () => now;
	(plugin as unknown as { stored: unknown }).stored = options.stored ?? null;
	await plugin.onload();
	return { plugin, setNow: (value: number) => (now = value), stored: () => (plugin as unknown as { stored: unknown }).stored };
}

beforeEach(() => {
	vi.stubGlobal("activeDocument", { body: { toggleClass: () => {}, removeClass: () => {} } });
	settingsMade.length = 0;
	buttons.length = 0;
});

const EMPTY: PolarIds = { organizationId: "", benefitId: "", buyUrl: "" };

describe("1: when a Polar id is empty", () => {
	it("payment is not ready", () => {
		expect(paymentReady(EMPTY)).toBe(false);
		expect(shouldShowBuyButton(EMPTY)).toBe(false);
		expect(paymentReady({ ...IDS, buyUrl: "" })).toBe(false);
		expect(paymentReady({ ...IDS, benefitId: " " })).toBe(false);
		expect(paymentReady(IDS)).toBe(true);
	});

	it("shows no buy button and no key field, only coming soon, and no paid skins", async () => {
		const { plugin } = await load({ ids: EMPTY, stored: { licenseKey: "KEY-1", licenseCheckedAt: START, skin: "arcane" } });
		expect(plugin.isLicensed).toBe(false);
		new RollwrightSettingTab(plugin.app, plugin).display();
		expect(buttons.some((b) => /^Buy/.test(b.text))).toBe(false);
		expect(buttons.map((b) => b.text)).not.toContain("Activate");
		const key = settingsMade.find((s) => s.name === "License key");
		expect(key?.desc).toBe(COMING_SOON);
		expect(key?.texts).toHaveLength(0);
		expect(settingsMade.find((s) => s.name === "Skin")?.options).toEqual(availableSkins(false).map((s) => s.id));
		expect(settingsMade.find((s) => s.name === "Skin")?.options).toEqual(["classic"]);
		expect(settingsMade.some((s) => s.desc.includes("Nothing is sent anywhere"))).toBe(false);
	});
});

describe("1b: the shipped Polar constants", () => {
	it("are the ids of the Dortus organization, the License Keys benefit and the checkout page", () => {
		expect(POLAR_ORG_ID).toBe("5f4a360c-7552-4269-a44a-4311f7f672d6");
		expect(POLAR_BENEFIT_ID).toBe("344f6030-66ec-437a-8fbb-186b80a98c65");
		expect(BUY_URL).toBe("https://buy.polar.sh/polar_cl_kJQ6H0U8GSNV0qMQkejM6SY4BYkU9k3SxfApH07ipIP");
		expect(paymentReady()).toBe(true);
		expect(shouldShowBuyButton()).toBe(true);
	});

	it("show the buy button and the key field with an Activate button", async () => {
		const { plugin } = await load({ ids: { organizationId: POLAR_ORG_ID, benefitId: POLAR_BENEFIT_ID, buyUrl: BUY_URL } });
		new RollwrightSettingTab(plugin.app, plugin).display();
		expect(buttons.map((b) => b.text)).toContain("Buy for $6");
		expect(buttons.map((b) => b.text)).toContain("Activate");
		const key = settingsMade.find((s) => s.name === "License key");
		expect(key?.desc).not.toBe(COMING_SOON);
		expect(key?.texts).toHaveLength(1);
	});

	it("the buy button opens the real Polar checkout page", async () => {
		const open = vi.fn();
		vi.stubGlobal("activeWindow", { open });
		const { plugin } = await load({ ids: { organizationId: POLAR_ORG_ID, benefitId: POLAR_BENEFIT_ID, buyUrl: BUY_URL } });
		new RollwrightSettingTab(plugin.app, plugin).display();
		buttons.find((b) => b.text === "Buy for $6")?.press();
		expect(open).toHaveBeenCalledWith(BUY_URL);
	});
});

describe("2: a valid key", () => {
	it("sends the key, our organization and our benefit to the validate endpoint", async () => {
		const request = fakeRequest(granted());
		expect(await validateLicense(" KEY-1 ", request, IDS)).toBe("valid");
		const sent = request.mock.calls[0]?.[0];
		expect(sent).toMatchObject({ url: VALIDATE_URL, method: "POST", contentType: "application/json", throw: false });
		expect(JSON.parse(sent?.body ?? "{}")).toEqual({ key: "KEY-1", organization_id: "org-1", benefit_id: "ben-1" });
	});

	it("unlocks the skins and keeps only the key and the date, never name or e-mail", async () => {
		const { plugin, stored } = await load({ request: fakeRequest(granted()) });
		expect(plugin.isLicensed).toBe(false);
		expect(await plugin.activateLicense("KEY-1")).toBe("valid");
		expect(plugin.isLicensed).toBe(true);
		expect(availableSkins(plugin.isLicensed)).toHaveLength(3);
		expect(plugin.settings.licenseKey).toBe("KEY-1");
		expect(plugin.settings.licenseCheckedAt).toBe(START);
		const text = JSON.stringify(stored());
		expect(text).not.toContain("Ada");
		expect(text).not.toContain("ada@example.com");
		expect(text).not.toContain("lk-1");
	});

	it("typing a key in the field unlocks nothing; only Activate does", async () => {
		const { plugin } = await load({ request: fakeRequest(granted()) });
		new RollwrightSettingTab(plugin.app, plugin).display();
		settingsMade.find((s) => s.name === "License key")?.texts[0]?.("KEY-1");
		expect(plugin.isLicensed).toBe(false);
		expect(plugin.settings.licenseKey).toBe("");
		buttons.find((b) => b.text === "Activate")?.press();
		await vi.waitFor(() => expect(plugin.isLicensed).toBe(true));
		expect(buttons.map((b) => b.text)).toContain("Buy for $6");
	});

	it("pressing Activate twice quickly asks Polar once", async () => {
		const request = fakeRequest(granted());
		const { plugin } = await load({ request });
		new RollwrightSettingTab(plugin.app, plugin).display();
		settingsMade.find((s) => s.name === "License key")?.texts[0]?.("KEY-1");
		const activate = buttons.find((b) => b.text === "Activate");
		activate?.press();
		activate?.press();
		await vi.waitFor(() => expect(plugin.isLicensed).toBe(true));
		expect(request).toHaveBeenCalledTimes(1);
	});

	it("the buy button opens the buy URL of the plugin's Polar ids", async () => {
		const open = vi.fn();
		vi.stubGlobal("activeWindow", { open });
		const { plugin } = await load();
		new RollwrightSettingTab(plugin.app, plugin).display();
		buttons.find((b) => b.text === "Buy for $6")?.press();
		expect(open).toHaveBeenCalledWith(IDS.buyUrl);
	});

	it("an old key without a check date is not active", async () => {
		const { plugin } = await load({ stored: { licenseKey: "RW1-ABCDE-23456-000000" } });
		expect(plugin.isLicensed).toBe(false);
	});
});

describe("3: a key that is not ours or not granted", () => {
	it.each([
		["404 (unknown, revoked, disabled, expired)", { status: 404, json: { detail: "Not found" } }],
		["200 with another benefit", granted({ benefit_id: "ben-2" })],
		["200 with another organization", granted({ organization_id: "org-2" })],
		["200 with status revoked", granted({ status: "revoked" })],
		["200 without a body", { status: 200, json: null }],
	])("%s: not active, the invalid key message", async (_name, answer) => {
		const { plugin } = await load({ request: fakeRequest(answer) });
		expect(await plugin.activateLicense("KEY-1")).toBe("invalid");
		expect(plugin.isLicensed).toBe(false);
		expect(plugin.settings.licenseKey).toBe("");
		expect(LICENSE_MESSAGES.invalid).toBe("This key is not valid. If you rotated it, paste the new key from your Polar purchases.");
	});
});

describe("4: errors on activate and on the quiet check", () => {
	const unreachable: [string, LicenseResponse | Error][] = [
		["a network error", new Error("offline")],
		["500", { status: 500, json: null }],
		["503", { status: 503, json: null }],
		["429", { status: 429, json: null }],
		["an unknown code 418", { status: 418, json: null }],
	];

	it.each(unreachable)("activate with %s: not active, could not reach Polar", async (_name, answer) => {
		const { plugin } = await load({ request: fakeRequest(answer) });
		expect(await plugin.activateLicense("KEY-1")).toBe("no-connection");
		expect(plugin.isLicensed).toBe(false);
		expect(LICENSE_MESSAGES["no-connection"]).toBe("Could not reach Polar, try again.");
	});

	it("activate with 422: something is wrong on our side", async () => {
		const { plugin } = await load({ request: fakeRequest({ status: 422, json: { detail: [] } }) });
		expect(await plugin.activateLicense("KEY-1")).toBe("our-error");
		expect(plugin.isLicensed).toBe(false);
		expect(LICENSE_MESSAGES["our-error"]).toBe("Something is wrong on our side, please contact thijs@dortus.com.");
	});

	it("the settings show the message after a failed Activate", async () => {
		const { plugin } = await load({ request: fakeRequest({ status: 404, json: null }) });
		new RollwrightSettingTab(plugin.app, plugin).display();
		settingsMade.find((s) => s.name === "License key")?.texts[0]?.("KEY-1");
		buttons.find((b) => b.text === "Activate")?.press();
		await vi.waitFor(() => expect(settingsMade.some((s) => s.desc.startsWith(LICENSE_MESSAGES.invalid))).toBe(true));
	});

	const active = { licenseKey: "KEY-1", licenseCheckedAt: START - 31 * DAY };

	it.each([...unreachable, ["422", { status: 422, json: null }] as [string, LicenseResponse]])("quiet check with %s: the key stays active", async (_name, answer) => {
		const request = fakeRequest(answer);
		const { plugin } = await load({ request, stored: { ...active } });
		expect(request).toHaveBeenCalledTimes(1);
		expect(plugin.isLicensed).toBe(true);
		expect(plugin.settings.licenseCheckedAt).toBe(active.licenseCheckedAt);
	});

	it("quiet check with 404: the key is locked", async () => {
		const request = fakeRequest({ status: 404, json: null });
		const { plugin } = await load({ request, stored: { ...active } });
		await vi.waitFor(() => expect(plugin.isLicensed).toBe(false));
		expect(request).toHaveBeenCalledTimes(1);
	});

	it("quiet check with 200 for another benefit: the key is locked", async () => {
		const { plugin } = await load({ request: fakeRequest(granted({ benefit_id: "ben-2" })), stored: { ...active } });
		await vi.waitFor(() => expect(plugin.isLicensed).toBe(false));
	});
});

describe("5: the quiet check runs at most once per 30 days", () => {
	it("does not ask Polar before 30 days have passed", async () => {
		const request = fakeRequest(granted());
		await load({ request, now: START + 29 * DAY, stored: { licenseKey: "KEY-1", licenseCheckedAt: START } });
		expect(request).not.toHaveBeenCalled();
	});

	it("asks after 30 days, moves the date on, then waits again", async () => {
		const request = fakeRequest(granted());
		const { plugin, setNow } = await load({ request, now: START + RECHECK_INTERVAL_MS, stored: { licenseKey: "KEY-1", licenseCheckedAt: START } });
		await vi.waitFor(() => expect(plugin.settings.licenseCheckedAt).toBe(START + RECHECK_INTERVAL_MS));
		expect(request).toHaveBeenCalledTimes(1);
		setNow(START + RECHECK_INTERVAL_MS + 10 * DAY);
		await plugin.recheckLicense();
		expect(request).toHaveBeenCalledTimes(1);
		setNow(START + 2 * RECHECK_INTERVAL_MS);
		await plugin.recheckLicense();
		expect(request).toHaveBeenCalledTimes(2);
	});

	it("a check date in the future (the clock went back) becomes now, without asking Polar", async () => {
		const request = fakeRequest(granted());
		const { plugin, setNow, stored } = await load({ request, now: START, stored: { licenseKey: "KEY-1", licenseCheckedAt: START + 365 * DAY } });
		await vi.waitFor(() => expect(plugin.settings.licenseCheckedAt).toBe(START));
		expect((stored() as { licenseCheckedAt: number }).licenseCheckedAt).toBe(START);
		expect(plugin.isLicensed).toBe(true);
		expect(request).not.toHaveBeenCalled();
		setNow(START + 29 * DAY);
		await plugin.recheckLicense();
		expect(request).not.toHaveBeenCalled();
		setNow(START + RECHECK_INTERVAL_MS);
		await plugin.recheckLicense();
		expect(request).toHaveBeenCalledTimes(1);
	});

	it("never checks without an active key", async () => {
		const request = fakeRequest(granted());
		await load({ request, now: START + 100 * DAY, stored: { licenseKey: "KEY-1" } });
		expect(request).not.toHaveBeenCalled();
	});
});
