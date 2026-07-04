import type { Point } from './viewport';

export type Page = Point & {
	id: number;
	title: string;
	description: string;
};

export function createPage(id: number, point: Point): Page {
	return {
		id,
		x: point.x,
		y: point.y,
		title: `Page ${id}`,
		description: ''
	};
}

export function movePage(page: Page, point: Point): Page {
	return {
		...page,
		x: point.x,
		y: point.y
	};
}
