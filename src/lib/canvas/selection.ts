import type { Page } from './pages';
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

export function findPagesInRect(pages: Page[], rect: SelectionRect): number[] {
	const maxX = rect.x + rect.width;
	const maxY = rect.y + rect.height;

	return pages
		.filter((page) => page.x >= rect.x && page.x <= maxX && page.y >= rect.y && page.y <= maxY)
		.map((page) => page.id);
}
