import { describe, expect, it } from "vitest";
import { DiceError, type RandomInt } from "../src/engine";
import { findInlineDice, formulaFromCode } from "../src/rollers/inline";
import { listItems, noteLines, parseBlocks } from "../src/rollers/markdown";
import { rollSpec, type NoteData, type RollContext } from "../src/rollers/run";
import { parseSpec, splitPipes } from "../src/rollers/spec";
import { findLookupRow, lookupFormula, parseRowRanges, parseTable } from "../src/rollers/table";

const NOTES: Record<string, string> = {
	Tables: `---
tags: [a]
---
# Title

| Name | Value |
| --- | --- |
| Ann | 1 |
| Bob | 2 |
^people

| dice: 1d20 | Result |
|---|---|
| 1-2 | low |
| 11 | eleven |
| 13,14 | pair |
| 15–20 | high |
^look

| dice:1d% | Result |
|---|---|
| 51-60 | hyphen |
| 61–70 | dash |
^percent

| dice: 1d4 | Result |
|---|---|
| 1 | \`dice: 2d6\` gold |
| 2 | dice: [[Tables^people]] |
| 3 | \`dice: [[Tables^loop]]\` |
^nested

| dice: 1d4 | Result |
|---|---|
| 1-4 | \`dice: [[Tables^loop]]\` |
^loop

|  | Red | Blue |
|---|---|---|
| Small | a | b |
| Large | c | d |
^grid

| Name | xy |
|---|---|
| Ann | column |
^xycol

- First
- Second
  - Nested
- Third
^items
`,
	Section: `---
yaml: true
---
## Heading two

Paragraph one
over two lines.

---

### Heading three

Paragraph two ^para
`,
	Lines: `---
a: b
---
One

Two
`,
};

const TAGGED: NoteData[] = [
	{ path: "A.md", markdown: "# Head A\n\nBody A\n" },
	{ path: "folder/B.md", markdown: "---\nx: 1\n---\nBody B\n" },
];

function context(random: RandomInt): RollContext {
	return {
		sourcePath: "Here.md",
		random,
		readNote: async (link) => (NOTES[link] === undefined ? null : { path: `${link}.md`, markdown: NOTES[link] as string }),
		notesWithTag: async (tag) => (tag === "npc" ? TAGGED : []),
	};
}

/** Answers in order; after the last value it keeps giving the lowest. */
function sequence(...values: number[]): RandomInt {
	let i = 0;
	return (min) => values[i++] ?? min;
}

const run = async (raw: string, ...values: number[]) => rollSpec(raw, context(sequence(...values)));

describe("markdown blocks", () => {
	it("recognises block types and ids", () => {
		const blocks = parseBlocks(NOTES.Section as string);
		expect(blocks.map((b) => b.type)).toEqual(["yaml", "heading", "paragraph", "thematicBreak", "heading", "paragraph"]);
		expect(blocks[1]?.level).toBe(2);
		expect(blocks[5]?.id).toBe("para");
		expect(blocks[5]?.text).toBe("Paragraph two");
	});

	it("recognises code, quotes and callouts and ignores tables inside code", () => {
		const blocks = parseBlocks("```\n| a | b |\n|---|---|\n```\n\n> quote\n\n> [!note] hi\n> there\n\n<div>x</div>\n\n[^1]: foot\n\n[a]: http://x");
		expect(blocks.map((b) => b.type)).toEqual(["code", "blockquote", "callout", "html", "footnoteDefinition", "definition"]);
	});

	it("splits list items and keeps nested lines", () => {
		expect(listItems("- a\n- b\n  - c\n- d")).toEqual(["a", "b\n  - c", "d"]);
	});

	it("gives note lines without frontmatter or empties", () => {
		expect(noteLines(NOTES.Lines as string)).toEqual(["One", "Two"]);
	});
});

describe("table parsing", () => {
	it("keeps escaped pipes in a cell", () => {
		const table = parseTable("| a | b |\n|---|---|\n| [[x\\|y]] | 2 |");
		expect(table.rows[0]).toEqual(["[[x|y]]", "2"]);
	});

	it("reads lookup headers", () => {
		expect(lookupFormula(parseTable("| dice: 1d20 | x |\n|---|---|"))).toBe("1d20");
		expect(lookupFormula(parseTable("| dice:1d% | x |\n|---|---|"))).toBe("1d%");
		expect(lookupFormula(parseTable("| name | x |\n|---|---|"))).toBeNull();
	});

	it.each([
		["1-2", [[1, 2]]],
		["11", [[11, 11]]],
		["13,14", [[13, 13], [14, 14]]],
		["51-60", [[51, 60]]],
		["51–60", [[51, 60]]],
		["51 — 60", [[51, 60]]],
		["1-2, 5", [[1, 2], [5, 5]]],
		["soon", null],
	])("reads the row label %s", (label, expected) => {
		expect(parseRowRanges(label)).toEqual(expected);
	});

	it("finds the row for a value", () => {
		const table = parseTable("| dice: 1d20 | x |\n|---|---|\n| 1-2 | low |\n| 13,14 | pair |");
		expect(findLookupRow(table, 2)?.[1]).toBe("low");
		expect(findLookupRow(table, 14)?.[1]).toBe("pair");
		expect(findLookupRow(table, 3)).toBeUndefined();
	});
});

