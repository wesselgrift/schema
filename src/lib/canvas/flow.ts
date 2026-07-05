import type { Connection, Edge, Node, XYPosition } from '@xyflow/svelte';
import type { Page } from './pages';

export const PAGE_NODE_TYPE = 'page';
export const SECTION_NODE_TYPE = 'section';
export const PAGE_FLOW_EDGE_TYPE = 'page-flow';
export const PAGE_SOURCE_HANDLE = 'right';
export const PAGE_TARGET_HANDLE = 'left';
export const PAGE_TOP_HANDLE = 'top';
export const PAGE_BOTTOM_HANDLE = 'bottom';
export const PAGE_NODE_DRAG_HANDLE = '.page-header-row';
export const DEFAULT_SECTION_SIZE = { width: 480, height: 320 };
export const MIN_SECTION_SIZE = { width: 240, height: 160 };

export type PageNodeData = {
	pageId: number;
	title: string;
	description: string;
	icon: string;
	focusTitle?: boolean;
};

export type PageFlowEdgeData = {
	label?: string;
	labelPosition?: number;
	labelSelected?: boolean;
};

export type SectionNodeData = {
	sectionId: number;
	title: string;
	width: number;
	height: number;
	focusTitle?: boolean;
	isDropTarget?: boolean;
};

export type PageFlowNode = Node<PageNodeData, typeof PAGE_NODE_TYPE>;
export type SectionFlowNode = Node<SectionNodeData, typeof SECTION_NODE_TYPE>;
export type CanvasFlowNode = PageFlowNode | SectionFlowNode;
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

export function sectionIdToNodeId(sectionId: number): string {
	return `section-${sectionId}`;
}

export function nodeIdToSectionId(nodeId: string): number | null {
	const match = /^section-(\d+)$/.exec(nodeId);
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

export function createSectionNode(
	sectionId: number,
	position: XYPosition,
	options: {
		title?: string;
		width?: number;
		height?: number;
		focusTitle?: boolean;
	} = {}
): SectionFlowNode {
	const width = options.width ?? DEFAULT_SECTION_SIZE.width;
	const height = options.height ?? DEFAULT_SECTION_SIZE.height;

	return {
		id: sectionIdToNodeId(sectionId),
		type: SECTION_NODE_TYPE,
		position,
		style: `width: ${width}px; height: ${height}px;`,
		data: {
			sectionId,
			title: options.title ?? `Section ${sectionId}`,
			width,
			height,
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

export function getNodeAbsolutePosition(node: CanvasFlowNode, nodes: CanvasFlowNode[]): XYPosition {
	if (!node.parentId) return node.position;

	const parentNode = nodes.find((candidate): candidate is SectionFlowNode => candidate.id === node.parentId);
	if (!parentNode || parentNode.type !== SECTION_NODE_TYPE) return node.position;

	return getSectionAbsolutePosition(node.position, parentNode);
}

export function getSectionRelativePosition(absolutePosition: XYPosition, section: SectionFlowNode): XYPosition {
	const topLeft = getSectionTopLeft(section);

	return {
		x: absolutePosition.x - topLeft.x,
		y: absolutePosition.y - topLeft.y
	};
}

export function getSectionAbsolutePosition(relativePosition: XYPosition, section: SectionFlowNode): XYPosition {
	const topLeft = getSectionTopLeft(section);

	return {
		x: topLeft.x + relativePosition.x,
		y: topLeft.y + relativePosition.y
	};
}

export function getSectionTopLeft(section: SectionFlowNode): XYPosition {
	return {
		x: section.position.x - section.data.width / 2,
		y: section.position.y - section.data.height / 2
	};
}

export function isPointInsideSection(point: XYPosition, section: SectionFlowNode): boolean {
	const halfWidth = section.data.width / 2;
	const halfHeight = section.data.height / 2;

	return (
		point.x >= section.position.x - halfWidth &&
		point.x <= section.position.x + halfWidth &&
		point.y >= section.position.y - halfHeight &&
		point.y <= section.position.y + halfHeight
	);
}

export function reparentPageNode(
	pageNode: PageFlowNode,
	section: SectionFlowNode | null,
	nodes: CanvasFlowNode[]
): PageFlowNode {
	const absolutePosition = getNodeAbsolutePosition(pageNode, nodes);

	if (!section) {
		const { parentId: _parentId, ...rootPageNode } = pageNode;
		return {
			...rootPageNode,
			position: absolutePosition
		};
	}

	return {
		...pageNode,
		parentId: section.id,
		position: getSectionRelativePosition(absolutePosition, section)
	};
}

export function unparentSectionChildren(nodes: CanvasFlowNode[], sectionId: string): CanvasFlowNode[] {
	const section = nodes.find((node): node is SectionFlowNode => node.id === sectionId && node.type === SECTION_NODE_TYPE);
	if (!section) return nodes;

	return nodes.map((node) => {
		if (node.parentId !== sectionId || node.type !== PAGE_NODE_TYPE) return node;

		const { parentId: _parentId, ...rootPageNode } = node;
		return {
			...rootPageNode,
			position: getSectionAbsolutePosition(node.position, section)
		};
	});
}

export function orderNodesForParenting(nodes: CanvasFlowNode[]): CanvasFlowNode[] {
	const sections = nodes.filter((node) => node.type === SECTION_NODE_TYPE);
	const nonSections = nodes.filter((node) => node.type !== SECTION_NODE_TYPE);

	return [...sections, ...nonSections];
}

export function getNextNumericPageId(nodes: Pick<Node, 'id'>[]): number {
	const pageIds = nodes.map((node) => nodeIdToPageId(node.id)).filter((id): id is number => id !== null);

	return pageIds.length === 0 ? 1 : Math.max(...pageIds) + 1;
}

export function getNextNumericSectionId(nodes: Pick<Node, 'id'>[]): number {
	const sectionIds = nodes.map((node) => nodeIdToSectionId(node.id)).filter((id): id is number => id !== null);

	return sectionIds.length === 0 ? 1 : Math.max(...sectionIds) + 1;
}

export function flowPositionToPoint(position: XYPosition) {
	return { x: position.x, y: position.y };
}
