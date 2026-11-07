/** Returns a whole number from min to max, both included. */
export type RandomInt = (min: number, max: number) => number;

/** Every problem with a formula is reported with this error, with a readable message. */
export class DiceError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "DiceError";
	}
}

export const LIMITS = {
	formulaLength: 1000,
	parseDepth: 64,
	diceInGroup: 1000,
	sides: 1000000,
	rollsPerFormula: 10000,
	/** Upper bound for the repeat count of ! and r, and the meaning of "i". */
	repeats: 100,
	aliasDepth: 8,
	/** Calculation steps per roll, so chains of named formulas cannot run for ages. */
	stepsPerRoll: 100000,
	/** Picks from tables, lists and notes per roll, nesting included. */
	picksPerRoll: 10000,
} as const;

/** Messages for limits that are checked in more than one place. */
export function tooManyDiceMessage(count: number): string {
	return `At most ${LIMITS.diceInGroup} dice can be rolled at once, not ${count}. Use a smaller number, like 100d6.`;
}
export const TOO_MANY_ROLLS_MESSAGE = `This formula rolls more than ${LIMITS.rollsPerFormula} dice. Roll fewer dice, or limit exploding and rerolling, like 10d6!3.`;
export const TOO_LARGE_MESSAGE = "The result is too large to show. Use smaller numbers or fewer dice, like 10d6 * 100.";

export interface Token {
	type: "num" | "word" | "cmp" | "bang" | "sym";
	value: string;
	pos: number;
}

export type CompareOp = "=" | "!=" | ">" | "<" | ">=" | "<=";

export interface Condition {
	op: CompareOp;
	value: number;
}

export type Sides =
	| { kind: "default" }
	| { kind: "number"; sides: number }
	| { kind: "percent" }
	| { kind: "digits"; digits: number[] }
	| { kind: "fudge" }
	| { kind: "range"; min: number; max: number }
	| { kind: "faces"; faces: number[] };

export type Modifier =
	| { kind: "keep" | "drop"; which: "high" | "low"; count: number }
	| { kind: "explode"; combine: boolean; times: number; conditions: Condition[] }
	| { kind: "reroll"; times: number; conditions: Condition[] }
	| { kind: "sort"; direction: "asc" | "desc" }
	| { kind: "unique" }
	| { kind: "count"; op: CompareOp; threshold: Node; score: 1 | -1 };

export type Node =
	| { type: "number"; value: number }
	| { type: "name"; name: string }
	| { type: "negate"; inner: Node }
	| { type: "group"; inner: Node }
	| { type: "binary"; op: "+" | "-" | "*" | "/" | "^"; left: Node; right: Node }
	| { type: "dice"; count: Node | null; sides: Sides; modifiers: Modifier[] }
	/** 1dS, the stunt die of Fantasy AGE (see stunt.ts). */
	| { type: "stunt" };

/** What one roll has used so far. Nested rollers share one budget. */
export interface Budget {
	rolls: number;
	steps: number;
	picks: number;
}

export function newBudget(): Budget {
	return { rolls: 0, steps: 0, picks: 0 };
}

export interface RollOptions {
	budget?: Budget;
	random?: RandomInt;
	/** Used when the sides are left out, as in "3d". Defaults to 100. */
	defaultSides?: number;
	/** Used when the count is left out, as in "d6". Defaults to 1. */
	defaultCount?: number;
	/** Named formulas that may be used as a value inside a formula. */
	names?: Record<string, string>;
}

export interface RollResult {
	formula: string;
	total: number;
	/** The dice as they fell, such as "[75, 20, 75] + 12". */
	breakdown: string;
}
