import { describe, expect, it } from "vitest";
import { historyLabel } from "../src/ui/history-label";

describe("historyLabel: how a roll is shown in the history", () => {
	it("a plain formula stays as it is, without a name", () => {
		expect(historyLabel("2d6 + 3")).toEqual({ name: "", formula: "2d6 + 3" });
		expect(historyLabel("1d1000000")).toEqual({ name: "", formula: "1d1000000" });
	});

	it("text(...) becomes the name and the flags go away (Daan punt 6)", () => {
		expect(historyLabel("1d20 + 5|text(Raak?)")).toEqual({ name: "Raak?", formula: "1d20 + 5" });
		expect(historyLabel("1d20|avg|signed")).toEqual({ name: "", formula: "1d20" });
		expect(historyLabel("4d6kh3 | nodice | text(Strength)")).toEqual({ name: "Strength", formula: "4d6kh3" });
	});

	it("a table link shows the note and the table (Daan punt 9)", () => {
		expect(historyLabel("[[Tabellen^gasten]]")).toEqual({ name: "", formula: "Tabellen, gasten" });
		expect(historyLabel("[[Namen^namen]]")).toEqual({ name: "", formula: "Namen, namen" });
		expect(historyLabel("[[Tabellen#^gasten]]")).toEqual({ name: "", formula: "Tabellen, gasten" });
	});

	it("a heading link shows the note and the heading", () => {
		expect(historyLabel("[[Notitie#Kop]]")).toEqual({ name: "", formula: "Notitie, Kop" });
		expect(historyLabel("[[Notitie#Kop#Onderkop]]")).toEqual({ name: "", formula: "Notitie, Kop, Onderkop" });
	});

	it("a link without ^ or # shows only the note", () => {
		expect(historyLabel("[[Bron]]")).toEqual({ name: "", formula: "Bron" });
	});

	it("a path shows only the file name", () => {
		expect(historyLabel("[[Demo/Encounters^road]]")).toEqual({ name: "", formula: "Encounters, road" });
		expect(historyLabel("[[Demo/Sub/Encounters.md]]")).toEqual({ name: "", formula: "Encounters" });
	});

	it("an alias is the name the writer chose for the link", () => {
		expect(historyLabel("[[A|b]]")).toEqual({ name: "", formula: "b" });
		expect(historyLabel("[[Tabellen^gasten|Guests]]|text(Who?)")).toEqual({ name: "Who?", formula: "Guests" });
	});

	it("a count before a link stays visible", () => {
		expect(historyLabel("2[[Bron]]|line")).toEqual({ name: "", formula: "2× Bron" });
		expect(historyLabel("1d4[[Tabellen^gasten]]")).toEqual({ name: "", formula: "1d4× Tabellen, gasten" });
	});

	it("a markdown link and a tag are tidy too", () => {
		expect(historyLabel("[Guests](Demo/Tabellen.md#^gasten)")).toEqual({ name: "", formula: "Tabellen, gasten" });
		expect(historyLabel("#npc")).toEqual({ name: "", formula: "#npc" });
		expect(historyLabel("3#npc|link")).toEqual({ name: "", formula: "3× #npc" });
	});

	it("a label on a table roll is the name", () => {
		expect(historyLabel("[[Tabellen^gasten]]|text(Gast)")).toEqual({ name: "Gast", formula: "Tabellen, gasten" });
	});

	it("never throws on nonsense and falls back to the raw text", () => {
		const nonsense = ["", "   ", "|", "||text()", "1d20|bogus", "[[", "]]", "[[]]", "[[#]]", "[[^]]", "((((", "|text(x)", "%E0%A4%A", "[x](%E0%A4%A)", "[[|]]"];
		for (const raw of nonsense) {
			expect(() => historyLabel(raw)).not.toThrow();
			const label = historyLabel(raw);
			expect(typeof label.name).toBe("string");
			expect(typeof label.formula).toBe("string");
		}
		expect(historyLabel("1d20|bogus")).toEqual({ name: "", formula: "1d20|bogus" });
		expect(historyLabel("")).toEqual({ name: "", formula: "" });
		expect(historyLabel("|text(x)")).toEqual({ name: "", formula: "|text(x)" });
		expect(historyLabel("[[]]")).toEqual({ name: "", formula: "[[]]" });
		expect(historyLabel("[[^]]")).toEqual({ name: "", formula: "[[^]]" });
	});

	it("survives a stored value that is not text", () => {
		expect(historyLabel(undefined as unknown as string)).toEqual({ name: "", formula: "" });
		expect(historyLabel(42 as unknown as string)).toEqual({ name: "", formula: "42" });
	});
});
