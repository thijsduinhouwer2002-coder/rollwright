import { parseFormula } from "./parser";
import { defaultRandom } from "./random";
import { DiceError, LIMITS, newBudget, tooManyDiceMessage, TOO_MANY_ROLLS_MESSAGE, type Budget, type RandomInt } from "./types";

/**
 * Narrative dice of Genesys and the Star Wars roleplaying games, written like 3g2d.
 * Only used when a formula cannot be read as ordinary notation (see run.ts): 2d, d, 1dS,
 * 4dF and every other ordinary formula keep their meaning. The faces below are written
 * from general knowledge of the games and still have to be checked against the rulebook.
 */

export type NarrativeKind = "ability" | "proficiency" | "difficulty" | "challenge" | "boost" | "setback" | "force";

/** One symbol on a face: Success, Failure, Advantage, Threat, Triumph, Despair, Light, Dark. */
type Mark = "S" | "F" | "A" | "T" | "Tr" | "De" | "L" | "D";

const NAMES: Record<NarrativeKind, string> = {
	ability: "Ability",
	proficiency: "Proficiency",
	difficulty: "Difficulty",
	challenge: "Challenge",
	boost: "Boost",
	setback: "Setback",
	force: "Force",
};

/** The faces of each die, one string per face, symbols split by spaces. "" is a blank face. */
const FACES: Record<NarrativeKind, string[]> = {
	boost: ["", "", "S", "S A", "A A", "A"],
	setback: ["", "", "F", "F", "T", "T"],
	ability: ["", "S", "S", "S S", "A", "A", "S A", "A A"],
	difficulty: ["", "F", "F F", "T", "T", "T", "T T", "F T"],
	proficiency: ["", "S", "S", "S S", "S S", "A", "S A", "S A", "S A", "A A", "A A", "Tr"],
	challenge: ["", "F", "F", "F F", "F F", "T", "T", "F T", "F T", "T T", "T T", "De"],
	force: ["D", "D", "D", "D", "D", "D", "D D", "L", "L", "L L", "L L", "L L"],
};

/**
 * The letters of the notation. "p" is missing on purpose: it means Proficiency when the
 * formula also has an A, C or D die, and is ambiguous otherwise (see resolveP).
 */
const LETTERS: Record<string, NarrativeKind> = {
	g: "ability",
	a: "ability",
	y: "proficiency",
	pro: "proficiency",
	d: "difficulty",
	diff: "difficulty",
	r: "challenge",
	c: "challenge",
	b: "boost",
	boo: "boost",
	s: "setback",
	sb: "setback",
	blk: "setback",
	w: "force",
	f: "force",
};

/** All letters including "p", longest first, so "diff" is tried before "d" and "sb" before "s". */
const WORDS = [...Object.keys(LETTERS), "p"].sort((a, b) => b.length - a.length);

/** Letters that switch "p" to Proficiency. */
const SWITCHES = new Set(["a", "c", "d", "diff"]);

export interface NarrativeGroup {
	count: number;
	kind: NarrativeKind;
}

/** Splits a run of letters into words of the notation, or returns null. Tries longer words first; remembers dead ends so long runs stay fast. */
function splitLetters(run: string, from = 0, dead = new Set<number>()): string[] | null {
	if (from === run.length) return [];
	if (dead.has(from)) return null;
	for (const word of WORDS) {
		if (!run.startsWith(word, from)) continue;
		const rest = splitLetters(run, from + word.length, dead);
		if (rest) return [word, ...rest];
	}
	dead.add(from);
	return null;
}

/**
 * True when a piece between spaces reads as ordinary notation with more than a count and a d,
 * such as 4dF, 2d6s or 1dS. Such a piece is never narrative, so "4dF 2d" is not 4 Difficulty and a Force.
 * "2d" and "d" are allowed: alone they roll as ordinary dice anyway, so they only get here next to narrative dice.
 */
function isOrdinaryPiece(piece: string): boolean {
	try {
		const node = parseFormula(piece, []);
		return !(node.type === "name" || (node.type === "dice" && node.sides.kind === "default" && node.modifiers.length === 0));
	} catch {
		return false;
	}
}

/**
 * Reads a formula as narrative dice. Returns null when it is not made only of groups such as
 * 3g or 2d (capitals the same as small letters). Each piece between spaces must be narrative on
 * its own, so "2d6 2d" is not read as "2d62d". Throws when it is narrative but a "p" cannot be told apart.
 */
