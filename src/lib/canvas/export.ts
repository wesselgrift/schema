import {
	PAGE_NODE_TYPE,
	SECTION_NODE_TYPE,
	type CanvasFlowNode,
	type PageFlowEdge,
	type PageFlowNode,
	type SectionFlowNode
} from './flow';

export type IaPage = {
	id: string;
	title: string;
	description: string;
};

export type IaSection = {
	id: string;
	title: string;
	pages: IaPage[];
};

export type IaFlow = {
	from: string;
	to: string;
	condition: string;
};

export type IaModel = {
	sections: IaSection[];
	ungroupedPages: IaPage[];
	flows: IaFlow[];
};

const UNKNOWN_PAGE_TITLE = 'Untitled page';

function toIaPage(node: PageFlowNode): IaPage {
	return {
		id: node.id,
		title: node.data.title.trim() || UNKNOWN_PAGE_TITLE,
		description: node.data.description.trim()
	};
}

/**
 * Builds a position-free, lossless model of the information architecture.
 * Page descriptions and connector labels are preserved verbatim so the model
 * captures every bit of context; downstream rendering never has to infer them.
 */
export function buildIaModel(nodes: CanvasFlowNode[], edges: PageFlowEdge[]): IaModel {
	const pageNodes = nodes.filter((node): node is PageFlowNode => node.type === PAGE_NODE_TYPE);
	const sectionNodes = nodes.filter(
		(node): node is SectionFlowNode => node.type === SECTION_NODE_TYPE
	);

	const pagesBySection = new Map<string, IaPage[]>();
	const ungroupedPages: IaPage[] = [];

	for (const node of pageNodes) {
		const iaPage = toIaPage(node);
		const parentId = node.parentId;

		if (parentId && sectionNodes.some((section) => section.id === parentId)) {
			const bucket = pagesBySection.get(parentId) ?? [];
			bucket.push(iaPage);
			pagesBySection.set(parentId, bucket);
		} else {
			ungroupedPages.push(iaPage);
		}
	}

	const sections: IaSection[] = sectionNodes.map((section) => ({
		id: section.id,
		title: section.data.title.trim() || `Section ${section.data.sectionId}`,
		pages: pagesBySection.get(section.id) ?? []
	}));

	const pageTitleById = new Map(pageNodes.map((node) => [node.id, toIaPage(node).title]));

	const flows: IaFlow[] = edges
		.filter((edge) => pageTitleById.has(edge.source) && pageTitleById.has(edge.target))
		.map((edge) => ({
			from: pageTitleById.get(edge.source) ?? UNKNOWN_PAGE_TITLE,
			to: pageTitleById.get(edge.target) ?? UNKNOWN_PAGE_TITLE,
			condition: (edge.data?.label ?? '').trim()
		}));

	return { sections, ungroupedPages, flows };
}

function renderPageList(pages: IaPage[]): string {
	return pages
		.map((page) => {
			if (page.description === '') return `- **${page.title}**`;
			return `- **${page.title}**\n\n${indent(page.description)}`;
		})
		.join('\n\n');
}

function indent(text: string): string {
	return text
		.split('\n')
		.map((line) => (line.trim() === '' ? '' : `  ${line}`))
		.join('\n');
}

/**
 * Renders the IA model as a lossless Markdown context document. This is the raw,
 * faithful input handed to the LLM — not the polished spec itself.
 */
export function renderContextMarkdown(model: IaModel, projectName: string): string {
	const name = projectName.trim() || 'Untitled project';
	const parts: string[] = [`# ${name} — Information Architecture`];

	if (model.sections.length > 0) {
		parts.push('## Sections');
		for (const section of model.sections) {
			const body =
				section.pages.length > 0 ? renderPageList(section.pages) : '_No pages in this section._';
			parts.push(`### ${section.title}\n\n${body}`);
		}
	}

	if (model.ungroupedPages.length > 0) {
		parts.push(`## Ungrouped pages\n\n${renderPageList(model.ungroupedPages)}`);
	}

	if (model.flows.length > 0) {
		const flowLines = model.flows
			.map((flow) => {
				const base = `- ${flow.from} → ${flow.to}`;
				return flow.condition === '' ? base : `${base}\n  - Condition: ${flow.condition}`;
			})
			.join('\n');
		parts.push(`## Navigation flows\n\n${flowLines}`);
	}

	if (model.sections.length === 0 && model.ungroupedPages.length === 0) {
		parts.push('_No pages have been created yet._');
	}

	return `${parts.join('\n\n')}\n`;
}
