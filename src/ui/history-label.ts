import { parseSpec, splitPipes, type Target } from "../rollers/spec";

/** How a roll is shown in the history: a name (the text(...) label, or "") and the formula without flags. */
export interface HistoryLabel {
	name: string;
	formula: string;
}

/** The file name of a link without folders and without ".md": "Demo/Encounters.md" becomes "Encounters". */
function fileName(path: string): string {
	const last = path.split("/").pop() ?? path;
	return last.replace(/\.md$/i, "").trim();
}

/** The alias in a wiki link, like "b" in [[A|b]], or "" when there is none. */
function aliasOf(raw: string): string {
	const head = splitPipes(raw)[0] ?? "";
	const wiki = /\[\[[^\]]*?\|([^\]]*)\]\]\s*$/.exec(head);
	return (wiki?.[1] ?? "").trim();
}

/** "2× " for a count before a link or tag, nothing without one. */
function countText(prefix: string): string {
	return prefix === "" ? "" : `${prefix}× `;
}

function targetText(target: Target, raw: string): string {
	if (target.kind === "dice") return target.formula.trim();
	if (target.kind === "tag") return `${countText(target.prefix)}#${target.tag}`;
	const [note = "", ...headings] = target.note.split("#");
	const alias = aliasOf(raw);
	const place = [target.blockId ?? "", ...headings].map((part) => part.trim()).filter((part) => part !== "");
	const name = alias !== "" ? alias : [fileName(note), ...place].filter((part) => part !== "").join(", ");
	return name === "" ? "" : `${countText(target.prefix)}${name}`;
}

/**
 * The tidy text for a roll in the history. Only for showing: the stored formula stays as it is and
 * "Roll again" still uses it. Never throws; on anything it cannot read it gives the raw text back.
 */
export function historyLabel(formula: string): HistoryLabel {
	const raw = typeof formula === "string" ? formula : String(formula ?? "");
	try {
		const spec = parseSpec(raw);
		const shown = targetText(spec.target, raw);
		if (shown === "") return { name: "", formula: raw };
		return { name: (spec.flags.text ?? "").trim(), formula: shown };
	} catch {
		return { name: "", formula: raw };
	}
}
