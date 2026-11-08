import { setIcon } from "obsidian";
import { SKINS } from "../pro/skins";
import { extremeClasses, STAMP_CLASS } from "./widget";

/** The big token of every tile: a crit, the finest moment the skin has (Daan, ontwerp-v2 klus 7). */
export const PREVIEW_CRIT = "20";
export const PREVIEW_STAMP = "NAT 20";
/** The small ordinary roll next to it. */
export const PREVIEW_RESULT = "17";

/**
 * Three tiles side by side, one per skin, each with a crit and a small ordinary roll in the real look
 * of that skin, and its name under it. A paid skin that is not unlocked gets a small lock next to its
 * name. Shown with or without a key; it only shows, choosing stays in the Skin row.
 */
export function renderSkinPreview(parent: HTMLElement, licensed: boolean): void {
	const preview = parent.createDiv({ cls: "rollwright-skin-preview" });
	for (const skin of SKINS) {
		const tile = preview.createDiv({ cls: ["rollwright-skin-preview-tile", skin.cssClass] });
		const rolls = tile.createDiv({ cls: "rollwright-skin-preview-rolls" });
		const crit = rolls.createSpan({ cls: ["rollwright-roll", ...extremeClasses("max"), "rollwright-skin-preview-roll"] });
		setIcon(crit.createSpan({ cls: "rollwright-icon" }), "dices");
		crit.createSpan({ cls: "rollwright-value", text: PREVIEW_CRIT });
		crit.createSpan({ cls: STAMP_CLASS, text: PREVIEW_STAMP });
		const plain = rolls.createSpan({ cls: ["rollwright-roll", "rollwright-skin-preview-roll", "rollwright-skin-preview-small"] });
		setIcon(plain.createSpan({ cls: "rollwright-icon" }), "dices");
		plain.createSpan({ cls: "rollwright-value", text: PREVIEW_RESULT });
		const name = tile.createDiv({ cls: "rollwright-skin-preview-name", text: skin.name });
		if (skin.paid && !licensed) {
			const lock = name.createSpan({ cls: "rollwright-skin-preview-lock", attr: { "aria-label": "Paid skin, needs a license key" } });
			setIcon(lock, "lock");
		}
	}
}
