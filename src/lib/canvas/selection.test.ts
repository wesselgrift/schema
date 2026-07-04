import { describe, expect, test } from 'vitest';
import { findPagesInRect, normalizeRect } from './selection';

const pages = [
	{ id: 1, x: 0, y: 0, title: 'Page 1', elements: [] },
	{ id: 2, x: 100, y: 100, title: 'Page 2', elements: [] },
	{ id: 3, x: 300, y: 300, title: 'Page 3', elements: [] }
];

describe('canvas selection', () => {
	test('normalizes a drag rectangle regardless of drag direction', () => {
		expect(normalizeRect({ x: 120, y: 80 }, { x: -20, y: 200 })).toEqual({
			x: -20,
			y: 80,
			width: 140,
			height: 120
		});
	});

	test('finds pages with centers inside a selection rectangle', () => {
		const rect = normalizeRect({ x: -20, y: -20 }, { x: 150, y: 150 });

		expect(findPagesInRect(pages, rect)).toEqual([1, 2]);
	});
});
