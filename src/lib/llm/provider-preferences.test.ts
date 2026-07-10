// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
	loadProviderPreferences,
	saveProviderPreferences,
	setProviderRemembered
} from './provider-preferences';

const openAiKeys = {
	apiKey: 'schema:llm:openai:api-key',
	model: 'schema:llm:openai:model',
	remember: 'schema:llm:openai:remember',
	migrated: 'schema:llm:openai:migrated'
};

beforeEach(() => {
	window.localStorage.clear();
	window.sessionStorage.clear();
});

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe('provider preferences', () => {
	test('keeps saved provider preferences isolated', () => {
		saveProviderPreferences('anthropic', {
			apiKey: 'anthropic-key',
			modelId: 'claude-opus-4-8',
			rememberApiKey: true
		});
		saveProviderPreferences('openai', {
			apiKey: 'openai-key',
			modelId: 'gpt-5.6-terra',
			rememberApiKey: false
		});

		expect(loadProviderPreferences('anthropic')).toEqual({
			apiKey: 'anthropic-key',
			modelId: 'claude-opus-4-8',
			rememberApiKey: true
		});
		expect(localStorage.getItem('schema:llm:anthropic:api-key')).toBe('anthropic-key');
		expect(localStorage.getItem('schema:llm:openai:api-key')).toBeNull();
	});

	test('restores a valid model for its provider', () => {
		localStorage.setItem('schema:llm:anthropic:model', 'claude-sonnet-5');

		expect(loadProviderPreferences('anthropic').modelId).toBe('claude-sonnet-5');
	});

	test.each([
		['absent model', null],
		['invalid model', 'gpt-5.6-sol']
	])('falls back to the recommended model for an %s', (_scenario, storedModel) => {
		if (storedModel !== null) {
			localStorage.setItem('schema:llm:anthropic:model', storedModel);
		}

		expect(loadProviderPreferences('anthropic').modelId).toBe('claude-fable-5');
	});

	test('stores API keys in the session and only persists remembered keys', () => {
		saveProviderPreferences('gemini', {
			apiKey: 'session-only-key',
			modelId: 'gemini-3.5-flash',
			rememberApiKey: false
		});

		expect(sessionStorage.getItem('schema:llm:gemini:api-key')).toBe('session-only-key');
		expect(localStorage.getItem('schema:llm:gemini:api-key')).toBeNull();
		expect(localStorage.getItem('schema:llm:gemini:remember')).toBeNull();
		expect(localStorage.getItem('schema:llm:gemini:model')).toBe('gemini-3.5-flash');

		saveProviderPreferences('gemini', {
			apiKey: 'remembered-key',
			modelId: 'gemini-3.1-flash-lite',
			rememberApiKey: true
		});

		expect(sessionStorage.getItem('schema:llm:gemini:api-key')).toBe('remembered-key');
		expect(localStorage.getItem('schema:llm:gemini:api-key')).toBe('remembered-key');
		expect(localStorage.getItem('schema:llm:gemini:remember')).toBe('true');
	});

	test('keeps newer provider preferences during first-run OpenAI migration', () => {
		sessionStorage.setItem('schema:openai-api-key', 'legacy-key');
		localStorage.setItem('schema:remember-openai-api-key', 'true');
		localStorage.setItem('schema:openai-api-key', 'legacy-key');
		localStorage.setItem('schema:openai-model', 'gpt-5.6-terra');
		sessionStorage.setItem(openAiKeys.apiKey, 'newer-key');
		localStorage.setItem(openAiKeys.apiKey, 'newer-key');
		localStorage.setItem(openAiKeys.model, 'gpt-5.6-sol');
		localStorage.setItem(openAiKeys.remember, 'true');

		expect(loadProviderPreferences('openai')).toEqual({
			apiKey: 'newer-key',
			modelId: 'gpt-5.6-sol',
			rememberApiKey: true
		});
		expect(localStorage.getItem(openAiKeys.migrated)).toBe('true');
	});

	test('migrates legacy OpenAI preferences once without overwriting provider values', () => {
		sessionStorage.setItem('schema:openai-api-key', 'legacy-key');
		localStorage.setItem('schema:remember-openai-api-key', 'true');
		localStorage.setItem('schema:openai-api-key', 'legacy-key');
		localStorage.setItem('schema:openai-model', 'gpt-5.6-terra');

		expect(loadProviderPreferences('openai')).toEqual({
			apiKey: 'legacy-key',
			modelId: 'gpt-5.6-terra',
			rememberApiKey: true
		});
		expect(localStorage.getItem(openAiKeys.migrated)).toBe('true');

		sessionStorage.setItem(openAiKeys.apiKey, 'newer-key');
		localStorage.setItem(openAiKeys.apiKey, 'newer-key');
		localStorage.setItem(openAiKeys.model, 'gpt-5.6-sol');
		localStorage.setItem(openAiKeys.remember, 'true');
		sessionStorage.setItem('schema:openai-api-key', 'later-legacy-key');
		localStorage.setItem('schema:openai-api-key', 'later-legacy-key');
		localStorage.setItem('schema:openai-model', 'gpt-5.6-terra');

		expect(loadProviderPreferences('openai')).toEqual({
			apiKey: 'newer-key',
			modelId: 'gpt-5.6-sol',
			rememberApiKey: true
		});
	});

	test('disabling remember retains provider session and model state only', () => {
		saveProviderPreferences('anthropic', {
			apiKey: 'anthropic-key',
			modelId: 'claude-opus-4-8',
			rememberApiKey: true
		});
		saveProviderPreferences('openai', {
			apiKey: 'openai-key',
			modelId: 'gpt-5.6-terra',
			rememberApiKey: true
		});

		setProviderRemembered('anthropic', false);

		expect(sessionStorage.getItem('schema:llm:anthropic:api-key')).toBe('anthropic-key');
		expect(localStorage.getItem('schema:llm:anthropic:model')).toBe('claude-opus-4-8');
		expect(localStorage.getItem('schema:llm:anthropic:api-key')).toBeNull();
		expect(localStorage.getItem('schema:llm:anthropic:remember')).toBeNull();
		expect(loadProviderPreferences('openai')).toEqual({
			apiKey: 'openai-key',
			modelId: 'gpt-5.6-terra',
			rememberApiKey: true
		});
	});

	test('returns defaults and ignores writes without browser storage', () => {
		vi.stubGlobal('window', undefined);

		expect(loadProviderPreferences('mistral')).toEqual({
			apiKey: '',
			modelId: 'mistral-medium-3-5',
			rememberApiKey: false
		});
		expect(() =>
			saveProviderPreferences('mistral', {
				apiKey: 'key',
				modelId: 'mistral-small-2603',
				rememberApiKey: true
			})
		).not.toThrow();
		expect(() => setProviderRemembered('mistral', false)).not.toThrow();
	});

	test('returns defaults and tolerates throwing storage methods', () => {
		vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
			throw new Error('Storage unavailable');
		});
		vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
			throw new Error('Storage unavailable');
		});
		vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
			throw new Error('Storage unavailable');
		});

		expect(loadProviderPreferences('gemini')).toEqual({
			apiKey: '',
			modelId: 'gemini-3.5-flash',
			rememberApiKey: false
		});
		expect(() =>
			saveProviderPreferences('gemini', {
				apiKey: 'key',
				modelId: 'gemini-3.1-flash-lite',
				rememberApiKey: true
			})
		).not.toThrow();
		expect(() => setProviderRemembered('gemini', true, 'key')).not.toThrow();
		expect(() => setProviderRemembered('gemini', false)).not.toThrow();
	});
});
