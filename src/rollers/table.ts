export interface Table {
	headers: string[];
	rows: string[][];
}

/** Splits a table line on "|", leaving "\|" inside a cell. */
function splitRow(line: string): string[] {
	let text = line.trim();
	if (text.startsWith("|")) text = text.slice(1);
	if (text.endsWith("|") && !text.endsWith("\\|")) text = text.slice(0, -1);
	const cells: string[] = [];
	let current = "";
	for (let i = 0; i < text.length; i++) {
		const ch = text.charAt(i);
		if (ch === "\\" && text.charAt(i + 1) === "|") {
			current += "|";
			i++;
		} else if (ch === "|") {
			cells.push(current.trim());
			current = "";
		} else {
			current += ch;
		}
	}
	cells.push(current.trim());
	return cells;
}

export function parseTable(markdown: string): Table {
	const lines = markdown.split("\n").filter((line) => line.trim() !== "");
	const [head, , ...body] = lines;
	return { headers: splitRow(head ?? ""), rows: body.map(splitRow) };
}

/**
 * The formula of a lookup table, read from the first header. Null for a normal table.
 * "dice+:" and "dice-:" work as "dice:": a header is rolled each time, never kept on
 * its own. "dice-mod:" is refused, so such a table is a normal table.
 */
export function lookupFormula(table: Table): string | null {
	const first = (table.headers[0] ?? "").replace(/`/g, "").trim();
	const match = /^dice[+-]?:\s*(.+)$/i.exec(first);
	return match ? (match[1] as string).trim() : null;
}

/** Reads "1-2", "11", "13,14" and "51–60" (with a dash of any common width). */
export function parseRowRanges(label: string): [number, number][] | null {
	const ranges: [number, number][] = [];
	for (const raw of label.split(",")) {
		const part = raw.trim();
		const match = /^(-?\d+)(?:\s*[-–—]\s*(-?\d+))?$/.exec(part);
		if (!match) return null;
		const low = Number(match[1]);
		const high = match[2] === undefined ? low : Number(match[2]);
		ranges.push([Math.min(low, high), Math.max(low, high)]);
	}
	return ranges;
}

/** The row whose first cell contains the value, or undefined. */
export function findLookupRow(table: Table, value: number): string[] | undefined {
	return table.rows.find((row) => {
		const ranges = parseRowRanges(row[0] ?? "");
		return ranges?.some(([low, high]) => value >= low && value <= high) ?? false;
	});
}

export function findColumn(table: Table, name: string): number {
	const wanted = name.trim().toLowerCase();
	return table.headers.findIndex((header) => header.trim().toLowerCase() === wanted);
}
