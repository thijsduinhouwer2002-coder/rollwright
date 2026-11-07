import { PluginSettingTab, requireApiVersion, Setting, type App, type SettingDefinition, type SettingDefinitionItem } from "obsidian";
import type RollwrightPlugin from "../main";
import { LICENSE_MESSAGES, paymentReady, PRICE_TEXT } from "../pro/license";
import { availableSkins, SKINS } from "../pro/skins";
import { renderSkinPreview } from "./skin-preview";

/** A whole number of at least min, or null for anything else, an empty field included. */
export function parseWholeNumber(value: string, min: number): number | null {
	const text = value.trim();
	if (!/^\d+$/.test(text)) return null;
	const number = Number(text);
	return Number.isSafeInteger(number) && number >= min ? number : null;
}

export const COMING_SOON = "Paid skins are coming soon.";
export const CHECK_NOTE = "It is checked online at most once every 30 days.";

/** The line under the key field: active since a date, or what went wrong, in plain words. */
export function licenseStatus(active: boolean, checkedAt: number, error: keyof typeof LICENSE_MESSAGES | null): string {
	if (error !== null) return LICENSE_MESSAGES[error];
	if (active) return `Active, checked on ${new Date(checkedAt).toLocaleDateString()}.`;
	return "Paste the key from your purchase email and press Activate.";
}

/** One row of the settings tab: its name, its description and the fields or buttons it adds. */
export interface SettingRow {
	name: string;
	desc?: string;
	build?: (setting: Setting) => void;
}

/** Rows under one heading; the first section has none. */
export interface SettingSection {
	heading?: string;
	rows: SettingRow[];
}

/** Fill a Setting from a row. Both display() and getSettingDefinitions() use this. */
export function renderRow(setting: Setting, row: SettingRow): void {
	if (row.name !== "") setting.setName(row.name);
	if (row.desc !== undefined) setting.setDesc(row.desc);
	row.build?.(setting);
}

/** A row as a definition for the settings search of Obsidian 1.13 and later. */
function toDefinition(row: SettingRow): SettingDefinition {
	return {
		name: row.name,
		desc: row.desc,
		searchable: row.name !== "",
		render: (setting: Setting) => renderRow(setting, row),
	};
}

export class RollwrightSettingTab extends PluginSettingTab {
	/** The outcome of the last Activate that failed, shown until the next try. */
	private lastError: keyof typeof LICENSE_MESSAGES | null = null;

	constructor(
		app: App,
		private readonly plugin: RollwrightPlugin,
	) {
		super(app, plugin);
	}

