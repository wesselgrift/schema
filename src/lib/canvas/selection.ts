import type { Item } from './items';
import type { Point } from './viewport';

export type SelectionRect = Point & {
	width: number;
	height: number;
};

export function normalizeRect(start: Point, end: Point): SelectionRect {
	const x = Math.min(start.x, end.x);
	const y = Math.min(start.y, end.y);

	return {
		x,
		y,
		width: Math.abs(end.x - start.x),
		height: Math.abs(end.y - start.y)
	};
}

export function findItemsInRect(items: Item[], rect: SelectionRect): number[] {
	const maxX = rect.x + rect.width;
	const maxY = rect.y + rect.height;

	return items
		.filter((item) => item.x >= rect.x && item.x <= maxX && item.y >= rect.y && item.y <= maxY)
		.map((item) => item.id);
}
