// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import ExportSpecDialog from './ExportSpecDialog.svelte';

const llm = vi.hoisted(() => ({
	generateProjectIntroduction: vi.fn(),
	generateImplementationArtifacts: vi.fn()
}));

vi.mock('$lib/llm/generate', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/llm/generate')>()),
	generateProjectIntroduction: llm.generateProjectIntroduction,
	generateImplementationArtifacts: llm.generateImplementationArtifacts
}));

let component: ReturnType<typeof mount> | undefined;

function buttonWithText(text: string): HTMLButtonElement {
	const button = [...document.querySelectorAll('button')].find((candidate) =>
		candidate.textContent?.includes(text)
	);
	expect(button, `Expected button containing "${text}"`).toBeDefined();
	return button!;
}

afterEach(() => {
	if (component) void unmount(component);
	component = undefined;
	document.body.replaceChildren();
	vi.restoreAllMocks();
	llm.generateProjectIntroduction.mockReset();
	llm.generateImplementationArtifacts.mockReset();
});

describe('export spec dialog', () => {
	test('does not download a ZIP when implementation artifact generation fails', async () => {
		llm.generateProjectIntroduction.mockResolvedValue('A project introduction.');
		llm.generateImplementationArtifacts.mockRejectedValue(new Error('Provider unavailable'));
		const download = vi.spyOn(HTMLAnchorElement.prototype, 'click');
		const target = document.body.appendChild(document.createElement('div'));

		component = mount(ExportSpecDialog, {
			target,
			props: {
				open: true,
				nodes: [],
				edges: [],
				canvasId: 'canvas-42',
				projectName: 'Acme'
			}
		});
		flushSync();

		const apiKey = document.querySelector('#llm-api-key') as HTMLInputElement;
		apiKey.value = 'test-key';
		apiKey.dispatchEvent(new Event('input', { bubbles: true }));
		flushSync();

		buttonWithText('Generate specs').click();

		await vi.waitFor(() => {
			expect(llm.generateImplementationArtifacts).toHaveBeenCalledOnce();
		});

		expect(download).not.toHaveBeenCalled();
		expect(document.body.textContent).toContain(
			'Could not generate the implementation plan and checklist: Provider unavailable. No package was downloaded.'
		);
	});
});
