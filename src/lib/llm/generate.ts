import { LLM_PROVIDERS, type LlmProvider, type LlmProviderId } from './providers';

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';
const ANTHROPIC_MESSAGES_URL = 'https://api.anthropic.com/v1/messages';
const OPENROUTER_CHAT_COMPLETIONS_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MISTRAL_CHAT_COMPLETIONS_URL = 'https://api.mistral.ai/v1/chat/completions';

export const MAX_AI_CONTEXT_CHARS = 80_000;
export const MAX_AI_OUTPUT_TOKENS = 4_096;
export const AI_REQUEST_TIMEOUT_MS = 60_000;

const SPEC_SYSTEM_PROMPT = `You are a senior product engineer writing a specification document that another engineer will load into an LLM-powered IDE (Cursor, Claude Code) to build the described application.

You are given a faithful description of an information architecture: sections, items with descriptions, and navigation flows between items. Each item has a type shown in parentheses after its title (e.g. Page, Form, Backend service, Database, API endpoint). Some flows include conditions.

Write a clear, well-structured Markdown specification that a coding agent can implement from. Rules:
- Preserve every item description and every flow condition. Treat them as hard requirements, quoting them where useful.
- Respect each item's type; describe it according to what that type implies (a UI page, a backend service, a database, etc.).
- Do not invent features, screens, or flows that are not implied by the input.
- Organize by section, then items, then flows. Make navigation conditions explicit (e.g. guards, states, prerequisites).
- Prefer precise, implementation-oriented language over marketing prose.
- Output only the Markdown document, with no preamble or commentary.`;

const PROJECT_INTRODUCTION_SYSTEM_PROMPT = `You are a senior product designer writing a concise project introduction for a developer-facing README.

Use only the supplied project facts. Do not invent requirements, architecture, libraries, users, screens, or flows. Explain the product's purpose, the main areas represented by the canvas, and the most important relationships in 1–3 concise paragraphs. Output Markdown prose only; do not add a heading.`;

const IMPLEMENTATION_PLAN_SYSTEM_PROMPT = `You are a senior software architect creating an implementation plan for a coding agent.

Use only the supplied project facts. Do not invent requirements, architecture, libraries, data fields, screens, or flows. If a necessary decision is missing, write it as an explicit open question. Produce Markdown only.

Create an ordered set of implementation milestones. For every milestone include its goal, dependencies, affected spec files, expected implementation artifacts, and how the work should be verified. Keep milestones small enough for focused coding sessions.`;

const TODO_SYSTEM_PROMPT = `You are a senior software engineer converting an approved implementation plan into an execution checklist for a coding agent.

Use only the supplied project facts and plan. Do not invent requirements, architecture, libraries, data fields, screens, or flows. If a necessary decision is missing, keep it as an explicit open question. Produce Markdown only.

Create atomic, ordered checkbox tasks. Each task must name its intent, relevant spec files, dependencies, and a concrete verification step. Do not combine unrelated work into one task.`;

export type LlmSelection = {
	provider: LlmProviderId;
	modelId: string;
};

export type GenerateSpecOptions = {
	apiKey: string;
	context: string;
	selection: LlmSelection;
	signal?: AbortSignal;
};

export class LlmProviderError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'LlmProviderError';
	}
}

type MarkdownRequest = {
	apiKey: string;
	selection: LlmSelection;
	systemPrompt: string;
	userPrompt: string;
	signal?: AbortSignal;
};

