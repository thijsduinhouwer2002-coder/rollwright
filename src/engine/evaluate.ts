import { parseFormula } from "./parser";
import { formatNumber } from "./format";
import { compare } from "./compare";
import { rollStunt } from "./stunt";
import { range, resolveFaces } from "./faces";
import { applyExplode, applyKeepDrop, applyReroll, applyUnique, showDie } from "./modifiers";
import { makeState, rollDie, spendStep, type Die, type State } from "./state";
import { DiceError, LIMITS, tooManyDiceMessage, TOO_LARGE_MESSAGE, type Modifier, type Node, type RollOptions, type RollResult } from "./types";

export interface Evaluated {
	value: number;
	text: string;
}

function evaluateDice(node: Extract<Node, { type: "dice" }>, state: State): Evaluated {
	const count = node.count ? evaluate(node.count, state).value : state.defaultCount;
	if (!Number.isInteger(count)) throw new DiceError(`The number of dice must be whole, not ${formatNumber(count)}. Use a whole number before the d, like 2d6.`);
	if (count < 0) throw new DiceError(`The number of dice cannot be negative (${count}). Use 0 or more, like 2d6.`);
	if (count > LIMITS.diceInGroup) throw new DiceError(tooManyDiceMessage(count));
	const faces = resolveFaces(node.sides, state);

	let dice: Die[] = [];
	for (let i = 0; i < count; i++) dice.push(rollDie(faces, state));

	const counting: Extract<Modifier, { kind: "count" }>[] = [];
	for (const mod of node.modifiers) {
		switch (mod.kind) {
			case "keep":
			case "drop":
				applyKeepDrop(dice, mod);
				break;
			case "explode":
				dice = applyExplode(dice, mod, faces, state);
				break;
			case "reroll":
				applyReroll(dice, mod, faces, state);
				break;
			case "unique":
				applyUnique(dice, faces, state);
				break;
			case "sort":
				dice = [...dice].sort((a, b) => (mod.direction === "asc" ? a.value - b.value : b.value - a.value));
				break;
			case "count":
				counting.push(mod);
				break;
		}
	}

	const active = dice.filter((d) => !d.dropped);
	let value: number;
	if (counting.length > 0) {
		const targets = counting.map((c) => ({ c, target: evaluate(c.threshold, state).value }));
		for (const die of active) {
			const hit = targets.find(({ c, target }) => compare(die.value, c.op, target));
			die.score = hit ? hit.c.score : 0;
		}
		value = active.reduce((sum, d) => sum + (d.score ?? 0), 0);
	} else {
		value = active.reduce((sum, d) => sum + d.value, 0);
		if (!Number.isFinite(value)) throw new DiceError(TOO_LARGE_MESSAGE);
	}
	return { value, text: `[${dice.map(showDie).join(", ")}]` };
}

/** Own keys only, so a name like "constructor" is simply unknown. */
function lookupName(names: Record<string, string> | undefined, name: string): string | undefined {
	return names && Object.prototype.hasOwnProperty.call(names, name) ? names[name] : undefined;
}

/** Runs work on the formula behind a name, and guards against names that refer to themselves. */
export function insideName<T>(name: string, state: State, work: (node: Node) => T): T {
	const formula = lookupName(state.names, name);
	if (formula === undefined) throw new DiceError(`Unknown name "${name}". Check the spelling, or add ${name} to the frontmatter or the saved formulas, like ${name}: 2.`);
	if (state.aliasStack.includes(name) || state.aliasStack.length >= LIMITS.aliasDepth) {
		throw new DiceError(`The named formula "${name}" refers to itself. Change that saved formula so it does not use "${name}", like 1d20 + 5.`);
	}
	state.aliasStack.push(name);
	const result = work(parseFormula(formula, Object.keys(state.names)));
	state.aliasStack.pop();
	return result;
}

function evaluateName(name: string, state: State): Evaluated {
	return insideName(name, state, (node) => evaluate(node, state));
}

export function evaluate(node: Node, state: State): Evaluated {
	spendStep(state.budget);
	switch (node.type) {
		case "number":
			return { value: node.value, text: formatNumber(node.value) };
		case "name":
			return evaluateName(node.name, state);
		case "negate": {
			const inner = evaluate(node.inner, state);
			return { value: -inner.value, text: `-${inner.text}` };
		}
		case "group": {
			const inner = evaluate(node.inner, state);
			return { value: inner.value, text: `(${inner.text})` };
		}
		case "dice":
			return evaluateDice(node, state);
		case "stunt":
			return rollStunt(() => rollDie(range(1, 6), state).value);
		case "binary": {
			const left = evaluate(node.left, state);
			const right = evaluate(node.right, state);
			return { value: calculate(node.op, left.value, right.value), text: `${left.text} ${node.op} ${right.text}` };
		}
	}
}

export function calculate(op: string, a: number, b: number): number {
	let value: number;
	switch (op) {
		case "+":
			value = a + b;
			break;
		case "-":
			value = a - b;
			break;
		case "*":
			value = a * b;
			break;
		case "/":
			if (b === 0) throw new DiceError("Cannot divide by zero. Check the number after /, like 10 / 2.");
			value = a / b;
			break;
		default:
			value = Math.pow(a, b);
	}
	if (!Number.isFinite(value)) throw new DiceError(TOO_LARGE_MESSAGE);
	return value;
}

/** Rolls a formula. Throws DiceError with a readable message when it is broken. */
export function roll(formula: string, options: RollOptions = {}): RollResult {
	const node = parseFormula(formula, Object.keys(options.names ?? {}));
	const { value, text } = evaluate(node, makeState(options));
	return { formula: formula.trim(), total: value, breakdown: text };
}
