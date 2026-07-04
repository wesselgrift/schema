import type { Point } from './viewport';

export type PageElement = {
	id: number;
	title: string;
};

export type Page = Point & {
	id: number;
	title: string;
	elements: PageElement[];
};

export function createPage(id: number, point: Point): Page {
	return {
		id,
		x: point.x,
		y: point.y,
		title: `Page ${id}`,
		elements: []
	};
}

export function movePage(page: Page, point: Point): Page {
	return {
		...page,
		x: point.x,
		y: point.y
	};
}

export function removePagesById(pages: Page[], pageIds: number[]): Page[] {
	const idsToRemove = new Set(pageIds);
	return pages.filter((page) => !idsToRemove.has(page.id));
}

export function addPageElement(page: Page, elementId: number): Page {
	return {
		...page,
		elements: [...page.elements, { id: elementId, title: 'Page element' }]
	};
}
