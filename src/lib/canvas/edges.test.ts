import { describe, expect, test } from 'vitest';
import { createFlowEdge, hasFlowEdge } from './edges';

describe('canvas edges', () => {
	test('creates a directed edge between two notes', () => {
		expect(createFlowEdge(7, 1, 2)).toEqual({
			id: 7,
			fromNodeId: 1,
			toNodeId: 2
		});
	});

	test('detects an existing directed edge', () => {
		const edges = [createFlowEdge(7, 1, 2)];

		expect(hasFlowEdge(edges, 1, 2)).toBe(true);
		expect(hasFlowEdge(edges, 2, 1)).toBe(false);
	});
});
