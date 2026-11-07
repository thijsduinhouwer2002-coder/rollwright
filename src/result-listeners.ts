import type { RollOutcome } from "./rollers/run";

type Listener = (outcome: RollOutcome) => void;

/**
 * Widgets that show the same place in a note (reading view and Live Preview share the key)
 * listen here, so a new result in one view also shows in the other. Without this, a view
 * that was already drawn kept showing the result from before the click.
 */
export class ResultListeners {
	private readonly byKey = new Map<string, Set<Listener>>();

	/** Returns the function that stops listening; call it when the widget goes away. */
	on(key: string, listener: Listener): () => void {
		let set = this.byKey.get(key);
		if (!set) {
			set = new Set();
			this.byKey.set(key, set);
		}
		set.add(listener);
		return () => {
			const current = this.byKey.get(key);
			if (!current) return;
			current.delete(listener);
			if (current.size === 0) this.byKey.delete(key);
		};
	}

	emit(key: string, outcome: RollOutcome): void {
		// A copy, so a listener that stops listening while being called does not upset the loop.
		for (const listener of [...(this.byKey.get(key) ?? [])]) listener(outcome);
	}

	/** How many keys have a listener; for tests. */
	get size(): number {
		return this.byKey.size;
	}
}
