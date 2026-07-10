import { describe, expect, test } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import type { CanonicalExportModel } from './export';
import * as exportModule from './export';
import type { ItemType } from './item-types';

type SpecFile = {
	path: string;
	contents: string;
};

type SpecPackage = {
	rootPath: string;
	files: SpecFile[];
};

type BuildSpecPackage = (
	model: CanonicalExportModel,
	options?: { introduction?: string }
) => SpecPackage;
type ZipSpecFiles = (files: SpecFile[]) => Uint8Array;

function packageBuilder(): BuildSpecPackage {
	expect(exportModule).toHaveProperty('buildSpecPackage');
	return (exportModule as typeof exportModule & { buildSpecPackage: BuildSpecPackage }).buildSpecPackage;
}

function zipBuilder(): ZipSpecFiles {
	expect(exportModule).toHaveProperty('zipSpecFiles');
	return (exportModule as typeof exportModule & { zipSpecFiles: ZipSpecFiles }).zipSpecFiles;
}

function fileContents(specPackage: SpecPackage, path: string): string {
	const file = specPackage.files.find((candidate) => candidate.path === path);
	expect(file, `Expected ${path} in package`).toBeDefined();
	return file!.contents;
}

function model(
	items: CanonicalExportModel['items'],
	edges: CanonicalExportModel['edges'] = [
		{
			id: 'edge-1',
			sourceId: 'item-1',
			targetId: 'item-2',
			sourceHandle: 'right',
			targetHandle: 'left',
			condition: 'after successful sign up'
		}
	]
): CanonicalExportModel {
	return {
		manifestVersion: 1,
		project: { id: 'canvas-42', name: 'Acme' },
		sections: [{ id: 'section-1', title: 'Auth' }],
		items,
		edges
	};
}

