import { beforeEach, describe, expect, it, vi } from "vitest";
import { EXAMPLE_NOTE_NAME, exampleNoteText, openExampleNote, showExampleNote } from "../src/ui/example-note";
import { formulaFromCode } from "../src/rollers/inline";
import { RollHistoryView } from "../src/ui/history-view";
import { rollSpec } from "../src/rollers/run";
import { notices } from "./obsidian-stub";

// Ontwerp-v2 klus 6 (Daan, punt 5): een voorbeeldnotitie via een knop in het lege logboek en een commando.
// Nooit vanzelf, nooit een bestaande notitie overschrijven, en alle worpen in de notitie werken.

function fakeApp(options: { linked?: { path: string } | null; atPath?: { path: string } | null; folder?: string; createFails?: boolean } = {}) {
	const created: { path: string; text: string }[] = [];
	const opened: unknown[] = [];
	const app = {
		metadataCache: { getFirstLinkpathDest: vi.fn(() => options.linked ?? null) },
		fileManager: {
			getNewFileParent: vi.fn(() => ({ path: options.folder ?? "/", isRoot: () => (options.folder ?? "") === "" })),
		},
		vault: {
			getFileByPath: vi.fn(() => options.atPath ?? null),
			create: vi.fn(async (path: string, text: string) => {
				if (options.createFails) throw new Error("File already exists.");
				created.push({ path, text });
				return { path };
			}),
		},
		workspace: { getLeaf: vi.fn(() => ({ openFile: async (file: unknown) => void opened.push(file) })) },
	};
	return { app, created, opened };
}

describe("the example note", () => {
	beforeEach(() => {
		notices.length = 0;
	});

	it("is made in the folder for new notes and opened", async () => {
		const { app, created, opened } = fakeApp({ folder: "Inbox" });
		await openExampleNote(app as never);
		expect(created).toHaveLength(1);
		expect(created[0]?.path).toBe(`Inbox/${EXAMPLE_NOTE_NAME}.md`);
		expect(opened).toEqual([{ path: `Inbox/${EXAMPLE_NOTE_NAME}.md` }]);
	});

	it("goes in the vault root when that is the folder for new notes", async () => {
		const { app, created } = fakeApp();
		await openExampleNote(app as never);
		expect(created[0]?.path).toBe("Rollwright example.md");
	});

	it("is never overwritten: an existing one is only opened", async () => {
		const mine = { path: "Games/Rollwright example.md" };
		const { app, created, opened } = fakeApp({ linked: mine });
		await openExampleNote(app as never);
		expect(app.vault.create).not.toHaveBeenCalled();
		expect(created).toHaveLength(0);
		expect(opened).toEqual([mine]);
	});

	it("is not made again when the file is there but the link cache does not know it yet", async () => {
		const there = { path: "Rollwright example.md" };
		const { app, opened } = fakeApp({ atPath: there });
		await openExampleNote(app as never);
		expect(app.vault.create).not.toHaveBeenCalled();
		expect(opened).toEqual([there]);
	});

	it("turns a failure into a notice and does not throw", async () => {
		const { app } = fakeApp({ createFails: true });
		await expect(showExampleNote(app as never)).resolves.toBeUndefined();
		expect(notices).toContain("File already exists.");
	});

	it("has the tip, four dice rolls and two table rolls in the same note", () => {
		const text = exampleNoteText();
		expect(text.startsWith("> [!tip] Every roll in this note is live")).toBe(true);
		const codes = (text.match(/`[^`]+`/g) ?? []).map((m) => m.slice(1, -1));
		expect(codes).toHaveLength(6);
		for (const code of codes) expect(formulaFromCode(code)).not.toBeNull();
		expect(text).toContain("[[Rollwright example^guests]]");
		expect(text).toContain("[[Rollwright example^rumours]]");
		expect(text).toMatch(/\n\^guests\n/);
		expect(text).toMatch(/\n\^rumours\n/);
	});
});

describe("the tables in the example note", () => {
	it("roll on the lists at the bottom of the same note", async () => {
		const note = { path: "Rollwright example.md", markdown: exampleNoteText() };
		const context = {
			readNote: async (link: string) => (link === EXAMPLE_NOTE_NAME ? note : null),
			notesWithTag: async () => [],
			sourcePath: note.path,
		};
		const guests = await rollSpec("[[Rollwright example^guests]]", context);
		expect(guests.kind).toBe("list");
		expect(["A dwarf counting her coins twice", "Two elves arguing over a map", "A bard with one string left", "A sleeping knight in muddy armour"]).toContain(guests.text);
		const rumours = await rollSpec("[[Rollwright example^rumours]]", context);
		expect(rumours.kind).toBe("list");
		expect(rumours.text).toMatch(/^"The (bridge|old mine)|^"Someone/);
	});
});

describe("the empty roll log", () => {
	it("shows the button that makes the example note, and only when the log is empty", () => {
		const make = (history: unknown[]) => {
			const els: { tag: string; cls: string[]; text: string; listeners: Record<string, () => void> }[] = [];
			const el = (tag: string, opts: { cls?: string | string[]; text?: string } = {}) => {
				const made = { tag, cls: ([] as string[]).concat(opts.cls ?? []), text: opts.text ?? "", listeners: {} as Record<string, () => void> };
				els.push(made);
				return Object.assign(made, {
					createEl: (t: string, o?: { cls?: string | string[]; text?: string }) => el(t, o),
					createDiv: (o?: { cls?: string | string[]; text?: string }) => el("div", o),
					createSpan: (o?: { cls?: string | string[]; text?: string }) => el("span", o),
					empty: () => undefined,
					addClass: () => undefined,
					setAttribute: () => undefined,
					addEventListener: (name: string, fn: () => void) => (made.listeners[name] = fn),
				});
			};
			const { app } = fakeApp();
			const view = new RollHistoryView({} as never, { settings: { formulas: [], history } } as never);
			Object.assign(view, { contentEl: el("div"), app });
			view.refresh();
			return { els, app };
		};
		const empty = make([]);
		const button = empty.els.find((e) => e.cls.includes("rollwright-history-try"));
		expect(button?.text).toBe("Try it: create an example note");
		button?.listeners.click?.();
		expect(empty.app.fileManager.getNewFileParent).toHaveBeenCalled();
		const full = make([{ time: 1, formula: "1d20", result: "7", details: "", source: "" }]);
		expect(full.els.some((e) => e.cls.includes("rollwright-history-try"))).toBe(false);
	});
});
