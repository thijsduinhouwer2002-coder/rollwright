import { describe, expect, it } from "vitest";
import { parseBlocks } from "../src/rollers/markdown";

describe("L6: table rule on long lines", () => {
	const spaces = " ".repeat(50000);

	it.each([
		["before a dash", `| a |\n${spaces}-x`],
		["before a pipe and dash", `${spaces}|\n${spaces}-|x`],
	])("stays fast with 50000 spaces %s", (_name, text) => {
		const start = performance.now();
		parseBlocks(text);
		expect(performance.now() - start).toBeLessThan(150);
	});

	it.each(["---", "|---|", "| --- | :-: |", " :--- | ---: ", "|-|-|"])("still reads %s as a table rule", (rule) => {
		expect(parseBlocks(`| a | b |\n${rule}\n| 1 | 2 |`)[0]?.type).toBe("table");
	});

	it.each(["- - x", "|---|x|", "||", "|-- -|"])("does not read %s as a table rule", (rule) => {
		expect(parseBlocks(`| a | b |\n${rule}\n`)[0]?.type).not.toBe("table");
	});
});
