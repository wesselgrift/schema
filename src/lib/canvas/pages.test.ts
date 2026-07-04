import { describe, expect, test } from 'vitest';
import { createPage, movePage } from './pages';

describe('canvas pages', () => {
	test('creates a page at the requested world position', () => {
		expect(createPage(3, { x: 120, y: -40 })).toEqual({
			id: 3,
			x: 120,
			y: -40,
			title: 'Page 3',
			description: ''
		});
	});

	test('moves a page without changing its content', () => {
		const page = {
			id: 3,
			x: 120,
			y: -40,
			title: 'Checkout',
			description: 'Keep me'
		};

		expect(movePage(page, { x: 200, y: 80 })).toEqual({
			id: 3,
			x: 200,
			y: 80,
			title: 'Checkout',
			description: 'Keep me'
		});
	});
});
