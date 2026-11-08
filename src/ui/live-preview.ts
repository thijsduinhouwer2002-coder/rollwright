import { syntaxTree } from "@codemirror/language";
import { RangeSetBuilder, type Extension } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, WidgetType, type DecorationSet, type ViewUpdate } from "@codemirror/view";
import { Component, editorInfoField, editorLivePreviewField } from "obsidian";
import type RollwrightPlugin from "../main";
import { findInlineDice } from "../rollers/inline";
import { editorModifier } from "./dice-mod";
import { mountRoll } from "./widget";

/**
 * The component of each drawn widget, by its DOM element. Not on the widget: when a rebuilt
 * widget is `eq` to the old one, CodeMirror keeps the old DOM, gives it to the new widget (which
 * never ran toDOM) and later calls destroy(dom) on that new widget. Kept on the widget, the old
 * component was never unloaded and its listeners stayed behind.
 */
const components = new WeakMap<HTMLElement, Component>();

class RollWidget extends WidgetType {
	constructor(
		private readonly plugin: RollwrightPlugin,
		private readonly formula: string,
		private readonly key: string,
		private readonly sourcePath: string,
		private readonly keep: boolean,
		private readonly modify: boolean,
		/** The line (from 0) and the number of the code on it, the same as in the key. */
		private readonly line: number,
		private readonly index: number,
	) {
		super();
	}

	// The key holds line and index, so a code on another line or place gets a new widget with the right line and index.
	eq(other: RollWidget): boolean {
		return other.key === this.key && other.keep === this.keep && other.modify === this.modify;
	}

	toDOM(view: EditorView): HTMLElement {
		const span = createSpan();
		const component = new Component();
		component.load();
		components.set(span, component);
		// dice-mod: writes only into this editor's own note, through the view, so undo works.
		const modify = this.modify ? editorModifier(this.plugin, view, span, this.formula, this.line, this.index) : undefined;
		mountRoll(this.plugin, span, this.formula, this.key, this.sourcePath, component, this.keep, modify);
		return span;
	}

	destroy(dom: HTMLElement): void {
		components.get(dom)?.unload();
		components.delete(dom);
	}

	ignoreEvent(): boolean {
		return true;
	}
}

function build(plugin: RollwrightPlugin, view: EditorView): DecorationSet {
	const builder = new RangeSetBuilder<Decoration>();
	const state = view.state;
	if (!state.field(editorLivePreviewField, false)) return builder.finish();
	const sourcePath = state.field(editorInfoField, false)?.file?.path ?? "";
	const selection = state.selection.ranges;
	const tree = syntaxTree(state);

	for (const { from, to } of view.visibleRanges) {
		let line = state.doc.lineAt(from);
		for (;;) {
			findInlineDice(line.text).forEach((found, index) => {
				const start = line.from + found.from;
				const end = line.from + found.to;
				// With the cursor on the code, the user is editing it: show the source.
				if (selection.some((range) => range.from <= end && range.to >= start)) return;
				if (tree.resolveInner(start + 1, 1).name.includes("codeblock")) return;
				const key = `${sourcePath}|${line.number - 1}:${index}|${found.formula}`;
				builder.add(start, end, Decoration.replace({ widget: new RollWidget(plugin, found.formula, key, sourcePath, found.keep, found.modify, line.number - 1, index) }));
			});
			if (line.to >= to || line.number >= state.doc.lines) break;
			line = state.doc.line(line.number + 1);
		}
	}
	return builder.finish();
}

export function rollwrightLivePreview(plugin: RollwrightPlugin): Extension {
	return ViewPlugin.fromClass(
		class {
			decorations: DecorationSet;

			constructor(view: EditorView) {
				this.decorations = build(plugin, view);
			}

			update(update: ViewUpdate): void {
				const modeChanged = update.startState.field(editorLivePreviewField, false) !== update.state.field(editorLivePreviewField, false);
				if (update.docChanged || update.viewportChanged || update.selectionSet || modeChanged) {
					this.decorations = build(plugin, update.view);
				}
			}
		},
		{ decorations: (value) => value.decorations },
	);
}
