const OPENAI_CHAT_COMPLETIONS_URL = 'https://api.openai.com/v1/chat/completions';

export const DEFAULT_OPENAI_MODEL = 'gpt-4o';

const SPEC_SYSTEM_PROMPT = `You are a senior product engineer writing a specification document that another engineer will load into an LLM-powered IDE (Cursor, Claude Code) to build the described application.

You are given a faithful description of an information architecture: sections, items with descriptions, and navigation flows between items. Each item has a type shown in parentheses after its title (e.g. Page, Form, Backend service, Database, API endpoint). Some flows include conditions.

Write a clear, well-structured Markdown specification that a coding agent can implement from. Rules:
- Preserve every item description and every flow condition. Treat them as hard requirements, quoting them where useful.
- Respect each item's type; describe it according to what that type implies (a UI page, a backend service, a database, etc.).
- Do not invent features, screens, or flows that are not implied by the input.
- Organize by section, then items, then flows. Make navigation conditions explicit (e.g. guards, states, prerequisites).
- Prefer precise, implementation-oriented language over marketing prose.
- Output only the Markdown document, with no preamble or commentary.`;

export type GenerateSpecOptions = {
	apiKey: string;
	context: string;
	model?: string;
	signal?: AbortSignal;
};

export class OpenAiError extends Error {}

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
	const trimmedKey = apiKey.trim();
	if (trimmedKey === '') {
		throw new OpenAiError('An OpenAI API key is required.');
	}

	let response: Response;
	try {
		response = await fetch(OPENAI_CHAT_COMPLETIONS_URL, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${trimmedKey}`
			},
			body: JSON.stringify({
				model,
				temperature: 0.2,
				messages: [
					{ role: 'system', content: SPEC_SYSTEM_PROMPT },
					{ role: 'user', content: context }
				]
			}),
			signal
		});
	} catch (error) {
		if (error instanceof DOMException && error.name === 'AbortError') throw error;
		throw new OpenAiError('Could not reach OpenAI. Check your connection and try again.');
	}

	if (!response.ok) {
		const message = await extractErrorMessage(response);
		throw new OpenAiError(message);
	}

	const payload = await response.json();
	const content = payload?.choices?.[0]?.message?.content;
	if (typeof content !== 'string' || content.trim() === '') {
		throw new OpenAiError('OpenAI returned an empty response.');
	}

	return content.trim();
}

async function extractErrorMessage(response: Response): Promise<string> {
	try {
		const payload = await response.json();
		const message = payload?.error?.message;
		if (typeof message === 'string' && message !== '') return message;
	} catch {
		// fall through to status-based message
	}

	if (response.status === 401) return 'Invalid OpenAI API key.';
	if (response.status === 429) return 'OpenAI rate limit reached. Try again shortly.';
	return `OpenAI request failed (${response.status}).`;
}
