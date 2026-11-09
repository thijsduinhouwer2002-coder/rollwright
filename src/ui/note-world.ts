import { MarkdownView, TFile, WorkspaceWindow, type WorkspaceLeaf } from "obsidian";
import type RollwrightPlugin from "../main";
import { resolveSkin } from "../pro/skins";
import { findInlineDice } from "../rollers/inline";

/**
 * A paid skin can skin the whole note, not only the tokens (Thijs, 9 nov 2026; plan in
 * bouwplan-notitiesfeer.md). This file decides which notes get the world and puts one class on
 * the note's own container. The look itself lives in the skin CSS, always under
 * `body.rollwright-skin-<skin> .rollwright-world`, so without a paid skin the class does nothing.
 */

/** The class on `view.containerEl` of a note that shows the world of the skin. */
export const WORLD_CLASS = "rollwright-world";
/** In `cssclasses`: always the world for this note, also when the setting is Off or there is no roll. */
export const WORLD_ON = "rollwright-world";
/** In `cssclasses`: never the world for this note. Wins over everything else. */
export const WORLD_OFF = "rollwright-plain";

export type NoteWorldMode = "rolls" | "all" | "off";

export const NOTE_WORLD_MODES: { id: NoteWorldMode; name: string }[] = [
	{ id: "rolls", name: "Notes with rolls" },
	{ id: "all", name: "All notes" },
	{ id: "off", name: "Off" },
];

/** A stored value that is not one of the three modes counts as the default. */
export function noteWorldMode(value: unknown): NoteWorldMode {
	return NOTE_WORLD_MODES.some((mode) => mode.id === value) ? (value as NoteWorldMode) : "rolls";
}

// Any indent, so a fence inside a list item counts too. An indented code block is not skipped (known limit).
const FENCE_OPEN = /^(?:[ \t]*>)*[ \t]*(`{3,}|~{3,})(.*)$/;
// Code spans first, so `%%` or `<!--` written inside backticks opens no comment.
const CODE_OR_COMMENT = /(`+)[\s\S]*?\1(?!`)|%%[\s\S]*?(?:%%|$)|<!--[\s\S]*?(?:-->|$)/g;

/** Spaces for everything but line breaks, so lines keep their number and length. */
function blank(text: string): string {
	return text.replace(/[^\n]/g, " ");
}

/** The note without frontmatter, fenced code, `%% %%` and HTML comments. Line breaks stay. */
export function visibleMarkdown(text: string): string {
	const lines = text.replace(/\r\n?/g, "\n").split("\n");
	let start = 0;
	if (lines[0] === "---") {
		const end = lines.indexOf("---", 1);
		if (end > 0) start = end + 1;
	}
	const kept: string[] = lines.slice(0, start).map(() => "");
	let fence: { char: string; length: number } | null = null;
	for (let i = start; i < lines.length; i++) {
		const line = lines[i] as string;
		const match = FENCE_OPEN.exec(line);
		if (fence === null) {
			// A backtick fence may not have a backtick in its info string.
			if (match && !((match[1] as string)[0] === "`" && (match[2] as string).includes("`"))) {
				fence = { char: (match[1] as string)[0] as string, length: (match[1] as string).length };
				kept.push("");
				continue;
			}
			kept.push(line);
			continue;
		}
		const fenceChars = match?.[1];
		if (fenceChars !== undefined && fenceChars[0] === fence.char && fenceChars.length >= fence.length && (match?.[2] ?? "").trim() === "") fence = null;
		kept.push("");
	}
	// An unclosed comment runs to the end of the note, as in Obsidian.
	return kept.join("\n").replace(CODE_OR_COMMENT, (found: string) => (found.startsWith("`") ? found : blank(found)));
}

/** True when the note shows at least one `dice:`, `dice+:`, `dice-:` or `dice-mod:` code. */
export function noteHasRoll(text: string): boolean {
	return visibleMarkdown(text)
		.split("\n")
		.some((line) => findInlineDice(line).length > 0);
}

/** `cssclasses` from the frontmatter as a list: Obsidian accepts a list or one text. */
export function cssClassList(value: unknown): string[] {
	if (typeof value === "string") return value.split(/[\s,]+/).filter((name) => name !== "");
	if (Array.isArray(value)) return value.filter((name): name is string => typeof name === "string").map((name) => name.trim());
	return [];
}

export interface WorldQuestion {
	/** A paid skin is active (a valid key and Parchment, Arcane or later). */
	paidSkin: boolean;
	mode: NoteWorldMode;
	cssclasses: string[];
	/** Asked only when the answer depends on it. */
	hasRoll: () => boolean;
}

