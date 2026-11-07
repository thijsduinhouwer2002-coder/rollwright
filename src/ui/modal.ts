import { Modal, Notice, Setting, type App } from "obsidian";
import type RollwrightPlugin from "../main";

export class RollFormulaModal extends Modal {
	constructor(
		app: App,
		private readonly plugin: RollwrightPlugin,
	) {
		super(app);
	}

	onOpen(): void {
		this.setTitle("Roll a formula");
		let formula = "";
		const submit = async (): Promise<void> => {
			if (formula.trim() === "") return;
			try {
				const outcome = await this.plugin.freshResult(null, formula.trim(), this.plugin.currentNotePath());
				new Notice(`${formula.trim()}: ${outcome.text}`);
				this.close();
			} catch (error) {
				new Notice(error instanceof Error ? error.message : String(error));
			}
		};
		new Setting(this.contentEl).setName("Formula").addText((text) => {
			text.setPlaceholder("1d20 + 5").onChange((value) => {
				formula = value;
			});
			text.inputEl.addEventListener("keydown", (event) => {
				if (event.key === "Enter") void submit();
			});
		});
		new Setting(this.contentEl).addButton((button) => button.setButtonText("Roll").setCta().onClick(() => void submit()));
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
