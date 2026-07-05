import type { Connection, Edge, Node, XYPosition } from '@xyflow/svelte';
import type { Page } from './pages';

export const PAGE_NODE_TYPE = 'page';
export const PAGE_FLOW_EDGE_TYPE = 'page-flow';
export const PAGE_SOURCE_HANDLE = 'right';
export const PAGE_TARGET_HANDLE = 'left';
export const PAGE_TOP_HANDLE = 'top';
export const PAGE_BOTTOM_HANDLE = 'bottom';
export const PAGE_NODE_DRAG_HANDLE = '.page-header-row';

export type PageNodeData = {
	pageId: number;
	title: string;
	description: string;
	icon: string;
	focusTitle?: boolean;
};

export type PageFlowEdgeData = {
	label?: string;
	labelSelected?: boolean;
};

export type PageFlowNode = Node<PageNodeData, typeof PAGE_NODE_TYPE>;
export type PageFlowEdge = Edge<PageFlowEdgeData, typeof PAGE_FLOW_EDGE_TYPE>;
type PageFlowConnection = Pick<Connection, 'source' | 'target'> &
	Partial<Pick<Connection, 'sourceHandle' | 'targetHandle'>>;

export function pageIdToNodeId(pageId: number): string {
	return `page-${pageId}`;
}

export function nodeIdToPageId(nodeId: string): number | null {
	const match = /^page-(\d+)$/.exec(nodeId);
	if (!match) return null;

	return Number(match[1]);
}

export function pageToNode(page: Page, options: { focusTitle?: boolean } = {}): PageFlowNode {
	return {
		id: pageIdToNodeId(page.id),
		type: PAGE_NODE_TYPE,
		position: { x: page.x, y: page.y },
		dragHandle: PAGE_NODE_DRAG_HANDLE,
		data: {
			pageId: page.id,
			title: page.title,
			description: page.description,
			icon: page.icon,
			...(options.focusTitle ? { focusTitle: true } : {})
		}
	};
}

export function pageFromNode(node: PageFlowNode): Page {
	return {
		id: node.data.pageId,
		x: node.position.x,
		y: node.position.y,
		title: node.data.title,
		description: node.data.description,
		icon: node.data.icon
	};
}

export function createPageFlowEdge(
	id: string,
	connection: PageFlowConnection,
	label?: string
): PageFlowEdge {
	return {
		id,
		type: PAGE_FLOW_EDGE_TYPE,
		source: connection.source,
		target: connection.target,
		sourceHandle: connection.sourceHandle ?? undefined,
		targetHandle: connection.targetHandle ?? undefined,
		data: label === undefined ? {} : { label }
	};
}

export function setEdgeLabel(edges: PageFlowEdge[], edgeId: string, label: string): PageFlowEdge[] {
	return edges.map((edge) => (edge.id === edgeId ? { ...edge, data: { ...edge.data, label } } : edge));
}

export function hasPageFlowEdge(edges: PageFlowEdge[], connection: PageFlowConnection): boolean {
	return edges.some(
		(edge) =>
			edge.source === connection.source &&
			edge.target === connection.target &&
			(edge.sourceHandle ?? null) === (connection.sourceHandle ?? null) &&
			(edge.targetHandle ?? null) === (connection.targetHandle ?? null)
	);
}

export function getNextNumericPageId(nodes: Pick<Node, 'id'>[]): number {
	const pageIds = nodes.map((node) => nodeIdToPageId(node.id)).filter((id): id is number => id !== null);

	return pageIds.length === 0 ? 1 : Math.max(...pageIds) + 1;
}

export function flowPositionToPoint(position: XYPosition) {
	return { x: position.x, y: position.y };
}