/** Does this note get the world? No paid skin: never. Then `rollwright-plain`, `rollwright-world`, then the mode. */
export function wantsWorld(question: WorldQuestion): boolean {
	if (!question.paidSkin) return false;
	if (question.cssclasses.includes(WORLD_OFF)) return false;
	if (question.cssclasses.includes(WORLD_ON)) return true;
	if (question.mode === "off") return false;
	if (question.mode === "all") return true;
	return question.hasRoll();
}

/** Puts and takes away the world class on the notes in the main area and in pop-out windows. */
export class NoteWorld {
	/** Per path: the mtime the text was read at and whether it had a roll. */
	private readonly rolls = new Map<string, { mtime: number; hasRoll: boolean }>();
	private readonly marked = new Set<HTMLElement>();
	private run = 0;

	constructor(private readonly plugin: RollwrightPlugin) {}

	/** Called by the changed event of the metadata cache: the text is already there, no read needed. */
	noteChanged(file: TFile, text: string): void {
		// Free users and notes that are not open cost nothing; a later read finds the new mtime.
		if (!this.paidSkin() || !this.isOpen(file)) return;
		this.rolls.set(file.path, { mtime: file.stat.mtime, hasRoll: noteHasRoll(text) });
		this.refresh();
	}

	private paidSkin(): boolean {
		return resolveSkin(this.plugin.settings.skin, this.plugin.isLicensed).paid;
	}

	private isOpen(file: TFile): boolean {
		let open = false;
		this.plugin.app.workspace.iterateAllLeaves((leaf) => {
			if (leaf.view instanceof MarkdownView && leaf.view.file?.path === file.path) open = true;
		});
		return open;
	}

	/** Looks at every open note again. Only the newest call applies its answer. */
	refresh(): void {
		const run = ++this.run;
		this.decide()
			.then((wanted) => {
				if (run === this.run) this.apply(wanted);
			})
			.catch((error: unknown) => console.error("Rollwright:", error));
	}

	/** Takes the class away everywhere, for unloading. */
	clear(): void {
		this.run++;
		for (const el of this.marked) el.removeClass(WORLD_CLASS);
		this.marked.clear();
	}

	private async decide(): Promise<Set<HTMLElement>> {
		const { settings } = this.plugin;
		const paidSkin = this.paidSkin();
		const wanted = new Set<HTMLElement>();
		if (!paidSkin) return wanted;
		const mode = noteWorldMode(settings.noteWorld);
		const checks: Promise<void>[] = [];
		this.plugin.app.workspace.iterateAllLeaves((leaf) => {
			const view = leaf.view;
			if (!(view instanceof MarkdownView) || !(view.file instanceof TFile) || !this.inMainArea(leaf)) return;
			const file = view.file;
			const el = view.containerEl;
			const frontmatter = this.plugin.app.metadataCache.getFileCache(file)?.frontmatter;
			// cssclass (without s) is the old name, still read by Obsidian.
			const cssclasses = [...cssClassList(frontmatter?.cssclasses), ...cssClassList(frontmatter?.cssclass)];
			let needsText = false;
			const quick = wantsWorld({
				paidSkin,
				mode,
				cssclasses,
				hasRoll: () => {
					needsText = true;
					return false;
				},
			});
			if (!needsText) {
				if (quick) wanted.add(el);
				return;
			}
			checks.push(this.hasRoll(file).then((hasRoll) => {
				if (hasRoll && view.file === file) wanted.add(el);
			}));
		});
		await Promise.all(checks);
		return wanted;
	}

	private async hasRoll(file: TFile): Promise<boolean> {
		const known = this.rolls.get(file.path);
		if (known && known.mtime === file.stat.mtime) return known.hasRoll;
		// The mtime from before the read: a change during the read then counts as not yet seen.
		const mtime = file.stat.mtime;
		const hasRoll = noteHasRoll(await this.plugin.app.vault.cachedRead(file));
		this.rolls.set(file.path, { mtime, hasRoll });
		return hasRoll;
	}

	/** Tabs in the main area and in pop-out windows. Not the sidebars, not leaves of other plugins (hover editors). */
	private inMainArea(leaf: WorkspaceLeaf): boolean {
		const { workspace } = this.plugin.app;
		const root = leaf.getRoot();
		if (root === workspace.leftSplit || root === workspace.rightSplit) return false;
		// getContainer gives the main area (rootSplit) or a pop-out window; getRoot of a pop-out leaf does not.
		const container = leaf.getContainer();
		return container === workspace.rootSplit || container instanceof WorkspaceWindow;
	}

	private apply(wanted: Set<HTMLElement>): void {
		for (const el of this.marked) {
			if (!wanted.has(el)) el.removeClass(WORLD_CLASS);
		}
		for (const el of wanted) el.addClass(WORLD_CLASS);
		this.marked.clear();
		for (const el of wanted) this.marked.add(el);
	}
}
