import { describe, expect, test } from 'vitest';
import { buildIaModel, renderContextMarkdown } from './export';
import {
	createPageFlowEdge,
	createSectionNode,
	itemToNode,
	reparentItemNode,
	type CanvasFlowNode,
	type PageFlowEdge
} from './flow';
import { createItem } from './items';
import type { ItemType } from './item-types';

function item(
	id: number,
	title: string,
	description: string,
	position = { x: 0, y: 0 },
	type: ItemType = 'page'
) {
	return itemToNode({ ...createItem(id, position), title, description, type });
}

describe('IA export serializer', () => {
	test('nests items under their section and keeps descriptions verbatim', () => {
		const section = createSectionNode(1, { x: 400, y: 300 }, { title: 'Onboarding' });
		const signup = reparentItemNode(
			item(1, 'Signup', 'Collect email and password.\nSupports SSO.', { x: 380, y: 280 }),
			section,
			[section]
		);

		const model = buildIaModel([section, signup], []);

		expect(model.sections).toEqual([
			{
				id: 'section-1',
				title: 'Onboarding',
				items: [
					{
						id: 'item-1',
						title: 'Signup',
						description: 'Collect email and password.\nSupports SSO.',
						type: 'page'
					}
				]
			}
		]);
		expect(model.ungroupedItems).toEqual([]);
	});

	test('collects items without a section as ungrouped', () => {
		const nodes: CanvasFlowNode[] = [item(1, 'Landing', '')];

		const model = buildIaModel(nodes, []);

		expect(model.sections).toEqual([]);
		expect(model.ungroupedItems).toEqual([
			{ id: 'item-1', title: 'Landing', description: '', type: 'page' }
		]);
	});

	test('captures connector labels as flow conditions between item titles', () => {
		const nodes: CanvasFlowNode[] = [item(1, 'Signup', ''), item(2, 'Dashboard', '')];
		const edges: PageFlowEdge[] = [
			createPageFlowEdge('edge-1', { source: 'item-1', target: 'item-2' }, 'only if email + password')
		];

		const model = buildIaModel(nodes, edges);

		expect(model.flows).toEqual([
			{ from: 'Signup', to: 'Dashboard', condition: 'only if email + password' }
		]);
	});

	test('renders sections, ungrouped items, type labels, and flow conditions in markdown', () => {
		const section = createSectionNode(1, { x: 0, y: 0 }, { title: 'Auth' });
		const signup = reparentItemNode(
			item(1, 'Signup', 'Email + password form.', { x: 0, y: 0 }, 'form'),
			section,
			[section]
		);
		const nodes: CanvasFlowNode[] = [
			section,
			signup,
			item(2, 'Dashboard', 'Main view.', { x: 0, y: 0 }, 'dashboard')
		];
		const edges: PageFlowEdge[] = [
			createPageFlowEdge('edge-1', { source: 'item-1', target: 'item-2' }, 'after successful signup')
		];

		const markdown = renderContextMarkdown(buildIaModel(nodes, edges), 'Acme');

		expect(markdown).toContain('# Acme — Information Architecture');
		expect(markdown).toContain('### Auth');
		expect(markdown).toContain('- **Signup** (Form)');
		expect(markdown).toContain('Email + password form.');
		expect(markdown).toContain('## Ungrouped items');
		expect(markdown).toContain('- **Dashboard** (Dashboard)');
		expect(markdown).toContain('- Signup → Dashboard');
		expect(markdown).toContain('- Condition: after successful signup');
	});

	test('notes an empty canvas', () => {
		expect(renderContextMarkdown(buildIaModel([], []), '')).toContain(
			'_No items have been created yet._'
		);
	});
});
