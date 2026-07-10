const OPENAI_CHAT_COMPLETIONS_URL = 'https://api.openai.com/v1/chat/completions';

export const DEFAULT_OPENAI_MODEL = 'gpt-4o';
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

export type GenerateSpecOptions = {
	apiKey: string;
	context: string;
	model?: string;
	signal?: AbortSignal;
};

export class OpenAiError extends Error {}

export type GenerateImplementationArtifactsOptions = GenerateSpecOptions;

export type ImplementationArtifacts = {
	implementationPlan: string;
	todo: string;
};

type MarkdownRequest = {
	apiKey: string;
	model: string;
	systemPrompt: string;
	userPrompt: string;
	signal?: AbortSignal;
};

function assertContextSize(context: string): void {
	if (context.length > MAX_AI_CONTEXT_CHARS) {
		throw new OpenAiError(
			`The spec context is too large for AI enrichment (${context.length.toLocaleString()} characters; maximum ${MAX_AI_CONTEXT_CHARS.toLocaleString()}). Download the base spec package instead.`
		);
	}
}

function untrustedCanvasData(context: string): string {
	return `<UNTRUSTED CANVAS DATA>\n${context}\n</UNTRUSTED CANVAS DATA>`;
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

function awaitWithAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
	if (signal.aborted) {
		return Promise.reject(signal.reason ?? new DOMException('OpenAI request was cancelled.', 'AbortError'));
	}

	return new Promise<T>((resolve, reject) => {
		const onAbort = () =>
			reject(signal.reason ?? new DOMException('OpenAI request was cancelled.', 'AbortError'));
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

async function requestMarkdown({
	apiKey,
	model,
	systemPrompt,
	userPrompt,
	signal
}: MarkdownRequest): Promise<string> {
	const trimmedKey = apiKey.trim();
	if (trimmedKey === '') throw new OpenAiError('An OpenAI API key is required.');
	if (signal?.aborted) {
		throw signal.reason instanceof Error
			? signal.reason
			: new DOMException('OpenAI request was cancelled.', 'AbortError');
	}

	const request = withTimeout(signal);
	try {
		const response = await fetch(OPENAI_CHAT_COMPLETIONS_URL, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${trimmedKey}`
			},
			body: JSON.stringify({
				model,
				temperature: 0.2,
				max_tokens: MAX_AI_OUTPUT_TOKENS,
				messages: [
					{ role: 'system', content: systemPrompt },
					{ role: 'user', content: userPrompt }
				]
			}),
			signal: request.signal
		});

		if (!response.ok) {
			const message = await extractErrorMessage(response, request.signal);
			throw new OpenAiError(message);
		}

		const payload = await awaitWithAbort(response.json(), request.signal);
		const content = payload?.choices?.[0]?.message?.content;
		if (typeof content !== 'string' || content.trim() === '') {
			throw new OpenAiError('OpenAI returned an empty response.');
		}

		return content.trim();
	} catch (error) {
		if (error instanceof OpenAiError) throw error;
		if (request.didTimeOut()) throw new OpenAiError('OpenAI request timed out. Try again.');
		if (signal?.aborted) throw error;
		throw new OpenAiError('Could not reach OpenAI. Check your connection and try again.');
	} finally {
		request.cleanup();
	}
}

/**
 * Sends the lossless IA context to OpenAI and returns a polished spec document.
 * The key is supplied by the caller (bring-your-own-key) and used only for this
 * direct browser request.
 */
export async function generateSpec({
	apiKey,
	context,
	model = DEFAULT_OPENAI_MODEL,
	signal
}: GenerateSpecOptions): Promise<string> {
	assertContextSize(context);
	return requestMarkdown({
		apiKey,
		model,
		systemPrompt: SPEC_SYSTEM_PROMPT,
		userPrompt: untrustedCanvasData(context),
		signal
	});
}

export async function generateProjectIntroduction({
	apiKey,
	context,
	model = DEFAULT_OPENAI_MODEL,
	signal
}: GenerateSpecOptions): Promise<string> {
	assertContextSize(context);
	return requestMarkdown({
		apiKey,
		model,
		systemPrompt: PROJECT_INTRODUCTION_SYSTEM_PROMPT,
		userPrompt: untrustedCanvasData(context),
		signal
	});
}

export async function generateImplementationArtifacts({
	apiKey,
	context,
	model = DEFAULT_OPENAI_MODEL,
	signal
}: GenerateImplementationArtifactsOptions): Promise<ImplementationArtifacts> {
	assertContextSize(context);
	const source = untrustedCanvasData(context);
	const implementationPlan = await requestMarkdown({
		apiKey,
		model,
		systemPrompt: IMPLEMENTATION_PLAN_SYSTEM_PROMPT,
		userPrompt: source,
		signal
	});
	const todoContext = `${source}\n\n<IMPLEMENTATION PLAN>\n${implementationPlan}\n</IMPLEMENTATION PLAN>`;
	assertContextSize(todoContext);
	const todo = await requestMarkdown({
		apiKey,
		model,
		systemPrompt: TODO_SYSTEM_PROMPT,
		userPrompt: todoContext,
		signal
	});

	return { implementationPlan, todo };
}

async function extractErrorMessage(response: Response, signal: AbortSignal): Promise<string> {
	try {
		const payload = await awaitWithAbort(response.json(), signal);
		const message = payload?.error?.message;
		if (typeof message === 'string' && message !== '') return message;
	} catch {
		// fall through to status-based message
	}

	if (response.status === 401) return 'Invalid OpenAI API key.';
	if (response.status === 429) return 'OpenAI rate limit reached. Try again shortly.';
	return `OpenAI request failed (${response.status}).`;
}
