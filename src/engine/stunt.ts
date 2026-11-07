import { DiceError, type Node, type Token } from "./types";

/**
 * The stunt die of Fantasy AGE, written 1dS: three six-sided dice, the third is the stunt die.
 * The result is the sum of all three. When at least two of the three are equal (a double),
 * the stunt die gives that many stunt points; otherwise none.
 */

/** Mean and bounds of 1dS for |avg and for counts such as (1dS)d6. The mean of the total is exact. */
export const STUNT_SPREAD = { mean: 10.5, min: 3, max: 18, whole: true };

/** True for the word of a stunt die: "dS" with a capital S. "ds" stays sorting. */
export function isStuntWord(word: string): boolean {
	return word.startsWith("dS");
}

/** Only 1dS and dS exist. Any other count, or anything glued to it, is an error. */
export function stuntNode(count: Node | null, word: Token): Node {
	if (word.value !== "dS") throw new DiceError(`The stunt die takes no modifiers: write 1dS, not ${word.value}`);
	if (count !== null && !(count.type === "number" && count.value === 1)) {
		const shown = count.type === "number" ? String(count.value) : "X";
		throw new DiceError(`Only one stunt die can be rolled: write 1dS, not ${shown}dS`);
	}
	return { type: "stunt" };
}

/** Rolls 1dS. rollD6 rolls one six-sided die and counts it against the budget. */
export function rollStunt(rollD6: () => number): { value: number; text: string } {
	const first = rollD6();
	const second = rollD6();
	const stunt = rollD6();
	const double = first === second || first === stunt || second === stunt;
	const points = double ? ` (${stunt} stunt ${stunt === 1 ? "point" : "points"})` : "";
	return { value: first + second + stunt, text: `[${first}, ${second}, S:${stunt}]${points}` };
}
