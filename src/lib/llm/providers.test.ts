import { describe, expect, test } from 'vitest';
import {
	getDefaultModel,
	getProvider,
	isSupportedModel,
	LLM_PROVIDERS,
	type LlmModel,
	type LlmProvider,
	type LlmProviderId
} from './providers';

type Mutable<T> = { -readonly [Property in keyof T]: T[Property] };

describe('LLM provider catalog', () => {
	test('lists providers in the configured order', () => {
		expect(LLM_PROVIDERS.map((provider) => provider.id)).toEqual([
			'openai',
			'anthropic',
			'gemini',
			'mistral'
		]);
	});

	test.each(LLM_PROVIDERS)('has exactly one recommended model for $label', (provider) => {
		const recommendedModels = provider.models.filter((model) => model.recommended);

		expect(recommendedModels).toHaveLength(1);
		expect(getDefaultModel(provider.id)).toEqual(recommendedModels[0]);
	});

	test('lists the selected lower-cost models with their providers', () => {
		expect(getProvider('openai').models).toContainEqual({
			id: 'gpt-5-mini',
			label: 'GPT-5 mini',
			recommended: false
		});
		expect(getProvider('anthropic').models).toContainEqual({
			id: 'claude-haiku-4-5-20251001',
			label: 'Claude Haiku 4.5',
			recommended: false
		});
	});

	test('does not expose OpenRouter as a provider', () => {
		expect(LLM_PROVIDERS.map((provider) => provider.id)).not.toContain('openrouter');
		expect(() => getProvider('openrouter' as LlmProviderId)).toThrow(
			'Unsupported LLM provider: openrouter'
		);
	});

	const supportedProviderModels: readonly [LlmProviderId, string][] = LLM_PROVIDERS.flatMap(
		(provider) =>
			provider.models.map((model) => [provider.id, model.id] as [LlmProviderId, string])
	);

	test.each(supportedProviderModels)('accepts %s model %s', (providerId, modelId) => {
		expect(isSupportedModel(providerId, modelId)).toBe(true);
	});

	const unsupportedProviderModels: readonly [LlmProviderId, string][] = LLM_PROVIDERS.flatMap(
		(provider) =>
			LLM_PROVIDERS.filter((otherProvider) => otherProvider.id !== provider.id).flatMap(
				(otherProvider) =>
					otherProvider.models.map(
						(model) => [provider.id, model.id] as [LlmProviderId, string]
					)
			)
	);

	test.each(unsupportedProviderModels)(
		'does not accept %s model %s',
		(providerId, modelId) => {
			expect(isSupportedModel(providerId, modelId)).toBe(false);
		}
	);

	test('exposes Mistral API key label and placeholder', () => {
		const provider = getProvider('mistral');

		expect(provider.apiKeyLabel).toBe('Mistral API key');
		expect(provider.apiKeyPlaceholder).toBe('Your Mistral API key');
	});

	test('prevents mutations through its public references', () => {
		const provider = getProvider('openai');
		const model = getDefaultModel('openai');

		expect(Object.isFrozen(LLM_PROVIDERS)).toBe(true);
		expect(Object.isFrozen(provider)).toBe(true);
		expect(Object.isFrozen(provider.models)).toBe(true);
		expect(Object.isFrozen(model)).toBe(true);
		expect(() => {
			(LLM_PROVIDERS as unknown as Mutable<LlmProvider[]>).push(provider);
		}).toThrow(TypeError);
		expect(() => {
			(provider as Mutable<typeof provider>).label = 'Changed';
		}).toThrow(TypeError);
		expect(() => {
			(provider.models as unknown as Mutable<LlmModel[]>).push(model);
		}).toThrow(TypeError);
		expect(() => {
			(model as Mutable<typeof model>).label = 'Changed';
		}).toThrow(TypeError);
	});
});
