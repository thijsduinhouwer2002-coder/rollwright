// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { defuseRolls } from "../src/rollers/defuse";
import { NESTED_CLASS, quietNestedCodes } from "../src/ui/nested-code";

/** Renders like MarkdownRenderer would for inline code: a code element per backtick pair. */
function render(markdown: string): HTMLElement {
	const el = document.createElement("span");
	el.innerHTML = defuseRolls(markdown).replace(/`([^`]+)`/g, (_m, inner: string) => `<code>${inner}</code>`);
	return el;
}

describe("quietNestedCodes (Daan punt 3)", () => {
	it("shows a defused dice code as plain text with only the formula", () => {
		const el = render("Alinea Delta met een worp `dice: 1d6` erin.");
		quietNestedCodes(el);
		expect(el.querySelector("code")).toBeNull();
		expect(el.textContent).toBe("Alinea Delta met een worp 1d6 erin.");
		expect(el.querySelector(`.${NESTED_CLASS}`)?.hasAttribute("title")).toBe(false);
	});

	it("handles every prefix and a link formula", () => {
		const el = render("`dice+: 2d6` `dice-: 1d4` `dice-mod: 1d8` `dice: [[Bron^delta]]`");
		quietNestedCodes(el);
		expect(Array.from(el.querySelectorAll(`.${NESTED_CLASS}`)).map((s) => s.textContent)).toEqual(["2d6", "1d4", "1d8", "[[Bron^delta]]"]);
	});

	it("leaves other code alone, also code blocks and an empty formula", () => {
		const el = render("`npm test` en `dice:` en `dicey: 3`");
		const pre = document.createElement("pre");
		pre.innerHTML = `<code>${defuseRolls("`dice: 1d6`").replace(/`/g, "")}</code>`;
		el.append(pre);
		quietNestedCodes(el);
		expect(el.querySelectorAll("code").length).toBe(4);
		expect(el.querySelector(`.${NESTED_CLASS}`)).toBeNull();
	});

	it("does not make the result rollable again", () => {
		const el = render("`dice: 1d6`");
		quietNestedCodes(el);
		expect(el.innerHTML).not.toMatch(/`dice/);
		expect(el.querySelector("code")).toBeNull();
	});

	it("also finds codes deeper in a list, quote or table", () => {
		const el = document.createElement("div");
		el.innerHTML = defuseRolls("<ul><li>a `dice: 1d4` b `dice: 1d8`</li></ul><blockquote><p><strong>x</strong> `dice: 2d6`</p></blockquote><table><tr><td>`dice: 1d10`</td></tr></table>").replace(/`([^`]+)`/g, (_m, inner: string) => `<code>${inner}</code>`);
		quietNestedCodes(el);
		expect(el.querySelector("code")).toBeNull();
		expect(Array.from(el.querySelectorAll(`.${NESTED_CLASS}`)).map((s) => s.textContent)).toEqual(["1d4", "1d8", "2d6", "1d10"]);
	});
});
