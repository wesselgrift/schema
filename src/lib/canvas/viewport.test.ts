import { describe, expect, test } from 'vitest';
import { screenToWorld, zoomAtPoint } from './viewport';

describe('viewport math', () => {
	test('maps screen coordinates into world coordinates', () => {
		expect(screenToWorld({ x: 260, y: 180 }, { x: 100, y: 60, scale: 2 })).toEqual({
			x: 80,
			y: 60
		});
	});

	test('keeps the world point under the cursor fixed while zooming', () => {
		const pointer = { x: 400, y: 300 };
		const viewport = { x: 40, y: 30, scale: 1 };
		const worldBefore = screenToWorld(pointer, viewport);
		const next = zoomAtPoint(viewport, pointer, 2);
		const worldAfter = screenToWorld(pointer, next);

		expect(next.scale).toBe(2);
		expect(worldAfter.x).toBeCloseTo(worldBefore.x);
		expect(worldAfter.y).toBeCloseTo(worldBefore.y);
	});
});
