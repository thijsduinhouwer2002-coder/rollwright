import { parseFormula } from "./parser";
import { calculate, evaluate, insideName } from "./evaluate";
import { resolveFaces } from "./faces";
import { makeState, spendStep, type State } from "./state";
import { STUNT_SPREAD } from "./stunt";
import { LIMITS, newBudget, type Node, type RollOptions } from "./types";

/** What is known for sure about a part of a formula that has no modifiers. */
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
function exactSpread(node: Node, state: State): Spread | null {
	spendStep(state.budget);
	switch (node.type) {
		case "number":
			return constant(node.value);
		case "name":
			return insideName(node.name, state, (inner) => exactSpread(inner, state));
		case "group":
			return exactSpread(node.inner, state);
		case "negate": {
			const inner = exactSpread(node.inner, state);
			return inner && { mean: -inner.mean, min: -inner.max, max: -inner.min, whole: inner.whole };
		}
		case "dice":
			return exactDice(node, state);
		case "stunt":
			return STUNT_SPREAD;
		case "binary": {
			const left = exactSpread(node.left, state);
			if (!left) return null;
			const right = exactSpread(node.right, state);
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

function exactDice(node: Extract<Node, { type: "dice" }>, state: State): Spread | null {
	if (node.modifiers.length > 0) return null;
	const count = node.count ? exactSpread(node.count, state) : constant(state.defaultCount);
	// Only a count that always works in a real roll: whole, not negative, within the limit.
	if (!count || !count.whole || count.min < 0 || count.max > LIMITS.diceInGroup) return null;
	const faces = resolveFaces(node.sides, state);
	const facesSpread = { mean: faces.mean, min: faces.min, max: faces.max, whole: true };
	return { mean: calculate("*", count.mean, faces.mean), ...corners(count, facesSpread), whole: true };
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