	/** The tab for Obsidian before 1.13. From 1.13 on, Obsidian draws getSettingDefinitions() instead. */
	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		for (const section of this.sections()) {
			if (section.heading !== undefined) new Setting(containerEl).setName(section.heading).setHeading();
			for (const row of section.rows) renderRow(new Setting(containerEl), row);
		}
	}

	/** The same rows as display(), so they show up in the settings search of Obsidian 1.13 and later. */
	getSettingDefinitions(): SettingDefinitionItem[] {
		return this.sections().flatMap((section): SettingDefinitionItem[] =>
			section.heading === undefined
				? section.rows.map(toDefinition)
				: [{ type: "group", heading: section.heading, items: section.rows.map(toDefinition) }],
		);
	}

	/** Draw the tab again after a row was added, removed or changed. */
	private redraw(): void {
		if (requireApiVersion("1.13.0")) this.update();
		else this.display();
	}

	/** Every row of the tab, built from the current settings. The one source for both ways of drawing. */
	sections(): SettingSection[] {
		const settings = this.plugin.settings;
		const save = () => this.plugin.saveSettings();

		const general: SettingRow[] = [
			{
				name: "Default die",
				desc: "The number of sides when a formula leaves it out, as in 3d.",
				build: (setting) =>
					setting.addText((text) =>
						text.setValue(String(settings.defaultSides)).onChange(async (value) => {
							const sides = parseWholeNumber(value, 1);
							if (sides === null) return;
							settings.defaultSides = sides;
							await save();
						}),
					),
			},
			{
				name: "Default number of dice",
				desc: "The number of dice when a formula leaves it out, as in d6.",
				build: (setting) =>
					setting.addText((text) =>
						text.setValue(String(settings.defaultCount)).onChange(async (value) => {
							const count = parseWholeNumber(value, 0);
							if (count === null) return;
							settings.defaultCount = count;
							await save();
						}),
					),
			},
			{
				name: "Keep the formula when a dice-mod code is replaced",
				desc: "On: 3d6 -> [2, 5, 4] -> 11. Off: [2, 5, 4] -> 11. Results of tables, lists and notes never show a formula.",
				build: (setting) =>
					setting.addToggle((toggle) =>
						toggle.setValue(settings.diceModFormula).onChange(async (value) => {
							settings.diceModFormula = value;
							await save();
						}),
					),
			},
		];

		const formulas: SettingRow[] = settings.formulas.map((formula, index) => ({
			name: "",
			build: (setting) =>
				setting
					.addText((text) =>
						text.setPlaceholder("Name").setValue(formula.name).onChange(async (value) => {
							formula.name = value.trim();
							await save();
						}),
					)
					.addText((text) =>
						text.setPlaceholder("Formula").setValue(formula.formula).onChange(async (value) => {
							formula.formula = value.trim();
							await save();
						}),
					)
					.addExtraButton((button) =>
						button.setIcon("trash").setTooltip("Remove").onClick(async () => {
							settings.formulas.splice(index, 1);
							await save();
							this.redraw();
						}),
					),
		}));
		formulas.push(
			{
				name: "Add a formula",
				desc: "Use its name in any roll, such as dice: attack.",
				build: (setting) =>
					setting.addButton((button) =>
						button.setButtonText("Add").onClick(async () => {
							settings.formulas.push({ name: `formula${settings.formulas.length + 1}`, formula: "1d20" });
							await save();
							this.redraw();
						}),
					),
			},
			{
				name: "Import saved formulas",
				desc: "Copies named formulas from the data file of the Dice Roller plugin, if you have it. That file is only read, and existing names stay as they are.",
				build: (setting) =>
					setting.addButton((button) =>
						button.setButtonText("Import").onClick(async () => {
							await this.plugin.importSavedFormulas();
							this.redraw();
						}),
					),
			},
		);

		return [
			{ rows: general },
			{ heading: "Saved formulas", rows: formulas },
			{ heading: "Skins", rows: this.skinRows() },
		];
	}

	/** The skin choice with a preview of every skin, then Buy and the key field with Activate only when payment is ready. */
	private skinRows(): SettingRow[] {
		const settings = this.plugin.settings;
		const ready = paymentReady(this.plugin.polarIds);
		const paidNames = SKINS.filter((skin) => skin.paid).map((skin) => skin.name).join(" and ");
		const rows: SettingRow[] = [
			{
				name: "Skin",
				desc: `All rolling is free. ${paidNames} are paid skins and need a license key.${ready ? "" : ` ${COMING_SOON}`}`,
				build: (setting) =>
					setting.addDropdown((dropdown) => {
						for (const skin of availableSkins(this.plugin.isLicensed)) dropdown.addOption(skin.id, skin.name);
						dropdown.setValue(settings.skin).onChange(async (value) => {
							settings.skin = value;
							await this.plugin.saveSettings();
							this.plugin.applySkin();
						});
					}),
			},
			{ name: "", build: (setting) => renderSkinPreview(setting.infoEl) },
		];

		if (!ready) {
			rows.push({ name: "License key", desc: COMING_SOON });
			return rows;
		}

		const status = licenseStatus(this.plugin.isLicensed, settings.licenseCheckedAt, this.lastError);
		rows.push(
			{
				name: "Get the paid skins",
				desc: `${paidNames}. One payment, yours to keep.`,
				build: (setting) =>
					setting.addButton((button) =>
						button.setButtonText(`Buy for ${PRICE_TEXT}`).onClick(() => {
							activeWindow.open(this.plugin.polarIds.buyUrl);
						}),
					),
			},
			{
				name: "License key",
				desc: `${status} ${CHECK_NOTE}`,
				build: (setting) => {
					// Typing only changes this draft; nothing is saved or unlocked until Activate.
					let draft = settings.licenseKey;
					setting
						.addText((text) =>
							text.setPlaceholder("Your license key").setValue(draft).onChange((value) => {
								draft = value.trim();
							}),
						)
						.addButton((button) =>
							button.setButtonText("Activate").onClick(async () => {
								button.setDisabled(true);
								const outcome = await this.plugin.activateLicense(draft);
								this.lastError = outcome === "valid" ? null : outcome;
								this.redraw();
							}),
						);
				},
			},
		);
		return rows;
	}
}
