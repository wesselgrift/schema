import { describe, expect, test } from 'vitest';
import {
	addPageElement,
	createPage,
	DEFAULT_PAGE_ICON_KEY,
	movePage,
	removePagesById,
	resetPageIcon,
	setPageIcon
} from './pages';

describe('canvas pages', () => {
	test('creates a page at the requested world position', () => {
		expect(createPage(3, { x: 120, y: -40 })).toEqual({
			id: 3,
			x: 120,
			y: -40,
			title: 'Page 3',
			icon: DEFAULT_PAGE_ICON_KEY,
			elements: []
		});
	});

	test('moves a page without changing its content', () => {
		const page = {
			id: 3,
			x: 120,
			y: -40,
			title: 'Checkout',
			icon: 'BrowserIcon',
			elements: [{ id: 1, title: 'Email' }]
		};

		expect(movePage(page, { x: 200, y: 80 })).toEqual({
			id: 3,
			x: 200,
			y: 80,
			title: 'Checkout',
			icon: 'BrowserIcon',
			elements: [{ id: 1, title: 'Email' }]
		});
	});

	test('removes pages with matching ids', () => {
		const pages = [
			{ id: 1, x: 0, y: 0, title: 'Home', icon: 'BrowserIcon', elements: [] },
			{ id: 2, x: 100, y: 0, title: 'Search', icon: 'Search01Icon', elements: [] },
			{ id: 3, x: 200, y: 0, title: 'Checkout', icon: 'FileAddIcon', elements: [] }
		];

		expect(removePagesById(pages, [1, 3])).toEqual([
			{ id: 2, x: 100, y: 0, title: 'Search', icon: 'Search01Icon', elements: [] }
		]);
	});

	test('adds a generic element to a page', () => {
		const page = {
			id: 3,
			x: 120,
			y: -40,
			title: 'Checkout',
			icon: 'BrowserIcon',
			elements: []
		};

		expect(addPageElement(page, 7)).toEqual({
			id: 3,
			x: 120,
			y: -40,
			title: 'Checkout',
			icon: 'BrowserIcon',
			elements: [{ id: 7, title: 'Page element' }]
		});
	});

	test('updates and resets a page icon', () => {
		const page = createPage(3, { x: 120, y: -40 });

		expect(setPageIcon(page, 'BrowserIcon')).toEqual({
			...page,
			icon: 'BrowserIcon'
		});

		expect(resetPageIcon(setPageIcon(page, 'BrowserIcon'))).toEqual(page);
	});
});
