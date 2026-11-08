/** What the log needs of an entry to group it: when it was rolled and from which note. */
export interface Groupable {
	time: number;
	source: string;
}

/** A run of rolls from one note on one day, newest first, as the log shows them under one heading. */
export interface HistoryGroup<T extends Groupable> {
	/** The heading: "The Rusty Flagon · 21:40", or "Other rolls · 21:40" without a note. */
	title: string;
	/** The note path of the group, "" without a note. */
	source: string;
	/** Time of the first (oldest) roll of the group. */
	time: number;
	entries: T[];
}

/** Heading of a group whose rolls came from no note (an empty source). */
export const NO_NOTE_TITLE = "Other rolls";

/** The note name without folders and without ".md": "Campaign/The Rusty Flagon.md" becomes "The Rusty Flagon". */
export function noteName(path: string): string {
	const last = path.split("/").pop() ?? path;
	const name = last.replace(/\.md$/i, "").trim();
	return name === "" ? path : name;
}

/** Hours and minutes in the user's locale, like the times on the items. */
export function shortTime(time: number): string {
	return new Date(time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function dayOf(time: number): string {
	const date = new Date(time);
	return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

/**
 * Groups the log (newest first) into sessions: next to each other in the list, the same note and the
 * same calendar day. The heading carries the time of the oldest roll of the group, where the session
 * began. Pure: the order of the entries stays as it is.
 */
export function groupHistory<T extends Groupable>(history: readonly T[], formatTime: (time: number) => string = shortTime): HistoryGroup<T>[] {
	const groups: HistoryGroup<T>[] = [];
	let current: HistoryGroup<T> | undefined;
	for (const entry of history) {
		if (current && current.source === entry.source && dayOf(current.time) === dayOf(entry.time)) {
			current.entries.push(entry);
			current.time = entry.time;
			continue;
		}
		current = { title: "", source: entry.source, time: entry.time, entries: [entry] };
		groups.push(current);
	}
	for (const group of groups) {
		const name = group.source === "" ? NO_NOTE_TITLE : noteName(group.source);
		group.title = `${name} · ${formatTime(group.time)}`;
	}
	return groups;
}
