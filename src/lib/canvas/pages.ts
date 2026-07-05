import type { Point } from './viewport';

export const DEFAULT_PAGE_ICON_KEY = 'FileEmpty01Icon';

export type Page = Point & {
	id: number;
	title: string;
	icon: string;
	description: string;
};

export function createPage(id: number, point: Point): Page {
	return {
		id,
		x: point.x,
		y: point.y,
		title: `Page ${id}`,
		icon: DEFAULT_PAGE_ICON_KEY,
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

export function removePagesById(pages: Page[], pageIds: number[]): Page[] {
	const idsToRemove = new Set(pageIds);
	return pages.filter((page) => !idsToRemove.has(page.id));
}

export function setPageDescription(page: Page, description: string): Page {
	return {
		...page,
		description
	};
}

export function setPageIcon(page: Page, icon: string): Page {
	return {
		...page,
		icon
	};
}

export function resetPageIcon(page: Page): Page {
	return setPageIcon(page, DEFAULT_PAGE_ICON_KEY);
}
