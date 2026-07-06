import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';
import type { Viewport } from '@xyflow/svelte';
import {
	PAGE_FLOW_EDGE_TYPE,
	PAGE_NODE_TYPE,
	SECTION_NODE_TYPE,
	type CanvasFlowNode,
	type PageFlowEdge
} from './flow';
import { serializeEdge, serializeNode, type CanvasPatch } from './persistence';

export const SHARE_VERSION = 1;
export const SHARE_HASH_KEY = 'share';

/**
 * Practical safe ceiling for a shareable URL. Modern browsers handle far more,
 * but we keep a conservative guard and fall back to file export beyond it.
 */
export const SHARE_SIZE_LIMIT = 12000;

export type SharePayload = {
	v: typeof SHARE_VERSION;
	name: string;
	nodes: CanvasFlowNode[];
	edges: PageFlowEdge[];
	viewport: Viewport;
};

const VALID_NODE_TYPES = new Set([PAGE_NODE_TYPE, SECTION_NODE_TYPE]);

export function encodeCanvasToHash(patch: CanvasPatch): string {
	const payload: SharePayload = {
		v: SHARE_VERSION,
		name: patch.name,
		nodes: patch.nodes.map(serializeNode),
		edges: patch.edges.map(serializeEdge),
		viewport: { x: patch.viewport.x, y: patch.viewport.y, zoom: patch.viewport.zoom }
	};

	return compressToEncodedURIComponent(JSON.stringify(payload));
}

export function buildShareUrl(encoded: string): string {
	if (typeof window === 'undefined') return `#${SHARE_HASH_KEY}=${encoded}`;

	return `${location.origin}${location.pathname}#${SHARE_HASH_KEY}=${encoded}`;
}

export function isShareTooLarge(url: string): boolean {
	return url.length > SHARE_SIZE_LIMIT;
}

function isFiniteNumber(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value);
}

function isValidNode(value: unknown): value is CanvasFlowNode {
	if (typeof value !== 'object' || value === null) return false;

	const node = value as Partial<CanvasFlowNode>;
	if (typeof node.id !== 'string') return false;
	if (typeof node.type !== 'string' || !VALID_NODE_TYPES.has(node.type)) return false;
	if (typeof node.position !== 'object' || node.position === null) return false;
	if (!isFiniteNumber(node.position.x) || !isFiniteNumber(node.position.y)) return false;
	if (typeof node.data !== 'object' || node.data === null) return false;

	return true;
}

function isValidEdge(value: unknown): value is PageFlowEdge {
	if (typeof value !== 'object' || value === null) return false;

	const edge = value as Partial<PageFlowEdge>;
	if (typeof edge.id !== 'string') return false;
	if (typeof edge.source !== 'string' || typeof edge.target !== 'string') return false;
	if (edge.type !== undefined && edge.type !== PAGE_FLOW_EDGE_TYPE) return false;

	return true;
}

function isValidViewport(value: unknown): value is Viewport {
	if (typeof value !== 'object' || value === null) return false;

	const viewport = value as Partial<Viewport>;
	return isFiniteNumber(viewport.x) && isFiniteNumber(viewport.y) && isFiniteNumber(viewport.zoom);
}

/**
 * Decode a location hash into a share payload. Returns null on any malformed,
 * corrupt, or absent input so a bad link can never crash the canvas renderer.
 */
export function decodeHashToPayload(hash: string): SharePayload | null {
	try {
		const params = new URLSearchParams(hash.replace(/^#/, ''));
		const encoded = params.get(SHARE_HASH_KEY);
		if (!encoded) return null;

		const json = decompressFromEncodedURIComponent(encoded);
		if (!json) return null;

		const parsed: unknown = JSON.parse(json);
		if (typeof parsed !== 'object' || parsed === null) return null;

		const candidate = parsed as Partial<SharePayload>;
		if (candidate.v !== SHARE_VERSION) return null;
		if (typeof candidate.name !== 'string') return null;
		if (!Array.isArray(candidate.nodes) || !candidate.nodes.every(isValidNode)) return null;
		if (!Array.isArray(candidate.edges) || !candidate.edges.every(isValidEdge)) return null;
		if (!isValidViewport(candidate.viewport)) return null;

		return {
			v: SHARE_VERSION,
			name: candidate.name,
			nodes: candidate.nodes,
			edges: candidate.edges,
			viewport: candidate.viewport
		};
	} catch {
		return null;
	}
}
