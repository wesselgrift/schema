import type {
	CanonicalExportEdge,
	CanonicalExportItem,
	CanonicalExportModel,
	CanonicalExportSection
} from './export';
import { strToU8, zipSync } from 'fflate';
import type { ItemType } from './item-types';
import { getItemTypeLabel } from './item-types';

export type SpecFile = {
	path: string;
	contents: string;
};

export type SpecPackage = {
	rootPath: string;
	files: SpecFile[];
};

export type GeneratedImplementationArtifacts = {
	implementationPlan: string;
	todo: string;
};

export type BuildSpecPackageOptions = {
	introduction?: string;
	implementationArtifacts?: GeneratedImplementationArtifacts;
};

const TYPE_DIRECTORY: Record<ItemType, string> = {
	page: 'pages',
	form: 'pages',
	list: 'pages',
	dashboard: 'pages',
	email: 'communications/email',
	notification: 'communications/notifications',
	backend: 'architecture/services',
	api: 'architecture/api',
	database: 'architecture/data',
	job: 'architecture/automation',
	auth: 'architecture/auth',
	integration: 'architecture/integrations',
	webhook: 'architecture/integrations/webhooks'
};

function compareById<T extends { id: string }>(left: T, right: T): number {
	return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

function slugify(value: string, fallback: string): string {
	const slug = value
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');

	return slug || fallback;
}

function escapeLinkText(value: string): string {
	return value.replace(/([\\[\]])/g, '\\$1');
}

function displayTitle(item: CanonicalExportItem): string {
	return item.title.trim() || 'Untitled item';
}

function itemPath(rootPath: string, item: CanonicalExportItem): string {
	const directory = TYPE_DIRECTORY[item.type];
	if (!directory) throw new Error(`Unsupported item type for ${item.id}: ${String(item.type)}`);

	return `${rootPath}/${directory}/${slugify(item.title, 'untitled')}-${slugify(item.id, 'item')}.md`;
}

function relativePath(fromPath: string, toPath: string): string {
	const fromDirectory = fromPath.split('/').slice(0, -1);
	const target = toPath.split('/');

	while (fromDirectory.length > 0 && target.length > 0 && fromDirectory[0] === target[0]) {
		fromDirectory.shift();
		target.shift();
	}

	return [...fromDirectory.map(() => '..'), ...target].join('/');
}

function formatCondition(edge: CanonicalExportEdge): string {
	return edge.condition === '' ? '' : ` — ${edge.condition}`;
}

function collectById<T extends { id: string }>(values: T[], label: string): Map<string, T> {
	const entries = new Map<string, T>();
	for (const value of values) {
		if (value.id.trim() === '') throw new Error(`${label} ID cannot be empty.`);
		if (entries.has(value.id)) throw new Error(`Duplicate ${label} ID: ${value.id}`);
		entries.set(value.id, value);
	}
	return entries;
}

function stableModel(model: CanonicalExportModel): CanonicalExportModel {
	return {
		manifestVersion: model.manifestVersion,
		project: { id: model.project.id, name: model.project.name },
		sections: [...model.sections].sort(compareById),
		items: [...model.items].sort(compareById),
		edges: [...model.edges].sort(compareById)
	};
}

function validateModel(model: CanonicalExportModel): void {
	if (model.project.id.trim() === '') throw new Error('Project ID cannot be empty.');

	const sections = collectById(model.sections, 'section');
	const items = collectById(model.items, 'item');
	collectById(model.edges, 'edge');
	const paths = new Set<string>();

	for (const item of model.items) {
		if (item.sectionId !== null && !sections.has(item.sectionId)) {
			throw new Error(`Item ${item.id} references missing section ${item.sectionId}.`);
		}

		const path = itemPath('specs/package', item);
		if (paths.has(path)) throw new Error(`Items produce the same spec path: ${path}`);
		paths.add(path);
	}

	for (const edge of model.edges) {
		if (!items.has(edge.sourceId)) throw new Error(`Edge ${edge.id} has missing source ${edge.sourceId}.`);
		if (!items.has(edge.targetId)) throw new Error(`Edge ${edge.id} has missing target ${edge.targetId}.`);
	}
}

function renderDescription(description: string): string {
	return description === '' ? '_No details captured._' : description;
}

function renderItemLink(item: CanonicalExportItem, fromPath: string, paths: Map<string, string>): string {
	const path = paths.get(item.id);
	if (!path) throw new Error(`Missing path for item ${item.id}.`);

	return `[${escapeLinkText(displayTitle(item))}](${relativePath(fromPath, path)})`;
}

function renderFlowList(
	edges: CanonicalExportEdge[],
	otherItem: (edge: CanonicalExportEdge) => CanonicalExportItem,
	fromPath: string,
	paths: Map<string, string>,
	prefix: string
): string {
	if (edges.length === 0) return '_None._';

	return edges
		.map((edge) => `- ${prefix} ${renderItemLink(otherItem(edge), fromPath, paths)}${formatCondition(edge)}`)
		.join('\n');
}

function renderItemSpec(
	item: CanonicalExportItem,
	sectionById: Map<string, CanonicalExportSection>,
	itemsById: Map<string, CanonicalExportItem>,
	paths: Map<string, string>,
	edges: CanonicalExportEdge[]
): string {
	const path = paths.get(item.id);
	if (!path) throw new Error(`Missing path for item ${item.id}.`);

	const incoming = edges.filter((edge) => edge.targetId === item.id);
	const outgoing = edges.filter((edge) => edge.sourceId === item.id);
	const section = item.sectionId ? sectionById.get(item.sectionId) : undefined;
	const sectionLine = section ? section.title.trim() || section.id : 'Ungrouped';

	return [
		`# ${displayTitle(item)}`,
		`- **ID:** \`${item.id}\``,
		`- **Type:** ${getItemTypeLabel(item.type)}`,
		`- **Section:** ${sectionLine}`,
		'## Description',
		renderDescription(item.description),
		'## Incoming flows',
		renderFlowList(
			incoming,
			(edge) => itemsById.get(edge.sourceId)!,
			path,
			paths,
			'From'
		),
		'## Outgoing flows',
		renderFlowList(
			outgoing,
			(edge) => itemsById.get(edge.targetId)!,
			path,
			paths,
			'To'
		)
	].join('\n\n') + '\n';
}

function renderOverview(
	rootPath: string,
	model: CanonicalExportModel,
	sectionById: Map<string, CanonicalExportSection>,
	itemsById: Map<string, CanonicalExportItem>,
	paths: Map<string, string>
): string {
	const sections = model.sections.map((section) => {
		const items = model.items.filter((item) => item.sectionId === section.id);
		const list =
			items.length === 0
				? '_No items in this section._'
				: items
						.map(
							(item) =>
								`- ${renderItemLink(item, `${rootPath}/project-overview.md`, paths)} (${getItemTypeLabel(item.type)})`
						)
						.join('\n');
		return `### ${section.title.trim() || section.id}\n\n${list}`;
	});

	const ungrouped = model.items.filter((item) => item.sectionId === null);
	const ungroupedSection =
		ungrouped.length === 0
			? ''
			: `## Ungrouped items\n\n${ungrouped
					.map(
						(item) =>
							`- ${renderItemLink(item, `${rootPath}/project-overview.md`, paths)} (${getItemTypeLabel(item.type)})`
					)
					.join('\n')}`;
	const flowLines =
		model.edges.length === 0
			? '_No flows captured._'
			: model.edges
					.map(
						(edge) =>
							`- ${renderItemLink(itemsById.get(edge.sourceId)!, `${rootPath}/project-overview.md`, paths)} → ${renderItemLink(itemsById.get(edge.targetId)!, `${rootPath}/project-overview.md`, paths)}${formatCondition(edge)}`
					)
					.join('\n');

	return [
		`# ${model.project.name.trim() || 'Untitled project'} — project overview`,
		'## Sections',
		sections.length === 0 ? '_No sections captured._' : sections.join('\n\n'),
		ungroupedSection,
		'## Flows',
		flowLines,
		`<!-- ${sectionById.size} sections, ${model.items.length} items, ${model.edges.length} flows -->`
	]
		.filter((part) => part !== '')
		.join('\n\n') + '\n';
}

function renderReadme(
	rootPath: string,
	model: CanonicalExportModel,
	paths: Map<string, string>,
	options: BuildSpecPackageOptions
): string {
	const index = model.items
		.map(
			(item) =>
				`- ${renderItemLink(item, `${rootPath}/README.md`, paths)} (${getItemTypeLabel(item.type)})`
		)
		.join('\n');
	const implementationWorkflow = options.implementationArtifacts
		? [
				'## Implementation workflow',
				'Before planning or implementing, ask the user whether to use the provided [Implementation plan](generated/implementation-plan.md) and [Checklist](generated/todo.md), or create custom artifacts.',
				'If they request custom artifacts, ask whether they want a plan, a checklist, or both. Use your normal planning workflow and do not modify the provided files.'
			].join('\n\n')
		: '';

	return [
		`# ${model.project.name.trim() || 'Untitled project'} specs`,
		options.introduction?.trim() ? `## Introduction\n\n${options.introduction.trim()}` : '',
		'## Start here',
		'- [Project overview](project-overview.md)',
		'- `manifest.json` is the machine-readable canonical graph.',
		implementationWorkflow,
		'## Item specs',
		index || '_No items captured._'
	].join('\n\n') + '\n';
}

export function buildSpecPackage(
	model: CanonicalExportModel,
	options: BuildSpecPackageOptions = {}
): SpecPackage {
	validateModel(model);

	const stable = stableModel(model);
	const rootPath = `specs/${slugify(stable.project.name, 'untitled-project')}-${slugify(stable.project.id, 'canvas')}`;
	const sectionById = new Map(stable.sections.map((section) => [section.id, section]));
	const itemsById = new Map(stable.items.map((item) => [item.id, item]));
	const paths = new Map(stable.items.map((item) => [item.id, itemPath(rootPath, item)]));
	const files: SpecFile[] = [
		{
			path: `${rootPath}/README.md`,
			contents: renderReadme(rootPath, stable, paths, options)
		},
		{
			path: `${rootPath}/project-overview.md`,
			contents: renderOverview(rootPath, stable, sectionById, itemsById, paths)
		},
		{ path: `${rootPath}/manifest.json`, contents: `${JSON.stringify(stable, null, 2)}\n` },
		...stable.items.map((item) => ({
			path: paths.get(item.id)!,
			contents: renderItemSpec(item, sectionById, itemsById, paths, stable.edges)
		})),
		...(options.implementationArtifacts
			? [
					{
						path: `${rootPath}/generated/implementation-plan.md`,
						contents: options.implementationArtifacts.implementationPlan
					},
					{ path: `${rootPath}/generated/todo.md`, contents: options.implementationArtifacts.todo }
				]
			: [])
	];

	return { rootPath, files };
}

export function zipSpecFiles(files: SpecFile[]): Uint8Array {
	return zipSync(
		Object.fromEntries(files.map((file) => [file.path, strToU8(file.contents)])),
		{ level: 6 }
	);
}
