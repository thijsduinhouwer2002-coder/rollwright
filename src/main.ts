import { getAllTags, MarkdownView, Notice, Plugin, TFile, type WorkspaceLeaf } from "obsidian";
import { extractSavedFormulas, mergeFormulas } from "./import/dice-roller-data";
import { activateLicense, isLicenseActive, obsidianRequest, paymentReady, POLAR_IDS, recheckLicense, type LicenseOutcome, type PolarIds, type RequestFunction } from "./pro/license";
import { resolveSkin, SKINS } from "./pro/skins";
import { fieldNames } from "./rollers/fields";
import { stampText } from "./rollers/extreme";
import { replaceCodeInNote } from "./rollers/modify";
import { DEFAULT_SETTINGS, HISTORY_LIMIT, isKeptOutcome, KEPT_RESULTS_LIMIT, RESULT_CACHE_LIMIT, type RollwrightSettings } from "./plugin-data";
import { ResultListeners } from "./result-listeners";
import { rollSpec, type NoteData, type RollContext, type RollOutcome } from "./rollers/run";
import { showExampleNote } from "./ui/example-note";
import { CHANGED_NOTICE, NOT_MARKDOWN_NOTICE, ReplaceCodeModal } from "./ui/dice-mod";
import { HISTORY_VIEW, RollHistoryView } from "./ui/history-view";
import { rollwrightLivePreview } from "./ui/live-preview";
import { RollFormulaModal } from "./ui/modal";
import { processReadingView } from "./ui/reading-view";
import { RollwrightSettingTab } from "./ui/settings";

export type { HistoryEntry, RollwrightSettings } from "./plugin-data";
export { KEPT_RESULTS_LIMIT } from "./plugin-data";

export default class RollwrightPlugin extends Plugin {
	settings: RollwrightSettings = { ...DEFAULT_SETTINGS };
	private readonly results = new Map<string, RollOutcome>();
	/** First rolls still on their way (a table reads a note first), so a second view of the same code waits for it. */
	private readonly pending = new Map<string, Promise<RollOutcome>>();
	/** Widgets per key, told about every new result so all views of a place show the same. */
	readonly resultListeners = new ResultListeners();
	/** Results of `dice+:`, written to disk with the settings. */
	private readonly kept = new Map<string, RollOutcome>();
	private readonly skinnedDocuments = new Set<Document>();
	/** The network call, the clock and our Polar ids; tests put in their own. */
	licenseRequest: RequestFunction = obsidianRequest;
	now: () => number = () => Date.now();
	polarIds: PolarIds = POLAR_IDS;

	async onload(): Promise<void> {
		await this.loadSettings();

		this.registerView(HISTORY_VIEW, (leaf: WorkspaceLeaf) => new RollHistoryView(leaf, this));
		this.registerMarkdownPostProcessor((el, ctx) => processReadingView(this, el, ctx));
		this.registerEditorExtension(rollwrightLivePreview(this));
		this.addSettingTab(new RollwrightSettingTab(this.app, this));

		this.addCommand({
			id: "open-history",
			name: "Open roll log",
			callback: () => void this.openHistory(),
		});
		this.addCommand({
			id: "create-example-note",
			name: "Create example note",
			callback: () => void showExampleNote(this.app),
		});
		this.addCommand({
			id: "roll-formula",
			name: "Roll a formula",
			callback: () => new RollFormulaModal(this.app, this).open(),
		});

		this.applySkin(activeDocument);
		this.registerEvent(this.app.workspace.on("window-open", (win) => this.applySkin(win.doc)));
		// Windows that were open before the plugin loaded never send window-open.
		this.app.workspace.onLayoutReady(() => {
			this.app.workspace.iterateAllLeaves((leaf) => {
				this.skinnedDocuments.add(leaf.view.containerEl.doc);
			});
			this.applySkin();
			void this.recheckLicense();
		});
	}

	onunload(): void {
		for (const doc of this.skinnedDocuments) {
			for (const skin of SKINS) doc.body.removeClass(skin.cssClass);
		}
	}

	async loadSettings(): Promise<void> {
		const stored = (await this.loadData()) as Partial<RollwrightSettings> | null;
		// A deep copy of the defaults, so no two loads share the lists in them.
		this.settings = { ...DEFAULT_SETTINGS, formulas: [], history: [], keptResults: [], ...stored };
		this.kept.clear();
		const kept = Array.isArray(this.settings.keptResults) ? this.settings.keptResults : [];
		for (const entry of kept) {
			if (Array.isArray(entry) && typeof entry[0] === "string" && isKeptOutcome(entry[1])) this.kept.set(entry[0], entry[1]);
		}
		this.trimKept();
	}

	async saveSettings(): Promise<void> {
		this.settings.keptResults = [...this.kept.entries()];
		await this.saveData(this.settings);
	}

	/** The only question the rest of the code asks. A key without a check date is not active. */
	get isLicensed(): boolean {
		return paymentReady(this.polarIds) && isLicenseActive(this.settings);
	}

