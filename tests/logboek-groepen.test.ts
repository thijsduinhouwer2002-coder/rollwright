import { describe, expect, it } from "vitest";
import { groupHistory, NO_NOTE_TITLE, noteName } from "../src/ui/history-groups";

// Klus 5 (Daan): het logboek groepeert worpen per sessie, een notitie op een dag, met het uur van de eerste worp.

const at = (day: number, hour: number, minute: number) => new Date(2026, 10, day, hour, minute).getTime();
const hhmm = (time: number) => {
	const d = new Date(time);
	return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};
const roll = (source: string, time: number, formula = "1d20") => ({ source, time, formula });

describe("noteName", () => {
	it("drops folders and .md", () => {
		expect(noteName("Campaign/Taverns/The Rusty Flagon.md")).toBe("The Rusty Flagon");
		expect(noteName("Notes.MD")).toBe("Notes");
		expect(noteName("Plain")).toBe("Plain");
	});
});

describe("groupHistory", () => {
	it("gives nothing for an empty log", () => {
		expect(groupHistory([], hhmm)).toEqual([]);
	});

	it("puts rolls of one note on one day under one heading with the time of the oldest roll", () => {
		const log = [roll("Camp/The Rusty Flagon.md", at(7, 22, 5)), roll("Camp/The Rusty Flagon.md", at(7, 21, 52)), roll("Camp/The Rusty Flagon.md", at(7, 21, 40))];
		const groups = groupHistory(log, hhmm);
		expect(groups).toHaveLength(1);
		expect(groups[0]?.title).toBe("The Rusty Flagon · 21:40");
		expect(groups[0]?.source).toBe("Camp/The Rusty Flagon.md");
		expect(groups[0]?.entries).toEqual(log);
	});

	it("starts a new group when the note changes, also when an earlier note comes back", () => {
		const log = [roll("A.md", at(7, 22, 0)), roll("B.md", at(7, 21, 50)), roll("A.md", at(7, 21, 45)), roll("A.md", at(7, 21, 40))];
		const groups = groupHistory(log, hhmm);
		expect(groups.map((g) => g.title)).toEqual(["A · 22:00", "B · 21:50", "A · 21:40"]);
		expect(groups.map((g) => g.entries.length)).toEqual([1, 1, 2]);
	});

	it("starts a new group on a new calendar day, even in the same note", () => {
		const log = [roll("A.md", at(8, 0, 10)), roll("A.md", at(7, 23, 50))];
		expect(groupHistory(log, hhmm).map((g) => g.title)).toEqual(["A · 00:10", "A · 23:50"]);
	});

	it("names rolls without a note 'Other rolls' with the time", () => {
		const log = [roll("", at(7, 21, 41)), roll("", at(7, 21, 40)), roll("A.md", at(7, 21, 30))];
		const groups = groupHistory(log, hhmm);
		expect(groups.map((g) => g.title)).toEqual([`${NO_NOTE_TITLE} · 21:40`, "A · 21:30"]);
	});

	it("keeps every entry, in order, and does not change the log", () => {
		const log = Array.from({ length: 9 }, (_, i) => roll(i % 3 === 0 ? "B.md" : "A.md", at(7, 20, 50 - i)));
		const copy = JSON.parse(JSON.stringify(log)) as typeof log;
		const flat = groupHistory(log, hhmm).flatMap((g) => g.entries);
		expect(flat).toEqual(log);
		expect(log).toEqual(copy);
	});

	it("uses a local time with hours and minutes by default", () => {
		const [group] = groupHistory([roll("A.md", at(7, 21, 40))]);
		expect(group?.title.startsWith("A · ")).toBe(true);
		expect(group?.title).toMatch(/21|9/);
		expect(group?.title).toMatch(/40/);
	});
});
