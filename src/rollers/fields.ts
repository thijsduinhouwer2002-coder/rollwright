import { tokenize } from "../engine";

/** Letters that the notation reads as a die or modifier, such as d, dh, k, s or F. These stay notation. */
const NOTATION_WORD = /^d?f?(kh|kl|dh|dl|k|sa|sd|s|u|r|i)*$/i;
/** A text that is exactly a number, such as "3", "-2" or "1.5". */
const NUMBER_TEXT = /^-?\d+(\.\d+)?$/;

/** True when a formula can use this field name as a name: one word, and not notation. */
function usableName(name: string): boolean {
	if (NOTATION_WORD.test(name)) return false;
	try {
		const tokens = tokenize(name);
		return tokens.length === 1 && tokens[0]?.type === "word" && tokens[0].value === name;
	} catch {
		return false;
	}
}

/** The number in a field, as formula text, or undefined when it is no finite number. */
function numberText(value: unknown): string | undefined {
	// A very large or small number prints as "1e+21", which the notation cannot read: skip it too.
	if (typeof value !== "number" && typeof value !== "string") return undefined;
	const text = typeof value === "number" ? String(value) : value.trim();
	return NUMBER_TEXT.test(text) && Number.isFinite(Number(text)) ? text : undefined;
}

/**
 * Number fields of a note's frontmatter as named formulas, so `dice: str` and `1d20 + str`
 * read them the way they read a saved formula. Fields that are no number, or whose name
 * reads as notation, are left out; then the formula gives the usual "Unknown name".
 */
export function fieldNames(frontmatter: unknown): Record<string, string> {
	const names: Record<string, string> = {};
	if (typeof frontmatter !== "object" || frontmatter === null || Array.isArray(frontmatter)) return names;
	for (const [name, value] of Object.entries(frontmatter as Record<string, unknown>)) {
		const text = numberText(value);
		if (text !== undefined && name !== "__proto__" && usableName(name)) names[name] = text;
	}
	return names;
}
