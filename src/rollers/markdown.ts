/** A small block model of a note: enough to pick from, not a full markdown parser. */
export type BlockType =
	| "yaml"
	| "heading"
	| "paragraph"
	| "list"
	| "table"
	| "code"
	| "blockquote"
	| "callout"
	| "thematicBreak"
	| "html"
	| "definition"
	| "footnoteDefinition";

export interface Block {
	type: BlockType;
	/** The heading level, for headings only. */
	level?: number;
	text: string;
	id?: string;
}

const TRAILING_ID = /\s\^([A-Za-z0-9-]+)\s*$/;
const ID_ONLY = /^\^([A-Za-z0-9-]+)\s*$/;
const HEADING = /^(#{1,6})\s/;
const THEMATIC = /^ {0,3}(\*{3,}|-{3,}|_{3,})\s*$/;
const LIST_ITEM = /^(\s*)([-*+]|\d+[.)])\s/;
const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const HTML = /^<[a-zA-Z/!]/;
const FOOTNOTE = /^\[\^[^\]]+\]:/;
const DEFINITION = /^\[[^\]]+\]:/;

const RULE_CELL = /^:?-+:?$/;

/**
 * The line under a table head, such as "| --- | :-: |". Checked by hand: a regular
 * expression with several optional spaces took about a second on a line of 50000 spaces.
 */
function isTableRule(line: string): boolean {
	let text = line.trim();
	if (text.startsWith("|")) text = text.slice(1);
	if (text.endsWith("|")) text = text.slice(0, -1);
	return text.split("|").every((cell) => RULE_CELL.test(cell.trim()));
}

function startsBlock(line: string, next: string | undefined): boolean {
	return (
		HEADING.test(line) ||
		THEMATIC.test(line) ||
		LIST_ITEM.test(line) ||
		FENCE.test(line) ||
		line.startsWith(">") ||
		(line.includes("|") && next !== undefined && next.includes("-") && isTableRule(next))
	);
}

function finish(type: BlockType, lines: string[], level?: number): Block {
	const block: Block = { type, text: lines.join("\n") };
	if (level !== undefined) block.level = level;
	const last = lines[lines.length - 1] ?? "";
	const match = type === "code" ? null : TRAILING_ID.exec(last);
	if (match) {
		block.id = match[1];
		block.text = block.text.replace(TRAILING_ID, "");
	}
	return block;
}

export function parseBlocks(markdown: string): Block[] {
	const lines = markdown.replace(/\r\n/g, "\n").split("\n");
	const blocks: Block[] = [];
	let i = 0;

	if (lines[0]?.trim() === "---") {
		const end = lines.findIndex((line, index) => index > 0 && line.trim() === "---");
		if (end > 0) {
			blocks.push({ type: "yaml", text: lines.slice(1, end).join("\n") });
			i = end + 1;
		}
	}

	while (i < lines.length) {
		const line = lines[i] as string;
		const next = lines[i + 1];
		if (line.trim() === "") {
			i++;
			continue;
		}
		const idOnly = ID_ONLY.exec(line);
		const previous = blocks[blocks.length - 1];
		if (idOnly && previous) {
			previous.id = idOnly[1];
			i++;
			continue;
		}
		const heading = HEADING.exec(line);
		const fence = FENCE.exec(line);
		if (heading) {
			blocks.push(finish("heading", [line], (heading[1] as string).length));
			i++;
		} else if (fence) {
			const marker = fence[1] as string;
			const body = [line];
			i++;
			while (i < lines.length) {
				const current = lines[i] as string;
				body.push(current);
				i++;
				if (current.trim().startsWith(marker)) break;
			}
			blocks.push(finish("code", body));
		} else if (THEMATIC.test(line)) {
			blocks.push({ type: "thematicBreak", text: line });
			i++;
		} else if (line.includes("|") && next !== undefined && next.includes("-") && isTableRule(next)) {
			const body = [line, next];
			i += 2;
			while (i < lines.length && (lines[i] as string).includes("|") && !ID_ONLY.test(lines[i] as string)) {
				body.push(lines[i] as string);
				i++;
			}
			blocks.push(finish("table", body));
		} else if (line.startsWith(">")) {
			const body: string[] = [];
			while (i < lines.length && (lines[i] as string).startsWith(">")) {
				body.push(lines[i] as string);
				i++;
			}
			blocks.push(finish(/^>\s*\[!/.test(line) ? "callout" : "blockquote", body));
		} else if (LIST_ITEM.test(line)) {
			const body: string[] = [];
			while (i < lines.length) {
				const current = lines[i] as string;
				if (current.trim() === "" || ID_ONLY.test(current)) break;
				if (!LIST_ITEM.test(current) && !/^\s/.test(current)) break;
				body.push(current);
				i++;
			}
			blocks.push(finish("list", body));
		} else if (FOOTNOTE.test(line)) {
			blocks.push(finish("footnoteDefinition", [line]));
			i++;
		} else if (DEFINITION.test(line)) {
			blocks.push(finish("definition", [line]));
			i++;
		} else if (HTML.test(line)) {
			const body: string[] = [];
			while (i < lines.length && (lines[i] as string).trim() !== "") {
				body.push(lines[i] as string);
				i++;
			}
			blocks.push(finish("html", body));
		} else {
			const body = [line];
			i++;
			while (i < lines.length) {
				const current = lines[i] as string;
				if (current.trim() === "" || ID_ONLY.test(current) || startsBlock(current, lines[i + 1])) break;
				body.push(current);
				i++;
			}
			blocks.push(finish("paragraph", body));
		}
	}
	return blocks;
}

/** Top-level items of a list, each with its nested lines. */
export function listItems(listText: string): string[] {
	const lines = listText.split("\n");
	const indent = LIST_ITEM.exec(lines[0] ?? "")?.[1]?.length ?? 0;
	const items: string[][] = [];
	for (const line of lines) {
		const match = LIST_ITEM.exec(line);
		if (match && (match[1] as string).length <= indent) items.push([line]);
		else items[items.length - 1]?.push(line);
	}
	return items.map((item) => item.join("\n").replace(LIST_ITEM, "").trim());
}

/** A line that is only a horizontal rule (***, ---, ___, also with spaces) has no text, so |line skips it. */
const THEMATIC_BREAK = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;

/** Non-empty lines of a note, without its frontmatter and without lines that are only a horizontal rule. */
export function noteLines(markdown: string): string[] {
	const lines = markdown.replace(/\r\n/g, "\n").split("\n");
	let start = 0;
	if (lines[0]?.trim() === "---") {
		const end = lines.findIndex((line, index) => index > 0 && line.trim() === "---");
		if (end > 0) start = end + 1;
	}
	return lines.slice(start).filter((line) => line.trim() !== "" && !THEMATIC_BREAK.test(line));
}

