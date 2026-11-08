import { Component, Keymap, MarkdownRenderer, Notice, setIcon, setTooltip, TFile, type PaneType } from "obsidian";
import { formatResult, rangeOf } from "../engine";
import type RollwrightPlugin from "../main";
import { defuseRolls } from "../rollers/defuse";
import { quietNestedCodes } from "./nested-code";
import { stampText, type Extreme } from "../rollers/extreme";
import { parseSpec } from "../rollers/spec";
import type { RollOutcome } from "../rollers/run";
import type { ModifyHandler } from "./dice-mod";
import { Landing, motionWindow, restartRolled } from "./motion";

export { ROLLED_CLASS } from "./motion";

export const NO_SOURCE_NOTICE = "This result comes from more than one note, so there is no single note to open.";
export const SOURCE_GONE_NOTICE = "The note this result came from is no longer there.";
/** On a roll whose rendered result is more than one line or a block: styles.css shows it as a block under the line. */
export const BLOCK_CLASS = "rollwright-roll-block";
/** On a roll of dice that is the highest or lowest result of its formula (see rollers/extreme.ts). */
export const MAX_CLASS = "rollwright-roll-max";
export const MIN_CLASS = "rollwright-roll-min";
/** The same moment under the names styles.css (Rollwright v2) uses: gold for a crit, red for a fumble. */
export const CRIT_CLASS = "rollwright-crit";
export const FUMBLE_CLASS = "rollwright-fumble";
/** The small "NAT 20", "NAT 1", "MAX" or "MIN" on a crit or fumble. */
export const STAMP_CLASS = "rollwright-stamp";
/** A comma only screen readers hear, between a result and its stamp. */
export const SEP_CLASS = "rollwright-sep";
/** On a result from a table, list, section, line or tag: text, not a number. */
export const TEXT_CLASS = "rollwright-text";

/** The classes for a crit or fumble, for the roll and for an item in the history. */
export function extremeClasses(extreme: Extreme | undefined): string[] {
	if (extreme === "max") return [MAX_CLASS, CRIT_CLASS];
	if (extreme === "min") return [MIN_CLASS, FUMBLE_CLASS];
	return [];
}

/** The classes that belong to one result, taken off before anything new is shown. */
function clearResultClasses(target: HTMLElement): void {
	target.removeClass(BLOCK_CLASS);
	target.removeClass(MAX_CLASS);
	target.removeClass(MIN_CLASS);
	target.removeClass(CRIT_CLASS);
	target.removeClass(FUMBLE_CLASS);
	target.removeClass(TEXT_CLASS);
}

/** The rendered parts of a result, looking through wrapper divs that hold elements. */
function renderedParts(el: Element): Element[] {
	const parts: Element[] = [];
	for (let i = 0; i < el.childElementCount; i++) {
		const child = el.children.item(i);
		if (child === null) continue;
		// Only a wrapper div with elements in it is looked through; a div with just text is one part.
		if (child.tagName === "DIV" && child.childElementCount > 0) parts.push(...renderedParts(child));
		else parts.push(child);
	}
	return parts;
}

/**
 * True when a rendered result does not fit in a sentence: more than one part, a part that is not a
 * paragraph (heading, list, quote, code block, table, line), or a paragraph over more than one line.
 */
