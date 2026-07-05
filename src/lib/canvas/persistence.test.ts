// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
	STORAGE_KEY,
	createCanvas,
	createEmptyStore,
	deleteCanvas,
	getActiveCanvas,
	listCanvases,
	loadStore,
	persistActiveCanvas,
	switchActiveCanvas,
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

describe('multi-canvas management', () => {
	beforeEach(() => {
		localStorage.clear();
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	function advance() {
		vi.setSystemTime(new Date(Date.now() + 1000));
	}

	test('lists canvases sorted by createdAt ascending', () => {
		let store = createEmptyStore();
		const firstId = store.activeCanvasId;
		advance();
		store = createCanvas(store);
		const secondId = store.activeCanvasId;

		expect(listCanvases(store).map((canvas) => canvas.id)).toEqual([firstId, secondId]);
	});

	test('creates a new canvas and makes it active', () => {
		const store = createEmptyStore();
		const originalId = store.activeCanvasId;
		advance();
		const next = createCanvas(store);

		expect(Object.keys(next.canvases)).toHaveLength(2);
		expect(next.activeCanvasId).not.toBe(originalId);
		expect(getActiveCanvas(next).name).toBe('Untitled project');
	});

	test('switches the active canvas', () => {
		let store = createEmptyStore();
		const firstId = store.activeCanvasId;
		advance();
		store = createCanvas(store);

		const switched = switchActiveCanvas(store, firstId);
		expect(switched.activeCanvasId).toBe(firstId);
	});

	test('deleting a non-active canvas keeps the active canvas', () => {
		let store = createEmptyStore();
		const firstId = store.activeCanvasId;
		advance();
		store = createCanvas(store);
		const secondId = store.activeCanvasId;

		const next = deleteCanvas(store, firstId);
		expect(Object.keys(next.canvases)).toEqual([secondId]);
		expect(next.activeCanvasId).toBe(secondId);
	});

	test('deleting the active canvas falls back to the most recently updated remaining', () => {
		let store = createEmptyStore();
		advance();
		store = createCanvas(store);
		const bId = store.activeCanvasId;
		advance();
		store = createCanvas(store);
		const cId = store.activeCanvasId;

		advance();
		store = switchActiveCanvas(store, bId);
		store = persistActiveCanvas(store, buildPatch({ name: 'B touched' }));

		store = switchActiveCanvas(store, cId);
		expect(store.activeCanvasId).toBe(cId);

		const next = deleteCanvas(store, cId);
		expect(next.canvases[cId]).toBeUndefined();
		expect(next.activeCanvasId).toBe(bId);
	});

	test('deleting the last canvas seeds a fresh empty active canvas', () => {
		const store = createEmptyStore();
		const onlyId = store.activeCanvasId;

		const next = deleteCanvas(store, onlyId);
		expect(Object.keys(next.canvases)).toHaveLength(1);
		expect(next.canvases[onlyId]).toBeUndefined();
		expect(getActiveCanvas(next)).toMatchObject({ name: 'Untitled project', nodes: [], edges: [] });
	});
});
