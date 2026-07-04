import { describe, expect, test } from 'vitest';
import { findNodesInRect, normalizeRect } from './selection';

const nodes = [
	{ id: 1, x: 0, y: 0, text: '' },
	{ id: 2, x: 100, y: 100, text: '' },
	{ id: 3, x: 300, y: 300, text: '' }
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

	test('finds notes with centers inside a selection rectangle', () => {
		const rect = normalizeRect({ x: -20, y: -20 }, { x: 150, y: 150 });

		expect(findNodesInRect(nodes, rect)).toEqual([1, 2]);
	});
});
