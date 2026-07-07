import { describe, expect, test } from 'vitest';
import {
	classifyChange,
	createContentSnapshot,
	decodeContentSnapshot,
	structuralSignature
} from './history';
import {
	createPageFlowEdge,
	createSectionNode,
	itemToNode,
	type CanvasFlowNode,
	type PageFlowEdge
} from './flow';
import { createItem } from './items';

function item(id: number, overrides: { title?: string; description?: string } = {}): CanvasFlowNode {
	const node = itemToNode(createItem(id, { x: id * 10, y: id * 5 }));
	return {
		...node,
		data: {
			...node.data,
			...(overrides.title !== undefined ? { title: overrides.title } : {}),
			...(overrides.description !== undefined ? { description: overrides.description } : {})
		}
	};
}

function edge(id: string, label?: string): PageFlowEdge {
	return createPageFlowEdge(id, { source: 'item-1', target: 'item-2' }, label);
}

describe('createContentSnapshot', () => {
	test('is order-independent for nodes and edges', () => {
		const a = createContentSnapshot({
			name: 'Doc',
			nodes: [item(1), item(2)],
			edges: [edge('edge-a'), edge('edge-b')]
		});
		const b = createContentSnapshot({
			name: 'Doc',
			nodes: [item(2), item(1)],
			edges: [edge('edge-b'), edge('edge-a')]
		});

		expect(a).toBe(b);
	});

	test('ignores selection and other transient node fields', () => {
		const plain = createContentSnapshot({ name: 'Doc', nodes: [item(1)], edges: [] });
		const selected = createContentSnapshot({
			name: 'Doc',
			nodes: [{ ...item(1), selected: true, dragging: true } as CanvasFlowNode],
			edges: []
		});

		expect(selected).toBe(plain);
	});

	test('drops item style (not owned) but keeps section style', () => {
		const plain = createContentSnapshot({ name: 'Doc', nodes: [item(1)], edges: [] });
		const styledItem = createContentSnapshot({
			name: 'Doc',
			nodes: [{ ...item(1), style: 'z-index: 5;' } as CanvasFlowNode],
			edges: []
		});
		expect(styledItem).toBe(plain);

		const section = createSectionNode(1, { x: 0, y: 0 });
		const snapshot = createContentSnapshot({ name: 'Doc', nodes: [section], edges: [] });
		expect(snapshot).toContain('width: 480px');
	});
});

describe('structuralSignature / classifyChange', () => {
	test('text-only edits are classified as text', () => {
		const before = createContentSnapshot({ name: 'Doc', nodes: [item(1)], edges: [edge('e', 'hi')] });
		const titleEdit = createContentSnapshot({
			name: 'Doc',
			nodes: [item(1, { title: 'Renamed' })],
			edges: [edge('e', 'hi')]
		});
		const labelEdit = createContentSnapshot({
			name: 'Doc',
			nodes: [item(1)],
			edges: [edge('e', 'changed')]
		});
		const nameEdit = createContentSnapshot({ name: 'Renamed doc', nodes: [item(1)], edges: [edge('e', 'hi')] });

		expect(structuralSignature(before)).toBe(structuralSignature(titleEdit));
		expect(classifyChange(before, titleEdit)).toBe('text');
		expect(classifyChange(before, labelEdit)).toBe('text');
		expect(classifyChange(before, nameEdit)).toBe('text');
	});

	test('adds/removes/moves are classified as structural', () => {
		const before = createContentSnapshot({ name: 'Doc', nodes: [item(1)], edges: [] });
		const added = createContentSnapshot({ name: 'Doc', nodes: [item(1), item(2)], edges: [] });
		const moved = createContentSnapshot({
			name: 'Doc',
			nodes: [{ ...item(1), position: { x: 999, y: 999 } }],
			edges: []
		});

		expect(classifyChange(before, added)).toBe('structural');
		expect(classifyChange(before, moved)).toBe('structural');
	});

	test('identical snapshots are none', () => {
		const snapshot = createContentSnapshot({ name: 'Doc', nodes: [item(1)], edges: [] });
		expect(classifyChange(snapshot, snapshot)).toBe('none');
	});

	test('a typing burst coalesces then a structural change forms a new step', () => {
		const base = createContentSnapshot({ name: 'Doc', nodes: [item(1)], edges: [] });
		const typed1 = createContentSnapshot({ name: 'Doc', nodes: [item(1, { title: 'H' })], edges: [] });
		const typed2 = createContentSnapshot({
			name: 'Doc',
			nodes: [item(1, { title: 'Hello' })],
			edges: []
		});
		const structural = createContentSnapshot({
			name: 'Doc',
			nodes: [item(1, { title: 'Hello' }), item(2)],
			edges: []
		});

		expect(classifyChange(base, typed1)).toBe('text');
		expect(classifyChange(typed1, typed2)).toBe('text');
		expect(classifyChange(typed2, structural)).toBe('structural');
	});
});

describe('decodeContentSnapshot', () => {
	test('round-trips content and can be reserialized identically', () => {
		const nodes = [item(1, { title: 'One' }), createSectionNode(2, { x: 40, y: 40 })];
		const edges = [edge('e', 'label')];
		const snapshot = createContentSnapshot({ name: 'Doc', nodes, edges });

		const decoded = decodeContentSnapshot(snapshot);
		expect(decoded.name).toBe('Doc');
		expect(decoded.nodes).toHaveLength(2);
		expect(decoded.edges).toHaveLength(1);

		const reserialized = createContentSnapshot({
			name: decoded.name,
			nodes: decoded.nodes,
			edges: decoded.edges
		});
		expect(reserialized).toBe(snapshot);
	});
});
