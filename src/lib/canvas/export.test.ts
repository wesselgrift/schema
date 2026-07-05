import { describe, expect, test } from 'vitest';
import { buildIaModel, renderContextMarkdown } from './export';
import {
	createPageFlowEdge,
	createSectionNode,
	pageToNode,
	reparentPageNode,
	type CanvasFlowNode,
	type PageFlowEdge
} from './flow';
import { createPage } from './pages';

function page(id: number, title: string, description: string, position = { x: 0, y: 0 }) {
	return pageToNode({ ...createPage(id, position), title, description });
}

describe('IA export serializer', () => {
	test('nests pages under their section and keeps descriptions verbatim', () => {
		const section = createSectionNode(1, { x: 400, y: 300 }, { title: 'Onboarding' });
		const signup = reparentPageNode(
			page(1, 'Signup', 'Collect email and password.\nSupports SSO.', { x: 380, y: 280 }),
			section,
			[section]
		);

		const model = buildIaModel([section, signup], []);

		expect(model.sections).toEqual([
			{
				id: 'section-1',
				title: 'Onboarding',
				pages: [
					{ id: 'page-1', title: 'Signup', description: 'Collect email and password.\nSupports SSO.' }
				]
			}
		]);
		expect(model.ungroupedPages).toEqual([]);
	});

	test('collects pages without a section as ungrouped', () => {
		const nodes: CanvasFlowNode[] = [page(1, 'Landing', '')];

		const model = buildIaModel(nodes, []);

		expect(model.sections).toEqual([]);
		expect(model.ungroupedPages).toEqual([{ id: 'page-1', title: 'Landing', description: '' }]);
	});

	test('captures connector labels as flow conditions between page titles', () => {
		const nodes: CanvasFlowNode[] = [page(1, 'Signup', ''), page(2, 'Dashboard', '')];
		const edges: PageFlowEdge[] = [
			createPageFlowEdge('edge-1', { source: 'page-1', target: 'page-2' }, 'only if email + password')
		];

		const model = buildIaModel(nodes, edges);

		expect(model.flows).toEqual([
			{ from: 'Signup', to: 'Dashboard', condition: 'only if email + password' }
		]);
	});

	test('renders sections, ungrouped pages, and flow conditions in markdown', () => {
		const section = createSectionNode(1, { x: 0, y: 0 }, { title: 'Auth' });
		const signup = reparentPageNode(page(1, 'Signup', 'Email + password form.'), section, [section]);
		const nodes: CanvasFlowNode[] = [section, signup, page(2, 'Dashboard', 'Main view.')];
		const edges: PageFlowEdge[] = [
			createPageFlowEdge('edge-1', { source: 'page-1', target: 'page-2' }, 'after successful signup')
		];

		const markdown = renderContextMarkdown(buildIaModel(nodes, edges), 'Acme');

		expect(markdown).toContain('# Acme — Information Architecture');
		expect(markdown).toContain('### Auth');
		expect(markdown).toContain('Email + password form.');
		expect(markdown).toContain('## Ungrouped pages');
		expect(markdown).toContain('- Signup → Dashboard');
		expect(markdown).toContain('- Condition: after successful signup');
	});

	test('notes an empty canvas', () => {
		expect(renderContextMarkdown(buildIaModel([], []), '')).toContain(
			'_No pages have been created yet._'
		);
	});
});