	/** Activate in the settings. Only a valid answer stores the key and unlocks the skins. */
	async activateLicense(key: string): Promise<LicenseOutcome> {
		const outcome = await activateLicense(this.settings, key, this.licenseRequest, this.now(), this.polarIds);
		if (outcome === "valid") await this.saveSettings();
		this.applySkin();
		return outcome;
	}

	/** Quiet check of an active key, at most once per 30 days. Only a clear "not valid" locks. */
	async recheckLicense(): Promise<void> {
		if (await recheckLicense(this.settings, this.licenseRequest, this.now(), this.polarIds)) {
			await this.saveSettings();
			this.applySkin();
		}
	}

	/** Sets the skin on this document and on every window that already has one. */
	applySkin(doc: Document = activeDocument): void {
		this.skinnedDocuments.add(doc);
		const active = resolveSkin(this.settings.skin, this.isLicensed);
		for (const known of this.skinnedDocuments) {
			for (const skin of SKINS) known.body.toggleClass(skin.cssClass, skin.id === active.id);
		}
	}

	/** Builds the bridge between the pure rollers and this vault. */
	rollContext(sourcePath: string): RollContext {
		// Number fields of the note with the code; a saved formula with the same name goes first.
		const aliases: Record<string, string> = this.noteFields(sourcePath);
		for (const formula of this.settings.formulas) aliases[formula.name] = formula.formula;
		return {
			sourcePath,
			defaultSides: this.settings.defaultSides,
			defaultCount: this.settings.defaultCount,
			aliases,
			readNote: (link, from) => this.readNote(link, from),
			notesWithTag: (tag) => this.notesWithTag(tag),
		};
	}

	/** The number fields in the frontmatter of this note, as names. Nothing when it has none. */
	private noteFields(sourcePath: string): Record<string, string> {
		try {
			const file = this.app.vault.getAbstractFileByPath(sourcePath);
			if (!(file instanceof TFile)) return {};
			return fieldNames(this.app.metadataCache.getFileCache(file)?.frontmatter);
		} catch {
			return {};
		}
	}

	private async readNote(link: string, sourcePath: string): Promise<NoteData | null> {
		// [[#^id]] or [[^id]] points at the note itself, so a renamed note keeps working.
		const file = link === "" ? this.app.vault.getAbstractFileByPath(sourcePath) : this.app.metadataCache.getFirstLinkpathDest(link, sourcePath);
		if (!(file instanceof TFile)) return null;
		return { path: file.path, markdown: await this.app.vault.cachedRead(file) };
	}

	private async notesWithTag(tag: string): Promise<NoteData[]> {
		const wanted = `#${tag}`.toLowerCase();
		const notes: NoteData[] = [];
		for (const file of this.app.vault.getMarkdownFiles()) {
			const cache = this.app.metadataCache.getFileCache(file);
			const tags = cache ? getAllTags(cache) : null;
			if (tags?.some((t) => t.toLowerCase() === wanted || t.toLowerCase().startsWith(`${wanted}/`))) {
				notes.push({ path: file.path, markdown: await this.app.vault.cachedRead(file) });
			}
		}
		return notes;
	}

	/** The newest result remembered for a place, if any. */
	latestResult(key: string): RollOutcome | undefined {
		return this.results.get(key);
	}

	hasResult(key: string, keep = false): boolean {
		return this.results.has(key) || (keep && this.kept.has(key));
	}

	/**
	 * The result for this place in a note: remembered, or rolled for the first time.
	 * With keep (`dice+:`) the result also comes from and goes to disk.
	 */
	async firstResult(key: string, formula: string, sourcePath: string, keep = false): Promise<RollOutcome> {
		const known = this.results.get(key) ?? (keep ? this.kept.get(key) : undefined);
		if (known) {
			if (keep && !this.kept.has(key)) await this.keep(key, known);
			return known;
		}
		const running = this.pending.get(key);
		if (running) return running;
		// Compared with what is in pending once the roll is back; assigned before any await finishes.
		let roll: Promise<RollOutcome> | undefined = undefined;
		roll = (async (): Promise<RollOutcome> => {
			try {
				const outcome = await rollSpec(formula, this.rollContext(sourcePath), { firstRoll: true });
				// Forgotten (Ctrl-click) while rolling: show it, but do not remember it.
				if (this.pending.get(key) !== roll) return outcome;
				// A click or Alt-click came in while rolling: that newer result wins.
				const newer = this.results.get(key);
				if (newer) return newer;
				this.remember(key, outcome);
				if (keep) await this.keep(key, outcome);
				return outcome;
			} finally {
				if (this.pending.get(key) === roll) this.pending.delete(key);
			}
		})();
		this.pending.set(key, roll);
		return roll;
	}

	/** A roll someone asked for. Only these go into the history. With keep, the new result replaces the kept one. */
	async freshResult(key: string | null, formula: string, sourcePath: string, keep = false): Promise<RollOutcome> {
		const outcome = await rollSpec(formula, this.rollContext(sourcePath));
		if (key !== null) this.remember(key, outcome);
		if (key !== null && keep) this.storeKept(key, outcome);
		await this.addToHistory(outcome, formula, sourcePath);
		return outcome;
	}

