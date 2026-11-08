import esbuild from "esbuild";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";

await esbuild.build({
	entryPoints: ["src/main.ts"],
	bundle: true,
	external: ["obsidian", "electron", "@codemirror/*", "@lezer/*"],
	format: "cjs",
	target: "es2018",
	logLevel: "info",
	outfile: "main.js",
	minify: false,
});

// styles.css is de som van src/styles/*.css, op naam gesorteerd, zonder iets ertussen.
// Obsidian laadt één styles.css; de delen houden elk bestand onder de 400 regels.
// Wijzig de delen, niet styles.css zelf: tests/styles-bundel.test.mjs bewaakt dat ze gelijk zijn.
const dir = "src/styles";
const delen = readdirSync(dir).filter((f) => f.endsWith(".css")).sort();
if (delen.length === 0) throw new Error(`geen delen in ${dir}, styles.css niet gebouwd`);
writeFileSync("styles.css", delen.map((f) => readFileSync(`${dir}/${f}`, "utf8")).join(""));
console.log(`styles.css gebouwd uit ${delen.length} delen`);
