export type LlmProviderId = 'openai' | 'anthropic' | 'gemini' | 'openrouter' | 'mistral';

export type LlmModel = {
	readonly id: string;
	readonly label: string;
	readonly recommended: boolean;
};

export type LlmProvider = {
	readonly id: LlmProviderId;
	readonly label: string;
	readonly apiKeyLabel: string;
	readonly apiKeyPlaceholder: string;
	readonly models: readonly LlmModel[];
};

function createModel(id: string, label: string, recommended: boolean): LlmModel {
	return Object.freeze({ id, label, recommended });
}

function createProvider(
	id: LlmProviderId,
	label: string,
	apiKeyLabel: string,
	apiKeyPlaceholder: string,
	models: readonly LlmModel[]
): LlmProvider {
	return Object.freeze({
		id,
		label,
		apiKeyLabel,
		apiKeyPlaceholder,
		models: Object.freeze([...models])
	});
}

export const LLM_PROVIDERS: readonly LlmProvider[] = Object.freeze([
	createProvider('openai', 'OpenAI', 'OpenAI API key', 'sk-...', [
		createModel('gpt-5.6-sol', 'GPT-5.6 Sol', true),
		createModel('gpt-5.6-terra', 'GPT-5.6 Terra', false),
		createModel('gpt-5.6-luna', 'GPT-5.6 Luna', false)
	]),
	createProvider('anthropic', 'Anthropic', 'Anthropic API key', 'sk-ant-...', [
		createModel('claude-fable-5', 'Claude Fable 5', true),
		createModel('claude-opus-4-8', 'Claude Opus 4.8', false),
		createModel('claude-sonnet-5', 'Claude Sonnet 5', false)
	]),
	createProvider('gemini', 'Gemini', 'Google Gemini API key', 'AIza...', [
		createModel('gemini-3.5-flash', 'Gemini 3.5 Flash', true),
		createModel('gemini-3.1-flash-lite', 'Gemini 3.1 Flash-Lite', false)
	]),
	createProvider('openrouter', 'OpenRouter', 'OpenRouter API key', 'sk-or-...', [
		createModel('anthropic/claude-fable-5', 'Claude Fable 5', true),
		createModel('openai/gpt-5.6-sol', 'GPT-5.6 Sol', false),
		createModel('anthropic/claude-opus-4.8', 'Claude Opus 4.8', false)
	]),
	createProvider('mistral', 'Mistral', 'Mistral API key', 'Your Mistral API key', [
		createModel('mistral-medium-3-5', 'Mistral Medium 3.5', true),
		createModel('mistral-small-2603', 'Mistral Small 4', false)
	])
]);

export function getProvider(providerId: LlmProviderId): LlmProvider {
	const provider = LLM_PROVIDERS.find((candidate) => candidate.id === providerId);

	if (!provider) {
		throw new Error(`Unsupported LLM provider: ${providerId}`);
	}

	return provider;
}

export function getDefaultModel(providerId: LlmProviderId): LlmModel {
	const model = getProvider(providerId).models.find((candidate) => candidate.recommended);

	if (!model) {
		throw new Error(`No recommended model configured for provider: ${providerId}`);
	}

	return model;
}

export function isSupportedModel(providerId: LlmProviderId, modelId: string): boolean {
	return getProvider(providerId).models.some((model) => model.id === modelId);
}
