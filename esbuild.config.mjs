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

// Iedereen laadt styles.css, ook gratis gebruikers; de letters van de skins staan er als base64 in.
// Harde grens 500 KB (bouwplan notitiesfeer, punt 6): daarboven faalt de build.
const STYLES_LIMIT = 500 * 1024;
const stylesSize = readFileSync("styles.css").length;
if (stylesSize > STYLES_LIMIT) throw new Error(`styles.css is ${stylesSize} bytes, meer dan de grens van ${STYLES_LIMIT}`);
console.log(`styles.css: ${(stylesSize / 1024).toFixed(1)} KB van de ${STYLES_LIMIT / 1024} KB`);