describe("spec parsing", () => {
	it("splits on pipes outside brackets", () => {
		expect(splitPipes("[[a|b]]|text(x|y)|none")).toEqual(["[[a|b]]", "text(x|y)", "none"]);
	});

	it("reads flags", () => {
		const spec = parseSpec("1d20 + 2|nodice|text(Dexterity +2)");
		expect(spec.flags.nodice).toBe(true);
		expect(spec.flags.text).toBe("Dexterity +2");
		expect(spec.target).toEqual({ kind: "dice", formula: "1d20 + 2" });
	});

	it("recognises every link form", () => {
		for (const raw of ["[[Note^id]]", "[[Note#^id]]", "[text](Note#^id)"]) {
			expect(parseSpec(raw).target).toEqual({ kind: "note", prefix: "", note: "Note", blockId: "id" });
		}
		expect(parseSpec("3d[[Note]]").target).toEqual({ kind: "note", prefix: "3d", note: "Note" });
		expect(parseSpec("1d4+1[[Note^id]]").target).toEqual({ kind: "note", prefix: "1d4+1", note: "Note", blockId: "id" });
		expect(parseSpec("2d#tag").target).toEqual({ kind: "tag", prefix: "2d", tag: "tag" });
	});

	it("does not take d[a,b] for a link", () => {
		expect(parseSpec("2d[1,4]").target).toEqual({ kind: "dice", formula: "2d[1,4]" });
	});

	it("rejects unknown flags on dice", () => {
		expect(() => parseSpec("1d6|nonsense")).toThrow(/Unknown flag/);
	});

	it("resolves an alias with extra flags", () => {
		const spec = parseSpec("loot|none", { loot: "[[Tables^people]]|Name" });
		expect(spec.target).toMatchObject({ kind: "note", note: "Tables", blockId: "people" });
		expect(spec.args).toEqual(["Name"]);
		expect(spec.flags.none).toBe(true);
	});
});

describe("dice through the roller", () => {
	it("does not take built-in object keys for aliases", async () => {
		await expect(rollSpec("constructor", { ...context(sequence()), aliases: {} })).rejects.toThrow(/Unknown name/);
	});

	it("rolls and shows the breakdown", async () => {
		const outcome = await run("2d6+1", 3, 4);
		expect(outcome.total).toBe(8);
		expect(outcome.details).toBe("[3, 4] + 1");
	});

	it("gives the mean on the first roll with |avg, and a real roll later", async () => {
		const options = context(sequence(1, 1));
		const first = await rollSpec("2d6|avg", options, { firstRoll: true });
		expect(first.total).toBe(7);
		const second = await rollSpec("2d6|avg", options);
		expect(second.total).toBe(2);
	});
});

describe("table roller", () => {
	it("picks a row", async () => {
		expect((await run("[[Tables^people]]", 1)).text).toBe("Bob | 2");
	});

	it("picks several rows with X, Xd and a formula", async () => {
		expect((await run("2[[Tables^people]]", 0, 1)).text).toBe("Ann | 1, Bob | 2");
		expect((await run("2d[[Tables^people]]", 1, 0)).text).toBe("Bob | 2, Ann | 1");
		expect((await run("1d2+1[[Tables^people]]", 1, 0, 1)).text).toBe("Ann | 1, Bob | 2");
	});

	it("reads a lone d before a link as one pick", async () => {
		expect((await run("d[[Tables^people]]", 1)).text).toBe("Bob | 2");
	});

	it("selects a column by name, in any case", async () => {
		expect((await run("[[Tables^people]]|name", 1)).text).toBe("Bob");
		expect((await run("[[Tables^people]]|Value", 0)).text).toBe("1");
	});

	it("names the columns when one is missing", async () => {
		await expect(run("[[Tables^people]]|Age")).rejects.toThrow(/no column "Age".*Name, Value/);
	});

	it("gives one cell with |xy, from outside the first column", async () => {
		expect((await run("[[Tables^grid]]|xy", 1, 2)).text).toBe("d");
	});

	it("prefers a real column called xy", async () => {
		expect((await run("[[Tables^xycol]]|xy", 0)).text).toBe("column");
	});
});

