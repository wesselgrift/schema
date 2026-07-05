import type { Viewport } from '@xyflow/svelte';
import {
	SECTION_NODE_TYPE,
	type CanvasFlowNode,
	type PageFlowEdge,
	type PageFlowNode,
	type SectionFlowNode
} from './flow';

export const STORAGE_KEY = 'schema:store';
export const STORAGE_VERSION = 1;

export type StoredCanvas = {
	id: string;
	name: string;
	nodes: CanvasFlowNode[];
	edges: PageFlowEdge[];
	viewport: Viewport;
	createdAt: number;
	updatedAt: number;
};

export type StoredState = {
	version: typeof STORAGE_VERSION;
	activeCanvasId: string;
	canvases: Record<string, StoredCanvas>;
};

export type CanvasPatch = {
	name: string;
	nodes: CanvasFlowNode[];
	edges: PageFlowEdge[];
	viewport: Viewport;
};

const DEFAULT_CANVAS_NAME = 'Untitled project';
const DEFAULT_VIEWPORT: Viewport = { x: 0, y: 0, zoom: 1 };

function hasLocalStorage(): boolean {
	return typeof localStorage !== 'undefined';
}

function createId(): string {
	if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
		return crypto.randomUUID();
	}

	return `canvas-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Strip transient/runtime fields (focus, drop-target, selection, and any
 * SvelteFlow-added measurements) so the persisted payload only contains data we
 * own. Prevents reloading with stuck focus, drop highlights, or stale selection.
 */
export function serializeNode(node: CanvasFlowNode): CanvasFlowNode {
	const base = {
		id: node.id,
		type: node.type,
		position: { x: node.position.x, y: node.position.y },
		...(node.parentId ? { parentId: node.parentId } : {}),
		...(node.dragHandle ? { dragHandle: node.dragHandle } : {}),
		...(node.style ? { style: node.style } : {})
	};

	if (node.type === SECTION_NODE_TYPE) {
		const data = node.data;
		return {
			...base,
			data: {
				sectionId: data.sectionId,
				title: data.title,
				width: data.width,
				height: data.height
			}
		} as SectionFlowNode;
	}

	const data = node.data;
	return {
		...base,
		data: {
			pageId: data.pageId,
			title: data.title,
			description: data.description,
			icon: data.icon
		}
	} as PageFlowNode;
}

export function serializeEdge(edge: PageFlowEdge): PageFlowEdge {
	const data = edge.data ?? {};
	return {
		id: edge.id,
		type: edge.type,
		source: edge.source,
		target: edge.target,
		...(edge.sourceHandle ? { sourceHandle: edge.sourceHandle } : {}),
		...(edge.targetHandle ? { targetHandle: edge.targetHandle } : {}),
		data: {
			...(data.label !== undefined ? { label: data.label } : {}),
			...(data.labelPosition !== undefined ? { labelPosition: data.labelPosition } : {})
		}
	} as PageFlowEdge;
}

function isStoredState(value: unknown): value is StoredState {
	if (typeof value !== 'object' || value === null) return false;

	const candidate = value as Partial<StoredState>;
	return (
		candidate.version === STORAGE_VERSION &&
		typeof candidate.activeCanvasId === 'string' &&
		typeof candidate.canvases === 'object' &&
		candidate.canvases !== null
	);
}

function createEmptyCanvas(): StoredCanvas {
	const now = Date.now();

	return {
		id: createId(),
		name: DEFAULT_CANVAS_NAME,
		nodes: [],
		edges: [],
		viewport: { ...DEFAULT_VIEWPORT },
		createdAt: now,
		updatedAt: now
	};
}

export function createEmptyStore(): StoredState {
	const canvas = createEmptyCanvas();

	return {
		version: STORAGE_VERSION,
		activeCanvasId: canvas.id,
		canvases: {
			[canvas.id]: canvas
		}
	};
}

export function loadStore(): StoredState | null {
	if (!hasLocalStorage()) return null;

	const raw = localStorage.getItem(STORAGE_KEY);
	if (raw === null) return null;

	try {
		const parsed: unknown = JSON.parse(raw);
		if (!isStoredState(parsed)) return null;

		return parsed;
	} catch {
		return null;
	}
}

export function getActiveCanvas(store: StoredState): StoredCanvas {
	const active = store.canvases[store.activeCanvasId];
	if (active) return active;

	const fallback = Object.values(store.canvases)[0];
	if (fallback) return fallback;

	return getActiveCanvas(createEmptyStore());
}

function writeStore(store: StoredState): void {
	if (!hasLocalStorage()) return;

	localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

export function persistActiveCanvas(store: StoredState, patch: CanvasPatch): StoredState {
	const existing = getActiveCanvas(store);
	const updated: StoredCanvas = {
		...existing,
		name: patch.name,
		nodes: patch.nodes.map(serializeNode),
		edges: patch.edges.map(serializeEdge),
		viewport: { x: patch.viewport.x, y: patch.viewport.y, zoom: patch.viewport.zoom },
		updatedAt: Date.now()
	};

	const next: StoredState = {
		...store,
		activeCanvasId: existing.id,
		canvases: {
			...store.canvases,
			[existing.id]: updated
		}
	};

	writeStore(next);
	return next;
}

export function listCanvases(store: StoredState): StoredCanvas[] {
	return Object.values(store.canvases).sort((a, b) => a.createdAt - b.createdAt);
}

export function createCanvas(store: StoredState): StoredState {
	const canvas = createEmptyCanvas();

	const next: StoredState = {
		...store,
		activeCanvasId: canvas.id,
		canvases: {
			...store.canvases,
			[canvas.id]: canvas
		}
	};

	writeStore(next);
	return next;
}

export function switchActiveCanvas(store: StoredState, id: string): StoredState {
	if (!store.canvases[id] || id === store.activeCanvasId) return store;

	const next: StoredState = { ...store, activeCanvasId: id };

	writeStore(next);
	return next;
}

export function deleteCanvas(store: StoredState, id: string): StoredState {
	if (!store.canvases[id]) return store;

	const remaining = { ...store.canvases };
	delete remaining[id];

	if (Object.keys(remaining).length === 0) {
		const canvas = createEmptyCanvas();
		const next: StoredState = {
			...store,
			activeCanvasId: canvas.id,
			canvases: { [canvas.id]: canvas }
		};

		writeStore(next);
		return next;
	}

	let activeCanvasId = store.activeCanvasId;
	if (activeCanvasId === id) {
		const mostRecent = Object.values(remaining).sort((a, b) => b.updatedAt - a.updatedAt)[0];
		activeCanvasId = mostRecent.id;
	}

	const next: StoredState = { ...store, activeCanvasId, canvases: remaining };

	writeStore(next);
	return next;
}
