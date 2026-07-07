import {
	ITEM_NODE_TYPE,
	SECTION_NODE_TYPE,
	type CanvasFlowNode,
	type PageFlowEdge,
	type ItemFlowNode,
	type SectionFlowNode
} from './flow';
import { getItemTypeLabel, type ItemType } from './item-types';

export type IaItem = {
	id: string;
	title: string;
	description: string;
	type: ItemType;
};

export type IaSection = {
	id: string;
	title: string;
	items: IaItem[];
};

export type IaFlow = {
	from: string;
	to: string;
	condition: string;
};

export type IaModel = {
	sections: IaSection[];
	ungroupedItems: IaItem[];
	flows: IaFlow[];
};

const UNKNOWN_ITEM_TITLE = 'Untitled item';

function toIaItem(node: ItemFlowNode): IaItem {
	return {
		id: node.id,
		title: node.data.title.trim() || UNKNOWN_ITEM_TITLE,
		description: node.data.description.trim(),
		type: node.data.type
	};
}

/**
 * Builds a position-free, lossless model of the information architecture.
 * Item descriptions and connector labels are preserved verbatim so the model
 * captures every bit of context; downstream rendering never has to infer them.
 */
export function buildIaModel(nodes: CanvasFlowNode[], edges: PageFlowEdge[]): IaModel {
	const itemNodes = nodes.filter((node): node is ItemFlowNode => node.type === ITEM_NODE_TYPE);
	const sectionNodes = nodes.filter(
		(node): node is SectionFlowNode => node.type === SECTION_NODE_TYPE
	);

	const itemsBySection = new Map<string, IaItem[]>();
	const ungroupedItems: IaItem[] = [];

	for (const node of itemNodes) {
		const iaItem = toIaItem(node);
		const parentId = node.parentId;

		if (parentId && sectionNodes.some((section) => section.id === parentId)) {
			const bucket = itemsBySection.get(parentId) ?? [];
			bucket.push(iaItem);
			itemsBySection.set(parentId, bucket);
		} else {
			ungroupedItems.push(iaItem);
		}
	}

	const sections: IaSection[] = sectionNodes.map((section) => ({
		id: section.id,
		title: section.data.title.trim() || `Section ${section.data.sectionId}`,
		items: itemsBySection.get(section.id) ?? []
	}));

	const itemTitleById = new Map(itemNodes.map((node) => [node.id, toIaItem(node).title]));

	const flows: IaFlow[] = edges
		.filter((edge) => itemTitleById.has(edge.source) && itemTitleById.has(edge.target))
		.map((edge) => ({
			from: itemTitleById.get(edge.source) ?? UNKNOWN_ITEM_TITLE,
			to: itemTitleById.get(edge.target) ?? UNKNOWN_ITEM_TITLE,
			condition: (edge.data?.label ?? '').trim()
		}));

	return { sections, ungroupedItems, flows };
}

function renderItemList(items: IaItem[]): string {
	return items
		.map((item) => {
			const label = getItemTypeLabel(item.type);
			if (item.description === '') return `- **${item.title}** (${label})`;
			return `- **${item.title}** (${label})\n\n${indent(item.description)}`;
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
				section.items.length > 0 ? renderItemList(section.items) : '_No items in this section._';
			parts.push(`### ${section.title}\n\n${body}`);
		}
	}

	if (model.ungroupedItems.length > 0) {
		parts.push(`## Ungrouped items\n\n${renderItemList(model.ungroupedItems)}`);
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

	if (model.sections.length === 0 && model.ungroupedItems.length === 0) {
		parts.push('_No items have been created yet._');
	}

	return `${parts.join('\n\n')}\n`;
}
