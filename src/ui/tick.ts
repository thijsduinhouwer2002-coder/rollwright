/**
 * Doortellen (ontwerp-v2 klus 4, 4b en 4c): after a click the number counts through a few random
 * values and lands on the real result. Moved out of widget.ts in the cleanup of 8 nov 2026; widget.ts
 * exports the same names again, so nothing that imports them from there changes.
 */
import { motionWindow } from "./motion";

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
