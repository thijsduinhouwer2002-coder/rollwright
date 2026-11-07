import { beforeEach, describe, expect, it, vi } from "vitest";
import RollwrightPlugin from "../src/main";
import { modifiedText } from "../src/rollers/modify";
import { rollSpec } from "../src/rollers/run";
import { mountRoll } from "../src/ui/widget";

/** A small element: records listeners, the shown text and its error attribute. */
function fakeSpan() {
	const listeners: Record<string, (event: unknown) => void> = {};
	const el = {
		listeners,
		text: "",
		error: "",
		empty: () => (el.text = ""),
		addClass() {},
		removeClass() {},
		setAttribute: (name: string, value: string) => (el.error = name === "data-rollwright-error" ? value : el.error),
		setText: (text: string) => (el.text = text),
		createSpan: (options?: { text?: string }) => {
			if (options?.text !== undefined) el.text += options.text;
			return el;
		},
		addEventListener: (name: string, listener: (event: unknown) => void) => (listeners[name] = listener),
		closest: () => null,
	};
	return el;
}

const press = (keys: { altKey?: boolean } = {}) => ({ target: { instanceOf: () => false }, preventDefault() {}, stopPropagation() {}, ...keys });
const wait = () => new Promise((resolve) => setTimeout(resolve, 20));

function fakeApp() {
	return {
		workspace: { on: vi.fn(), getLeavesOfType: () => [], getActiveViewOfType: () => null, onLayoutReady: (callback: () => void) => callback(), iterateAllLeaves: () => {} },
		metadataCache: { getFirstLinkpathDest: () => null, getFileCache: () => ({}) },
		vault: { configDir: ".obsidian", cachedRead: async () => "", getMarkdownFiles: () => [], getAbstractFileByPath: () => null },
	};
}

async function load() {
	const plugin = new (RollwrightPlugin as unknown as new (app: unknown) => RollwrightPlugin)(fakeApp());
	await plugin.onload();
	return plugin;
}

const SUMMARY = /^(No result|((\d+ (Success|Failure|Advantage|Threat|Triumph|Despair|Light|Dark))(, )?)+)$/;

beforeEach(() => {
	vi.stubGlobal("Element", class {});
	vi.stubGlobal("activeDocument", { body: { toggleClass() {}, removeClass() {} } });
});

describe("narrative dice in the widget (fake Obsidian)", () => {
	it("shows the text, a click rolls again, Alt-click gives the message without crashing", async () => {
		const plugin = await load();
		const span = fakeSpan();
		mountRoll(plugin, span as never, "3g4d", "k", "A.md", {} as never);
		await wait();
		expect(span.text).toMatch(SUMMARY);
		span.listeners.click?.(press());
		await wait();
		expect(span.text).toMatch(SUMMARY);
		expect(plugin.settings.history.length).toBeGreaterThan(0);
		span.listeners.click?.(press({ altKey: true }));
		await wait();
		expect(span.error).toBe("Narrative dice have no average");
	});

	it("an ambiguous p shows the message in the widget", async () => {
		const plugin = await load();
		const span = fakeSpan();
		mountRoll(plugin, span as never, "3g2p", "k", "A.md", {} as never);
		await wait();
		expect(span.error).toContain("P is ambiguous");
	});

	it("dice-mod writes the narrative text", async () => {
		const outcome = await rollSpec("1y", { sourcePath: "A.md", random: () => 12, readNote: async () => null, notesWithTag: async () => [] });
		expect(modifiedText(outcome, true)).toBe("1y -> Proficiency [Tr] -> 1 Success, 1 Triumph");
		expect(modifiedText(outcome, false)).toBe("Proficiency [Tr] -> 1 Success, 1 Triumph");
	});
});
