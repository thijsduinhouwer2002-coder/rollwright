// @vitest-environment jsdom
import { EditorSelection, EditorState, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ResultListeners } from "../src/result-listeners";

/**
 * CodeMirror keeps the old DOM of a widget when the new widget is `eq` to it, and then gives
 * that DOM to the new widget. Later it calls `destroy(dom)` on the new widget only. Every
 * Component that was loaded for a widget must still be unloaded, or its listeners stay behind.
 */

const components = vi.hoisted(() => ({ loaded: 0, unloaded: 0 }));

vi.mock("obsidian", async (original) => {
	const { StateField } = await import("@codemirror/state");
	const field = <T>(value: T) => StateField.define<T>({ create: () => value, update: (v) => v });
	class Component {
		private readonly callbacks: (() => void)[] = [];
		private loaded = false;
		load(): void {
			this.loaded = true;
			components.loaded++;
		}
		unload(): void {
			if (!this.loaded) return;
			this.loaded = false;
			components.unloaded++;
			for (const callback of this.callbacks.splice(0)) callback();
		}
		register(callback: () => void): void {
			this.callbacks.push(callback);
		}
	}
	return {
		...(await original<object>()),
		Component,
		editorLivePreviewField: field(true),
		editorInfoField: field({ file: { path: "Note.md" } }),
	};
});

// The widget's own drawing is tested elsewhere; here only the listener it registers matters.
vi.mock("../src/ui/widget", () => ({
	mountRoll: (plugin: { resultListeners: ResultListeners }, _target: HTMLElement, _formula: string, key: string, _sourcePath: string, component: { register(callback: () => void): void }) => {
		component.register(plugin.resultListeners.on(key, () => {}));
	},
}));

const { editorInfoField, editorLivePreviewField } = (await import("obsidian")) as unknown as Record<"editorInfoField" | "editorLivePreviewField", Extension>;
const { rollwrightLivePreview } = await import("../src/ui/live-preview");

describe("Live Preview widgets after a rebuild", () => {
	let view: EditorView | null = null;

	beforeEach(() => {
		components.loaded = 0;
		components.unloaded = 0;
		vi.stubGlobal("activeDocument", document);
	});

	afterEach(() => {
		view?.destroy();
		view = null;
		vi.unstubAllGlobals();
	});

	function makeView(plugin: unknown): EditorView {
		const doc = "Attack `dice: 1d6` now\nsecond line\nthird line";
		const state = EditorState.create({
			doc,
			selection: EditorSelection.cursor(doc.length),
			extensions: [editorLivePreviewField, editorInfoField, rollwrightLivePreview(plugin as never)],
		});
		return new EditorView({ state, parent: document.body });
	}

	function redrawLine(target: EditorView): void {
		// Writing the same text over line 1 (as undo or a sync from disk can) makes CodeMirror draw
		// the line again. The new widget is `eq` to the old one (same key), so CodeMirror keeps the
		// old DOM and hands it to the new widget, which never ran toDOM.
		for (let i = 0; i < 3; i++) {
			const line = target.state.doc.line(1);
			target.dispatch({ changes: { from: line.from, to: line.to, insert: line.text } });
			target.dispatch({ selection: EditorSelection.cursor(target.state.doc.length - i) });
		}
	}

	it("unloads every component when the view goes away", () => {
		const plugin = { resultListeners: new ResultListeners() };
		view = makeView(plugin);
		expect(view.contentDOM.querySelectorAll("span").length).toBeGreaterThan(0);
		redrawLine(view);
		expect(plugin.resultListeners.size).toBe(1);

		view.destroy();
		view = null;
		expect(components.loaded).toBeGreaterThan(0);
		expect(components.unloaded).toBe(components.loaded);
		expect(plugin.resultListeners.size).toBe(0);
	});

	it("unloads the component when the code is removed after a rebuild", () => {
		const plugin = { resultListeners: new ResultListeners() };
		view = makeView(plugin);
		redrawLine(view);

		view.dispatch({ changes: { from: 0, to: view.state.doc.line(1).to, insert: "no code here" } });
		expect(components.unloaded).toBe(components.loaded);
		expect(plugin.resultListeners.size).toBe(0);
	});
});
