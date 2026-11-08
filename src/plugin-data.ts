import type { SavedFormula } from "./import/dice-roller-data";
import type { Extreme } from "./rollers/extreme";
import type { RollOutcome } from "./rollers/run";

/**
 * The data Rollwright keeps in its plugin data file: the settings, the roll log and kept results,
 * plus the check that a kept result read back from disk is a real outcome. Split from main.ts (size).
 */

export interface HistoryEntry {
	time: number;
	formula: string;
	result: string;
	details: string;
	source: string;
	/** A crit or fumble (see rollers/extreme.ts). Missing on other rolls and in entries of 0.2.x and older. */
	extreme?: Extreme;
	/** What the stamp says on a crit or fumble: "NAT 20", "NAT 1", "MAX" or "MIN". */
	stamp?: string;
}

export interface RollwrightSettings {
	defaultSides: number;
	defaultCount: number;
	formulas: SavedFormula[];
	history: HistoryEntry[];
	licenseKey: string;
	/** When Polar last said the key is valid (ms since 1970), 0 when never. Name and e-mail are never stored. */
	licenseCheckedAt: number;
	skin: string;
	/** Results of `dice+:` by key (note, place, formula), oldest first. Kept across restarts. */
	keptResults: [string, RollOutcome][];
	/** Write the formula before the result when a `dice-mod:` code is replaced. */
	diceModFormula: boolean;
}

export const DEFAULT_SETTINGS: RollwrightSettings = {
	defaultSides: 100,
	defaultCount: 1,
	formulas: [],
	history: [],
	licenseKey: "",
	licenseCheckedAt: 0,
	skin: "classic",
	keptResults: [],
	diceModFormula: true,
};

export const HISTORY_LIMIT = 200;
/** Remembered per place in a note, so scrolling never rerolls. Not kept across restarts; the oldest go first. */
export const RESULT_CACHE_LIMIT = 2000;
/** At most this many `dice+:` results on disk; the oldest go first. */
export const KEPT_RESULTS_LIMIT = 500;

const OUTCOME_KINDS = new Set(["dice", "table", "list", "section", "line", "tag"]);

/** A kept result read back from disk must look like a real outcome, or it is skipped. */
export function isKeptOutcome(value: unknown): value is RollOutcome {
	if (typeof value !== "object" || value === null) return false;
	const o = value as Record<string, unknown>;
	return (
		typeof o.kind === "string" && OUTCOME_KINDS.has(o.kind) &&
		typeof o.text === "string" && typeof o.formula === "string" && typeof o.details === "string" &&
		typeof o.flags === "object" && o.flags !== null && !Array.isArray(o.flags) &&
		(o.total === undefined || typeof o.total === "number")
	);
}
