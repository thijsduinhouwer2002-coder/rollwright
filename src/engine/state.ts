import { defaultRandom } from "./random";
import type { Faces } from "./faces";
import { DiceError, LIMITS, newBudget, TOO_MANY_ROLLS_MESSAGE, type Budget, type RandomInt, type RollOptions } from "./types";

export interface Die {
	value: number;
	label?: string;
	dropped?: boolean;
	exploded?: boolean;
	rerolled?: boolean;
	score?: number;
}

export interface State {
	random: RandomInt;
	defaultSides: number;
	defaultCount: number;
	names: Record<string, string>;
	budget: Budget;
	aliasStack: string[];
}

function spend(state: State): void {
	if (++state.budget.rolls > LIMITS.rollsPerFormula) {
		throw new DiceError(TOO_MANY_ROLLS_MESSAGE);
	}
}

export function rollDie(faces: Faces, state: State): Die {
	spend(state);
	return faces.roll(state.random);
}

export function spendStep(budget: Budget): void {
	if (++budget.steps > LIMITS.stepsPerRoll) throw new DiceError("This formula is too complex to work out. Make it simpler, with fewer dice and fewer named formulas, like 4d6kh3 + 2.");
}

export function makeState(options: RollOptions): State {
	return {
		random: options.random ?? defaultRandom,
		defaultSides: options.defaultSides ?? 100,
		defaultCount: options.defaultCount ?? 1,
		names: options.names ?? {},
		budget: options.budget ?? newBudget(),
		aliasStack: [],
	};
}
