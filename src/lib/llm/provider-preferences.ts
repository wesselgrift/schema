import { getDefaultModel, isSupportedModel, type LlmProviderId } from './providers';

export type ProviderPreferences = {
	apiKey: string;
	modelId: string;
	rememberApiKey: boolean;
};

type StorageKind = 'local' | 'session';

const RETIRED_OPENROUTER_MIGRATION_KEY = 'schema:llm:openrouter:retired';

function getStorage(kind: StorageKind): Storage | null {
	if (typeof window === 'undefined') return null;

	try {
		return kind === 'local' ? window.localStorage : window.sessionStorage;
	} catch {
		return null;
	}
}

function readStorage(kind: StorageKind, key: string): string | null {
	try {
		return getStorage(kind)?.getItem(key) ?? null;
	} catch {
		return null;
	}
}

function writeStorage(kind: StorageKind, key: string, value: string): void {
	try {
		getStorage(kind)?.setItem(key, value);
	} catch {
		// Browser storage is optional.
	}
}

function removeStorage(kind: StorageKind, key: string): void {
	try {
		getStorage(kind)?.removeItem(key);
	} catch {
		// Browser storage is optional.
	}
}

function providerStorageKey(provider: LlmProviderId, preference: 'api-key' | 'model' | 'remember'): string {
	return `schema:llm:${provider}:${preference}`;
}

function migrateLegacyOpenAiPreferences(): void {
	const migrationKey = 'schema:llm:openai:migrated';
	if (readStorage('local', migrationKey) !== null) return;

	const apiKey = providerStorageKey('openai', 'api-key');
	const modelKey = providerStorageKey('openai', 'model');
	const rememberKey = providerStorageKey('openai', 'remember');
	const legacyRemembered = readStorage('local', 'schema:remember-openai-api-key') === 'true';

	if (readStorage('session', apiKey) === null) {
		const legacyApiKey = readStorage('session', 'schema:openai-api-key');
		if (legacyApiKey !== null) writeStorage('session', apiKey, legacyApiKey);
	}

	if (legacyRemembered && readStorage('local', apiKey) === null) {
		const legacyApiKey = readStorage('local', 'schema:openai-api-key');
		if (legacyApiKey !== null) writeStorage('local', apiKey, legacyApiKey);
	}

	if (legacyRemembered && readStorage('local', rememberKey) === null) {
		writeStorage('local', rememberKey, 'true');
	}

	if (readStorage('local', modelKey) === null) {
		const legacyModel = readStorage('local', 'schema:openai-model');
		if (legacyModel !== null && isSupportedModel('openai', legacyModel)) {
			writeStorage('local', modelKey, legacyModel);
		}
	}

	writeStorage('local', migrationKey, 'true');
}

function retireOpenRouterPreferences(): void {
	if (readStorage('local', RETIRED_OPENROUTER_MIGRATION_KEY) !== null) return;

	for (const kind of ['local', 'session'] as const) {
		removeStorage(kind, 'schema:llm:openrouter:api-key');
	}
	removeStorage('local', 'schema:llm:openrouter:model');
	removeStorage('local', 'schema:llm:openrouter:remember');
	writeStorage('local', RETIRED_OPENROUTER_MIGRATION_KEY, 'true');
}

export function loadProviderPreferences(provider: LlmProviderId): ProviderPreferences {
	retireOpenRouterPreferences();
	if (provider === 'openai') migrateLegacyOpenAiPreferences();

	const apiKeyKey = providerStorageKey(provider, 'api-key');
	const modelKey = providerStorageKey(provider, 'model');
	const rememberKey = providerStorageKey(provider, 'remember');
	const rememberApiKey = readStorage('local', rememberKey) === 'true';
	const sessionApiKey = readStorage('session', apiKeyKey);
	const persistedApiKey = rememberApiKey ? readStorage('local', apiKeyKey) : null;
	const storedModelId = readStorage('local', modelKey);

	return {
		apiKey: sessionApiKey || persistedApiKey || '',
		modelId:
			storedModelId !== null && isSupportedModel(provider, storedModelId)
				? storedModelId
				: getDefaultModel(provider).id,
		rememberApiKey
	};
}

export function saveProviderPreferences(
	provider: LlmProviderId,
	preferences: ProviderPreferences
): void {
	const apiKeyKey = providerStorageKey(provider, 'api-key');
	const modelKey = providerStorageKey(provider, 'model');
	const rememberKey = providerStorageKey(provider, 'remember');

	writeStorage('session', apiKeyKey, preferences.apiKey);
	writeStorage('local', modelKey, preferences.modelId);

	if (preferences.rememberApiKey) {
		writeStorage('local', apiKeyKey, preferences.apiKey);
		writeStorage('local', rememberKey, 'true');
		return;
	}

	removeStorage('local', apiKeyKey);
	removeStorage('local', rememberKey);
}

export function setProviderRemembered(
	provider: LlmProviderId,
	rememberApiKey: boolean,
	apiKey?: string
): void {
	const apiKeyKey = providerStorageKey(provider, 'api-key');
	const rememberKey = providerStorageKey(provider, 'remember');

	if (apiKey !== undefined) {
		writeStorage('session', apiKeyKey, apiKey);
	}

	if (!rememberApiKey) {
		removeStorage('local', apiKeyKey);
		removeStorage('local', rememberKey);
		return;
	}

	writeStorage('local', apiKeyKey, apiKey ?? readStorage('session', apiKeyKey) ?? '');
	writeStorage('local', rememberKey, 'true');
}
