import { describe, expect, test } from 'vitest';
import {
	createPageFlowEdge,
	getNextNumericPageId,
	hasPageFlowEdge,
	pageFromNode,
	pageIdToNodeId,
	pageToNode,
	setEdgeLabel
} from './flow';
import { createPage } from './pages';

describe('canvas flow helpers', () => {
	test('converts a page to a centered Svelte Flow page node', () => {
		const page = {
			...createPage(3, { x: 120, y: -40 }),
			title: 'Checkout',
			description: 'Checkout flow',
			icon: 'BrowserIcon'
		};

		expect(pageToNode(page)).toEqual({
			id: 'page-3',
			type: 'page',
			position: { x: 120, y: -40 },
			dragHandle: '.page-header-row',
			data: {
				pageId: 3,
				title: 'Checkout',
				description: 'Checkout flow',
				icon: 'BrowserIcon'
			}
		});
	});

	test('converts a moved and edited page node back to the page model', () => {
		const node = pageToNode(createPage(3, { x: 120, y: -40 }));
		const editedNode = {
			...node,
			position: { x: 200, y: 80 },
			data: {
				...node.data,
				title: 'Search',
				description: 'Search results',
				icon: 'BrowserIcon'
			}
		};

		expect(pageFromNode(editedNode)).toEqual({
			id: 3,
			x: 200,
			y: 80,
			title: 'Search',
			description: 'Search results',
			icon: 'BrowserIcon'
		});
	});

	test('creates an unlabeled page flow edge from a connection', () => {
		expect(
			createPageFlowEdge('edge-1', {
				source: 'page-1',
				target: 'page-2',
				sourceHandle: 'right',
				targetHandle: 'left'
			})
		).toEqual({
			id: 'edge-1',
			type: 'page-flow',
			source: 'page-1',
			target: 'page-2',
			sourceHandle: 'right',
			targetHandle: 'left',
			data: {}
		});
	});

	test('updates an edge label immutably', () => {
		const edges = [
			createPageFlowEdge('edge-1', { source: 'page-1', target: 'page-2' }),
			createPageFlowEdge('edge-2', { source: 'page-2', target: 'page-3' })
		];

		const updatedEdges = setEdgeLabel(edges, 'edge-1', 'continues to');

		expect(updatedEdges).toEqual([
			{ ...edges[0], data: { label: 'continues to' } },
			edges[1]
		]);
		expect(updatedEdges).not.toBe(edges);
		expect(updatedEdges[0]).not.toBe(edges[0]);
		expect(updatedEdges[1]).toBe(edges[1]);
	});

	test('detects duplicate page flow edges by endpoints and handles', () => {
		const edges = [
			createPageFlowEdge('edge-1', {
				source: 'page-1',
				target: 'page-2',
				sourceHandle: 'right',
				targetHandle: 'left'
			})
		];

		expect(
			hasPageFlowEdge(edges, {
				source: 'page-1',
				target: 'page-2',
				sourceHandle: 'right',
				targetHandle: 'left'
			})
		).toBe(true);
		expect(hasPageFlowEdge(edges, { source: 'page-2', target: 'page-1' })).toBe(false);
	});

	test('finds the next numeric page id from flow node ids', () => {
		expect(
			getNextNumericPageId([
				pageToNode(createPage(1, { x: 0, y: 0 })),
				pageToNode(createPage(8, { x: 0, y: 0 }))
			])
		).toBe(9);
		expect(
			getNextNumericPageId([{ ...pageToNode(createPage(1, { x: 0, y: 0 })), id: 'draft' }])
		).toBe(1);
		expect(pageIdToNodeId(12)).toBe('page-12');
	});
});
