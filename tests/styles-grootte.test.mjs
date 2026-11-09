import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Bouwplan notitiesfeer, punt 6 en eis 9: iedereen laadt styles.css, dus harde grens 500 KB.
describe("styles.css stays small", () => {
	it("the parts together are at most 500 KB", () => {
		const size = readdirSync("src/styles")
			.filter((f) => f.endsWith(".css"))
			.reduce((sum, f) => sum + readFileSync(`src/styles/${f}`).length, 0);
		expect(size).toBeLessThanOrEqual(500 * 1024);
	});

	it("the build checks the same limit", () => {
		expect(readFileSync("esbuild.config.mjs", "utf8")).toContain("500 * 1024");
	});
});
