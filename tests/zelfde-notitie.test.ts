import { describe, expect, it } from "vitest";
import { rollSpec, type RollContext } from "../src/rollers/run";

// [[#^id]] (of [[^id]]) rolt op een tabel of lijst in de notitie waar de code staat.
// Een geneste code in een tabelcel of lijstpunt van een andere notitie bedoelt die andere notitie.

const NOTES: Record<string, string> = {
	"A.md": ["Een worp hier.", "", "- a1", "^sub", ""].join("\n"),
	"B.md": ["| Wat |", "|---|", "| `dice: [[#^sub]]` |", "^t", "", "- b1", "^sub", "", "- `dice: [[#^sub]]`", "^lijst", ""].join("\n"),
};

/** Leest zoals main.ts: een lege link is de bronnotitie zelf, anders de naam plus .md. */
function context(sourcePath: string): RollContext {
	return {
		sourcePath,
		readNote: async (link, from) => {
			const path = link === "" ? from : `${link}.md`;
			const markdown = NOTES[path];
			return markdown === undefined ? null : { path, markdown };
		},
		notesWithTag: async () => [],
	};
}

describe("[[#^id]]: a table or list in the same note", () => {
	it("rolls on the note that holds the code", async () => {
		const outcome = await rollSpec("[[#^sub]]", context("A.md"));
		expect(outcome.text).toBe("a1");
		expect(outcome.source).toBe("A.md");
	});

	it("inside a table cell of another note means that other note", async () => {
		const outcome = await rollSpec("[[B^t]]", context("A.md"));
		expect(outcome.text).toBe("b1");
	});

	it("inside a list item of another note means that other note", async () => {
		const outcome = await rollSpec("[[B^lijst]]", context("A.md"));
		expect(outcome.text).toBe("b1");
	});

	it("names this note in the error, not an empty name", async () => {
		await expect(rollSpec("[[#^bestaatniet]]", context("A.md"))).rejects.toThrow("Block ^bestaatniet was not found in this note.");
	});
});
