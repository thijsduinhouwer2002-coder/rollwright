import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SKINS } from "../src/pro/skins";

// Bouwplan notitiesfeer, punt 4 en eis 9: een variabele die met var() is opgebouwd wordt al op body
// uitgerekend. Daarom zet elke betaalde skin binnen .rollwright-world zelf elke variabele die het
// notitievlak gebruikt. Plus --callout-blend-mode (Daan, ronde a): anders nemen callouts de tekstkleur
// van het thema mee.
const WORLD_VARIABLES = [
	"--font-text", "--font-text-theme",
	"--background-primary", "--background-secondary",
	"--text-normal", "--text-muted", "--text-faint", "--text-accent", "--text-accent-hover",
	"--h1-font", "--h2-font", "--h3-font", "--h4-font", "--h5-font", "--h6-font",
	"--h1-color", "--h2-color", "--h3-color", "--h4-color", "--h5-color", "--h6-color",
	"--link-color", "--link-unresolved-color", "--link-external-color",
	"--tag-color", "--tag-background",
	"--bold-color", "--italic-color", "--hr-color", "--list-marker-color", "--checkbox-color",
	"--blockquote-border-color", "--table-border-color", "--code-background",
	"--text-selection", "--caret-color",
	"--callout-blend-mode",
];

const css = readdirSync("src/styles")
	.filter((f) => f.endsWith(".css"))
	.sort()
	.map((f) => readFileSync(`src/styles/${f}`, "utf8"))
	.join("\n")
	.replace(/\/\*[\s\S]*?\*\//g, "");

/** Custom properties set in rules whose selector list contains exactly `body.<skin> .rollwright-world`. */
function worldVariables(cssClass) {
	const wanted = `body.${cssClass} .rollwright-world`;
	const found = new Set();
	for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
		const selectors = (match[1] ?? "").split(",").map((s) => s.trim().replace(/\s+/g, " "));
		if (!selectors.includes(wanted)) continue;
		for (const decl of (match[2] ?? "").matchAll(/(--[a-z0-9-]+)\s*:/g)) found.add(decl[1] ?? "");
	}
	return found;
}

describe("every paid skin sets the whole world", () => {
	const paid = SKINS.filter((skin) => skin.paid);

	it("there are paid skins to check", () => {
		expect(paid.length).toBeGreaterThan(0);
	});

	it.each(paid.map((skin) => [skin.id, skin.cssClass]))("%s sets every variable", (_id, cssClass) => {
		const set = worldVariables(cssClass);
		expect(WORLD_VARIABLES.filter((name) => !set.has(name))).toEqual([]);
	});

	it("callouts do not blend with the theme", () => {
		for (const skin of paid) {
			const rule = new RegExp(`body\\.${skin.cssClass} \\.rollwright-world\\s*\\{[^}]*--callout-blend-mode:\\s*normal`);
			expect(css).toMatch(rule);
		}
	});

	it("Classic has no world", () => {
		expect(worldVariables("rollwright-skin-classic").size).toBe(0);
	});
});
