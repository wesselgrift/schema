import { describe, expect, test } from 'vitest';
import { findItemsInRect, normalizeRect } from './selection';

const items = [
	{ id: 1, x: 0, y: 0, title: 'Item 1', type: 'page' as const, description: '' },
	{ id: 2, x: 100, y: 100, title: 'Item 2', type: 'page' as const, description: '' },
	{ id: 3, x: 300, y: 300, title: 'Item 3', type: 'page' as const, description: '' }
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

	test('finds items with centers inside a selection rectangle', () => {
		const rect = normalizeRect({ x: -20, y: -20 }, { x: 150, y: 150 });

		expect(findItemsInRect(items, rect)).toEqual([1, 2]);
	});
});
