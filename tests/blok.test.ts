import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import RollwrightPlugin from "../src/main";
import type { RollOutcome } from "../src/rollers/run";
import { BLOCK_CLASS, isBlockValue, mountRoll } from "../src/ui/widget";
import { setTooltip } from "obsidian";
import { MarkdownRenderer, TFile } from "./obsidian-stub";

// setTooltip is a no-op in the stub; here it records, so a test sees which tooltip came last.
vi.mock("obsidian", async (original) => ({ ...(await original<object>()), setTooltip: vi.fn() }));

/** A small element with tag, children and classes, enough for the widget and isBlockValue. */
class FakeEl {
	children: FakeEl[] = [];
	classes = new Set<string>();
	listeners: Record<string, (event: unknown) => void> = {};
	text = "";
	parentElement: FakeEl | null = null;
	constructor(public tagName = "SPAN") {
		// el.children.item(i) as the DOM has it.
		Object.defineProperty(this.children, "item", { value: (i: number) => this.children[i] ?? null });
	}
	get childElementCount(): number {
		return this.children.length;
	}
	append(tag: string): FakeEl {
		const child = new FakeEl(tag);
		child.parentElement = this;
		this.children.push(child);
		return child;
	}
	empty(): void {
		for (const child of this.children) child.parentElement = null;
		this.children.length = 0;
		this.text = "";
	}
	addClass(cls: string): void {
		this.classes.add(cls);
	}
	removeClass(cls: string): void {
		this.classes.delete(cls);
	}
	setAttribute(): void {}
	setText(text: string): void {
		this.text = text;
	}
	createSpan(): FakeEl {
		return this.append("SPAN");
	}
	addEventListener(name: string, listener: (event: unknown) => void): void {
		this.listeners[name] = listener;
	}
	closest(): null {
		return null;
	}
	querySelector(tag: string): FakeEl | null {
		for (const child of this.children) {
			if (child.tagName === tag.toUpperCase()) return child;
			const found = child.querySelector(tag);
			if (found) return found;
		}
		return null;
	}
}

/** A tiny markdown renderer: blocks split on a blank line; #, - and > start their own element. */
function fakeRender(markdown: string, el: FakeEl): void {
	for (const block of markdown.split(/\n\s*\n/)) {
		const tag = /^#{1,6} /.test(block) ? "H1" : /^- /.test(block) ? "UL" : block.startsWith(">") ? "BLOCKQUOTE" : "P";
		const part = el.append(tag);
		if (tag === "P" && block.includes("\n")) part.append("BR");
		if (tag === "UL") block.split("\n").forEach(() => part.append("LI"));
	}
}

const press = (keys: { ctrlKey?: boolean } = {}) => ({ target: { instanceOf: () => false }, preventDefault() {}, stopPropagation() {}, ...keys });
const wait = () => new Promise((resolve) => setTimeout(resolve, 20));

const FILES: Record<string, string> = {
	"Bron.md": "# Kop Alfa\n\nAlinea Bravo.\n\n- Lijst Foxtrot\n- Lijst Golf\n",
};

function fakeApp() {
	const tfiles = Object.keys(FILES).map((path) => new TFile(path));
	return {
		workspace: { on: vi.fn(), getLeavesOfType: () => [], getActiveViewOfType: () => null, onLayoutReady: (callback: () => void) => callback(), iterateAllLeaves: () => {} },
		metadataCache: { getFirstLinkpathDest: (link: string) => tfiles.find((f) => f.path === `${link}.md`) ?? null, getFileCache: () => ({}) },
		vault: { configDir: ".obsidian", cachedRead: async (file: TFile) => FILES[file.path] ?? "", getMarkdownFiles: () => tfiles, getAbstractFileByPath: () => null },
	};
}

async function load() {
	const plugin = new (RollwrightPlugin as unknown as new (app: unknown) => RollwrightPlugin)(fakeApp());
	await plugin.onload();
	return plugin;
}

