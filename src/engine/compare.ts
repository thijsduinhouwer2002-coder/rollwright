import type { CompareOp, Condition } from "./types";

export function compare(value: number, op: CompareOp, target: number): boolean {
	switch (op) {
		case "=":
			return value === target;
		case "!=":
			return value !== target;
		case ">":
			return value > target;
		case "<":
			return value < target;
		case ">=":
			return value >= target;
		case "<=":
			return value <= target;
	}
}

export function matchesAny(value: number, conditions: Condition[]): boolean {
	return conditions.some((c) => compare(value, c.op, c.value));
}
