import { describe, expect, it } from "vitest";
import type { HistoryEntry } from "../src/main";
import { RollHistoryView } from "../src/ui/history-view";

// Het logboek: de stempel staat naast het getal, niet erin, zodat `.rollwright-history-result` alleen het getal is.

interface Node {
	cls: string[];
	text: string;
	children: Node[];
}
function node(options: { cls?: string | string[]; text?: string } = {}): Node {
	const made: Node = { cls: options.cls === undefined ? [] : ([] as string[]).concat(options.cls), text: options.text ?? "", children: [] };
	const create = (_tag: string, opts?: { cls?: string | string[]; text?: string }) => {
		const c = node(opts);
		made.children.push(c);
		return c;
	};
	Object.assign(made, {
		createEl: create,
		createDiv: (opts?: { cls?: string | string[]; text?: string }) => create("div", opts),
		createSpan: (opts?: { cls?: string | string[]; text?: string }) => create("span", opts),
		empty: () => (made.children.length = 0),
		addClass: (cls: string) => made.cls.push(cls),
		setAttribute() {},
		addEventListener() {},
	});
	return made;
}
const textContent = (n: Node): string => n.text + n.children.map(textContent).join("");
const all = (n: Node): Node[] => [n, ...n.children.flatMap(all)];

function itemsOf(history: HistoryEntry[]): Node[] {
	const view = new RollHistoryView({} as never, { settings: { formulas: [], history } } as never);
	const root = node();
	(view as unknown as { contentEl: Node }).contentEl = root;
	view.refresh();
	return all(root).filter((n) => n.cls.includes("rollwright-history-item"));
}

describe("the stamp in the history", () => {
	it("is next to the result, so the result is only the number, and the item reads '25, NAT 20'", () => {
		const [crit] = itemsOf([{ time: 0, details: "", source: "", formula: "1d20+5", result: "25", extreme: "max", stamp: "NAT 20" }]);
		const result = crit?.children.find((n) => n.cls.includes("rollwright-history-result"));
		expect(result && textContent(result)).toBe("25");
		const at = crit?.children.indexOf(result as Node) ?? -1;
		expect(crit?.children.slice(at, at + 3).map(textContent)).toEqual(["25", ", ", "NAT 20"]);
		expect(crit?.children[at + 2]?.cls).toContain("rollwright-stamp");
	});

	it("an ordinary roll has no stamp and no comma", () => {
		const [plain] = itemsOf([{ time: 0, details: "", source: "", formula: "1d20", result: "9" }]);
		expect(all(plain as Node).some((n) => n.cls.includes("rollwright-stamp") || n.cls.includes("rollwright-history-sep"))).toBe(false);
	});
});
