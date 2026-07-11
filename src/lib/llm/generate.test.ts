import { afterEach, describe, expect, test, vi } from 'vitest';
import type { LlmProviderId } from './providers';
import * as generateModule from './generate';

type GenerateSpec = (options: {
	apiKey: string;
	context: string;
	selection: { provider: LlmProviderId; modelId: string };
	signal?: AbortSignal;
}) => Promise<string>;

type GenerateImplementationArtifacts = (options: {
	apiKey: string;
	context: string;
	selection: { provider: LlmProviderId; modelId: string };
	signal?: AbortSignal;
}) => Promise<{ implementationPlan: string; todo: string }>;

type GenerateProjectIntroduction = (options: {
	apiKey: string;
	context: string;
	selection: { provider: LlmProviderId; modelId: string };
	signal?: AbortSignal;
}) => Promise<string>;

function generateSpec(): GenerateSpec {
	expect(generateModule).toHaveProperty('generateSpec');
	return (generateModule as typeof generateModule & { generateSpec: GenerateSpec }).generateSpec;
}

function generateArtifacts(): GenerateImplementationArtifacts {
	expect(generateModule).toHaveProperty('generateImplementationArtifacts');
	return (
		generateModule as typeof generateModule & {
			generateImplementationArtifacts: GenerateImplementationArtifacts;
		}
	).generateImplementationArtifacts;
}

function generateProjectIntroduction(): GenerateProjectIntroduction {
	expect(generateModule).toHaveProperty('generateProjectIntroduction');
	return (
		generateModule as typeof generateModule & {
			generateProjectIntroduction: GenerateProjectIntroduction;
		}
	).generateProjectIntroduction;
}

function selection(provider: LlmProviderId, modelId: string) {
	return { provider, modelId };
}

function response(payload: unknown, status = 200): Response {
	return new Response(JSON.stringify(payload), { status });
}

