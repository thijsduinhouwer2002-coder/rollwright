import type { EditorView } from "@codemirror/view";
import { Modal, Notice, Setting, type App } from "obsidian";
import type RollwrightPlugin from "../main";
import { modifiedText, replacementInLine } from "../rollers/modify";
import type { RollOutcome } from "../rollers/run";

/** What a click on a dice-mod code does with the result it shows. */
export type ModifyHandler = (outcome: RollOutcome) => void;

export const CHANGED_NOTICE = "The dice-mod code has changed, so nothing was replaced.";
export const EMBED_NOTICE = "A dice-mod code in an embedded note cannot be replaced here. Open that note to replace it.";
export const RESULT_NOTICE = "A dice-mod code inside a rolled result cannot be replaced.";
export const NOT_MARKDOWN_NOTICE = "Only a dice-mod code in a markdown note can be replaced.";
export const UNPLACED_NOTICE = "This dice-mod code cannot be replaced here, because its line in the note is unknown.";

/** Shows the text a dice-mod code becomes and asks first. Closing it counts as cancel. */
export class ReplaceCodeModal extends Modal {
	private answered = false;

	constructor(
		app: App,
		private readonly text: string,
		private readonly answer: (replace: boolean) => void,
	) {
		super(app);
	}

	onOpen(): void {
		this.setTitle("Replace the dice code?");
		this.contentEl.createEl("p", { text: "The code in the note becomes:" });
		this.contentEl.createEl("pre").createEl("code", { text: this.text });
		new Setting(this.contentEl)
			.addButton((button) => button.setButtonText("Cancel").onClick(() => this.reply(false)))
			.addButton((button) => button.setButtonText("Replace").setCta().onClick(() => this.reply(true)));
	}

	private reply(replace: boolean): void {
		this.answered = true;
		this.answer(replace);
		this.close();
	}

	onClose(): void {
		this.contentEl.empty();
		if (!this.answered) this.answer(false);
	}
}

/**
 * Reading view. Writes only to the note of the code itself (sourcePath), through
 * vault.process, and only at a known line. In an embedded note the roll shows, but a click
 * only says it cannot be replaced: sourcePath would then be the embedded note.
 */
export function readingModifier(plugin: RollwrightPlugin, target: HTMLElement, sourcePath: string, position: { line: number; index: number } | undefined, formula: string): ModifyHandler {
	return (outcome) => {
		// Checked on click, when the element surely hangs in the page.
		if (target.closest(".rollwright-value")) {
			new Notice(RESULT_NOTICE);
			return;
		}
		if (target.closest(".markdown-embed, .internal-embed")) {
			new Notice(EMBED_NOTICE);
			return;
		}
		if (!position) {
			new Notice(UNPLACED_NOTICE);
			return;
		}
		const text = modifiedText(outcome, plugin.settings.diceModFormula);
		void plugin.confirmReplace(text).then((replace) => (replace ? plugin.replaceInNote(sourcePath, position.line, position.index, formula, text) : false));
	};
}

/**
 * Live Preview. Writes through the editor in one change, so undo takes it back. The widget
 * knows its line (from 0) and its number on that line, as the key has them; right before
 * writing it checks that the same dice-mod code is still there, as the reading view does.
 * posAtDOM is not used: in Obsidian it does not always give the exact start of the code.
 */
export function editorModifier(plugin: RollwrightPlugin, view: EditorView, target: HTMLElement, formula: string, line: number, index: number): ModifyHandler {
	return (outcome) => {
		const text = modifiedText(outcome, plugin.settings.diceModFormula);
		void plugin.confirmReplace(text).then((replace) => {
			if (replace) replaceInEditor(view, target, formula, line, index, text);
		});
	};
}

function replaceInEditor(view: EditorView, target: HTMLElement, formula: string, lineNumber: number, index: number, text: string): void {
	// A widget that left the editor (note closed, other editor) writes nothing.
	if (!target.isConnected || !view.contentDOM.contains(target)) {
		new Notice(CHANGED_NOTICE);
		return;
	}
	const doc = view.state.doc;
	const line = lineNumber >= 0 && lineNumber < doc.lines ? doc.line(lineNumber + 1) : null;
	const change = line ? replacementInLine(line.text, index, formula, text) : null;
	if (!line || !change) {
		new Notice(CHANGED_NOTICE);
		return;
	}
	view.dispatch({ changes: { from: line.from + change.from, to: line.from + change.to, insert: change.insert }, userEvent: "input" });
}
