import { beforeEach, describe, expect, it, vi } from "vitest";
import RollwrightPlugin from "../src/main";
import { ResultListeners } from "../src/result-listeners";
import { mountRoll } from "../src/ui/widget";
import { rendered } from "./obsidian-stub";

// Twee snelle klikken in één weergave waarvan de eerste later terugkomt (trage opslag van de geschiedenis):
// de aangeklikte weergave moet de nieuwste uitkomst tonen, gelijk aan de andere weergave (controleur 7 nov 14:50).
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

const press = () => ({ target: { instanceOf: () => false }, preventDefault() {}, stopPropagation() {} });
const wait = () => new Promise((resolve) => setTimeout(resolve, 20));

function fakeApp() {
	return {
		workspace: { on: vi.fn(), getLeavesOfType: () => [], getActiveViewOfType: () => null, onLayoutReady: (callback: () => void) => callback(), iterateAllLeaves: () => {} },
		metadataCache: { getFirstLinkpathDest: () => null, getFileCache: () => null },
		vault: { configDir: ".obsidian", cachedRead: async () => "", getMarkdownFiles: () => [], getAbstractFileByPath: () => null },
	};
}

async function load() {
	const plugin = new (RollwrightPlugin as unknown as new (app: unknown) => RollwrightPlugin)(fakeApp());
	await plugin.onload();
	return plugin;
}

/** Mounts a widget with a component that remembers its cleanup, like Obsidian does on unload. */
function mount(plugin: RollwrightPlugin, key: string, formula = "1d1000000") {
	const span = fakeSpan();
	const cleanups: (() => void)[] = [];
	mountRoll(plugin, span as never, formula, key, "A.md", { register: (fn: () => void) => cleanups.push(fn) } as never);
	return { span, unload: () => cleanups.forEach((fn) => fn()) };
}

beforeEach(() => {
	rendered.length = 0;
	vi.stubGlobal("Element", class {});
	vi.stubGlobal("activeDocument", { body: { toggleClass() {}, removeClass() {} } });
});

describe("two quick clicks that come back in reverse order", () => {
	it("both views end on the newest result", async () => {
		const plugin = await load();
		const lezen = mount(plugin, "A.md|0:0|1d1000000");
		const live = mount(plugin, "A.md|0:0|1d1000000");
		await wait();
		const echt = plugin.saveSettings.bind(plugin);
		let eerste = true;
		plugin.saveSettings = async () => {
			if (eerste) {
				eerste = false;
				await new Promise((resolve) => setTimeout(resolve, 60));
			}
			await echt();
		};
		lezen.span.listeners.click?.(press());
		await new Promise((resolve) => setTimeout(resolve, 5));
		lezen.span.listeners.click?.(press());
		await new Promise((resolve) => setTimeout(resolve, 120));
		const nieuwste = plugin.settings.history[0]?.result;
		const oudere = plugin.settings.history[1]?.result;
		expect(nieuwste).not.toBe(oudere);
		expect(live.span.text).toBe(nieuwste);
		expect(lezen.span.text).toBe(nieuwste);
	});

	it("a single click still shows its own result", async () => {
		const plugin = await load();
		const lezen = mount(plugin, "k");
		await wait();
		lezen.span.listeners.click?.(press());
		await wait();
		expect(lezen.span.text).toBe(plugin.settings.history[0]?.result);
	});
});
