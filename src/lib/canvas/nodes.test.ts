import { describe, expect, test } from 'vitest';
import { createTextNode, moveTextNode } from './nodes';

describe('canvas nodes', () => {
	test('creates a text node at the requested world position', () => {
		expect(createTextNode(3, { x: 120, y: -40 })).toEqual({
			id: 3,
			x: 120,
			y: -40,
			text: ''
		});
	});

	test('moves a text node without changing its content', () => {
		const node = {
			id: 3,
			x: 120,
			y: -40,
			text: 'Keep me'
		};

		expect(moveTextNode(node, { x: 200, y: 80 })).toEqual({
			id: 3,
			x: 200,
			y: 80,
			text: 'Keep me'
		});
	});
});
