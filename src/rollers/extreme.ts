import { parseFormula, rangeOf, type RollOptions } from "../engine";

/** A roll that is the highest or lowest result its formula can give. */
export type Extreme = "max" | "min";

/**
 * "max" when total is the highest result the formula can give, "min" when it is the lowest,
 * otherwise undefined. Only when both ends are known for sure (see rangeOf): never for an
 * estimate, exploding dice, or a formula that always gives the same result.
 */
export function extremeOf(total: number, formula: string, options: RollOptions = {}): Extreme | undefined {
	const range = rangeOf(formula, options);
	if (range === null || range.min === range.max) return undefined;
	if (total === range.max) return "max";
	if (total === range.min) return "min";
	return undefined;
}

type Node = ReturnType<typeof parseFormula>;
type DiceNode = Extract<Node, { type: "dice" }>;

/** Names in names that refer to each other this deep are not followed (the roll itself would fail). */
const MAX_NAME_DEPTH = 8;

/** 1d20 (or d20), 1d20kh1, or two d20 of which one counts: 2d20kh1, 2d20k1, 2d20kl1, 2d20dl1, 2d20dh1. */
function isOneD20(node: DiceNode, defaultSides: number | undefined): boolean {
	const twenty = node.sides.kind === "number" ? node.sides.sides === 20 : node.sides.kind === "default" && defaultSides === 20;
	if (!twenty) return false;
	const count = node.count === null ? 1 : node.count.type === "number" ? node.count.value : NaN;
	const mods = node.modifiers;
	if (count === 1) return mods.length === 0 || (mods.length === 1 && mods[0]?.kind === "keep" && mods[0].count === 1);
	if (count === 2) return mods.length === 1 && (mods[0]?.kind === "keep" || mods[0]?.kind === "drop") && mods[0].count === 1;
	return false;
}

/**
 * The sign of the one d20 that counts in the formula (+1 or -1), or null when that is not exactly
 * one d20 with only numbers and names of numbers added or taken off. Names are filled in first.
 */
function d20Sign(node: Node, names: Record<string, string>, defaultSides: number | undefined, depth: number, found: { sign: number | null; other: boolean }, sign: number): void {
	switch (node.type) {
		case "number":
			return;
		case "group":
			d20Sign(node.inner, names, defaultSides, depth, found, sign);
			return;
		case "negate":
			d20Sign(node.inner, names, defaultSides, depth, found, -sign);
			return;
		case "binary":
			if (node.op !== "+" && node.op !== "-") {
				found.other = true;
				return;
			}
			d20Sign(node.left, names, defaultSides, depth, found, sign);
			d20Sign(node.right, names, defaultSides, depth, found, node.op === "-" ? -sign : sign);
			return;
		case "name": {
			const formula = Object.prototype.hasOwnProperty.call(names, node.name) ? names[node.name] : undefined;
			if (formula === undefined || depth >= MAX_NAME_DEPTH) {
				found.other = true;
				return;
			}
			d20Sign(parseFormula(formula, Object.keys(names)), names, defaultSides, depth + 1, found, sign);
			return;
		}
		case "dice":
			if (found.sign === null && isOneD20(node, defaultSides)) found.sign = sign;
			else found.other = true;
			return;
		default:
			found.other = true;
	}
}

/** Where the names of a roll come from: note fields and saved formulas, as in RollOptions. */
export interface StampNames {
	names?: Record<string, string>;
	defaultSides?: number;
}

/**
 * The stamp on a crit or fumble. "NAT 20" and "NAT 1" only when exactly one d20 counts
 * (1d20 + 4, advantage 2d20kh1 or 2d20dl1, disadvantage 2d20kl1 or 2d20dh1), with names such as
 * `1d20 + dex` or a saved formula filled in first: then the die really showed that number.
 * For any other formula (2d6, 4d6kh3, 1d20 + 1d4, 1d20 * 2, Fudge dice) "NAT 20" would not be true,
 * so it says MAX or MIN.
 */
export function stampText(formula: string, extreme: Extreme, options: StampNames = {}): string {
	const names = options.names ?? {};
	const found: { sign: number | null; other: boolean } = { sign: null, other: false };
	try {
		d20Sign(parseFormula(formula, Object.keys(names)), names, options.defaultSides, 0, found, 1);
	} catch {
		found.other = true;
	}
	if (found.other || found.sign === null) return extreme === "max" ? "MAX" : "MIN";
	// 10 - 1d20 is highest when the die shows 1.
	const high = (extreme === "max") === (found.sign > 0);
	return high ? "NAT 20" : "NAT 1";
}