function outcome(text: string, details = ""): RollOutcome {
	return { kind: "section", text, formula: "[[Bron]]", details, flags: {} as RollOutcome["flags"], source: "Bron.md" };
}

function mount(plugin: RollwrightPlugin, formula: string) {
	const span = new FakeEl();
	mountRoll(plugin, span as never, formula, "k", "A.md", {} as never);
	return span;
}

/** Mount with these results: the first one shown, the next ones after each click. */
async function mountWith(texts: string[]) {
	const plugin = await load();
	const [first, ...next] = texts.map((t) => outcome(t));
	vi.spyOn(plugin, "firstResult").mockResolvedValue(first as RollOutcome);
	const fresh = vi.spyOn(plugin, "freshResult");
	for (const o of next) fresh.mockResolvedValueOnce(o);
	const span = mount(plugin, "[[Bron]]");
	await wait();
	return span;
}

beforeEach(() => {
	vi.stubGlobal("Element", class {});
	vi.stubGlobal("activeDocument", { body: { toggleClass() {}, removeClass() {} } });
	vi.spyOn(MarkdownRenderer, "render").mockImplementation(async (_app: unknown, markdown: string, el?: unknown) => fakeRender(markdown, el as FakeEl));
});

afterEach(() => {
	vi.restoreAllMocks();
	vi.mocked(setTooltip).mockClear();
});

/** The last tooltip set on this element. */
const lastTooltip = (span: FakeEl) => {
	const calls = vi.mocked(setTooltip).mock.calls.filter(([el]) => el === (span as never));
	return calls[calls.length - 1]?.[1];
};

describe("a result of more than one line or a block is shown as a block", () => {
	it.each([
		["a heading", "# Kop Alfa"],
		["a list", "- Lijst Foxtrot\n- Lijst Golf"],
		["two paragraphs", "Alinea Bravo.\n\nAlinea Delta."],
		["a paragraph over two lines", "Alinea Hotel\ngaat door met India."],
		["a quote", "> Een citaat"],
	])("%s gets the block class", async (_, text) => {
		const span = await mountWith([text]);
		expect(span.classes.has(BLOCK_CLASS)).toBe(true);
		expect(span.classes.has("rollwright-roll")).toBe(true);
	});

	it("one paragraph stays in the sentence", async () => {
		const span = await mountWith(["Alinea Bravo."]);
		expect(span.classes.has(BLOCK_CLASS)).toBe(false);
	});

	it("a number from dice stays in the sentence", async () => {
		const plugin = await load();
		const span = mount(plugin, "1d6");
		await wait();
		expect(span.classes.has(BLOCK_CLASS)).toBe(false);
		expect(span.classes.has("rollwright-error")).toBe(false);
	});

	it("an error never gets the block class", async () => {
		const plugin = await load();
		const span = mount(plugin, "2d6 +");
		await wait();
		expect(span.classes.has("rollwright-error")).toBe(true);
		expect(span.classes.has(BLOCK_CLASS)).toBe(false);
	});

	it("a real heading roll from a note gets the block class", async () => {
		const plugin = await load();
		const span = mount(plugin, "[[Bron]]|heading-1");
		await wait();
		expect(span.classes.has(BLOCK_CLASS)).toBe(true);
	});

	it("is decided again on every new result: block, one line, block", async () => {
		const span = await mountWith(["# Kop Alfa", "Alinea Bravo.", "- Lijst Foxtrot\n- Lijst Golf"]);
		expect(span.classes.has(BLOCK_CLASS)).toBe(true);
		span.listeners.click?.(press());
		await wait();
		expect(span.classes.has(BLOCK_CLASS)).toBe(false);
		span.listeners.click?.(press());
		await wait();
		expect(span.classes.has(BLOCK_CLASS)).toBe(true);
	});

	it("from one line to a block on Enter", async () => {
		const span = await mountWith(["Alinea Bravo.", "Alinea Bravo.\n\nAlinea Delta."]);
		expect(span.classes.has(BLOCK_CLASS)).toBe(false);
		span.listeners.keydown?.({ key: "Enter", preventDefault() {} });
		await wait();
		expect(span.classes.has(BLOCK_CLASS)).toBe(true);
	});
});

