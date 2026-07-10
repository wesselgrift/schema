import { describe, expect, test } from 'vitest';
import { buildIaModel, renderContextMarkdown } from './export';
import * as exportModule from './export';
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
	test('builds a canonical model without trimming text or replacing flow IDs with titles', () => {
		expect(exportModule).toHaveProperty('buildCanonicalExportModel');

		const buildCanonicalExportModel = (
			exportModule as typeof exportModule & {
				buildCanonicalExportModel: (
					nodes: CanvasFlowNode[],
					edges: PageFlowEdge[],
					project: { id: string; name: string }
				) => {
					manifestVersion: number;
					project: { id: string; name: string };
					items: Array<{
						id: string;
						title: string;
						description: string;
						type: ItemType;
						sectionId: string | null;
					}>;
					edges: Array<{
						id: string;
						sourceId: string;
						targetId: string;
						condition: string;
					}>;
				};
			}
		).buildCanonicalExportModel;

		const section = createSectionNode(1, { x: 0, y: 0 }, { title: '  Auth  ' });
		const signup = reparentItemNode(
			item(1, '  Sign up  ', '  Keep this text exactly. \n', { x: 0, y: 0 }, 'form'),
			section,
			[section]
		);
		const account = item(2, 'Sign up', '', { x: 0, y: 0 }, 'api');
		const edge = createPageFlowEdge(
			'edge-1',
			{ source: signup.id, target: account.id },
			'  preserve this condition  '
		);

		const model = buildCanonicalExportModel([section, signup, account], [edge], {
			id: 'canvas-42',
			name: '  Acme  '
		});

		expect(model.manifestVersion).toBe(1);
		expect(model.project).toEqual({ id: 'canvas-42', name: '  Acme  ' });
		expect(model.items).toEqual([
			{
				id: 'item-1',
				title: '  Sign up  ',
				description: '  Keep this text exactly. \n',
				type: 'form',
				sectionId: 'section-1'
			},
			{ id: 'item-2', title: 'Sign up', description: '', type: 'api', sectionId: null }
		]);
		expect(model.edges).toEqual([
			{
				id: 'edge-1',
				sourceId: 'item-1',
				targetId: 'item-2',
				sourceHandle: null,
				targetHandle: null,
				condition: '  preserve this condition  '
			}
		]);
	});

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
