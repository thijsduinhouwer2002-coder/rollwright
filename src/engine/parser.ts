import { isStuntWord, stuntNode } from "./stunt";
import { tokenize } from "./tokenizer";
import { DiceError, LIMITS, type CompareOp, type Condition, type Modifier, type Node, type Sides, type Token } from "./types";

const MODIFIER_WORDS = ["kh", "kl", "dh", "dl", "k", "sa", "sd", "s", "u", "r"];

/** True when the letters after the leading "d" read as a chain of modifiers. */
function isDiceWord(word: string): boolean {
	if (word.charAt(0) !== "d" && word.charAt(0) !== "D") return false;
	let rest = word.slice(1).toLowerCase();
	if (rest.charAt(0) === "f") rest = rest.slice(1);
	while (rest.length > 0) {
		const match = MODIFIER_WORDS.find((m) => rest.startsWith(m));
		if (!match) return false;
		rest = rest.slice(match.length);
		if (match === "r" && rest.charAt(0) === "i") rest = rest.slice(1);
	}
	return true;
}

/** For a token that cannot stand where it is. Only after a value can a missing + - * / be the fix. */
function unexpected(token: Token, previous: Token | undefined): DiceError {
	const afterValue = previous !== undefined && previous.type !== "cmp" && !(previous.type === "sym" && "+-*/^(".includes(previous.value));
	let fix = "Remove it, like 2d6 + 3.";
	if (token.value === ")") fix = "Remove it or add the ( it closes, like (2d6 + 1) * 2.";
	else if (afterValue) fix = "Remove it or put + - * / before it, like 2d6 + 3.";
	return new DiceError(`Unexpected "${token.value}" at position ${token.pos + 1}. ${fix}`);
}

function mapComparator(value: string): { op: CompareOp; score: 1 | -1 } {
	switch (value) {
		case "=<":
			return { op: "<=", score: 1 };
		case "=>":
			return { op: ">=", score: 1 };
		case "=!":
			return { op: "!=", score: 1 };
		case "=-":
		case "-=":
			return { op: "=", score: -1 };
		default:
			return { op: value as CompareOp, score: 1 };
	}
}

class Parser {
	private index = 0;
	private depth = 0;

	constructor(
		private readonly tokens: Token[],
		private readonly names: Set<string>,
	) {}

	parse(): Node {
		if (this.tokens.length === 0) throw new DiceError("The formula is empty. Write a formula after dice:, like 2d6 + 1.");
		const node = this.additive();
		const left = this.peek();
		if (left) throw unexpected(left, this.tokens[this.index - 1]);
		return node;
	}

	private peek(): Token | undefined {
		return this.tokens[this.index];
	}

	private isSym(value: string): boolean {
		const token = this.peek();
		return token?.type === "sym" && token.value === value;
	}

	private additive(): Node {
		let left = this.multiplicative();
		while (this.isSym("+") || this.isSym("-")) {
			const op = this.tokens[this.index++]?.value as "+" | "-";
			left = { type: "binary", op, left, right: this.multiplicative() };
		}
		return left;
	}

	private multiplicative(): Node {
		let left = this.unary();
		while (this.isSym("*") || this.isSym("/")) {
			const op = this.tokens[this.index++]?.value as "*" | "/";
			left = { type: "binary", op, left, right: this.unary() };
		}
		return left;
	}

	private unary(): Node {
		this.enter();
		let node: Node;
		if (this.isSym("-")) {
			this.index++;
			node = { type: "negate", inner: this.unary() };
		} else if (this.isSym("+")) {
			this.index++;
			node = this.unary();
		} else {
			node = this.power();
		}
		this.depth--;
		return node;
	}

	/** "^" binds tighter than a leading minus and groups from the right. */
	private power(): Node {
		const base = this.primary();
		if (this.isSym("^")) {
			this.index++;
			return { type: "binary", op: "^", left: base, right: this.unary() };
		}
		return base;
	}

	private enter(): void {
		if (++this.depth > LIMITS.parseDepth) throw new DiceError("The formula is nested too deeply. Use fewer brackets, like (2d6 + 1) * 2.");
	}

	/** Names the last token, so the message shows where the formula stops. */
	private endsTooEarly(): DiceError {
		const last = this.tokens[this.tokens.length - 1]?.value ?? "";
		if (last === "") return new DiceError("The formula ends too early. Add a number or a die at the end, like 2d6 + 1.");
		return new DiceError(`The formula ends too early: it ends with ${last}. Add a number or a die after it, like 2d6 + 1.`);
	}

