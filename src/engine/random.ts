import type { RandomInt } from "./types";

export const defaultRandom: RandomInt = (min, max) => min + Math.floor(Math.random() * (max - min + 1));
