import { formatResult } from "../engine";
import { defuseRolls } from "./defuse";
import { findInlineDice } from "./inline";
import type { RollOutcome } from "./run";

/**
 * Puts a result on one line. A dice-mod code sits in the middle of a line, so a line
 * break in the result would split a paragraph, a list item or a table row. Every run of
 * white space that holds a line break becomes one space: the note stays plain text,
 * without HTML such as <br>, and reads the same in every editor.
 */
function oneLine(text: string): string {
	return text.replace(/\s*[\r\n]\s*/g, " ").trim();
}

/**
 * The text a dice-mod code is replaced with.
 * - Dice: "<formula> -> <breakdown> -> <total>", the total with the number flags and a "~"
 *   for an estimate. Without the formula: "<breakdown> -> <total>". When there is no
 *   breakdown (the average of |avg), that part is left out, so no arrow points at nothing.
 *   Display flags (|text, |form, |nodice, |none) only change the widget and are not written.
 * - Table, list, section, line and tag: only the result text.
 * Always defused, so the written text never holds a new code that rolls.
 */
export function modifiedText(outcome: RollOutcome, showFormula: boolean): string {
	if (outcome.kind !== "dice") return oneLine(defuseRolls(outcome.text));
	const total = `${outcome.estimated ? "~" : ""}${outcome.total === undefined ? outcome.text : formatResult(outcome.total, outcome.flags)}`;
	const parts: string[] = [];
	if (showFormula) parts.push(outcome.formula.trim());
	const breakdown = outcome.average ? "" : outcome.details.trim();
	if (breakdown !== "") parts.push(breakdown);
	parts.push(total);
	return oneLine(defuseRolls(parts.join(" -> ")));
}

/** Puts a backslash before every unescaped character of this kind. An odd run of backslashes before it already escapes it. */
function escapeAll(text: string, char: "`" | "|"): string {
	const pattern = char === "`" ? /(\\*)`/g : /(\\*)\|/g;
	return text.replace(pattern, (whole: string, slashes: string) => (slashes.length % 2 === 0 ? `${slashes}\\${char}` : whole));
}

/** True when the text has a "|" that no backslash escapes. */
function hasBarePipe(text: string): boolean {
	return /(^|[^\\])(\\\\)*\|/.test(text);
}

/** What can open a block at the start of a line: heading, quote, list, rule, setext line, fence, table, html, link definition. A dice breakdown "[1] -> 1" is none of these. */
const BLOCK_START = /^(?:[#>\-+*=_~|<]|\[[^\]]*\]:)/;

/**
 * Makes the replacement safe at its place in the line, so it reads as plain text there:
 * - every backtick gets a backslash, or it would pair with a backtick later on the line and
 *   make a new code span, maybe a code that rolls;
 * - in a table row every "|" gets a backslash, or it would make a new cell. A line is taken as a
 *   table row when, with quote markers and spaces in front left out, it starts with "|",
 *   or when it has an unescaped "|" outside the code;
 * - at the start of a line (after spaces, quote markers and list markers), a first character that would
 *   start a block, such as "#", "-", ">" or "---", gets a backslash, and so does the dot or
 *   bracket of "1." or "1)".
 */
function fitReplacement(line: string, from: number, to: number, text: string): string {
	let safe = escapeAll(text, "`");
	const rest = line.slice(0, from) + line.slice(to);
	if (rest.replace(/^[\s>]*/, "").startsWith("|") || hasBarePipe(rest)) safe = escapeAll(safe, "|");
	// Only spaces, quote markers and list markers before the code: the replacement starts the text of a block.
	if (/^(?:\s|>|[-+*](?=\s)|\d+[.)](?=\s))*$/.test(line.slice(0, from))) {
		if (BLOCK_START.test(safe)) safe = `\\${safe}`;
		else safe = safe.replace(/^(\d+)([.)])/, "$1\\$2");
	}
	return safe;
}

type Found = ReturnType<typeof findInlineDice>[number];

/** The change for one found code, or null when it is not a dice-mod code with this formula. */
function changeFor(lineText: string, code: Found | undefined, formula: string, replacement: string): { from: number; to: number; insert: string } | null {
	if (!code || !code.modify || code.formula !== formula) return null;
	return { from: code.from, to: code.to, insert: fitReplacement(lineText, code.from, code.to, replacement) };
}

/**
 * The change for the code with this number on the line (counted as findInlineDice counts), as
 * the editor needs it: from and to within the line and the text to insert. Null when it is no
 * longer a dice-mod code with this formula: then nothing may be written.
 */
export function replacementInLine(lineText: string, index: number, formula: string, replacement: string): { from: number; to: number; insert: string } | null {
	return changeFor(lineText, findInlineDice(lineText)[index], formula, replacement);
}

/** The whole line with the code with this number replaced, or null as replacementInLine. */
export function replaceCodeInLine(lineText: string, index: number, formula: string, replacement: string): string | null {
	const change = replacementInLine(lineText, index, formula, replacement);
	return change === null ? null : lineText.slice(0, change.from) + change.insert + lineText.slice(change.to);
}

/** The same for a whole note, with the line counted from 0. Line endings stay as they are. */
export function replaceCodeInNote(markdown: string, line: number, index: number, formula: string, replacement: string): string | null {
	const lines = markdown.split("\n");
	const text = lines[line];
	if (text === undefined) return null;
	const replaced = replaceCodeInLine(text, index, formula, replacement);
	if (replaced === null) return null;
	lines[line] = replaced;
	return lines.join("\n");
}