export function parseNarrative(formula: string): NarrativeGroup[] | null {
	if (formula.length > LIMITS.formulaLength) return null;
	const pieces = formula.trim().split(/\s+/);
	const words: { count: number; word: string }[] = [];
	for (const piece of pieces) {
		const text = piece.toLowerCase();
		if (!/^[0-9a-z]*[a-z]$/.test(text) || isOrdinaryPiece(piece)) return null;
		const groups = /(\d*)([a-z]+)/g;
		for (let match = groups.exec(text); match; match = groups.exec(text)) {
			const split = splitLetters(match[2] as string);
			if (!split) return null;
			split.forEach((word, i) => words.push({ count: i === 0 && match[1] !== "" ? Number(match[1]) : 1, word }));
		}
	}
	const switched = words.some((w) => SWITCHES.has(w.word));
	return words.map(({ count, word }) => {
		if (word !== "p") return { count, kind: LETTERS[word] as NarrativeKind };
		if (!switched) throw new DiceError("P is ambiguous here: write Y for Proficiency or D for Difficulty");
		return { count, kind: "proficiency" };
	});
}

/** True when a formula reads as narrative dice. An ambiguous "p" counts as narrative too. */
export function isNarrative(formula: string): boolean {
	try {
		return parseNarrative(formula) !== null;
	} catch (error) {
		return error instanceof DiceError;
	}
}

export interface NarrativeResult {
	/** Short text such as "2 Success, 1 Threat". */
	summary: string;
	/** Every die as it fell, such as "Ability [S A, blank]; Difficulty [T]". */
	breakdown: string;
	counts: Record<Mark, number>;
}

function showFace(face: string): string {
	return face === "" ? "blank" : face;
}

/**
 * The result after cancelling: Success against Failure, Advantage against Threat.
 * Triumph also counts as a Success and Despair as a Failure; they stay shown on their own.
 */
export function summarize(counts: Record<Mark, number>): string {
	const parts: string[] = [];
	const net = counts.S + counts.Tr - counts.F - counts.De;
	if (net > 0) parts.push(`${net} Success`);
	else if (net < 0) parts.push(`${-net} Failure`);
	const edge = counts.A - counts.T;
	if (edge > 0) parts.push(`${edge} Advantage`);
	else if (edge < 0) parts.push(`${-edge} Threat`);
	if (counts.Tr > 0) parts.push(`${counts.Tr} Triumph`);
	if (counts.De > 0) parts.push(`${counts.De} Despair`);
	if (counts.L > 0) parts.push(`${counts.L} Light`);
	if (counts.D > 0) parts.push(`${counts.D} Dark`);
	return parts.length > 0 ? parts.join(", ") : "No result";
}

/** Rolls narrative dice. Throws DiceError when the formula is not narrative or too large. */
export function rollNarrative(formula: string, random: RandomInt = defaultRandom, budget: Budget = newBudget()): NarrativeResult {
	const groups = parseNarrative(formula);
	if (!groups) throw new DiceError(`"${formula.trim()}" is not narrative dice. Write a number and a letter for each kind, like 3g2d.`);
	const total = groups.reduce((sum, g) => sum + g.count, 0);
	if (total > LIMITS.diceInGroup) throw new DiceError(tooManyDiceMessage(total));
	const counts: Record<Mark, number> = { S: 0, F: 0, A: 0, T: 0, Tr: 0, De: 0, L: 0, D: 0 };
	// Dice of one kind are shown together, in the order the kinds first appear.
	const shown = new Map<NarrativeKind, string[]>();
	for (const { count, kind } of groups) {
		const faces = FACES[kind];
		const list = shown.get(kind) ?? [];
		shown.set(kind, list);
		for (let i = 0; i < count; i++) {
			if (++budget.rolls > LIMITS.rollsPerFormula) throw new DiceError(TOO_MANY_ROLLS_MESSAGE);
			const face = faces[random(1, faces.length) - 1] as string;
			for (const symbol of face.split(" ")) if (symbol !== "") counts[symbol as Mark]++;
			list.push(showFace(face));
		}
	}
	const breakdown = [...shown].filter(([, list]) => list.length > 0).map(([kind, list]) => `${NAMES[kind]} [${list.join(", ")}]`).join("; ");
	return { summary: summarize(counts), breakdown: breakdown === "" ? "No dice" : breakdown, counts };
}

/** The faces of a die, for tests and the README. */
export function narrativeFaces(kind: NarrativeKind): readonly string[] {
	return FACES[kind];
}
