import { describe, expect, it, vi } from "vitest";
import { ResultListeners } from "../src/result-listeners";
// @ts-expect-error Vite reads this file as text; the project has no types for that.
import readme from "../README.md?raw";
import { processReadingView } from "../src/ui/reading-view";

function fakeSpan(): HTMLElement {
	const self: Record<string, unknown> = {
		empty() {},
		addClass() {},
		removeClass() {},
		setAttribute() {},
		addEventListener() {},
		setText() {},
		createSpan: () => self,
	};
	return self as unknown as HTMLElement;
}

function fakeCell(formula: string) {
	const code = { textContent: `dice: ${formula}`, parentElement: { tagName: "TD" }, replaceWith() {} };
	return { closest: () => null, querySelectorAll: () => [code] };
}

describe("L5: dice codes without a known line", () => {
	it("gives each table cell its own key", () => {
		vi.stubGlobal("activeDocument", { createElement: fakeSpan });
		const firstResult = vi.fn(async () => ({ kind: "dice", text: "1", formula: "1d6", details: "", flags: {} }));
		const plugin = { rollContext: () => ({ aliases: {} }), hasResult: () => false, firstResult, resultListeners: new ResultListeners() };
		const ctx = { sourcePath: "A.md", getSectionInfo: () => null, addChild() {} };
		processReadingView(plugin as never, fakeCell("1d6") as never, ctx as never);
		processReadingView(plugin as never, fakeCell("1d6") as never, ctx as never);
		const keys = firstResult.mock.calls.map((call) => (call as unknown[])[0]);
		expect(keys).toHaveLength(2);
		expect(keys[0]).not.toBe(keys[1]);
	});
});

describe("L5: the README says what really happens", () => {
	it("no longer promises results stay until a click", () => {
		expect(readme).not.toContain("Results stay as they are until you click.");
	});

	it("names the moments a roll is made again", () => {
		expect(readme).toMatch(/restart/i);
		expect(readme).toMatch(/lines? above/i);
	});
});