afterEach(() => {
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

describe('provider-neutral spec generation', () => {
	test.each([
		{
			provider: 'openai' as const,
			modelId: 'gpt-5.6-sol',
			url: 'https://api.openai.com/v1/responses',
			payload: {
				output: [
					{
						type: 'message',
						content: [
							{ type: 'output_text', text: 'OpenAI ' },
							{ type: 'output_text', text: 'result' }
						]
					}
				]
			},
			expected: 'OpenAI result',
			assertRequest: (url: string, init: RequestInit, body: Record<string, unknown>) => {
				expect(url).toBe('https://api.openai.com/v1/responses');
				expect(init.headers).toMatchObject({ Authorization: 'Bearer test-key' });
				expect(body.model).toBe('gpt-5.6-sol');
				expect(body.max_output_tokens).toBeGreaterThan(0);
				expect(body.instructions).toContain('specification document');
				expect(body.input).toContain('<UNTRUSTED CANVAS DATA>');
				expect(body.input).toContain('Canvas facts');
			}
		},
		{
			provider: 'anthropic' as const,
			modelId: 'claude-fable-5',
			url: 'https://api.anthropic.com/v1/messages',
			payload: { content: [{ type: 'text', text: 'Anthropic ' }, { type: 'text', text: 'result' }] },
			expected: 'Anthropic result',
			assertRequest: (url: string, init: RequestInit, body: Record<string, unknown>) => {
				expect(url).toBe('https://api.anthropic.com/v1/messages');
				expect(init.headers).toMatchObject({
					'x-api-key': 'test-key',
					'anthropic-version': '2023-06-01',
					'anthropic-dangerous-direct-browser-access': 'true'
				});
				expect(body.model).toBe('claude-fable-5');
				expect(body.max_tokens).toBeGreaterThan(0);
				expect(body.system).toContain('specification document');
				expect(body.messages).toEqual([
					{ role: 'user', content: '<UNTRUSTED CANVAS DATA>\nCanvas facts\n</UNTRUSTED CANVAS DATA>' }
				]);
			}
		},
		{
			provider: 'gemini' as const,
			modelId: 'gemini-3.5-flash',
			url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent',
			payload: {
				candidates: [{ content: { parts: [{ text: 'Gemini ' }, { text: 'result' }] } }]
			},
			expected: 'Gemini result',
			assertRequest: (url: string, init: RequestInit, body: Record<string, unknown>) => {
				expect(url).toBe(
					'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent'
				);
				expect(init.headers).toMatchObject({
					'Content-Type': 'application/json',
					'x-goog-api-key': 'test-key'
				});
				expect(body.systemInstruction).toEqual(
					expect.objectContaining({ parts: [{ text: expect.stringContaining('specification document') }] })
				);
				expect(body.contents).toEqual([
					{
						role: 'user',
						parts: [{ text: '<UNTRUSTED CANVAS DATA>\nCanvas facts\n</UNTRUSTED CANVAS DATA>' }]
					}
				]);
				expect(body.generationConfig).toEqual(
					expect.objectContaining({ maxOutputTokens: expect.any(Number) })
				);
			}
		},
		{
			provider: 'mistral' as const,
			modelId: 'mistral-medium-3-5',
			url: 'https://api.mistral.ai/v1/chat/completions',
			payload: { choices: [{ message: { content: 'Mistral result' } }] },
			expected: 'Mistral result',
			assertRequest: (url: string, init: RequestInit, body: Record<string, unknown>) => {
				expect(url).toBe('https://api.mistral.ai/v1/chat/completions');
				expect(init.headers).toMatchObject({ Authorization: 'Bearer test-key' });
				expect(body.model).toBe('mistral-medium-3-5');
				expect(body.max_tokens).toBeGreaterThan(0);
				expect(body.messages).toEqual(
					expect.arrayContaining([
						expect.objectContaining({ role: 'system' }),
						expect.objectContaining({ role: 'user' })
					])
				);
			}
		}
	])('uses the $provider native request contract', async ({ provider, modelId, payload, expected, assertRequest }) => {
		const fetch = vi.fn().mockResolvedValue(response(payload));
		vi.stubGlobal('fetch', fetch);

		await expect(
			generateSpec()({ apiKey: ' test-key ', context: 'Canvas facts', selection: selection(provider, modelId) })
		).resolves.toBe(expected);

		expect(fetch).toHaveBeenCalledTimes(1);
		const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
		assertRequest(url, init, JSON.parse(init.body as string));
	});

	test('passes the project-introduction prompt and untrusted context to the selected provider', async () => {
		const fetch = vi.fn().mockResolvedValue(
			response({
				output: [{ type: 'message', content: [{ type: 'output_text', text: 'Project intro' }] }]
			})
		);
		vi.stubGlobal('fetch', fetch);

		await expect(
			generateProjectIntroduction()({
				apiKey: 'test-key',
				context: 'Project facts',
				selection: selection('openai', 'gpt-5.6-sol')
			})
		).resolves.toBe('Project intro');

		const request = JSON.parse(fetch.mock.calls[0][1].body);
		expect(request.instructions).toContain('project introduction');
		expect(request.input).toBe('<UNTRUSTED CANVAS DATA>\nProject facts\n</UNTRUSTED CANVAS DATA>');
	});

	test('rejects blank keys and catalog-invalid selections without fetching', async () => {
		const fetch = vi.fn();
		vi.stubGlobal('fetch', fetch);

		await expect(
			generateSpec()({
				apiKey: '  ',
				context: 'Canvas facts',
				selection: selection('openai', 'gpt-5.6-sol')
			})
		).rejects.toThrow(/OpenAI API key is required/i);
		await expect(
			generateSpec()({
				apiKey: 'test-key',
				context: 'Canvas facts',
				selection: selection('openai', 'not-a-catalog-model')
			})
		).rejects.toThrow(/invalid model selection/i);
		await expect(
			generateSpec()({
				apiKey: 'test-key',
				context: 'Canvas facts',
				selection: selection('not-a-provider' as LlmProviderId, 'model')
			})
		).rejects.toThrow(/invalid provider selection/i);

		expect(fetch).not.toHaveBeenCalled();
	});

	test('rejects oversized context without sending an API request', async () => {
		const fetch = vi.fn();
		vi.stubGlobal('fetch', fetch);

		await expect(
			generateSpec()({
				apiKey: 'test-key',
				context: 'x'.repeat(generateModule.MAX_AI_CONTEXT_CHARS + 1),
				selection: selection('openai', 'gpt-5.6-sol')
			})
		).rejects.toThrow(
			'The spec context is too large for AI enrichment (80,001 characters; maximum 80,000). Reduce the canvas context and try again.'
		);

		expect(fetch).not.toHaveBeenCalled();
	});

	test('preserves the identity of a pre-aborted external signal', async () => {
		const fetch = vi.fn();
		vi.stubGlobal('fetch', fetch);
		const controller = new AbortController();
		const reason = new DOMException('Cancelled', 'AbortError');
		controller.abort(reason);

		await expect(
			generateSpec()({
				apiKey: 'test-key',
				context: 'Canvas facts',
				selection: selection('openai', 'gpt-5.6-sol'),
				signal: controller.signal
			})
		).rejects.toBe(reason);

		expect(fetch).not.toHaveBeenCalled();
	});

	test('times out while waiting for a stalled response body', async () => {
		vi.useFakeTimers();
		const fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: () => new Promise<never>(() => undefined)
		} as unknown as Response);
		vi.stubGlobal('fetch', fetch);

		const result = generateSpec()({
			apiKey: 'test-key',
			context: 'Canvas facts',
			selection: selection('openai', 'gpt-5.6-sol')
		});
		const rejection = expect(result).rejects.toThrow(/OpenAI request timed out/i);
		await vi.advanceTimersByTimeAsync(generateModule.AI_REQUEST_TIMEOUT_MS);

		await rejection;
		expect(fetch).toHaveBeenCalledTimes(1);
	});

	test('names Anthropic when the network is unreachable', async () => {
		const fetch = vi.fn().mockRejectedValue(new TypeError('Network request failed'));
		vi.stubGlobal('fetch', fetch);

		await expect(
			generateSpec()({
				apiKey: 'test-key',
				context: 'Canvas facts',
				selection: selection('anthropic', 'claude-fable-5')
			})
		).rejects.toMatchObject({
			name: 'LlmProviderError',
			message: 'Could not reach Anthropic. Check your connection and try again.'
		});
	});

	test('names Gemini when a successful response contains no parseable text', async () => {
		const fetch = vi.fn().mockResolvedValue(response({ candidates: [{ content: { parts: [{}] } }] }));
		vi.stubGlobal('fetch', fetch);

		await expect(
			generateSpec()({
				apiKey: 'test-key',
				context: 'Canvas facts',
				selection: selection('gemini', 'gemini-3.5-flash')
			})
		).rejects.toMatchObject({
			name: 'LlmProviderError',
			message: 'Gemini returned an empty response.'
		});
	});

	test('rejects legacy OpenRouter selections without fetching', async () => {
		const fetch = vi.fn();
		vi.stubGlobal('fetch', fetch);

		await expect(
			generateSpec()({
				apiKey: 'test-key',
				context: 'Canvas facts',
				selection: selection('openrouter' as LlmProviderId, 'anthropic/claude-fable-5')
			})
		).rejects.toMatchObject({
			name: 'LlmProviderError',
			message: 'Invalid provider selection: openrouter.'
		});
		expect(fetch).not.toHaveBeenCalled();
	});

	test.each([
		[401, /invalid Mistral API key/i],
		[429, /Mistral rate limit/i]
	])('normalizes Mistral status %i errors', async (status, message) => {
		const fetch = vi.fn().mockResolvedValue(response({}, status));
		vi.stubGlobal('fetch', fetch);

		await expect(
			generateSpec()({
				apiKey: 'test-key',
				context: 'Canvas facts',
				selection: selection('mistral', 'mistral-medium-3-5')
			})
		).rejects.toThrow(message);
	});

	test('generates the implementation plan before the todo from the selected model', async () => {
		const fetch = vi
			.fn()
			.mockResolvedValueOnce(response({ choices: [{ message: { content: '# Plan' } }] }))
			.mockResolvedValueOnce(response({ choices: [{ message: { content: '# Todo' } }] }));
		vi.stubGlobal('fetch', fetch);

		await expect(
			generateArtifacts()({
				apiKey: 'test-key',
				context: 'Canvas facts',
				selection: selection('mistral', 'mistral-medium-3-5')
			})
		).resolves.toEqual({ implementationPlan: '# Plan', todo: '# Todo' });

		expect(fetch).toHaveBeenCalledTimes(2);
		const firstRequest = JSON.parse(fetch.mock.calls[0][1].body);
		const secondRequest = JSON.parse(fetch.mock.calls[1][1].body);
		expect(firstRequest.model).toBe('mistral-medium-3-5');
		expect(firstRequest.messages[0].content).toContain('implementation plan');
		expect(secondRequest.model).toBe('mistral-medium-3-5');
		expect(secondRequest.messages[0].content).toContain('execution checklist');
		expect(secondRequest.messages[1].content).toContain('# Plan');
	});
});
