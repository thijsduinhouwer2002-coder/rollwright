import { DiceError, type Token } from "./types";

const COMPARATORS = [">=", "<=", "=<", "=>", "=!", "=-", "-=", ">", "<", "="];

function isDigit(ch: string): boolean {
	return ch >= "0" && ch <= "9";
}

function isLetter(ch: string): boolean {
	return (ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z") || ch === "_";
}

/**
 * Splits a formula into tokens. Letters stay together as one word: the parser
 * knows from its position whether "dkh" is a die with a modifier or a name.
 */
export function tokenize(input: string): Token[] {
	const tokens: Token[] = [];
	let i = 0;
	while (i < input.length) {
		const ch = input.charAt(i);
		if (ch === " " || ch === "\t" || ch === "\n" || ch === "{" || ch === "}") {
			i++;
			continue;
		}
		if (isDigit(ch) || (ch === "." && isDigit(input.charAt(i + 1)))) {
			const start = i;
			while (isDigit(input.charAt(i))) i++;
			if (input.charAt(i) === "." && isDigit(input.charAt(i + 1))) {
				i++;
				while (isDigit(input.charAt(i))) i++;
			}
			tokens.push({ type: "num", value: input.slice(start, i), pos: start });
			continue;
		}
		if (isLetter(ch)) {
			const start = i;
			const afterValue = isAfterValue(tokens);
			while (isLetter(input.charAt(i)) || (i > start && isDigit(input.charAt(i)) && !isDiceBoundary(input, start, i, afterValue))) i++;
			tokens.push({ type: "word", value: input.slice(start, i), pos: start });
			continue;
		}
		const comparator = COMPARATORS.find((c) => input.startsWith(c, i));
		if (comparator) {
			tokens.push({ type: "cmp", value: comparator, pos: i });
			i += comparator.length;
			continue;
		}
		if (ch === "!") {
			const double = input.charAt(i + 1) === "!";
			tokens.push({ type: "bang", value: double ? "!!" : "!", pos: i });
			i += double ? 2 : 1;
			continue;
		}
		if ("+-*/^()[],%".includes(ch)) {
			tokens.push({ type: "sym", value: ch, pos: i });
			i++;
			continue;
		}
		throw new DiceError(`Unexpected character "${ch}" at position ${i + 1}. Remove it and use only numbers, dice and + - * / ( ), like 2d6 + 1.`);
	}
	return tokens;
}

/**
 * True right after a value, where a word can only be a modifier, such as "KH" in
 * "1D6KH1". At the start of a term a word may be a name, such as "K2".
 */
function isAfterValue(tokens: Token[]): boolean {
	const last = tokens[tokens.length - 1];
	if (!last) return false;
	return last.type === "num" || last.type === "word" || last.type === "bang" || (last.type === "sym" && (last.value === ")" || last.value === "]" || last.value === "%"));
}

/**
 * Digits end a word unless the word can only be a name, such as "str2".
 * After a value, modifiers in capitals end it too.
 */
function isDiceBoundary(input: string, start: number, i: number, afterValue: boolean): boolean {
	const word = input.slice(start, i);
	if (/^[dD]?[fF]?(kh|kl|dh|dl|k|sa|sd|s|u|r|i)*$/.test(word)) return true;
	return afterValue && /^d?f?(kh|kl|dh|dl|k|sa|sd|s|u|r|i)*$/i.test(word);
}
