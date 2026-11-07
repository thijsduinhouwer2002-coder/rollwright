export interface InlineDice {
	/** Position of the opening backtick in the line. */
	from: number;
	/** Position right after the closing backtick. */
	to: number;
	formula: string;
	/** True for `dice+:`: the result is kept on disk across restarts. */
	keep: boolean;
	/** True for `dice-mod:`: after a click and a confirmation, the code is replaced by its result. */
	modify: boolean;
}

/**
 * Finds `dice: x` in one line of text. Longer backtick runs are skipped. A backtick with a
 * backslash before it opens no code, as in markdown, so an escaped backtick written by dice-mod never
 * pairs with a later backtick. Inside a code span a backslash means nothing.
 */
export function findInlineDice(line: string): InlineDice[] {
	const found: InlineDice[] = [];
	const pattern = /\\[\s\S]|(`+)([^`]*)\1/g;
	for (let match = pattern.exec(line); match; match = pattern.exec(line)) {
		if (match[1] === undefined) continue;
		const code = readDiceCode(match[2] as string);
		if (match[1].length === 1 && code !== null) {
			found.push({ from: match.index, to: match.index + match[0].length, formula: code.formula, keep: code.keep, modify: code.modify === true });
		}
	}
	return found;
}

export interface DiceCode {
	formula: string;
	/** "dice+:" keeps the result across restarts. "dice:", "dice-:" and "dice-mod:" never do. */
	keep: boolean;
	/** Only set, to true, for "dice-mod:". Left out for the others. */
	modify?: true;
}

/**
 * Reads "dice:", "dice+:", "dice-:" and "dice-mod:" in the note itself. Rollers that roll
 * inside a result (nested cells in run.ts, lookup headers in table.ts) still refuse
 * "dice-mod:", because there is no place in the note to replace.
 */
export function readDiceCode(text: string): DiceCode | null {
	const match = /^dice(-mod|[+-])?:\s*(.*\S)\s*$/i.exec(text.trim());
	if (!match) return null;
	const prefix = (match[1] ?? "").toLowerCase();
	const code: DiceCode = { formula: match[2] as string, keep: prefix === "+" };
	if (prefix === "-mod") code.modify = true;
	return code;
}

/** The formula in the text of a code element, or null if it is not a dice code. */
export function formulaFromCode(text: string): string | null {
	return readDiceCode(text)?.formula ?? null;
}