type ProviderRequest = {
	url: string;
	init: RequestInit;
	parse: (payload: unknown) => string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function text(value: unknown): string {
	return typeof value === 'string' ? value : '';
}

function assertContextSize(context: string): void {
	if (context.length > MAX_AI_CONTEXT_CHARS) {
		throw new LlmProviderError(
			`The spec context is too large for AI enrichment (${context.length.toLocaleString()} characters; maximum ${MAX_AI_CONTEXT_CHARS.toLocaleString()}). Download the base spec package instead.`
		);
	}
}

function untrustedCanvasData(context: string): string {
	return `<UNTRUSTED CANVAS DATA>\n${context}\n</UNTRUSTED CANVAS DATA>`;
}

function resolveProvider(selection: LlmSelection): LlmProvider {
	const provider = LLM_PROVIDERS.find((candidate) => candidate.id === selection.provider);
	if (!provider) {
		throw new LlmProviderError(`Invalid provider selection: ${String(selection.provider)}.`);
	}

	if (!provider.models.some((model) => model.id === selection.modelId)) {
		throw new LlmProviderError(
			`Invalid model selection for ${provider.label}: ${selection.modelId || '(none)'}.`
		);
	}

	return provider;
}

function assertApiKey(apiKey: string, provider: LlmProvider): string {
	const trimmedKey = apiKey.trim();
	if (trimmedKey === '') throw new LlmProviderError(`An ${provider.label} API key is required.`);
	return trimmedKey;
}

function withTimeout(signal?: AbortSignal): {
	signal: AbortSignal;
	cleanup: () => void;
	didTimeOut: () => boolean;
} {
	const controller = new AbortController();
	let timedOut = false;
	const onAbort = () => controller.abort(signal?.reason);
	const timeout = setTimeout(() => {
		timedOut = true;
		controller.abort();
	}, AI_REQUEST_TIMEOUT_MS);

	if (signal) signal.addEventListener('abort', onAbort, { once: true });

	return {
		signal: controller.signal,
		cleanup: () => {
			clearTimeout(timeout);
			if (signal) signal.removeEventListener('abort', onAbort);
		},
		didTimeOut: () => timedOut
	};
}

function abortReason(signal: AbortSignal): unknown {
	return signal.reason ?? new DOMException('LLM request was cancelled.', 'AbortError');
}

function awaitWithAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
	if (signal.aborted) return Promise.reject(abortReason(signal));

	return new Promise<T>((resolve, reject) => {
		const onAbort = () => reject(abortReason(signal));
		signal.addEventListener('abort', onAbort, { once: true });
		promise.then(
			(value) => {
				signal.removeEventListener('abort', onAbort);
				resolve(value);
			},
			(error) => {
				signal.removeEventListener('abort', onAbort);
				reject(error);
			}
		);
	});
}

function outputTextParts(payload: unknown): string {
	if (!isRecord(payload) || !Array.isArray(payload.output)) return '';

	return payload.output
		.filter((item) => isRecord(item) && item.type === 'message' && Array.isArray(item.content))
		.flatMap((item) => (item.content as unknown[]) ?? [])
		.filter((part) => isRecord(part) && part.type === 'output_text')
		.map((part) => (isRecord(part) ? text(part.text) : ''))
		.join('');
}

function anthropicTextBlocks(payload: unknown): string {
	if (!isRecord(payload) || !Array.isArray(payload.content)) return '';
	return payload.content
		.filter((block) => isRecord(block) && block.type === 'text')
		.map((block) => text(block.text))
		.join('');
}

function geminiCandidateText(payload: unknown): string {
	if (!isRecord(payload) || !Array.isArray(payload.candidates)) return '';

	return payload.candidates
		.filter(isRecord)
		.flatMap((candidate) => {
			const content = candidate.content;
			return isRecord(content) && Array.isArray(content.parts) ? content.parts : [];
		})
		.filter(isRecord)
		.map((part) => text(part.text))
		.join('');
}

function chatCompletionText(payload: unknown): string {
	if (!isRecord(payload) || !Array.isArray(payload.choices)) return '';

	return payload.choices
		.filter(isRecord)
		.flatMap((choice) => {
			const message = choice.message;
			if (!isRecord(message)) return [];
			if (typeof message.content === 'string') return [message.content];
			if (!Array.isArray(message.content)) return [];
			return message.content.filter(isRecord).map((part) => text(part.text));
		})
		.join('');
}

