import { describe, expect, test } from 'vitest';
import {
	createPage,
	DEFAULT_PAGE_ICON_KEY,
	movePage,
	removePagesById,
	resetPageIcon,
	setPageDescription,
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
			description: ''
		});
	});

	test('moves a page without changing its content', () => {
		const page = {
			id: 3,
			x: 120,
			y: -40,
			title: 'Checkout',
			icon: 'BrowserIcon',
			description: 'Checkout flow'
		};

		expect(movePage(page, { x: 200, y: 80 })).toEqual({
			id: 3,
			x: 200,
			y: 80,
			title: 'Checkout',
			icon: 'BrowserIcon',
			description: 'Checkout flow'
		});
	});

	test('removes pages with matching ids', () => {
		const pages = [
			{ id: 1, x: 0, y: 0, title: 'Home', icon: 'BrowserIcon', description: '' },
			{ id: 2, x: 100, y: 0, title: 'Search', icon: 'Search01Icon', description: '' },
			{ id: 3, x: 200, y: 0, title: 'Checkout', icon: 'FileAddIcon', description: '' }
		];

		expect(removePagesById(pages, [1, 3])).toEqual([
			{ id: 2, x: 100, y: 0, title: 'Search', icon: 'Search01Icon', description: '' }
		]);
	});

	test('updates a page description', () => {
		const page = createPage(3, { x: 120, y: -40 });

		expect(setPageDescription(page, 'Describe this page')).toEqual({
			...page,
			description: 'Describe this page'
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
