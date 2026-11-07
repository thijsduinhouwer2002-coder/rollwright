const IMAGE = /\.(avif|bmp|gif|jpe?g|png|svg|webp)$/i;

function isImage(target: string): boolean {
	const path = (target.split("|")[0] ?? "").split("#")[0] ?? "";
	return IMAGE.test(path.trim());
}

/**
 * Makes rolled text safe to render as markdown. Rendering runs the post-processor
 * again, so a dice code inside a result would roll again, and a note that rolls on
 * itself would never stop. Therefore nothing in a result may become a new roll:
 * - "dice:" (and "dice+:", "dice-:", "dice-mod:") right after a backtick run, or inside an HTML code element, gets an
 *   invisible character, so no code reads as a roll. Links and plain text keep their
 *   exact spelling, apart from plain text right after a closing backtick, where the
 *   character is harmless;
 * - an embed of a note becomes a link, because the embed would bring in that note's
 *   own dice codes. Embedded images stay.
 *
 * Backticks are not paired on purpose. Where a code span ends depends on blocks, list
 * items and table cells, so one stray backtick would throw off the pairing. A rollable
 * code always starts with "dice:" (see formulaFromCode), so looking at what follows a
 * backtick run finds all of them without knowing the pairs. A ">" is skipped too,
 * because a quote or callout drops it when a code span runs over two lines.
 */
/** An escaped character (skipped), "dice:" opening a code span, or an HTML code element. */
const CODE = /\\[\s\S]|`+[\s>]*dice\s*(?:[+-]|-\s*mod)?\s*:|<code\b[^>]*>[\s\S]*?(?:<\/code>|$)/gi;

export function defuseRolls(markdown: string): string {
	return markdown
		.replace(/!\[\[([^\]]+)\]\]/g, (whole: string, target: string) => (isImage(target) ? whole : `[[${target}]]`))
		.replace(/!\[([^\]]*)\]\(([^()]*)\)/g, (whole: string, label: string, target: string) =>
			isImage(target) || /^https?:/i.test(target) ? whole : `[${label}](${target})`,
		)
		.replace(CODE, (whole: string) => whole.replace(/(dice\s*(?:[+-]|-\s*mod)?)(\s*:)/gi, "$1\u200b$2"));
}
