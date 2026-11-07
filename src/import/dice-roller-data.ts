export interface SavedFormula {
	name: string;
	formula: string;
}

const NAME_KEYS = ["alias", "name", "title", "label"];
const FORMULA_KEYS = ["formula", "dice", "value"];

function firstString(entry: Record<string, unknown>, keys: string[]): string | null {
	for (const key of keys) {
		const value = entry[key];
		if (typeof value === "string" && value.trim() !== "") return value.trim();
	}
	return null;
}

/**
 * Reads named formulas from the text of another plugin's data.json. The exact
 * layout is not known to us, so this accepts the plain shapes under any
 * top-level key with "formula" in its name: a list of objects, or a map from
 * name to formula. Anything else is skipped. Never throws on bad content.
 */
export function extractSavedFormulas(jsonText: string): SavedFormula[] {
	let data: unknown;
	try {
		data = JSON.parse(jsonText);
	} catch {
		return [];
	}
	if (typeof data !== "object" || data === null) return [];

	const found: SavedFormula[] = [];
	for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
		if (!key.toLowerCase().includes("formula")) continue;
		if (Array.isArray(value)) {
			for (const entry of value) {
				if (typeof entry !== "object" || entry === null) continue;
				const name = firstString(entry as Record<string, unknown>, NAME_KEYS);
				const formula = firstString(entry as Record<string, unknown>, FORMULA_KEYS);
				if (name && formula) found.push({ name, formula });
			}
		} else if (typeof value === "object" && value !== null) {
			for (const [name, formula] of Object.entries(value as Record<string, unknown>)) {
				if (typeof formula === "string" && formula.trim() !== "") found.push({ name, formula: formula.trim() });
			}
		}
	}
	return found;
}

/** Adds formulas under new names only: what the user already has is never overwritten. */
export function mergeFormulas(current: SavedFormula[], incoming: SavedFormula[]): { merged: SavedFormula[]; added: number } {
	const names = new Set(current.map((f) => f.name));
	const merged = [...current];
	for (const formula of incoming) {
		if (names.has(formula.name)) continue;
		names.add(formula.name);
		merged.push(formula);
	}
	return { merged, added: merged.length - current.length };
}
