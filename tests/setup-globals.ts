// Obsidian gives every plugin the global helpers createEl, createDiv and createSpan.
// Node and vitest do not have them, so this file adds createSpan for all tests.
// It makes the span through activeDocument, so the stubs that tests already set
// on activeDocument (a fake span or the jsdom document) keep working as before.
type Doc = { createElement(tag: string): HTMLElement };

function createSpan(): HTMLSpanElement {
	const doc = (globalThis as unknown as { activeDocument?: Doc }).activeDocument ?? (globalThis as unknown as { document: Doc }).document;
	return doc.createElement("span") as HTMLSpanElement;
}

(globalThis as unknown as { createSpan: typeof createSpan }).createSpan = createSpan;
