import { describe, expect, test } from 'vitest';
import { addPageElement, createPage, movePage, removePagesById } from './pages';

describe('canvas pages', () => {
	test('creates a page at the requested world position', () => {
		expect(createPage(3, { x: 120, y: -40 })).toEqual({
			id: 3,
			x: 120,
			y: -40,
			title: 'Page 3',
			elements: []
		});
	});

	test('moves a page without changing its content', () => {
		const page = {
			id: 3,
			x: 120,
			y: -40,
			title: 'Checkout',
			elements: [{ id: 1, title: 'Email' }]
		};

		expect(movePage(page, { x: 200, y: 80 })).toEqual({
			id: 3,
			x: 200,
			y: 80,
			title: 'Checkout',
			elements: [{ id: 1, title: 'Email' }]
		});
	});

	test('removes pages with matching ids', () => {
		const pages = [
			{ id: 1, x: 0, y: 0, title: 'Home', elements: [] },
			{ id: 2, x: 100, y: 0, title: 'Search', elements: [] },
			{ id: 3, x: 200, y: 0, title: 'Checkout', elements: [] }
		];

		expect(removePagesById(pages, [1, 3])).toEqual([
			{ id: 2, x: 100, y: 0, title: 'Search', elements: [] }
		]);
	});

	test('adds a generic element to a page', () => {
		const page = {
			id: 3,
			x: 120,
			y: -40,
			title: 'Checkout',
			elements: []
		};

		expect(addPageElement(page, 7)).toEqual({
			id: 3,
			x: 120,
			y: -40,
			title: 'Checkout',
			elements: [{ id: 7, title: 'Page element' }]
		});
	});
});
