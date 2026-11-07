/** Shows at most two decimals and never "-0". Very large numbers cannot be rounded this way and stay as they are. */
export function formatNumber(value: number): string {
	if (value === Infinity) return "∞";
	if (value === -Infinity) return "-∞";
	const rounded = Math.round(value * 100) / 100;
	if (!Number.isFinite(rounded)) return String(value);
	return String(rounded === 0 ? 0 : rounded);
}

export interface NumberStyle {
	round?: "round" | "ceil" | "floor";
	signed?: boolean;
	paren?: boolean;
}

/**
 * Makes a number whole. "round" goes to the nearest whole number, halves away from zero (2.5 is 3, -2.5 is -3).
 * First rounded to 10 decimals, so a float error such as 3.0000000000000004 from (0.1+0.2)*10 gives 3 with ceil.
 */
export function roundNumber(raw: number, mode: NumberStyle["round"]): number {
	if (mode === undefined || !Number.isFinite(raw)) return raw;
	const value = Number(raw.toFixed(10));
	if (mode === "ceil") return Math.ceil(value);
	if (mode === "floor") return Math.floor(value);
	return Math.sign(value) * Math.round(Math.abs(value));
}

/** Shows a result with the number flags: first rounding, then the sign, then brackets. Without flags this is formatNumber. */
export function formatResult(value: number, style: NumberStyle = {}): string {
	const shown = formatNumber(roundNumber(value, style.round));
	const signed = style.signed && !shown.startsWith("-") ? `+${shown}` : shown;
	return style.paren ? `(${signed})` : signed;
}
