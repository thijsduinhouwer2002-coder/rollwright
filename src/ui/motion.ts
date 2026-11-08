import type { Component } from "obsidian";

/** On the roll from its first click on; it stays as long as the element stays. Never on opening. */
export const ROLLED_CLASS = "rollwright-rolled";
/** After a click the d20 tumbles and the number lands after about this long (ontwerp-v2 klus 2d). */
export const LAND_MS = 460;

/** The window to move in, or null when there is none with matchMedia (tests, odd hosts) or motion is reduced. */
export function motionWindow(): Window | null {
	if (typeof activeWindow === "undefined" || typeof activeWindow.matchMedia !== "function") return null;
	return activeWindow.matchMedia("(prefers-reduced-motion: reduce)").matches ? null : activeWindow;
}

/**
 * Klus 2c: sets the rolled class again so the motions of styles.css start over on every click,
 * also when the roll already had it. Reading offsetWidth makes the browser apply the removal first.
 */
export function restartRolled(target: HTMLElement): void {
	target.removeClass(ROLLED_CLASS);
	void target.offsetWidth;
	target.addClass(ROLLED_CLASS);
}

/**
 * Klus 2d: puts the gold or red of a crit or fumble on the roll only when the number lands, so the
 * colour does not tell the result while the d20 still tumbles. One timer per roll at most: a new
 * result cancels the old one, and so does the component going away (unload).
 */
export class Landing {
	private timer: number | null = null;
	private win: Window | null = null;

	constructor(private readonly target: HTMLElement, component: Component) {
		component.register(() => this.cancel());
	}

	cancel(): void {
		if (this.timer !== null) this.win?.clearTimeout(this.timer);
		this.timer = null;
		this.win = null;
	}

	/**
	 * Adds the classes after LAND_MS in win, or at once without a window (reduced motion). When the
	 * time comes and the result is no longer the newest (isCurrent) or the roll left the page, nothing.
	 * onLand runs just before the classes go on (klus 4c: the counted number goes away in that same tick).
	 */
	later(win: Window | null, classes: string[], isCurrent: () => boolean, onLand?: () => void): void {
		this.cancel();
		if (classes.length === 0) return;
		const put = (): void => {
			for (const cls of classes) this.target.addClass(cls);
		};
		if (win === null) {
			put();
			return;
		}
		this.win = win;
		this.timer = win.setTimeout(() => {
			this.timer = null;
			this.win = null;
			if (isCurrent() && this.target.isConnected) {
				onLand?.();
				put();
			}
		}, LAND_MS);
	}
}