	private primary(): Node {
		const token = this.peek();
		if (!token) throw this.endsTooEarly();
		if (token.type === "num") {
			this.index++;
			const value = Number(token.value);
			if (!Number.isSafeInteger(Math.trunc(value))) throw new DiceError(`The number ${token.value} is too large. Use a number with at most 15 digits, like 1000000.`);
			const next = this.peek();
			if (next?.type === "word" && (next.value.charAt(0) === "d" || next.value.charAt(0) === "D") && isDiceWord(next.value)) {
				return this.dice({ type: "number", value });
			}
			return { type: "number", value };
		}
		if (token.type === "sym" && token.value === "(") {
			this.index++;
			this.enter();
			const inner = this.additive();
			this.depth--;
			if (!this.isSym(")")) throw new DiceError("A closing bracket is missing. Add ) after the group, like (2d6 + 1) * 2.");
			this.index++;
			const next = this.peek();
			if (next?.type === "word" && isDiceWord(next.value)) return this.dice(inner);
			return { type: "group", inner };
		}
		if (token.type === "word") {
			if (this.names.has(token.value)) {
				this.index++;
				return { type: "name", name: token.value };
			}
			if (isDiceWord(token.value)) return this.dice(null);
			this.index++;
			return { type: "name", name: token.value };
		}
		throw unexpected(token, this.tokens[this.index - 1]);
	}

	private dice(count: Node | null): Node {
		const word = this.peek() as Token;
		if (isStuntWord(word.value)) {
			this.index++;
			return stuntNode(count, word);
		}
		let rest = word.value.slice(1);
		let sides: Sides = { kind: "default" };
		if (rest.charAt(0) === "F" || rest.charAt(0) === "f") {
			sides = { kind: "fudge" };
			rest = rest.slice(1);
		}
		if (rest.length > 0) {
			word.value = rest;
		} else {
			this.index++;
			if (sides.kind === "default") sides = this.sides();
		}
		return { type: "dice", count, sides, modifiers: this.modifiers() };
	}

	private sides(): Sides {
		const token = this.peek();
		if (token?.type === "num") {
			this.index++;
			if (this.isSym("%")) {
				this.index++;
				if (!/^[0-9]+$/.test(token.value)) throw new DiceError("Digit dice need a whole number, such as d66%");
				const digits = token.value.split("").map(Number);
				if (digits.includes(0)) throw new DiceError(`d${token.value}% has a die with zero sides. Use the digits 1 to 9, like d66%.`);
				return { kind: "digits", digits };
			}
			return { kind: "number", sides: this.wholeNumber(token, "The number of sides") };
		}
		if (this.isSym("%")) {
			this.index++;
			return { kind: "percent" };
		}
		if (this.isSym("[")) {
			this.index++;
			return this.bracketSides();
		}
		return { kind: "default" };
	}

	/** Two numbers are a range, both ends included. Three or more are the faces themselves. */
	private bracketSides(): Sides {
		const values: number[] = [];
		for (;;) {
			let sign = 1;
			if (this.isSym("-")) {
				sign = -1;
				this.index++;
			}
			const token = this.peek();
			if (token?.type !== "num") throw new DiceError("Write custom dice as d[min, max] or d[a, b, c]");
			this.index++;
			values.push(sign * this.wholeNumber(token, "A face"));
			if (this.isSym("]")) {
				this.index++;
				break;
			}
			if (this.isSym(",") || this.isSym("-")) {
				if (this.isSym(",")) this.index++;
				else if (this.tokens[this.index + 1]?.type === "num") this.index++;
				continue;
			}
			throw new DiceError("Write custom dice as d[min, max] or d[a, b, c]");
		}
		const [first, second] = values;
		if (first === undefined || second === undefined) throw new DiceError("Custom dice need at least two numbers. Write d[min, max] or d[a, b, c], like d[1, 4].");
		if (values.length === 2) return { kind: "range", min: Math.min(first, second), max: Math.max(first, second) };
		return { kind: "faces", faces: values };
	}

	private wholeNumber(token: Token, what: string): number {
		const value = Number(token.value);
		if (!Number.isInteger(value)) throw new DiceError(`${what} must be a whole number, not ${token.value}. Leave out the decimals, like 2d6 or 4d6kh3.`);
		return value;
	}

