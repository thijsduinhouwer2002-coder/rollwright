import { beforeEach, describe, expect, it, vi } from "vitest";
import RollwrightPlugin from "../src/main";
import { ResultListeners } from "../src/result-listeners";
import { mountRoll } from "../src/ui/widget";
import { rendered } from "./obsidian-stub";

// Lezen en Live Preview tonen dezelfde plek (dezelfde sleutel). Een klik in de ene weergave moet ook in
// de andere de nieuwe uitkomst tonen (run 42380865200: Live Preview toonde nog de buit van voor de klik).
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

describe("one place shown in two views", () => {
	it("a click in one view shows the new result in the other", async () => {
		const plugin = await load();
		const lezen = mount(plugin, "A.md|0:0|1d1000000");
		const live = mount(plugin, "A.md|0:0|1d1000000");
		await wait();
		expect(live.span.text).toBe(lezen.span.text);
		const voor = lezen.span.text;
		for (let i = 0; i < 5 && lezen.span.text === voor; i++) {
			lezen.span.listeners.click?.(press());
			await wait();
		}
		expect(lezen.span.text).not.toBe(voor);
		expect(live.span.text).toBe(lezen.span.text);
	});

	it("draws the clicked view once per click, not twice", async () => {
		const plugin = await load();
		const lezen = mount(plugin, "k");
		await wait();
		const voor = lezen.span.emptied;
		lezen.span.listeners.click?.(press());
		await wait();
		expect(lezen.span.emptied).toBe(voor + 1);
	});

	it("leaves other places alone", async () => {
		const plugin = await load();
		const a = mount(plugin, "A.md|0:0|1d1000000");
		const b = mount(plugin, "A.md|1:0|1d1000000");
		await wait();
		const bVoor = b.span.text;
		const bLeeg = b.span.emptied;
		a.span.listeners.click?.(press());
		await wait();
		expect(b.span.text).toBe(bVoor);
		expect(b.span.emptied).toBe(bLeeg);
	});

	it("a widget that went away no longer listens", async () => {
		const plugin = await load();
		const weg = mount(plugin, "k");
		const blijft = mount(plugin, "k");
		await wait();
		weg.unload();
		const wegVoor = weg.span.emptied;
		blijft.span.listeners.click?.(press());
		await wait();
		expect(weg.span.emptied).toBe(wegVoor);
		blijft.unload();
		expect(plugin.resultListeners.size).toBe(0);
	});
});

describe("ResultListeners", () => {
	it("tells only the listeners of that key, and stops after off", () => {
		const listeners = new ResultListeners();
		const seen: string[] = [];
		const off = listeners.on("a", (o) => seen.push(`a:${o.text}`));
		listeners.on("b", (o) => seen.push(`b:${o.text}`));
		listeners.emit("a", { text: "1" } as never);
		off();
		listeners.emit("a", { text: "2" } as never);
		expect(seen).toEqual(["a:1"]);
		expect(listeners.size).toBe(1);
	});

	it("a listener that stops while being told does not skip the next one", () => {
		const listeners = new ResultListeners();
		const seen: number[] = [];
		const off = listeners.on("k", () => {
			seen.push(1);
			off();
		});
		listeners.on("k", () => seen.push(2));
		listeners.emit("k", { text: "x" } as never);
		expect(seen).toEqual([1, 2]);
	});
});
