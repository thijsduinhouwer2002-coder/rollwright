import { setIcon } from "obsidian";
import { SKINS } from "../pro/skins";

/** The example result shown in every tile of the skin preview. */
export const PREVIEW_RESULT = "17";

/**
 * Three tiles side by side, one per skin, each with an example result in the real look of that skin
 * and its name under it. Shown with or without a key; it only shows, choosing stays in the Skin row.
 */
export function renderSkinPreview(parent: HTMLElement): void {
	const preview = parent.createDiv({ cls: "rollwright-skin-preview" });
	for (const skin of SKINS) {
		const tile = preview.createDiv({ cls: ["rollwright-skin-preview-tile", skin.cssClass] });
		const roll = tile.createSpan({ cls: ["rollwright-roll", "rollwright-skin-preview-roll"] });
		setIcon(roll.createSpan({ cls: "rollwright-icon" }), "dices");
		roll.createSpan({ cls: "rollwright-value", text: PREVIEW_RESULT });
		tile.createDiv({ cls: "rollwright-skin-preview-name", text: skin.name });
	}
}