	private modifiers(): Modifier[] {
		const modifiers: Modifier[] = [];
		for (;;) {
			const token = this.peek();
			if (!token) return modifiers;
			if (token.type === "bang") {
				this.index++;
				const times = this.repeatCount();
				modifiers.push({ kind: "explode", combine: token.value === "!!", times, conditions: this.conditions("1d6!>=5") });
			} else if (token.type === "cmp") {
				modifiers.push(this.countModifier());
			} else if (token.type === "word") {
				const lower = token.value.toLowerCase();
				const match = MODIFIER_WORDS.find((m) => lower.startsWith(m));
				if (!match) throw new DiceError(`Unknown modifier "${token.value}" at position ${token.pos + 1}. Use kh, kl, dh, dl, r, u, s or !, like 4d6kh3.`);
				this.consumeWordPart(token, match.length);
				modifiers.push(this.wordModifier(match));
			} else {
				return modifiers;
			}
		}
	}

	private consumeWordPart(token: Token, length: number): void {
		token.value = token.value.slice(length);
		token.pos += length;
		if (token.value.length === 0) this.index++;
	}

	private wordModifier(word: string): Modifier {
		switch (word) {
			case "k":
			case "kh":
				return { kind: "keep", which: "high", count: this.optionalCount() };
			case "kl":
				return { kind: "keep", which: "low", count: this.optionalCount() };
			case "dh":
				return { kind: "drop", which: "high", count: this.optionalCount() };
			case "dl":
				return { kind: "drop", which: "low", count: this.optionalCount() };
			case "s":
			case "sa":
				return { kind: "sort", direction: "asc" };
			case "sd":
				return { kind: "sort", direction: "desc" };
			case "u":
				return { kind: "unique" };
			default: {
				const times = this.repeatCount();
				return { kind: "reroll", times, conditions: this.conditions("1d6r<2") };
			}
		}
	}

	private optionalCount(): number {
		const token = this.peek();
		if (token?.type !== "num") return 1;
		this.index++;
		return this.wholeNumber(token, "The modifier count");
	}

	/** The number after ! or r, or "i" for the highest allowed. */
	private repeatCount(): number {
		const token = this.peek();
		if (token?.type === "word" && token.value.charAt(0).toLowerCase() === "i") {
			this.consumeWordPart(token, 1);
			return LIMITS.repeats;
		}
		const count = this.optionalCount();
		if (count > LIMITS.repeats) throw new DiceError(`A die can repeat at most ${LIMITS.repeats} times. Use a smaller number, like 1d6!10.`);
		return count;
	}

	/** Conditions right after ! or r belong to that modifier. */
	private conditions(example: string): Condition[] {
		const conditions: Condition[] = [];
		for (;;) {
			const token = this.peek();
			if (token?.type !== "cmp") return conditions;
			const { op, score } = mapComparator(token.value);
			if (score === -1) throw new DiceError(`"${token.value}" only works for counting, not on ! or r. Use it for counting, like 5d10>=8-=1.`);
			this.index++;
			const value = this.peek();
			if (value?.type !== "num") throw new DiceError(`A number is missing after "${token.value}". Add one, like ${example}.`);
			this.index++;
			conditions.push({ op, value: Number(value.value) });
		}
	}

	private countModifier(): Modifier {
		const token = this.peek() as Token;
		this.index++;
		const { op, score } = mapComparator(token.value);
		return { kind: "count", op, score, threshold: this.threshold(token.value) };
	}

	/** A number or plain dice. Modifiers after it belong to the outer dice. */
	private threshold(comparator: string): Node {
		const token = this.peek();
		if (token?.type === "num") {
			this.index++;
			const value = Number(token.value);
			const next = this.peek();
			if (next?.type === "word" && next.value.toLowerCase() === "d") {
				this.index++;
				return { type: "dice", count: { type: "number", value }, sides: this.sides(), modifiers: [] };
			}
			return { type: "number", value };
		}
		if (token?.type === "word" && token.value.toLowerCase() === "d") {
			this.index++;
			return { type: "dice", count: null, sides: this.sides(), modifiers: [] };
		}
		throw new DiceError(`A number is missing after "${comparator}". Add one, like 5d10>=8.`);
	}
}

export function parseFormula(formula: string, names: Iterable<string> = []): Node {
	if (formula.length > LIMITS.formulaLength) {
		throw new DiceError(`The formula is longer than ${LIMITS.formulaLength} characters. Save parts of it as named formulas and use their names, like 1d20 + atk.`);
	}
	return new Parser(tokenize(formula), new Set(names)).parse();
}
