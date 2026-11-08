/** Class of a dice code inside a result that does not roll (shown as plain text). */
export const NESTED_CLASS = "rollwright-nested";

/** A dice code ("dice", maybe + or - or -mod, then ":"), with or without the invisible character that defuseRolls adds. */
const NESTED = /^\s*dice\s*(?:[+-]|-\s*mod)?\s*\u200b?\s*:\s*([\s\S]*?)\s*$/i;

/**
 * Daan punt 3 (beoordeling 9): a section, paragraph or line as result shows its own dice codes as
 * raw code (`dice: 1d6`), which looks like a mistake. Those codes do not roll on purpose (a note
 * that rolls on itself would never stop, see defuse.ts), so they become plain text with only the
 * formula, like "1d6". No title of its own: the roll already has a tooltip. Runs after MarkdownRenderer.render.
 */
export function quietNestedCodes(value: Element): void {
	for (let i = 0; i < value.childElementCount; i++) {
		const child = value.children.item(i);
		if (child === null || child.tagName === "PRE") continue;
		if (child.tagName !== "CODE") {
			quietNestedCodes(child);
			continue;
		}
		const formula = NESTED.exec(child.textContent ?? "")?.[1];
		if (!formula) continue;
		const span = child.ownerDocument.createElement("span");
		span.className = NESTED_CLASS;
		span.textContent = formula;
		child.replaceWith(span);
	}
}