describe("lookup roller", () => {
	it.each([
		[1, "low"],
		[2, "low"],
		[11, "eleven"],
		[13, "pair"],
		[14, "pair"],
		[15, "high"],
		[20, "high"],
	])("finds %d", async (value, text) => {
		expect((await run("[[Tables^look]]", value)).text).toBe(text);
	});

	it("reports a value without a row", async () => {
		await expect(run("[[Tables^look]]", 5)).rejects.toThrow(/no row for 5/);
	});

	it("reads hyphen and long dash the same", async () => {
		expect((await run("[[Tables^percent]]", 55)).text).toBe("hyphen");
		expect((await run("[[Tables^percent]]", 65)).text).toBe("dash");
	});

	it("rolls a nested dice code in a cell", async () => {
		expect((await run("[[Tables^nested]]", 1, 3, 4)).text).toBe("7 gold");
	});

	it("rolls a nested roller in a cell", async () => {
		expect((await run("[[Tables^nested]]", 2, 1)).text).toBe("Bob | 2");
	});

	it("stops a table that points at itself", async () => {
		await expect(run("[[Tables^loop]]", 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1)).rejects.toThrow(DiceError);
		await expect(run("[[Tables^loop]]", 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1)).rejects.toThrow(/nested too deeply/);
	});
});

describe("section roller", () => {
	it("leaves out breaks and yaml by default", async () => {
		const options = context(sequence(0));
		const seen = new Set<string>();
		for (let i = 0; i < 4; i++) {
			const outcome = await rollSpec("[[Section]]", { ...options, random: () => i });
			seen.add(outcome.text);
		}
		expect(seen).toEqual(new Set(["## Heading two", "Paragraph one\nover two lines.", "### Heading three", "Paragraph two"]));
	});

	it("filters by block type and heading level", async () => {
		expect((await run("[[Section]]|paragraph", 1)).text).toBe("Paragraph two");
		expect((await run("[[Section]]|heading-3", 0)).text).toBe("### Heading three");
		expect((await run("[[Section]]|yaml", 0)).text).toBe("yaml: true");
	});

	it("picks several", async () => {
		expect((await run("2d[[Section]]|paragraph", 1, 1)).text).toBe("Paragraph two\n\nParagraph two");
	});

	it("rejects an unknown type and reports no match", async () => {
		await expect(run("[[Section]]|nonsense")).rejects.toThrow(/Unknown block type/);
		await expect(run("[[Section]]|table")).rejects.toThrow(/no matching blocks/);
	});

	it("reports a missing note and a missing block", async () => {
		await expect(run("[[Nope]]")).rejects.toThrow(/"Nope" was not found/);
		await expect(run("[[Section^nope]]")).rejects.toThrow(/\^nope was not found/);
	});

	it("returns a block with an id", async () => {
		expect((await run("[[Section^para]]")).text).toBe("Paragraph two");
	});
});

describe("line roller", () => {
	it("skips frontmatter and empty lines", async () => {
		expect((await run("[[Lines]]|line", 1)).text).toBe("Two");
	});
});

describe("list roller", () => {
	it("picks an item", async () => {
		expect((await run("[[Tables^items]]", 2)).text).toBe("Third");
		expect((await run("[[Tables^items]]", 1)).text).toContain("Second");
	});

	it("picks several items", async () => {
		expect((await run("2d[[Tables^items]]", 0, 2)).text).toBe("First, Third");
	});
});

describe("tag roller", () => {
	it("uses each note by default and with |+", async () => {
		expect((await run("#npc", 1, 0)).text).toBe("Body A\n\nBody B");
		expect((await run("#npc|+", 0, 0)).text).toBe("# Head A\n\nBody B");
	});

	it("uses one note with |-", async () => {
		expect((await run("#npc|-", 1, 0)).text).toBe("Body B");
		expect((await run("#npc|-", 1, 0)).source).toBe("folder/B.md");
	});

	it("links with |link", async () => {
		expect((await run("#npc|link", 1)).text).toBe("[[folder/B]]");
	});

	it("filters with |-|paragraph,yaml", async () => {
		expect((await run("#npc|-|yaml,paragraph", 1, 0)).text).toBe("x: 1");
	});

	it("picks several per note with 2d#tag", async () => {
		expect((await run("2d#npc", 0, 1, 0, 0)).text).toBe("# Head A\n\nBody A\n\nBody B\n\nBody B");
	});

	it("reports an unused tag", async () => {
		await expect(run("#ghost")).rejects.toThrow(/No notes have the tag #ghost/);
	});
});

describe("finding inline dice", () => {
	it("finds codes and skips the rest", () => {
		const found = findInlineDice("a `dice: 1d6` b `code` c `dice:2d8+1` d");
		expect(found.map((f) => f.formula)).toEqual(["1d6", "2d8+1"]);
		expect(found[0]).toMatchObject({ from: 2, to: 13 });
	});

	it("skips double backticks and empty codes", () => {
		expect(findInlineDice("``dice: 1d6`` `dice: `")).toEqual([]);
		expect(formulaFromCode("dicex")).toBeNull();
	});
});