function providerRequest(
	provider: LlmProvider,
	modelId: string,
	apiKey: string,
	systemPrompt: string,
	userPrompt: string,
	signal: AbortSignal
): ProviderRequest {
	const headers = { 'Content-Type': 'application/json' };

	switch (provider.id) {
		case 'openai':
			return {
				url: OPENAI_RESPONSES_URL,
				init: {
					method: 'POST',
					headers: { ...headers, Authorization: `Bearer ${apiKey}` },
					body: JSON.stringify({
						model: modelId,
						max_output_tokens: MAX_AI_OUTPUT_TOKENS,
						instructions: systemPrompt,
						input: userPrompt
					}),
					signal
				},
				parse: outputTextParts
			};
		case 'anthropic':
			return {
				url: ANTHROPIC_MESSAGES_URL,
				init: {
					method: 'POST',
					headers: {
						...headers,
						'x-api-key': apiKey,
						'anthropic-version': '2023-06-01',
						'anthropic-dangerous-direct-browser-access': 'true'
					},
					body: JSON.stringify({
						model: modelId,
						max_tokens: MAX_AI_OUTPUT_TOKENS,
						system: systemPrompt,
						messages: [{ role: 'user', content: userPrompt }]
					}),
					signal
				},
				parse: anthropicTextBlocks
			};
		case 'gemini':
			return {
				url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelId)}:generateContent`,
				init: {
					method: 'POST',
					headers: { ...headers, 'x-goog-api-key': apiKey },
					body: JSON.stringify({
						systemInstruction: { parts: [{ text: systemPrompt }] },
						contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
						generationConfig: { maxOutputTokens: MAX_AI_OUTPUT_TOKENS }
					}),
					signal
				},
				parse: geminiCandidateText
			};
		case 'openrouter':
			return {
				url: OPENROUTER_CHAT_COMPLETIONS_URL,
				init: {
					method: 'POST',
					headers: { ...headers, Authorization: `Bearer ${apiKey}` },
					body: JSON.stringify({
						model: modelId,
						max_tokens: MAX_AI_OUTPUT_TOKENS,
						messages: [
							{ role: 'system', content: systemPrompt },
							{ role: 'user', content: userPrompt }
						]
					}),
					signal
				},
				parse: chatCompletionText
			};
		case 'mistral':
			return {
				url: MISTRAL_CHAT_COMPLETIONS_URL,
				init: {
					method: 'POST',
					headers: { ...headers, Authorization: `Bearer ${apiKey}` },
					body: JSON.stringify({
						model: modelId,
						max_tokens: MAX_AI_OUTPUT_TOKENS,
						messages: [
							{ role: 'system', content: systemPrompt },
							{ role: 'user', content: userPrompt }
						]
					}),
					signal
				},
				parse: chatCompletionText
			};
	}
}

function statusError(provider: LlmProvider, status: number): LlmProviderError {
	if (status === 401) return new LlmProviderError(`Invalid ${provider.label} API key.`);
	if (status === 429) return new LlmProviderError(`${provider.label} rate limit reached. Try again shortly.`);
	return new LlmProviderError(`${provider.label} request failed (${status}).`);
}

async function requestMarkdown({
	apiKey,
	selection,
	systemPrompt,
	userPrompt,
	signal
}: MarkdownRequest): Promise<string> {
	const provider = resolveProvider(selection);
	const trimmedKey = assertApiKey(apiKey, provider);
	if (signal?.aborted) throw abortReason(signal);

	const request = withTimeout(signal);
	try {
		const providerRequestData = providerRequest(
			provider,
			selection.modelId,
			trimmedKey,
			systemPrompt,
			userPrompt,
			request.signal
		);
		const response = await fetch(providerRequestData.url, providerRequestData.init);
		if (!response.ok) throw statusError(provider, response.status);

		let payload: unknown;
		try {
			payload = await awaitWithAbort(response.json(), request.signal);
		} catch (error) {
			if (request.didTimeOut()) {
				throw new LlmProviderError(`${provider.label} request timed out. Try again.`);
			}
			if (signal?.aborted) throw abortReason(signal);
			throw new LlmProviderError(`${provider.label} returned an invalid response.`);
		}

		const content = providerRequestData.parse(payload).trim();
		if (content === '') throw new LlmProviderError(`${provider.label} returned an empty response.`);
		return content;
	} catch (error) {
		if (error instanceof LlmProviderError) throw error;
		if (signal?.aborted) throw abortReason(signal);
		if (request.didTimeOut()) {
			throw new LlmProviderError(`${provider.label} request timed out. Try again.`);
		}
		throw new LlmProviderError(`Could not reach ${provider.label}. Check your connection and try again.`);
	} finally {
		request.cleanup();
	}
}

export async function generateSpec(options: GenerateSpecOptions): Promise<string> {
	assertContextSize(options.context);
	return requestMarkdown({
		...options,
		systemPrompt: SPEC_SYSTEM_PROMPT,
		userPrompt: untrustedCanvasData(options.context)
	});
}

export async function generateProjectIntroduction(options: GenerateSpecOptions): Promise<string> {
	assertContextSize(options.context);
	return requestMarkdown({
		...options,
		systemPrompt: PROJECT_INTRODUCTION_SYSTEM_PROMPT,
		userPrompt: untrustedCanvasData(options.context)
	});
}

export async function generateImplementationArtifacts(
	options: GenerateSpecOptions
): Promise<{ implementationPlan: string; todo: string }> {
	assertContextSize(options.context);
	const source = untrustedCanvasData(options.context);
	const implementationPlan = await requestMarkdown({
		...options,
		systemPrompt: IMPLEMENTATION_PLAN_SYSTEM_PROMPT,
		userPrompt: source
	});
	const todoContext = `${source}\n\n<IMPLEMENTATION PLAN>\n${implementationPlan}\n</IMPLEMENTATION PLAN>`;
	assertContextSize(todoContext);
	const todo = await requestMarkdown({
		...options,
		systemPrompt: TODO_SYSTEM_PROMPT,
		userPrompt: todoContext
	});

	return { implementationPlan, todo };
}
