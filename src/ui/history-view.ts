import { ItemView, Notice, setIcon, type WorkspaceLeaf } from "obsidian";
import type RollwrightPlugin from "../main";
import { historyLabel } from "./history-label";

export const HISTORY_VIEW = "rollwright-history";

export class RollHistoryView extends ItemView {
	constructor(
		leaf: WorkspaceLeaf,
		private readonly plugin: RollwrightPlugin,
	) {
		super(leaf);
		this.icon = "dices";
	}

	getViewType(): string {
		return HISTORY_VIEW;
	}

	getDisplayText(): string {
		return "Roll history";
	}

	async onOpen(): Promise<void> {
		this.refresh();
		await Promise.resolve();
	}

	private async rollAndNotify(formula: string): Promise<void> {
		try {
			const source = this.plugin.currentNotePath();
			const outcome = await this.plugin.freshResult(null, formula, source);
			new Notice(`${formula}: ${outcome.text}`);
		} catch (error) {
			new Notice(error instanceof Error ? error.message : String(error));
		}
	}

	refresh(): void {
		const root = this.contentEl;
		root.empty();
		root.addClass("rollwright-history");

		const form = root.createEl("form", { cls: "rollwright-history-form" });
		const input = form.createEl("input", { type: "text", placeholder: "1d20 + 5" });
		input.setAttribute("aria-label", "Formula");
		form.createEl("button", { text: "Roll", type: "submit" });
		form.addEventListener("submit", (event) => {
			event.preventDefault();
			if (input.value.trim() !== "") void this.rollAndNotify(input.value.trim());
		});

		const saved = this.plugin.settings.formulas;
		if (saved.length > 0) {
			const row = root.createDiv({ cls: "rollwright-history-saved" });
			for (const formula of saved) {
				const button = row.createEl("button", { text: formula.name });
				button.setAttribute("aria-label", formula.formula);
				button.addEventListener("click", () => void this.rollAndNotify(formula.formula));
			}
		}

		const history = this.plugin.settings.history;
		if (history.length === 0) {
			root.createDiv({ cls: "rollwright-history-empty", text: "Click a roll in a note to see it here." });
			return;
		}
		const clear = root.createEl("button", { cls: "rollwright-history-clear", text: "Clear history" });
		clear.addEventListener("click", () => void this.plugin.clearHistory());

		const list = root.createDiv({ cls: "rollwright-history-list" });
		for (const entry of history) {
			const item = list.createDiv({ cls: "rollwright-history-item" });
			item.createDiv({ cls: "rollwright-history-result", text: entry.result });
			const label = historyLabel(entry.formula);
			if (label.name !== "") item.createDiv({ cls: "rollwright-history-name", text: label.name });
			// The tidy text is only for showing; the raw formula stays in the title so nothing is lost.
			const formula = item.createDiv({ cls: "rollwright-history-formula", text: label.formula });
			formula.setAttribute("title", entry.formula);
			if (entry.details !== "") item.createDiv({ cls: "rollwright-history-details", text: entry.details });
			const meta = item.createDiv({ cls: "rollwright-history-meta" });
			meta.createSpan({ text: new Date(entry.time).toLocaleTimeString() });
			if (entry.source !== "") {
				const link = meta.createEl("a", { text: entry.source });
				link.addEventListener("click", (event) => {
					event.preventDefault();
					void this.app.workspace.openLinkText(entry.source, "");
				});
			}
			const again = meta.createEl("button", { cls: "clickable-icon" });
			again.setAttribute("aria-label", "Roll again");
			setIcon(again, "refresh-cw");
			again.addEventListener("click", () => void this.rollAndNotify(entry.formula));
		}
	}
}
