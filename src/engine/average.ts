import { parseFormula } from "./parser";
import { calculate, evaluate, insideName } from "./evaluate";
import { resolveFaces } from "./faces";
import { makeState, spendStep, type State } from "./state";
import { STUNT_SPREAD } from "./stunt";
import { LIMITS, newBudget, type Modifier, type Node, type RollOptions } from "./types";

/**
 * What is known for sure about a part of a formula: its mean, lowest and highest result, and
 * whether it is always whole. Exact for parts without modifiers. For rangeOf (see keptRange) dice
 * that keep, drop or sort also get a Spread: then min and max are exact, but mean is not.
 */
interface Spread {
	mean: number;
	min: number;
	max: number;
	whole: boolean;
}

function constant(value: number): Spread {
	return { mean: value, min: value, max: value, whole: Number.isInteger(value) };
}

function isConstant(spread: Spread): boolean {
	return spread.min === spread.max;
}

function corners(a: Spread, b: Spread): { min: number; max: number } {
	const products = [a.min * b.min, a.min * b.max, a.max * b.min, a.max * b.max];
	return { min: Math.min(...products), max: Math.max(...products) };
}

/**
 * Works out the exact mean, or returns null when only a simulation can tell.
 * Every part of a formula rolls its own dice, so parts are independent: a sum and a
 * product of means are exact. Dividing by a die or a power of a die is not linear
 * ((1d4)^2 is 7.5, while (mean 2.5)^2 is 6.25), so those give null. Neither do counts
 * that could fail in a real roll get a mean.
 */
function exactSpread(node: Node, state: State, rangeOnly = false): Spread | null {
	const inner = (part: Node): Spread | null => exactSpread(part, state, rangeOnly);
	spendStep(state.budget);
	switch (node.type) {
		case "number":
			return constant(node.value);
		case "name":
			return insideName(node.name, state, inner);
		case "group":
			return inner(node.inner);
		case "negate": {
			const spread = inner(node.inner);
			return spread && { mean: -spread.mean, min: -spread.max, max: -spread.min, whole: spread.whole };
		}
		case "dice":
			return exactDice(node, state, rangeOnly);
		case "stunt":
			return STUNT_SPREAD;
		case "binary": {
			const left = inner(node.left);
			if (!left) return null;
			const right = inner(node.right);
			if (!right) return null;
			switch (node.op) {
				case "+":
					return { mean: calculate("+", left.mean, right.mean), min: left.min + right.min, max: left.max + right.max, whole: left.whole && right.whole };
				case "-":
					return { mean: calculate("-", left.mean, right.mean), min: left.min - right.max, max: left.max - right.min, whole: left.whole && right.whole };
				case "*":
					return { mean: calculate("*", left.mean, right.mean), ...corners(left, right), whole: left.whole && right.whole };
				case "/": {
					if (!isConstant(right)) return null;
					const mean = calculate("/", left.mean, right.mean);
					const ends = [left.min / right.mean, left.max / right.mean];
					return { mean, min: Math.min(...ends), max: Math.max(...ends), whole: isConstant(left) && Number.isInteger(mean) };
				}
				case "^":
					return isConstant(left) && isConstant(right) ? constant(calculate("^", left.mean, right.mean)) : null;
			}
		}
	}
}

function exactDice(node: Extract<Node, { type: "dice" }>, state: State, rangeOnly: boolean): Spread | null {
	if (node.modifiers.length > 0 && !rangeOnly) return null;
	const count = node.count ? exactSpread(node.count, state, rangeOnly) : constant(state.defaultCount);
	// Only a count that always works in a real roll: whole, not negative, within the limit.
	if (!count || !count.whole || count.min < 0 || count.max > LIMITS.diceInGroup) return null;
	const faces = resolveFaces(node.sides, state);
	if (node.modifiers.length > 0) return keptRange(node.modifiers, count, faces);
	const facesSpread = { mean: faces.mean, min: faces.min, max: faces.max, whole: true };
	return { mean: calculate("*", count.mean, faces.mean), ...corners(count, facesSpread), whole: true };
}

/**
 * Only for rangeOf: dice that keep, drop or sort, out of a fixed number of dice. The kept dice can
 * all show the lowest or all the highest face, so the ends are exact. The mean is not (2d20kh1 is
 * not 10.5), so it is only a middle that keeps the arithmetic finite and is never shown.
 * Any other modifier (exploding, rerolling, unique, counting) gives null.
 */
function keptRange(modifiers: Modifier[], count: Spread, faces: { min: number; max: number }): Spread | null {
	if (!isConstant(count)) return null;
	let kept = count.min;
	for (const mod of modifiers) {
		if (mod.kind === "sort") continue;
		if (mod.kind === "keep") kept = Math.min(mod.count, kept);
		else if (mod.kind === "drop") kept -= Math.min(mod.count, kept);
		else return null;
	}
	const min = kept * faces.min;
	const max = kept * faces.max;
	return { mean: (min + max) / 2, min, max, whole: true };
}

const AVERAGE_SAMPLES = 2000;

/**
 * The expected result. Exact where the rules of means allow it (see exactSpread),
 * otherwise an estimate from at most 2000 simulated rolls, as far as the budget of one roll reaches.
 */
export function averageOf(formula: string, options: RollOptions = {}): { value: number; exact: boolean } {
	const node = parseFormula(formula, Object.keys(options.names ?? {}));
	const exact = exactSpread(node, makeState({ ...options, budget: undefined }));
	if (exact) return { value: exact.mean, exact: true };
	let mean = 0;
	let samples = 0;
	// One budget for all samples: a heavy formula gets fewer samples, not more time.
	const budget = newBudget();
	for (; samples < AVERAGE_SAMPLES; samples++) {
		try {
			// A running mean, because a sum of very large results could overflow.
			mean += (evaluate(node, makeState({ ...options, budget })).value - mean) / (samples + 1);
		} catch (error) {
			const spent = budget.rolls > LIMITS.rollsPerFormula || budget.steps > LIMITS.stepsPerRoll;
			if (!spent || samples === 0) throw error;
			break;
		}
	}
	return { value: mean, exact: false };
}

/**
 * The lowest and highest result a formula can give, or null when that is not known for sure:
 * modifiers other than keep, drop and sort (exploding has no top), a count that is rolled for
 * dice that keep or drop, or anything averageOf could only estimate. Never throws.
 */
export function rangeOf(formula: string, options: RollOptions = {}): { min: number; max: number } | null {
	try {
		const node = parseFormula(formula, Object.keys(options.names ?? {}));
		const spread = exactSpread(node, makeState({ ...options, budget: undefined }), true);
		return spread && { min: spread.min, max: spread.max };
	} catch {
		return null;
	}
}