describe('spec package', () => {
	test('creates unique linked item specs and a stable manifest', () => {
		const specPackage = packageBuilder()(
			model([
				{
					id: 'item-1',
					title: 'Sign up',
					description: 'Collect email and password.',
					type: 'form',
					sectionId: 'section-1'
				},
				{
					id: 'item-2',
					title: 'Sign up',
					description: 'Create a user.',
					type: 'api',
					sectionId: null
				}
			])
		);

		expect(specPackage.rootPath).toBe('specs/acme-canvas-42');
		expect(specPackage.files.map((file) => file.path)).toEqual([
			'specs/acme-canvas-42/README.md',
			'specs/acme-canvas-42/project-overview.md',
			'specs/acme-canvas-42/manifest.json',
			'specs/acme-canvas-42/pages/sign-up-item-1.md',
			'specs/acme-canvas-42/architecture/api/sign-up-item-2.md'
		]);

		expect(fileContents(specPackage, 'specs/acme-canvas-42/pages/sign-up-item-1.md')).toContain(
			'[Sign up](../architecture/api/sign-up-item-2.md)'
		);
		expect(fileContents(specPackage, 'specs/acme-canvas-42/architecture/api/sign-up-item-2.md')).toContain(
			'[Sign up](../../pages/sign-up-item-1.md)'
		);
		expect(JSON.parse(fileContents(specPackage, 'specs/acme-canvas-42/manifest.json'))).toEqual(
			model([
				{
					id: 'item-1',
					title: 'Sign up',
					description: 'Collect email and password.',
					type: 'form',
					sectionId: 'section-1'
				},
				{
					id: 'item-2',
					title: 'Sign up',
					description: 'Create a user.',
					type: 'api',
					sectionId: null
				}
			])
		);
	});

	test('places the generated project introduction at the top of the README', () => {
		const specPackage = packageBuilder()(
			model(
				[
					{
						id: 'item-1',
						title: 'Account',
						description: '',
						type: 'page',
						sectionId: null
					}
				],
				[]
			),
			{ introduction: 'Acme gives teams a focused account experience.' }
		);

		expect(fileContents(specPackage, 'specs/acme-canvas-42/README.md')).toContain(
			'## Introduction\n\nAcme gives teams a focused account experience.'
		);
	});

	test.each([
		['page', 'pages/example-item.md'],
		['form', 'pages/example-item.md'],
		['list', 'pages/example-item.md'],
		['dashboard', 'pages/example-item.md'],
		['email', 'communications/email/example-item.md'],
		['notification', 'communications/notifications/example-item.md'],
		['backend', 'architecture/services/example-item.md'],
		['api', 'architecture/api/example-item.md'],
		['database', 'architecture/data/example-item.md'],
		['job', 'architecture/automation/example-item.md'],
		['auth', 'architecture/auth/example-item.md'],
		['integration', 'architecture/integrations/example-item.md'],
		['webhook', 'architecture/integrations/webhooks/example-item.md']
	] satisfies Array<[ItemType, string]>)('places %s specs in %s', (type, relativePath) => {
		const specPackage = packageBuilder()(
			model([
				{
					id: 'item',
					title: 'Example',
					description: '',
					type,
					sectionId: null
				}
			], [])
		);

		expect(specPackage.files.map((file) => file.path)).toContain(
			`specs/acme-canvas-42/${relativePath}`
		);
	});

	test('rejects dangling edges instead of silently dropping them', () => {
		const invalidModel = model([
			{
				id: 'item-1',
				title: 'Sign up',
				description: '',
				type: 'form',
				sectionId: 'section-1'
			}
		]);

		expect(() => packageBuilder()(invalidModel)).toThrow(/edge-1.*target/i);
	});

	test('preserves self and parallel flows in the manifest and item spec', () => {
		const specPackage = packageBuilder()(
			model(
				[
					{
						id: 'item-1',
						title: 'Account',
						description: '',
						type: 'page',
						sectionId: null
					},
					{
						id: 'item-2',
						title: 'Dashboard',
						description: '',
						type: 'dashboard',
						sectionId: null
					}
				],
				[
					{
						id: 'edge-1',
						sourceId: 'item-1',
						targetId: 'item-1',
						sourceHandle: 'right',
						targetHandle: 'left',
						condition: 'refresh'
					},
					{
						id: 'edge-2',
						sourceId: 'item-1',
						targetId: 'item-2',
						sourceHandle: 'right',
						targetHandle: 'left',
						condition: 'success'
					},
					{
						id: 'edge-3',
						sourceId: 'item-1',
						targetId: 'item-2',
						sourceHandle: 'bottom',
						targetHandle: 'top',
						condition: 'admin'
					}
				]
			)
		);

		const manifest = JSON.parse(fileContents(specPackage, 'specs/acme-canvas-42/manifest.json'));
		expect(manifest.edges).toHaveLength(3);
		expect(fileContents(specPackage, 'specs/acme-canvas-42/pages/account-item-1.md')).toContain(
			'— refresh'
		);
		expect(fileContents(specPackage, 'specs/acme-canvas-42/pages/account-item-1.md')).toContain(
			'— success'
		);
		expect(fileContents(specPackage, 'specs/acme-canvas-42/pages/account-item-1.md')).toContain(
			'— admin'
		);
	});

	test('rejects missing section references and unsupported runtime item types', () => {
		const missingSection = model(
			[
				{
					id: 'item-1',
					title: 'Account',
					description: '',
					type: 'page',
					sectionId: 'missing-section'
				}
			],
			[]
		);
		const unsupportedType = model(
			[
				{
					id: 'item-1',
					title: 'Account',
					description: '',
					type: 'unknown' as ItemType,
					sectionId: null
				}
			],
			[]
		);

		expect(() => packageBuilder()(missingSection)).toThrow(/missing section/i);
		expect(() => packageBuilder()(unsupportedType)).toThrow(/unsupported item type/i);
	});

	test('writes the spec files to a ZIP that can be extracted unchanged', () => {
		const zip = zipBuilder()([
			{ path: 'specs/acme-canvas-42/README.md', contents: '# Acme\n' },
			{ path: 'specs/acme-canvas-42/manifest.json', contents: '{"manifestVersion":1}\n' }
		]);
		const extracted = unzipSync(zip);

		expect(strFromU8(extracted['specs/acme-canvas-42/README.md'])).toBe('# Acme\n');
		expect(strFromU8(extracted['specs/acme-canvas-42/manifest.json'])).toBe(
			'{"manifestVersion":1}\n'
		);
	});
});