export function isBlockValue(value: Element): boolean {
	const parts = renderedParts(value);
	if (parts.length > 1) return true;
	const [only] = parts;
	if (only === undefined) return false;
	return only.tagName !== "P" || only.querySelector("br") !== null;
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function tooltipFor(outcome: RollOutcome): string {
	return outcome.details === "" ? outcome.formula : `${outcome.formula}\n${outcome.details}`;
}

/** Only the dice icon, as a |none code shows before its first click. */
function showBlank(target: HTMLElement, formula: string): void {
	target.empty();
	target.removeClass("rollwright-error");
	clearResultClasses(target);
	setIcon(target.createSpan({ cls: "rollwright-icon" }), "dices");
	setTooltip(target, formula);
}

function showError(target: HTMLElement, formula: string, error: unknown): void {
	target.empty();
	clearResultClasses(target);
	target.addClass("rollwright-error");
	const message = errorMessage(error);
	target.createSpan({ text: `dice: ${formula}` });
	setTooltip(target, message);
	target.setAttribute("data-rollwright-error", message);
}

/**
 * Klus 4b: the first counted number comes when the value starts to fly in (rw-land in styles.css
 * waits 140 ms), so none of them is counted while it is still invisible.
 */
export const TICK_START_MS = 140;
/**
 * Pauses between the counted numbers: 6 steps, slower each time. With the start they add up to
 * LAND_MS (460 ms, klus 4c), so the real number lands at the moment the gold or red comes.
 */
export const TICK_STEPS = [40, 45, 50, 55, 60, 70];
/** On the value while it counts: the number shown on top of the real one (styles.css). */
export const TICK_ATTR = "data-rollwright-tick";

export interface TickOptions {
	/** The real result: the last counted number is never this one, or the count would seem to hang one step. */
	actual?: number;
	/** Wait before the first number; TICK_START_MS when left out. */
	delay?: number;
}

/**
 * A number in the range that differs from both given numbers (null: none). A number that does not
 * fit is moved up by one (wrapping round), never drawn again, so a fixed Math.random can not keep
 * it going forever.
 */
export function tickNumber(range: { min: number; max: number }, draw: number, avoid: number | null, avoidToo: number | null): number {
	const size = range.max - range.min + 1;
	let n = range.min + (((Math.floor(draw * size) % size) + size) % size);
	for (let i = 0; i < size && (n === avoid || n === avoidToo); i++) n = n >= range.max ? range.min : n + 1;
	return n;
}

/**
 * The counted numbers, drawn from the last one back: the last differs from the real result (or the
 * count would seem to hang one step) and each one from the number after it. Drawn backwards, it
 * also works when the range has only two numbers.
 */
export function tickSequence(range: { min: number; max: number }, actual: number | null, random: () => number): number[] {
	const numbers: number[] = new Array<number>(TICK_STEPS.length);
	let after = actual;
	for (let i = TICK_STEPS.length - 1; i >= 0; i--) {
		after = tickNumber(range, random(), after, null);
		numbers[i] = after;
	}
	return numbers;
}

/**
 * Ontwerp-v2 punt 2.1: after a click the number counts through a few random values within the
 * range of the formula and lands on the real result. Only visual: the real text stays in the
 * element all the time (the counted number is an attribute that styles.css shows on top of it),
 * so anyone reading the page, the history or the stamp sees the real result at once.
 * Gives back a function that stops it, or null when nothing counts.
 */
export function startTicking(value: HTMLElement, range: { min: number; max: number } | null, options: TickOptions = {}, random: () => number = Math.random): (() => void) | null {
	const win = range === null ? null : motionWindow();
	if (range === null || win === null) return null;
	const span = range.max - range.min;
	// A range with a fraction (1d20/2) would count numbers that can never come out: then nothing counts.
	if (!Number.isFinite(span) || span < 1 || !Number.isInteger(range.min) || !Number.isInteger(range.max)) return null;
	const actual = options.actual !== undefined && Number.isFinite(options.actual) ? options.actual : null;
	let timer: number | null = null;
	let step = 0;
	const numbers = tickSequence(range, actual, random);
	const stop = (): void => {
		if (timer !== null) win.clearTimeout(timer);
		timer = null;
		value.removeAttribute(TICK_ATTR);
	};
	const next = (): void => {
		if (step >= TICK_STEPS.length) {
			stop();
			return;
		}
		value.setAttribute(TICK_ATTR, String(numbers[step]));
		timer = win.setTimeout(next, TICK_STEPS[step++]);
	};
	const delay = options.delay ?? TICK_START_MS;
	if (delay > 0) timer = win.setTimeout(next, delay);
	else next();
	return stop;
}

/** With holdExtreme the crit or fumble classes are left off: the caller puts them on when the number lands. */
async function showOutcome(plugin: RollwrightPlugin, target: HTMLElement, outcome: RollOutcome, sourcePath: string, component: Component, holdExtreme = false): Promise<HTMLElement | null> {
	target.empty();
	target.removeClass("rollwright-error");
	clearResultClasses(target);
	const { flags } = outcome;
	if (!flags.nodice) {
		setIcon(target.createSpan({ cls: "rollwright-icon" }), "dices");
	}
	if (flags.text !== undefined) target.createSpan({ cls: "rollwright-label", text: `${flags.text}: ` });
	else if (flags.form) target.createSpan({ cls: "rollwright-label", text: `${outcome.formula} -> ` });

	const value = target.createSpan({ cls: "rollwright-value" });
	if (outcome.kind === "dice") {
		value.setText(`${outcome.estimated ? "~" : ""}${outcome.total === undefined ? outcome.text : formatResult(outcome.total, flags)}`);
		// A kept result of an older version has no extreme: then nothing is added.
		if (!holdExtreme) for (const cls of extremeClasses(outcome.extreme)) target.addClass(cls);
		// The stamp is there at once (for reading and the history); styles.css lets it grow only after the landing.
		if (outcome.extreme !== undefined) {
			// Hidden comma, as in the log: a screen reader says "20, NAT 20" and not "20NAT 20".
			target.createSpan({ cls: SEP_CLASS, text: ", " });
			target.createSpan({ cls: STAMP_CLASS, text: outcome.stamp ?? stampText(outcome.formula, outcome.extreme) });
		}
	} else {
		target.addClass(TEXT_CLASS);
		await MarkdownRenderer.render(plugin.app, defuseRolls(outcome.text), value, sourcePath, component);
		// Decided again on every new result, so a click from a block to one line (or back) fits.
		// A render that finished after a newer result was shown no longer sits in target:
		// then class and tooltip stay those of the newer result.
		if (value.parentElement !== target) return null;
		quietNestedCodes(value);
		if (isBlockValue(value)) target.addClass(BLOCK_CLASS);
	}
	setTooltip(target, tooltipFor(outcome));
	return value;
}

/**
 * Fills an element with a roll and makes it clickable. Used by both the reading
 * view and Live Preview. A broken formula shows a marked message, it never throws.
 * The component owns anything rendered from markdown. With keep (`dice+:`) the
 * result is kept across restarts, and a click keeps the new one. With modify (`dice-mod:`)
 * a click does not roll again: it hands the shown result to modify, which asks before it
 * replaces the code.
 *
 * Ctrl- or Cmd-click opens the note a table, list, section, line or tag result came from,
 * and rolls nothing; on dice it rolls as a click does. On a |none code it makes the code empty
 * again and forgets the result. Alt-click shows the average of dice, as |avg does. On dice-mod
 * only the opening of the source is added; anything else stays a plain click.
 */
export function mountRoll(plugin: RollwrightPlugin, target: HTMLElement, formula: string, key: string, sourcePath: string, component: Component, keep = false, modify?: ModifyHandler): void {
	target.addClass("rollwright-roll");
	target.setAttribute("role", "button");

	let hideFirst = false;
	try {
		hideFirst = parseSpec(formula, plugin.rollContext(sourcePath).aliases).flags.none;
	} catch {
		hideFirst = false;
	}

	let shown: RollOutcome | null = null;
	// Set by a click just before it rolls: the next result drawn counts up to its number.
	let tickNext = false;
	let stopTick: (() => void) | null = null;
	const stopTicking = (): void => {
		stopTick?.();
		stopTick = null;
	};
	component.register(stopTicking);
	// Set by a click (and Alt-click): the next result drawn gets its gold or red only when it lands.
	let landNext = false;
	const landing = new Landing(target, component);
	const show = async (outcome: RollOutcome): Promise<void> => {
		// The listener below and the click itself both hand over the same result: draw it once.
		if (outcome === shown) return;
		shown = outcome;
		stopTicking();
		landing.cancel();
		const tick = tickNext;
		tickNext = false;
		// Opening a note (no click) or reduced motion: no window, so the colour comes at once.
		const landWin = landNext ? motionWindow() : null;
		landNext = false;
		const value = await showOutcome(plugin, target, outcome, sourcePath, component, landWin !== null);
		if (landWin !== null && value !== null && shown === outcome && outcome.kind === "dice") {
			// Klus 4c: the counting stops in the same tick the colour comes, so gold never shows a counted number.
			landing.later(landWin, extremeClasses(outcome.extreme), () => shown === outcome, stopTicking);
		}
		if (!tick || value === null || shown !== outcome || outcome.kind !== "dice" || outcome.total === undefined || outcome.estimated || outcome.average) return;
		const context = plugin.rollContext(sourcePath);
		const range = rangeOf(outcome.formula, { names: context.aliases, defaultSides: context.defaultSides, defaultCount: context.defaultCount });
		// Only dice count, and dice are never a block (only rendered text is), so the value always flies in with rw-land.
		stopTick = startTicking(value, range, { actual: outcome.total });
	};
	// A click hands back its result only after the history is saved. When two clicks come back in
	// reverse order, the older one must not cover the newer one, which the listener already drew.
	const showIfNewest = async (outcome: RollOutcome): Promise<void> => {
		const newest = plugin.latestResult(key);
		if (newest !== undefined && newest !== outcome) return;
		await show(outcome);
	};
	const fail = (error: unknown): void => {
		shown = null;
		tickNext = false;
		landNext = false;
		stopTicking();
		landing.cancel();
		showError(target, formula, error);
	};

	// Before the new result is drawn, so its content comes in with the motion of styles.css (klus 2c),
	// and the old gold or red goes at once, not after the d20 tumbled (klus 2d).
	const startClick = (): void => {
		landing.cancel();
		for (const cls of [MAX_CLASS, MIN_CLASS, CRIT_CLASS, FUMBLE_CLASS]) target.removeClass(cls);
		restartRolled(target);
		landNext = true;
	};

	const rerollNow = async (): Promise<void> => {
		try {
			if (!modify) {
				startClick();
				tickNext = true;
				await showIfNewest(await plugin.freshResult(key, formula, sourcePath, keep));
				return;
			}
			// dice-mod: write what is shown. Hidden by |none, it is rolled and shown first.
			if (shown === null) await show(await plugin.firstResult(key, formula, sourcePath));
			if (shown !== null) modify(shown);
		} catch (error) {
			fail(error);
		}
	};

	const averageNow = async (): Promise<void> => {
		try {
			startClick();
			await showIfNewest(await plugin.averageResult(key, formula, sourcePath, keep));
		} catch (error) {
			fail(error);
		}
	};

	const modClick = async (pane: PaneType | boolean): Promise<void> => {
		if (hideFirst) {
			shown = null;
			await plugin.forgetResult(key);
			showBlank(target, formula);
			return;
		}
		if (shown === null || shown.kind === "dice") {
			await rerollNow();
			return;
		}
		if (shown.source === undefined) {
			new Notice(NO_SOURCE_NOTICE);
			return;
		}
		// A kept result can name a note that was renamed or removed; never make a new empty one.
		const file = plugin.app.vault.getAbstractFileByPath(shown.source);
		if (!(file instanceof TFile)) {
			new Notice(SOURCE_GONE_NOTICE);
			return;
		}
		await plugin.app.workspace.getLeaf(pane === true ? "tab" : pane).openFile(file);
	};

	target.setAttribute("tabindex", "0");
	target.addEventListener("keydown", (event) => {
		if (event.key !== "Enter") return;
		// Without this the same key press goes on to the window that dice-mod opens, and Enter
		// there presses its focused button (Cancel) at once. In the editor it also keeps the
		// key from making a new line.
		event.preventDefault();
		void rerollNow();
	});
	target.addEventListener("click", (event) => {
		// A link inside a rendered result keeps working as a link.
		if ((event.target as Node).instanceOf(Element) && (event.target as Element).closest("a")) return;
		event.preventDefault();
		event.stopPropagation();
		const pane = Keymap.isModEvent(event);
		if (pane) void modClick(pane);
		else if (event.altKey && !modify) void averageNow();
		else void rerollNow();
	});
	// Keep the editor from moving the cursor into the code on a click.
	target.addEventListener("mousedown", (event) => event.preventDefault());

	// A new result for this place from another view (or this one) shows here too.
	component.register(plugin.resultListeners.on(key, (outcome) => void show(outcome)));

	if (hideFirst && !plugin.hasResult(key, keep)) {
		showBlank(target, formula);
		return;
	}
	plugin.firstResult(key, formula, sourcePath, keep).then(show, fail).catch(fail);
}
