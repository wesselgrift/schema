import { afterEach, describe, expect, test, vi } from 'vitest';
import * as openaiModule from './openai';

type GenerateImplementationArtifacts = (options: {
	apiKey: string;
	context: string;
	model?: string;
	signal?: AbortSignal;
}) => Promise<{ implementationPlan: string; todo: string }>;

type GenerateProjectIntroduction = (options: {
	apiKey: string;
	context: string;
	model?: string;
	signal?: AbortSignal;
}) => Promise<string>;

function artifactGenerator(): GenerateImplementationArtifacts {
	expect(openaiModule).toHaveProperty('generateImplementationArtifacts');
	return (
		openaiModule as typeof openaiModule & {
			generateImplementationArtifacts: GenerateImplementationArtifacts;
		}
	).generateImplementationArtifacts;
}

function introductionGenerator(): GenerateProjectIntroduction {
	expect(openaiModule).toHaveProperty('generateProjectIntroduction');
	return (
		openaiModule as typeof openaiModule & {
			generateProjectIntroduction: GenerateProjectIntroduction;
		}
	).generateProjectIntroduction;
}

function chatResponse(content: string): Response {
	return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
}

afterEach(() => {
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

describe('implementation artifact generation', () => {
	test('generates a project introduction from canonical canvas facts', async () => {
		const fetch = vi.fn().mockResolvedValue(chatResponse('Acme helps teams manage accounts.'));
		vi.stubGlobal('fetch', fetch);

		await expect(
			introductionGenerator()({ apiKey: 'sk-test', context: '{"project":{"name":"Acme"}}' })
		).resolves.toBe('Acme helps teams manage accounts.');

		expect(fetch).toHaveBeenCalledTimes(1);
		const request = JSON.parse(fetch.mock.calls[0][1].body);
		expect(request.messages[0].content).toContain('project introduction');
		expect(request.messages[1].content).toContain('UNTRUSTED CANVAS DATA');
	});

	test('generates an implementation plan before its task checklist', async () => {
		const fetch = vi
			.fn()
			.mockResolvedValueOnce(chatResponse('# Implementation plan'))
			.mockResolvedValueOnce(chatResponse('# Tasks'));
		vi.stubGlobal('fetch', fetch);

		await expect(
			artifactGenerator()({ apiKey: 'sk-test', context: 'Canvas facts', model: 'gpt-test' })
		).resolves.toEqual({
			implementationPlan: '# Implementation plan',
			todo: '# Tasks'
		});

		expect(fetch).toHaveBeenCalledTimes(2);
		const firstRequest = JSON.parse(fetch.mock.calls[0][1].body);
		const secondRequest = JSON.parse(fetch.mock.calls[1][1].body);
		expect(firstRequest.model).toBe('gpt-test');
		expect(firstRequest.max_tokens).toBeGreaterThan(0);
		expect(firstRequest.messages[1].content).toContain('UNTRUSTED CANVAS DATA');
		expect(secondRequest.messages[1].content).toContain('# Implementation plan');
	});

	test('rejects oversized context without sending an API request', async () => {
		const fetch = vi.fn();
		vi.stubGlobal('fetch', fetch);
		const maxContext = (
			openaiModule as typeof openaiModule & { MAX_AI_CONTEXT_CHARS: number }
		).MAX_AI_CONTEXT_CHARS;

		await expect(
			artifactGenerator()({
				apiKey: 'sk-test',
				context: 'x'.repeat(maxContext + 1)
			})
		).rejects.toThrow(/too large/i);
		expect(fetch).not.toHaveBeenCalled();
	});

	test('does not start enrichment when its abort signal is already cancelled', async () => {
		const fetch = vi.fn();
		vi.stubGlobal('fetch', fetch);
		const controller = new AbortController();
		controller.abort(new DOMException('Cancelled', 'AbortError'));

		await expect(
			artifactGenerator()({
				apiKey: 'sk-test',
				context: 'Canvas facts',
				signal: controller.signal
			})
		).rejects.toMatchObject({ name: 'AbortError' });
		expect(fetch).not.toHaveBeenCalled();
	});

	test('times out while waiting for a stalled response body', async () => {
		vi.useFakeTimers();
		const fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: () => new Promise<never>(() => undefined)
		} as unknown as Response);
		vi.stubGlobal('fetch', fetch);
		const timeout = (
			openaiModule as typeof openaiModule & { AI_REQUEST_TIMEOUT_MS: number }
		).AI_REQUEST_TIMEOUT_MS;

		const result = artifactGenerator()({ apiKey: 'sk-test', context: 'Canvas facts' });
		const rejection = expect(result).rejects.toThrow(/timed out/i);
		await vi.advanceTimersByTimeAsync(timeout);

		await rejection;
		expect(fetch).toHaveBeenCalledTimes(1);
	});

	test.each([
		[401, 'Invalid OpenAI API key.'],
		[429, 'OpenAI rate limit reached. Try again shortly.']
	])('surfaces OpenAI status %i without attempting the checklist', async (status, message) => {
		const fetch = vi.fn().mockResolvedValue(new Response('{}', { status }));
		vi.stubGlobal('fetch', fetch);

		await expect(
			artifactGenerator()({
				apiKey: 'sk-test',
				context: 'Canvas facts'
			})
		).rejects.toThrow(message);
		expect(fetch).toHaveBeenCalledTimes(1);
	});
});
