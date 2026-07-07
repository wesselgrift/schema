import type { Connection, Edge, Node, XYPosition } from '@xyflow/svelte';
import type { Item } from './items';
import type { ItemType } from './item-types';

export const ITEM_NODE_TYPE = 'item';
export const SECTION_NODE_TYPE = 'section';
export const PAGE_FLOW_EDGE_TYPE = 'page-flow';
export const PAGE_SOURCE_HANDLE = 'right';
export const PAGE_TARGET_HANDLE = 'left';
export const PAGE_TOP_HANDLE = 'top';
export const PAGE_BOTTOM_HANDLE = 'bottom';
export const ITEM_NODE_DRAG_HANDLE = '.item-header-row';
export const DEFAULT_SECTION_SIZE = { width: 480, height: 320 };
export const MIN_SECTION_SIZE = { width: 240, height: 160 };

export type ItemNodeData = {
	itemId: number;
	title: string;
	description: string;
	type: ItemType;
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

export type ItemFlowNode = Node<ItemNodeData, typeof ITEM_NODE_TYPE>;
export type SectionFlowNode = Node<SectionNodeData, typeof SECTION_NODE_TYPE>;
export type CanvasFlowNode = ItemFlowNode | SectionFlowNode;
export type PageFlowEdge = Edge<PageFlowEdgeData, typeof PAGE_FLOW_EDGE_TYPE>;
type PageFlowConnection = Pick<Connection, 'source' | 'target'> &
	Partial<Pick<Connection, 'sourceHandle' | 'targetHandle'>>;

export function itemIdToNodeId(itemId: number): string {
	return `item-${itemId}`;
}

export function nodeIdToItemId(nodeId: string): number | null {
	const match = /^item-(\d+)$/.exec(nodeId);
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

export function itemToNode(item: Item, options: { focusTitle?: boolean } = {}): ItemFlowNode {
	return {
		id: itemIdToNodeId(item.id),
		type: ITEM_NODE_TYPE,
		position: { x: item.x, y: item.y },
		dragHandle: ITEM_NODE_DRAG_HANDLE,
		data: {
			itemId: item.id,
			title: item.title,
			description: item.description,
			type: item.type,
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

export function itemFromNode(node: ItemFlowNode): Item {
	return {
		id: node.data.itemId,
		x: node.position.x,
		y: node.position.y,
		title: node.data.title,
		description: node.data.description,
		type: node.data.type
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

export function sectionContainsSection(outer: SectionFlowNode, inner: SectionFlowNode): boolean {
	const o = getSectionTopLeft(outer);
	const i = getSectionTopLeft(inner);

	return (
		i.x >= o.x &&
		i.y >= o.y &&
		i.x + inner.data.width <= o.x + outer.data.width &&
		i.y + inner.data.height <= o.y + outer.data.height
	);
}

export function reparentItemNode(
	itemNode: ItemFlowNode,
	section: SectionFlowNode | null,
	nodes: CanvasFlowNode[]
): ItemFlowNode {
	const absolutePosition = getNodeAbsolutePosition(itemNode, nodes);

	if (!section) {
		const { parentId: _parentId, ...rootItemNode } = itemNode;
		return {
			...rootItemNode,
			position: absolutePosition
		};
	}

	return {
		...itemNode,
		parentId: section.id,
		position: getSectionRelativePosition(absolutePosition, section)
	};
}

export function unparentSectionChildren(nodes: CanvasFlowNode[], sectionId: string): CanvasFlowNode[] {
	const section = nodes.find((node): node is SectionFlowNode => node.id === sectionId && node.type === SECTION_NODE_TYPE);
	if (!section) return nodes;

	return nodes.map((node) => {
		if (node.parentId !== sectionId || node.type !== ITEM_NODE_TYPE) return node;

		const { parentId: _parentId, ...rootItemNode } = node;
		return {
			...rootItemNode,
			position: getSectionAbsolutePosition(node.position, section)
		};
	});
}

export function orderNodesForParenting(nodes: CanvasFlowNode[]): CanvasFlowNode[] {
	const sections = nodes.filter((node) => node.type === SECTION_NODE_TYPE);
	const nonSections = nodes.filter((node) => node.type !== SECTION_NODE_TYPE);

	return [...sections, ...nonSections];
}

export function getNextNumericItemId(nodes: Pick<Node, 'id'>[]): number {
	const itemIds = nodes.map((node) => nodeIdToItemId(node.id)).filter((id): id is number => id !== null);

	return itemIds.length === 0 ? 1 : Math.max(...itemIds) + 1;
}

export function nodeIdToEdgeNumber(edgeId: string): number | null {
	const match = /^edge-(\d+)$/.exec(edgeId);
	if (!match) return null;

	return Number(match[1]);
}

export function getNextNumericEdgeId(edges: Pick<Edge, 'id'>[]): number {
	const edgeIds = edges.map((edge) => nodeIdToEdgeNumber(edge.id)).filter((id): id is number => id !== null);

	return edgeIds.length === 0 ? 1 : Math.max(...edgeIds) + 1;
}

export function getNextNumericSectionId(nodes: Pick<Node, 'id'>[]): number {
	const sectionIds = nodes.map((node) => nodeIdToSectionId(node.id)).filter((id): id is number => id !== null);

	return sectionIds.length === 0 ? 1 : Math.max(...sectionIds) + 1;
}

export function flowPositionToPoint(position: XYPosition) {
	return { x: position.x, y: position.y };
}
