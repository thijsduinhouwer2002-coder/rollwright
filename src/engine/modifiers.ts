import { matchesAny } from "./compare";
import type { Faces } from "./faces";
import { formatNumber } from "./format";
import { rollDie, type Die, type State } from "./state";
import { DiceError, type Condition, type Modifier } from "./types";

export function applyKeepDrop(dice: Die[], mod: Extract<Modifier, { kind: "keep" | "drop" }>): void {
	const active = dice.filter((d) => !d.dropped).sort((a, b) => a.value - b.value);
	const wanted = Math.min(mod.count, active.length);
	let toDrop: Die[];
	if (mod.kind === "keep") {
		toDrop = mod.which === "high" ? active.slice(0, active.length - wanted) : active.slice(wanted);
	} else {
		toDrop = mod.which === "low" ? active.slice(0, wanted) : active.slice(active.length - wanted);
	}
	for (const die of toDrop) die.dropped = true;
}

export function applyExplode(dice: Die[], mod: Extract<Modifier, { kind: "explode" }>, faces: Faces, state: State): Die[] {
	const conditions: Condition[] = mod.conditions.length > 0 ? mod.conditions : [{ op: "=", value: faces.max }];
	const output: Die[] = [];
	for (const die of dice) {
		output.push(die);
		if (die.dropped) continue;
		let current = die;
		for (let i = 0; i < mod.times && matchesAny(current.value, conditions); i++) {
			current.exploded = true;
			const extra = rollDie(faces, state);
			if (mod.combine) {
				die.value += extra.value;
				die.label = undefined;
			} else {
				output.push(extra);
			}
			current = mod.combine ? { value: extra.value } : extra;
		}
	}
	return output;
}

export function applyReroll(dice: Die[], mod: Extract<Modifier, { kind: "reroll" }>, faces: Faces, state: State): void {
	const conditions: Condition[] = mod.conditions.length > 0 ? mod.conditions : [{ op: "=", value: faces.min }];
	for (const die of dice) {
		if (die.dropped) continue;
		for (let i = 0; i < mod.times && matchesAny(die.value, conditions); i++) {
			const next = rollDie(faces, state);
			die.value = next.value;
			die.label = next.label;
			die.rerolled = true;
		}
	}
}

export function applyUnique(dice: Die[], faces: Faces, state: State): void {
	const active = dice.filter((d) => !d.dropped);
	if (active.length > faces.size) {
		throw new DiceError(`${active.length} dice cannot all differ: there are only ${faces.size} results. Roll fewer dice or a bigger die, like 3d6u.`);
	}
	const seen = new Set<number>();
	for (const die of active) {
		while (seen.has(die.value)) {
			const next = rollDie(faces, state);
			die.value = next.value;
			die.label = next.label;
			die.rerolled = true;
		}
		seen.add(die.value);
	}
}

export function showDie(die: Die): string {
	let text = die.label ?? formatNumber(die.value);
	if (die.dropped) text += "d";
	if (die.exploded) text += "!";
	if (die.rerolled) text += "r";
	if (die.score === 1) text += "*";
	if (die.score === -1) text += "-";
	return text;
}
