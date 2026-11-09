export interface Skin {
	id: string;
	name: string;
	paid: boolean;
	cssClass: string;
	/** One short line under the name of a paid tile: what the skin does beyond the token (Daan, notitiesfeer stap 2). */
	tagline?: string;
}

export const SKINS: Skin[] = [
	{ id: "classic", name: "Classic", paid: false, cssClass: "rollwright-skin-classic" },
	{ id: "parchment", name: "Parchment", paid: true, cssClass: "rollwright-skin-parchment", tagline: "Turns the whole note into old parchment" },
	{ id: "arcane", name: "Arcane", paid: true, cssClass: "rollwright-skin-arcane", tagline: "Turns the whole note into a torch-lit dungeon" },
];

const FREE_SKIN = SKINS[0] as Skin;

export function availableSkins(licensed: boolean): Skin[] {
	return SKINS.filter((skin) => licensed || !skin.paid);
}

/** The skin to show. A paid skin without a valid key falls back to the free one. */
export function resolveSkin(id: string, licensed: boolean): Skin {
	return availableSkins(licensed).find((skin) => skin.id === id) ?? FREE_SKIN;
}
