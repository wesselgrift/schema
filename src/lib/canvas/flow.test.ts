import { describe, expect, test } from 'vitest';
import {
	createSectionNode,
	createPageFlowEdge,
	getNextNumericEdgeId,
	getNextNumericSectionId,
	getNodeAbsolutePosition,
	getNextNumericItemId,
	getSectionAbsolutePosition,
	getSectionRelativePosition,
	hasPageFlowEdge,
	isPointInsideSection,
	orderNodesForParenting,
	itemFromNode,
	itemIdToNodeId,
	itemToNode,
	reparentItemNode,
	setEdgeLabel
} from './flow';
import { createItem } from './items';

describe('canvas flow helpers', () => {
	test('converts an item to a centered Svelte Flow item node', () => {
		const item = {
			...createItem(3, { x: 120, y: -40 }),
			title: 'Checkout',
			description: 'Checkout flow',
			type: 'page' as const
		};

		expect(itemToNode(item)).toEqual({
			id: 'item-3',
			type: 'item',
			position: { x: 120, y: -40 },
			dragHandle: '.item-header-row',
			data: {
				itemId: 3,
				title: 'Checkout',
				description: 'Checkout flow',
				type: 'page'
			}
		});
	});

	test('converts a moved and edited item node back to the item model', () => {
		const node = itemToNode(createItem(3, { x: 120, y: -40 }));
		const editedNode = {
			...node,
			position: { x: 200, y: 80 },
			data: {
				...node.data,
				title: 'Search',
				description: 'Search results',
				type: 'list' as const
			}
		};

		expect(itemFromNode(editedNode)).toEqual({
			id: 3,
			x: 200,
			y: 80,
			title: 'Search',
			description: 'Search results',
			type: 'list'
		});
	});

	test('creates an unlabeled page flow edge from a connection', () => {
		expect(
			createPageFlowEdge('edge-1', {
				source: 'item-1',
				target: 'item-2',
				sourceHandle: 'right',
				targetHandle: 'left'
			})
		).toEqual({
			id: 'edge-1',
			type: 'page-flow',
			source: 'item-1',
			target: 'item-2',
			sourceHandle: 'right',
			targetHandle: 'left',
			data: {}
		});
	});

	test('updates an edge label immutably', () => {
		const edges = [
			createPageFlowEdge('edge-1', { source: 'item-1', target: 'item-2' }),
			createPageFlowEdge('edge-2', { source: 'item-2', target: 'item-3' })
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
				source: 'item-1',
				target: 'item-2',
				sourceHandle: 'right',
				targetHandle: 'left'
			})
		];

		expect(
			hasPageFlowEdge(edges, {
				source: 'item-1',
				target: 'item-2',
				sourceHandle: 'right',
				targetHandle: 'left'
			})
		).toBe(true);
		expect(hasPageFlowEdge(edges, { source: 'item-2', target: 'item-1' })).toBe(false);
	});

	test('finds the next numeric item id from flow node ids', () => {
		expect(
			getNextNumericItemId([
				itemToNode(createItem(1, { x: 0, y: 0 })),
				itemToNode(createItem(8, { x: 0, y: 0 }))
			])
		).toBe(9);
		expect(
			getNextNumericItemId([{ ...itemToNode(createItem(1, { x: 0, y: 0 })), id: 'draft' }])
		).toBe(1);
		expect(itemIdToNodeId(12)).toBe('item-12');
	});

	test('finds the next numeric edge id from edge ids', () => {
		expect(
			getNextNumericEdgeId([
				createPageFlowEdge('edge-1', { source: 'item-1', target: 'item-2' }),
				createPageFlowEdge('edge-4', { source: 'item-2', target: 'item-3' })
			])
		).toBe(5);
		expect(getNextNumericEdgeId([])).toBe(1);
		expect(getNextNumericEdgeId([{ id: 'not-an-edge' }])).toBe(1);
	});

	test('creates a section node with default dimensions', () => {
		expect(createSectionNode(2, { x: 500, y: 300 }, { focusTitle: true })).toEqual({
			id: 'section-2',
			type: 'section',
			position: { x: 500, y: 300 },
			style: 'width: 480px; height: 320px;',
			data: {
				sectionId: 2,
				title: 'Section 2',
				width: 480,
				height: 320,
				focusTitle: true
			}
		});
	});

	test('converts item positions between root and section-relative coordinates', () => {
		const section = createSectionNode(1, { x: 400, y: 300 });
		const item = itemToNode(createItem(1, { x: 520, y: 260 }));
		const reparented = reparentItemNode(item, section, [section, item]);

		expect(reparented).toMatchObject({
			parentId: 'section-1',
			position: { x: 360, y: 120 }
		});
		expect(getNodeAbsolutePosition(reparented, [section, reparented])).toEqual({ x: 520, y: 260 });
		const rootItem = reparentItemNode(reparented, null, [section, reparented]);
		expect(rootItem.parentId).toBeUndefined();
		expect(rootItem.position).toEqual({ x: 520, y: 260 });
	});

	test('converts section relative and absolute positions', () => {
		const section = createSectionNode(1, { x: 200, y: 100 });

		expect(getSectionRelativePosition({ x: 260, y: 60 }, section)).toEqual({ x: 300, y: 120 });
		expect(getSectionAbsolutePosition({ x: 300, y: 120 }, section)).toEqual({ x: 260, y: 60 });
	});

	test('detects points inside center-origin section bounds', () => {
		const section = createSectionNode(1, { x: 200, y: 100 }, { width: 300, height: 200 });

		expect(isPointInsideSection({ x: 350, y: 200 }, section)).toBe(true);
		expect(isPointInsideSection({ x: 351, y: 200 }, section)).toBe(false);
	});

	test('keeps sections before child items for Svelte Flow parenting', () => {
		const item = itemToNode(createItem(1, { x: 0, y: 0 }));
		const section = createSectionNode(1, { x: 100, y: 100 });

		expect(orderNodesForParenting([item, section])).toEqual([section, item]);
		expect(getNextNumericSectionId([section, createSectionNode(8, { x: 0, y: 0 })])).toBe(9);
	});
});
