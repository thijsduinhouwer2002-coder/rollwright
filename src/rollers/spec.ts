import { DiceError } from "../engine";

export interface Flags {
	nodice: boolean;
	form: boolean;
	avg: boolean;
	none: boolean;
	text?: string;
	/** How to make the result whole. Off unless a flag asks for it. */
	round?: Rounding;
	/** Always show a plus or minus sign. */
	signed?: boolean;
	/** Put the result between brackets. */
	paren?: boolean;
}

export type Rounding = "round" | "ceil" | "floor";

export type Target =
	| { kind: "dice"; formula: string }
	| { kind: "note"; prefix: string; note: string; blockId?: string }
	| { kind: "tag"; prefix: string; tag: string };

export interface Spec {
	raw: string;
	target: Target;
	flags: Flags;
	/** Everything after "|" that is not a display flag: column names, block types, "line", "-" and so on. */
	args: string[];
	/** Everything after "|" in the order it was written, flags included. A table may have a column with such a name. */
	parts: string[];
}

/** Flags from the notation that we accept and that change nothing in this version. */
const IGNORED_FLAGS = new Set(["dice", "render", "norender", "noform"]);

/** Flags that change how a number is shown. When several are written, the last one counts. */
function applyNumberFlag(flags: Flags, lower: string): boolean {
	if (lower === "round" || lower === "ceil" || lower === "floor") flags.round = lower;
	else if (lower === "noround") delete flags.round;
	else if (lower === "signed") flags.signed = true;
	else if (lower === "paren") flags.paren = true;
	else if (lower === "noparen") delete flags.paren;
	else return false;
	return true;
}

/** Splits on "|", but not inside (), [] or [[]]. */
export function splitPipes(raw: string): string[] {
	const parts: string[] = [];
	let depth = 0;
	let current = "";
	for (const ch of raw) {
		if (ch === "(" || ch === "[") depth++;
		if ((ch === ")" || ch === "]") && depth > 0) depth--;
		if (ch === "|" && depth === 0) {
			parts.push(current);
			current = "";
		} else {
			current += ch;
		}
	}
	parts.push(current);
	return parts.map((part) => part.trim());
}

function decodeLink(link: string): string {
	try {
		return decodeURI(link);
	} catch {
		return link;
	}
}

function parseLink(head: string): { prefix: string; note: string; blockId?: string } | null {
	let prefix: string;
	let link: string;
	const wiki = /^(.*?)\[\[(.+?)\]\]$/.exec(head);
	const markdown = /^(.*?)\[[^\][]*\]\(([^()]+)\)$/.exec(head);
	if (wiki) {
		prefix = wiki[1] as string;
		link = (wiki[2] as string).split("|")[0] as string;
	} else if (markdown) {
		prefix = markdown[1] as string;
		link = decodeLink(markdown[2] as string);
	} else {
		return null;
	}
	const caret = link.indexOf("^");
	if (caret === -1) return { prefix: prefix.trim(), note: link.trim() };
	const note = link.slice(0, caret).replace(/#$/, "").trim();
	return { prefix: prefix.trim(), note, blockId: link.slice(caret + 1).trim() };
}

/** The flags without the one a word stands for, now that the word turned out to be a column. */
export function withoutFlag(flags: Flags, word: string): Flags {
	const lower = word.toLowerCase();
	const output = { ...flags };
	if (lower === "nodice" || lower === "form" || lower === "avg" || lower === "none") output[lower] = false;
	else if (lower.startsWith("text(")) delete output.text;
	else if (lower === "round" || lower === "ceil" || lower === "floor") delete output.round;
	else if (lower === "signed") delete output.signed;
	else if (lower === "paren") delete output.paren;
	return output;
}

export function parseSpec(raw: string, aliases: Record<string, string> = {}): Spec {
	const [first = "", ...rest] = splitPipes(raw);
	const alias = Object.prototype.hasOwnProperty.call(aliases, first) ? aliases[first] : undefined;
	const pipes = splitPipes(alias !== undefined && !alias.includes(first) ? alias : first);
	const body = pipes[0] ?? "";

	const flags: Flags = { nodice: false, form: false, avg: false, none: false };
	const args: string[] = [];
	const parts = [...pipes.slice(1), ...rest].filter((part) => part !== "");
	for (const part of parts) {
		const lower = part.toLowerCase();
		if (lower === "nodice" || lower === "form" || lower === "avg" || lower === "none") {
			flags[lower] = true;
		} else if (lower.startsWith("text(") && part.endsWith(")")) {
			flags.text = part.slice(5, -1);
		} else if (!applyNumberFlag(flags, lower) && !IGNORED_FLAGS.has(lower)) {
			args.push(part);
		}
	}

	const link = parseLink(body);
	if (link) return { raw, flags, args, parts, target: { kind: "note", ...link } };
	const tag = /^(.*?)#([^\s#]+)$/.exec(body);
	if (tag) return { raw, flags, args, parts, target: { kind: "tag", prefix: (tag[1] as string).trim(), tag: tag[2] as string } };
	if (args.length > 0) throw new DiceError(`Unknown flag "${args[0] as string}". Check the spelling after |, like 1d20|avg or 1d20|text(Attack).`);
	return { raw, flags, args, parts, target: { kind: "dice", formula: body } };
}
