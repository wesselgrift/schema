import { PAGE_NODE_TYPE, type CanvasFlowNode, type PageFlowEdge } from './flow';
import { serializeEdge, serializeNode } from './persistence';

/**
 * A normalized, order-independent JSON snapshot of undoable canvas content
 * (project name + nodes + edges). Viewport and transient/selection fields are
 * excluded. Nodes and edges are sorted by id and page `style` (which SvelteFlow
 * may mutate on selection/elevation and that we do not own) is dropped, so that
 * merely selecting or reordering never produces a spurious history entry.
 */
export type ContentSnapshot = string;

export type ContentSnapshotInput = {
	name: string;
	nodes: CanvasFlowNode[];
	edges: PageFlowEdge[];
};

export type DecodedSnapshot = {
	name: string;
	nodes: CanvasFlowNode[];
	edges: PageFlowEdge[];
};

export type ChangeKind = 'none' | 'text' | 'structural';

function byId(a: { id: string }, b: { id: string }): number {
	if (a.id < b.id) return -1;
	if (a.id > b.id) return 1;
	return 0;
}

function normalizeNode(node: CanvasFlowNode): CanvasFlowNode {
	const serialized = serializeNode(node);

	// Page `style` is not owned by us (SvelteFlow can set it on selection); drop
	// it so selection never changes the snapshot. Section `style` holds size and
	// is required to restore the section, so it is kept.
	if (serialized.type === PAGE_NODE_TYPE && serialized.style !== undefined) {
		const { style: _style, ...rest } = serialized;
		return rest as CanvasFlowNode;
	}

	return serialized;
}

export function createContentSnapshot(input: ContentSnapshotInput): ContentSnapshot {
	const nodes = input.nodes.map(normalizeNode).sort(byId);
	const edges = input.edges.map(serializeEdge).sort(byId);

	return JSON.stringify({ name: input.name, nodes, edges });
}

export function decodeContentSnapshot(snapshot: ContentSnapshot): DecodedSnapshot {
	const parsed = JSON.parse(snapshot) as DecodedSnapshot;
	return {
		name: parsed.name,
		nodes: parsed.nodes,
		edges: parsed.edges
	};
}

type BlankableData = Record<string, unknown> | undefined;

function blankNodeText(data: BlankableData): BlankableData {
	if (!data) return data;
	return { ...data, title: '', description: '' };
}

function blankEdgeText(data: BlankableData): BlankableData {
	if (!data) return data;
	return { ...data, label: '' };
}

/**
 * A structural fingerprint of a snapshot: text fields (project name, node
 * title/description, edge label) are removed so that two snapshots differing
 * only by typed text produce the same signature.
 */
export function structuralSignature(snapshot: ContentSnapshot): string {
	const parsed = JSON.parse(snapshot) as {
		nodes: Array<Record<string, unknown> & { data?: Record<string, unknown> }>;
		edges: Array<Record<string, unknown> & { data?: Record<string, unknown> }>;
	};

	return JSON.stringify({
		nodes: parsed.nodes.map((node) => ({ ...node, data: blankNodeText(node.data) })),
		edges: parsed.edges.map((edge) => ({ ...edge, data: blankEdgeText(edge.data) }))
	});
}

/**
 * Classify the change between two snapshots. `text` means only coalescible text
 * changed (project name / titles / descriptions / labels); `structural` means
 * anything else (add/remove, position, parent, icon, size, label position).
 */
export function classifyChange(prev: ContentSnapshot, next: ContentSnapshot): ChangeKind {
	if (prev === next) return 'none';
	return structuralSignature(prev) === structuralSignature(next) ? 'text' : 'structural';
}