describe("the block class follows the shown result, also when results cross", () => {
	it("a slow render that ends after a newer result leaves class and tooltip of the newer one", async () => {
		const plugin = await load();
		const render = vi.spyOn(MarkdownRenderer, "render").mockImplementation(async (_app: unknown, markdown: string, el?: unknown) => {
			if (markdown.startsWith("# Traag")) await new Promise((resolve) => setTimeout(resolve, 60));
			fakeRender(markdown, el as FakeEl);
		});
		vi.spyOn(plugin, "firstResult").mockResolvedValue(outcome("# Traag", "oud"));
		vi.spyOn(plugin, "freshResult").mockResolvedValueOnce(outcome("Alinea Bravo.", "nieuw"));
		const span = mount(plugin, "[[Bron]]");
		await new Promise((resolve) => setTimeout(resolve, 10));
		span.listeners.click?.(press());
		await new Promise((resolve) => setTimeout(resolve, 120));
		expect(render).toHaveBeenCalledTimes(2);
		expect(span.classes.has(BLOCK_CLASS)).toBe(false);
		expect(lastTooltip(span)).toBe("[[Bron]]\nnieuw");
	});

	it("from a block to an error drops the class", async () => {
		const plugin = await load();
		vi.spyOn(plugin, "firstResult").mockResolvedValue(outcome("# Kop Alfa"));
		vi.spyOn(plugin, "freshResult").mockRejectedValueOnce(new Error("kapot"));
		const span = mount(plugin, "[[Bron]]");
		await wait();
		expect(span.classes.has(BLOCK_CLASS)).toBe(true);
		span.listeners.click?.(press());
		await wait();
		expect(span.classes.has("rollwright-error")).toBe(true);
		expect(span.classes.has(BLOCK_CLASS)).toBe(false);
	});

	it("from a block back to an empty |none code drops the class", async () => {
		const plugin = await load();
		vi.spyOn(plugin, "hasResult").mockReturnValue(true);
		vi.spyOn(plugin, "firstResult").mockResolvedValue(outcome("# Kop Alfa"));
		const span = mount(plugin, "[[Bron]]|none");
		await wait();
		expect(span.classes.has(BLOCK_CLASS)).toBe(true);
		span.listeners.click?.(press({ ctrlKey: true }));
		await wait();
		expect(span.classes.has(BLOCK_CLASS)).toBe(false);
		expect(lastTooltip(span)).toBe("[[Bron]]|none");
	});
});

describe("isBlockValue", () => {
	const value = (...tags: string[]) => {
		const el = new FakeEl();
		for (const tag of tags) el.append(tag);
		return el;
	};

	it("empty or one plain paragraph is not a block", () => {
		expect(isBlockValue(value() as never)).toBe(false);
		expect(isBlockValue(value("P") as never)).toBe(false);
	});

	it("a code block, table or line is a block", () => {
		for (const tag of ["PRE", "TABLE", "HR", "OL"]) expect(isBlockValue(value(tag) as never)).toBe(true);
	});

	it("a div without elements in it (only text) is one part, not looked through", () => {
		expect(isBlockValue(value("DIV", "P") as never)).toBe(true);
		const one = value("DIV");
		expect(isBlockValue(one as never)).toBe(true);
	});

	it("looks through a wrapper div", () => {
		const wrapped = value("DIV");
		(wrapped.children[0] as FakeEl).append("P");
		expect(isBlockValue(wrapped as never)).toBe(false);
		(wrapped.children[0] as FakeEl).append("P");
		expect(isBlockValue(wrapped as never)).toBe(true);
	});
});
