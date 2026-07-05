// @vitest-environment jsdom
import { beforeEach, describe, expect, test } from 'vitest';
import {
	STORAGE_KEY,
	createEmptyStore,
	getActiveCanvas,
	loadStore,
	persistActiveCanvas,
	type CanvasPatch
} from './persistence';
import {
	createPageFlowEdge,
	createSectionNode,
	pageToNode,
	type CanvasFlowNode,
	type PageFlowEdge
} from './flow';
import { createPage } from './pages';

function buildPatch(overrides: Partial<CanvasPatch> = {}): CanvasPatch {
	return {
		name: 'My canvas',
		nodes: [],
		edges: [],
		viewport: { x: 0, y: 0, zoom: 1 },
		...overrides
	};
}

describe('canvas persistence', () => {
	beforeEach(() => {
		localStorage.clear();
	});

	test('creates an empty store with a single active canvas', () => {
		const store = createEmptyStore();
		const active = getActiveCanvas(store);

		expect(store.version).toBe(1);
		expect(Object.keys(store.canvases)).toHaveLength(1);
		expect(store.activeCanvasId).toBe(active.id);
		expect(active).toMatchObject({
			name: 'Untitled project',
			nodes: [],
			edges: [],
			viewport: { x: 0, y: 0, zoom: 1 }
		});
	});

	test('persists and loads a canvas roundtrip', () => {
		const nodes: CanvasFlowNode[] = [pageToNode(createPage(1, { x: 10, y: 20 }))];
		const edges: PageFlowEdge[] = [
			createPageFlowEdge('edge-1', { source: 'page-1', target: 'page-1' }, 'loops')
		];

		persistActiveCanvas(
			createEmptyStore(),
			buildPatch({ name: 'Roundtrip', nodes, edges, viewport: { x: -5, y: 7, zoom: 1.5 } })
		);

		const loaded = loadStore();
		expect(loaded).not.toBeNull();

		const active = getActiveCanvas(loaded!);
		expect(active.name).toBe('Roundtrip');
		expect(active.viewport).toEqual({ x: -5, y: 7, zoom: 1.5 });
		expect(active.nodes).toHaveLength(1);
		expect(active.edges[0].data).toEqual({ label: 'loops' });
	});

	test('updates the active record on subsequent saves', () => {
		let store = persistActiveCanvas(createEmptyStore(), buildPatch({ name: 'First' }));
		const firstUpdatedAt = getActiveCanvas(store).updatedAt;

		store = persistActiveCanvas(store, buildPatch({ name: 'Second' }));
		const active = getActiveCanvas(store);

		expect(Object.keys(store.canvases)).toHaveLength(1);
		expect(active.name).toBe('Second');
		expect(active.updatedAt).toBeGreaterThanOrEqual(firstUpdatedAt);
	});

	test('strips transient runtime fields before persisting', () => {
		const pageNode = {
			...pageToNode(createPage(1, { x: 0, y: 0 }), { focusTitle: true }),
			selected: true,
			dragging: true,
			measured: { width: 200, height: 120 }
		} as CanvasFlowNode;
		const sectionNode = {
			...createSectionNode(1, { x: 100, y: 100 }),
			data: { ...createSectionNode(1, { x: 100, y: 100 }).data, isDropTarget: true, focusTitle: true },
			selected: true
		} as CanvasFlowNode;
		const edge = {
			...createPageFlowEdge('edge-1', { source: 'page-1', target: 'page-1' }, 'ok'),
			selected: true,
			data: { label: 'ok', labelSelected: true }
		} as PageFlowEdge;

		persistActiveCanvas(
			createEmptyStore(),
			buildPatch({ nodes: [sectionNode, pageNode], edges: [edge] })
		);

		const active = getActiveCanvas(loadStore()!);
		const storedPage = active.nodes.find((node) => node.id === 'page-1')!;
		const storedSection = active.nodes.find((node) => node.id === 'section-1')!;
		const storedEdge = active.edges[0];

		expect('selected' in storedPage).toBe(false);
		expect('dragging' in storedPage).toBe(false);
		expect('measured' in storedPage).toBe(false);
		expect('focusTitle' in storedPage.data).toBe(false);
		expect('selected' in storedSection).toBe(false);
		expect('isDropTarget' in storedSection.data).toBe(false);
		expect('focusTitle' in storedSection.data).toBe(false);
		expect('selected' in storedEdge).toBe(false);
		expect(storedEdge.data).toEqual({ label: 'ok' });
	});

	test('returns null for a version mismatch', () => {
		localStorage.setItem(
			STORAGE_KEY,
			JSON.stringify({ version: 99, activeCanvasId: 'x', canvases: {} })
		);

		expect(loadStore()).toBeNull();
	});

	test('returns null for corrupted data', () => {
		localStorage.setItem(STORAGE_KEY, 'not json');

		expect(loadStore()).toBeNull();
	});
});
