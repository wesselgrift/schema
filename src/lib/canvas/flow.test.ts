import { describe, expect, test } from 'vitest';
import {
	createSectionNode,
	createPageFlowEdge,
	getNextNumericSectionId,
	getNodeAbsolutePosition,
	getNextNumericPageId,
	getSectionAbsolutePosition,
	getSectionRelativePosition,
	hasPageFlowEdge,
	isPointInsideSection,
	orderNodesForParenting,
	pageFromNode,
	pageIdToNodeId,
	pageToNode,
	reparentPageNode,
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

	test('converts page positions between root and section-relative coordinates', () => {
		const section = createSectionNode(1, { x: 400, y: 300 });
		const page = pageToNode(createPage(1, { x: 520, y: 260 }));
		const reparented = reparentPageNode(page, section, [section, page]);

		expect(reparented).toMatchObject({
			parentId: 'section-1',
			position: { x: 360, y: 120 }
		});
		expect(getNodeAbsolutePosition(reparented, [section, reparented])).toEqual({ x: 520, y: 260 });
		const rootPage = reparentPageNode(reparented, null, [section, reparented]);
		expect(rootPage.parentId).toBeUndefined();
		expect(rootPage.position).toEqual({ x: 520, y: 260 });
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

	test('keeps sections before child pages for Svelte Flow parenting', () => {
		const page = pageToNode(createPage(1, { x: 0, y: 0 }));
		const section = createSectionNode(1, { x: 100, y: 100 });

		expect(orderNodesForParenting([page, section])).toEqual([section, page]);
		expect(getNextNumericSectionId([section, createSectionNode(8, { x: 0, y: 0 })])).toBe(9);
	});
});
