import { DiceError, LIMITS, type RandomInt, type Sides } from "./types";

const TOO_MANY_SIDES = `A die can have at most ${LIMITS.sides} sides. Use a smaller die, like 1d100.`;

export interface Faces {
	min: number;
	max: number;
	/** How many different results exist. */
	size: number;
	mean: number;
	roll(random: RandomInt): { value: number; label?: string };
}

export function range(min: number, max: number): Faces {
	return { min, max, size: max - min + 1, mean: (min + max) / 2, roll: (random) => ({ value: random(min, max) }) };
}

/** The faces of a die; a die without sides gets the default number of sides. */
export function resolveFaces(sides: Sides, state: { defaultSides: number }): Faces {
	switch (sides.kind) {
		case "default":
			return checkedSides(state.defaultSides);
		case "number":
			return checkedSides(sides.sides);
		case "percent":
			return range(1, 100);
		case "range":
			return checkedSpan(sides.min, sides.max);
		case "fudge":
			return {
				min: -1,
				max: 1,
				size: 3,
				mean: 0,
				roll: (random) => {
					const value = random(-1, 1);
					return { value, label: value > 0 ? "+" : value < 0 ? "-" : "0" };
				},
			};
		case "faces": {
			const faces = sides.faces;
			if (faces.length > LIMITS.diceInGroup) throw new DiceError(`A custom die has too many faces. Use at most ${LIMITS.diceInGroup}, or a range, like d[1, 5000].`);
			return {
				min: Math.min(...faces),
				max: Math.max(...faces),
				size: new Set(faces).size,
				mean: faces.reduce((a, b) => a + b, 0) / faces.length,
				roll: (random) => ({ value: faces[random(0, faces.length - 1)] as number }),
			};
		}
		case "digits": {
			const digits = sides.digits;
			const join = (values: number[]) => Number(values.join(""));
			return {
				min: join(digits.map(() => 1)),
				max: join(digits),
				size: digits.reduce((a, b) => a * b, 1),
				mean: digits.reduce((sum, d) => sum * 10 + (d + 1) / 2, 0),
				roll: (random) => {
					const values = digits.map((d) => random(1, d));
					return { value: join(values), label: values.join(",") };
				},
			};
		}
	}
}

function checkedSides(sides: number): Faces {
	if (!Number.isInteger(sides) || sides < 1) throw new DiceError(`A die needs at least 1 side, not ${sides}. Use 1 or more, like 1d6.`);
	if (sides > LIMITS.sides) throw new DiceError(TOO_MANY_SIDES);
	return range(1, sides);
}

function checkedSpan(min: number, max: number): Faces {
	if (max - min + 1 > LIMITS.sides) throw new DiceError(TOO_MANY_SIDES);
	return range(min, max);
}
