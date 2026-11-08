import { normalizePath, Notice, type App, type TFile } from "obsidian";

/**
 * The example note of ontwerp-v2 point 5: a small tavern scene where every roll is live. Rollwright never
 * makes it on its own; only the button in the empty roll log and the command "Create example note" do.
 */
export const EXAMPLE_NOTE_NAME = "Rollwright example";

/** The text of the example note. The tables sit at the bottom of the same note, so it is one file. */
export function exampleNoteText(name: string = EXAMPLE_NOTE_NAME): string {
	return [
		"> [!tip] Every roll in this note is live",
		"> Click one to roll it again. Your rolls are kept in the roll log.",
		"",
		"A hooded stranger steps out of the rain and the room goes quiet.",
		"",
		"**Initiative** `dice: 1d20 + 3`",
		"",
		"**Longsword** `dice: 1d20 + 5|text(Hit)` for `dice: 2d6 + 3|text(Damage)`",
		"",
		"**Saving throw** `dice: 1d20|text(Wisdom save)`",
		"",
		`Who is at the bar tonight? \`dice: [[${name}^guests]]\``,
		"",
		`The stranger says: \`dice: [[${name}^rumours]]\``,
		"",
		"## Tavern tables",
		"",
		"- A dwarf counting her coins twice",
		"- Two elves arguing over a map",
		"- A bard with one string left",
		"- A sleeping knight in muddy armour",
		"^guests",
		"",
		'- "The bridge at Harrow fell last night."',
		'- "Someone is buying every lantern in town."',
		'- "The old mine is singing again."',
		"^rumours",
		"",
	].join("\n");
}

/**
 * Opens the example note, and makes it first when there is none yet. An existing note with that name is
 * never overwritten: it may be the user's own, changed copy. The note goes where the user's setting for
 * new notes says, so it is not dropped in the vault root against their wish.
 */
export async function openExampleNote(app: App): Promise<TFile> {
	const existing = app.metadataCache.getFirstLinkpathDest(EXAMPLE_NOTE_NAME, "");
	let file: TFile;
	if (existing !== null) {
		file = existing;
	} else {
		const parent = app.fileManager.getNewFileParent("");
		const folder = parent.isRoot() ? "" : `${parent.path}/`;
		const path = normalizePath(`${folder}${EXAMPLE_NOTE_NAME}.md`);
		// The link cache can lag right after start-up; the file itself is the last word.
		const atPath = app.vault.getFileByPath(path);
		file = atPath ?? (await app.vault.create(path, exampleNoteText()));
	}
	await app.workspace.getLeaf(false).openFile(file);
	return file;
}

/** For the button and the command: like openExampleNote, but a failure becomes a notice. */
export async function showExampleNote(app: App): Promise<void> {
	try {
		await openExampleNote(app);
	} catch (error) {
		new Notice(error instanceof Error ? error.message : String(error));
	}
}
