import { rollSpec, type RollContext } from "../src/rollers/run";

/** Shared by the dice-mod tests: a roll context with set rolls and notes. */
export function context(notes: Record<string, string> = {}, rolls: number[] = []): RollContext {
	const queue = [...rolls];
	return {
		sourcePath: "A.md",
		defaultSides: 100,
		defaultCount: 1,
		aliases: {},
		random: (min, max) => queue.shift() ?? Math.max(min, Math.min(max, 1)),
		readNote: async (link) => (notes[link] === undefined ? null : { path: `${link}.md`, markdown: notes[link] as string }),
		notesWithTag: async () => [],
	};
}

export const rolled = (spec: string, rolls: number[] = [], notes: Record<string, string> = {}) => rollSpec(spec, context(notes, rolls));