	/**
	 * Alt-click: dice show their average, as |avg does. It is remembered (and kept with keep)
	 * but not put in the history, because nothing was rolled. Anything else rolls as a click does.
	 */
	async averageResult(key: string, formula: string, sourcePath: string, keep = false): Promise<RollOutcome> {
		const outcome = await rollSpec(formula, this.rollContext(sourcePath), { average: true });
		this.remember(key, outcome);
		if (keep) this.storeKept(key, outcome);
		if (outcome.kind !== "dice") await this.addToHistory(outcome, formula, sourcePath);
		else if (keep) await this.saveSettings();
		return outcome;
	}

	/** Ctrl-click on a |none code: forgets its result, also the kept one, so it stays empty. */
	async forgetResult(key: string): Promise<void> {
		this.results.delete(key);
		this.pending.delete(key);
		if (this.kept.delete(key)) await this.saveSettings();
	}

	/** Puts a result at the newest end of the kept results, dropping the oldest over the limit. */
	private storeKept(key: string, outcome: RollOutcome): void {
		this.kept.delete(key);
		this.kept.set(key, outcome);
		this.trimKept();
	}

	private trimKept(): void {
		while (this.kept.size > KEPT_RESULTS_LIMIT) {
			const oldest = this.kept.keys().next().value;
			if (oldest === undefined) break;
			this.kept.delete(oldest);
		}
	}

	private async keep(key: string, outcome: RollOutcome): Promise<void> {
		this.storeKept(key, outcome);
		await this.saveSettings();
	}

	private remember(key: string, outcome: RollOutcome): void {
		if (this.results.size >= RESULT_CACHE_LIMIT) {
			const oldest = this.results.keys().next().value;
			if (oldest !== undefined) this.results.delete(oldest);
		}
		this.results.set(key, outcome);
		this.resultListeners.emit(key, outcome);
	}

	private async addToHistory(outcome: RollOutcome, formula: string, sourcePath: string): Promise<void> {
		this.settings.history.unshift({
			time: Date.now(),
			formula,
			result: outcome.text,
			details: outcome.details,
			source: sourcePath,
			...(outcome.kind === "dice" && outcome.extreme !== undefined ? { extreme: outcome.extreme, stamp: outcome.stamp ?? stampText(outcome.formula, outcome.extreme) } : {}),
		});
		this.settings.history.length = Math.min(this.settings.history.length, HISTORY_LIMIT);
		await this.saveSettings();
		this.refreshHistoryViews();
	}

	async clearHistory(): Promise<void> {
		this.settings.history = [];
		await this.saveSettings();
		this.refreshHistoryViews();
	}

	private refreshHistoryViews(): void {
		for (const leaf of this.app.workspace.getLeavesOfType(HISTORY_VIEW)) {
			if (leaf.view instanceof RollHistoryView) leaf.view.refresh();
		}
	}

	async openHistory(): Promise<void> {
		const { workspace } = this.app;
		let leaf = workspace.getLeavesOfType(HISTORY_VIEW)[0];
		if (!leaf) {
			leaf = workspace.getRightLeaf(false) ?? undefined;
			await leaf?.setViewState({ type: HISTORY_VIEW, active: true });
		}
		if (leaf) await workspace.revealLeaf(leaf);
	}

	/** Asks before a dice-mod code is replaced. True for Replace; Cancel and closing give false. */
	confirmReplace(text: string): Promise<boolean> {
		return new Promise((resolve) => new ReplaceCodeModal(this.app, text, resolve).open());
	}

	/**
	 * Replaces a dice-mod code in this one note, read fresh inside vault.process. Only when
	 * the code with this number on this line is still dice-mod with this formula; otherwise
	 * the note is given back as it was, with a notice. Never touches any other note.
	 */
	async replaceInNote(path: string, line: number, index: number, formula: string, replacement: string): Promise<boolean> {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) {
			new Notice(CHANGED_NOTICE);
			return false;
		}
		// A canvas or other file can also call the post-processor; only markdown notes are changed.
		if (file.extension !== "md") {
			new Notice(NOT_MARKDOWN_NOTICE);
			return false;
		}
		let done = false;
		await this.app.vault.process(file, (data) => {
			const next = replaceCodeInNote(data, line, index, formula, replacement);
			done = next !== null;
			return next ?? data;
		});
		if (!done) new Notice(CHANGED_NOTICE);
		return done;
	}

	currentNotePath(): string {
		return this.app.workspace.getActiveViewOfType(MarkdownView)?.file?.path ?? "";
	}

	/** Reads the named formulas of the other plugin. Reads only; its file stays as it is. */
	async importSavedFormulas(): Promise<void> {
		const path = `${this.app.vault.configDir}/plugins/obsidian-dice-roller/data.json`;
		const adapter = this.app.vault.adapter;
		if (!(await adapter.exists(path))) {
			new Notice("No saved formulas found to import.");
			return;
		}
		const found = extractSavedFormulas(await adapter.read(path));
		const { merged, added } = mergeFormulas(this.settings.formulas, found);
		this.settings.formulas = merged;
		await this.saveSettings();
		new Notice(`Imported ${added} of ${found.length} saved formulas.`);
	}
}
