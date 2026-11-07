/** A small stand-in for the obsidian module, for testing the plugin's glue without the app. */
export class TFile {
	constructor(public path: string) {}
	get extension(): string {
		const name = this.path.split("/").pop() ?? "";
		return name.includes(".") ? (name.split(".").pop() ?? "") : "";
	}
}

export class Plugin {
	stored: unknown = null;
	registered = { views: [] as string[], commands: [] as { id: string; name: string }[], processors: 0, extensions: 0, tabs: 0 };
	constructor(public app: unknown) {}
	async loadData(): Promise<unknown> {
		return this.stored;
	}
	async saveData(data: unknown): Promise<void> {
		this.stored = JSON.parse(JSON.stringify(data));
	}
	registerView(type: string): void {
		this.registered.views.push(type);
	}
	registerMarkdownPostProcessor(): void {
		this.registered.processors++;
	}
	registerEditorExtension(): void {
		this.registered.extensions++;
	}
	addSettingTab(): void {
		this.registered.tabs++;
	}
	addCommand(command: { id: string; name: string }): void {
		this.registered.commands.push(command);
	}
	registerEvent(): void {}
}

export const notices: string[] = [];
export class Notice {
	constructor(message: string) {
		notices.push(message);
	}
}

export function getAllTags(cache: { tags?: string[] }): string[] | null {
	return cache.tags ?? null;
}

/** Like Obsidian: Ctrl or Cmd opens in a new tab. The real one tells Ctrl and Cmd apart per platform. */
export const Keymap = {
	isModEvent: (event?: { ctrlKey?: boolean; metaKey?: boolean } | null): string | boolean => (event?.ctrlKey || event?.metaKey ? "tab" : false),
};

export class ItemView {}
export class MarkdownView {}
export class PluginSettingTab {
	containerEl = { empty: () => {} };
	/** How often update() was called; from Obsidian 1.13 on that redraws a tab built from definitions. */
	updates = 0;
	constructor(public app: unknown, public plugin: unknown) {}
	update(): void {
		this.updates++;
	}
}

/** The Obsidian version the stub pretends to be; tests set it to try both ways of drawing settings. */
export const apiVersion = { current: "1.7.2" };
export function requireApiVersion(version: string): boolean {
	const have = apiVersion.current.split(".").map(Number);
	const need = version.split(".").map(Number);
	for (let i = 0; i < 3; i++) {
		if ((have[i] ?? 0) !== (need[i] ?? 0)) return (have[i] ?? 0) > (need[i] ?? 0);
	}
	return true;
}

/** A tiny element: enough for a modal or a settings row to put text and classes in. */
export interface FakeEl {
	tag: string;
	text: string;
	cls: string[];
	children: FakeEl[];
	createEl(tag: string, options?: FakeElOptions): FakeEl;
	createDiv(options?: FakeElOptions): FakeEl;
	createSpan(options?: FakeElOptions): FakeEl;
	empty(): void;
}
type FakeElOptions = { text?: string; cls?: string | string[] };
export function fakeEl(tag = "div", text = "", cls: string[] = []): FakeEl {
	const create = (child: string, options?: FakeElOptions) => {
		const classes = options?.cls === undefined ? [] : ([] as string[]).concat(options.cls);
		const made = fakeEl(child, options?.text ?? "", classes);
		el.children.push(made);
		return made;
	};
	const el: FakeEl = {
		tag,
		text,
		cls,
		children: [],
		createEl: create,
		createDiv: (options) => create("div", options),
		createSpan: (options) => create("span", options),
		empty: () => {
			el.children.length = 0;
		},
	};
	return el;
}
export function allText(el: FakeEl): string[] {
	return [el.text, ...el.children.flatMap(allText)].filter((text) => text !== "");
}

export const openedModals: Modal[] = [];
export class Modal {
	contentEl = fakeEl();
	title = "";
	constructor(public app: unknown) {}
	setTitle(title: string): this {
		this.title = title;
		return this;
	}
	open(): void {
		openedModals.push(this);
		(this as { onOpen?: () => void }).onOpen?.();
	}
	close(): void {
		(this as { onClose?: () => void }).onClose?.();
	}
}

/** Buttons made through Setting.addButton, newest last, so a test can press one. */
export const buttons: { text: string; press: () => void }[] = [];
/** Every Setting made, with its name, description and dropdown options, so a test can read a settings tab. */
export const settingsMade: { name: string; desc: string; options: string[]; texts: ((value: string) => void)[]; infoEl: FakeEl }[] = [];
export class Setting {
	readonly infoEl = fakeEl();
	private readonly made = { name: "", desc: "", options: [] as string[], texts: [] as ((value: string) => void)[], infoEl: this.infoEl };
	constructor(_containerEl?: unknown) {
		settingsMade.push(this.made);
	}
	setName(name: string): this {
		this.made.name = name;
		return this;
	}
	setDesc(desc: string): this {
		this.made.desc = desc;
		return this;
	}
	setHeading(): this {
		return this;
	}
	addText(make: (text: unknown) => void): this {
		const text = {
			setValue: () => text,
			setPlaceholder: () => text,
			onChange: (change: (value: string) => void) => (this.made.texts.push(change), text),
		};
		make(text);
		return this;
	}
	addToggle(make: (toggle: unknown) => void): this {
		const toggle = { setValue: () => toggle, onChange: () => toggle };
		make(toggle);
		return this;
	}
	addExtraButton(make: (button: unknown) => void): this {
		const button = { setIcon: () => button, setTooltip: () => button, onClick: () => button };
		make(button);
		return this;
	}
	addDropdown(make: (dropdown: unknown) => void): this {
		const dropdown = {
			addOption: (id: string) => (this.made.options.push(id), dropdown),
			setValue: () => dropdown,
			onChange: () => dropdown,
		};
		make(dropdown);
		return this;
	}
	addButton(make: (button: unknown) => void): this {
		// Like a real button: a disabled one ignores presses.
		let disabled = false;
		const made = { text: "", press: () => {} };
		const button = {
			setButtonText: (text: string) => ((made.text = text), button),
			setCta: () => button,
			setDisabled: (value: boolean) => ((disabled = value), button),
			onClick: (press: () => void) => ((made.press = () => {
				if (!disabled) press();
			}), button),
		};
		make(button);
		buttons.push(made);
		return this;
	}
}
export class Component {}
export class MarkdownRenderChild {}
export const rendered: string[] = [];
export const MarkdownRenderer = {
	render: async (_app: unknown, markdown: string): Promise<void> => {
		rendered.push(markdown);
	},
};
export const editorInfoField = {};
export const editorLivePreviewField = {};
export function setIcon(): void {}
export function setTooltip(): void {}
