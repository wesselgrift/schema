<script lang="ts">
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import { AiMagicIcon, Loading03Icon } from '@hugeicons/core-free-icons';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { buildCanonicalExportModel, buildSpecPackage, zipSpecFiles } from './export';
	import {
		DEFAULT_OPENAI_MODEL,
		OpenAiError,
		generateProjectIntroduction,
		generateImplementationArtifacts
	} from '$lib/llm/openai';
	import type { CanvasFlowNode, PageFlowEdge } from './flow';

	const API_KEY_STORAGE = 'schema:openai-api-key';
	const REMEMBER_API_KEY_STORAGE = 'schema:remember-openai-api-key';
	const MODEL_STORAGE = 'schema:openai-model';

	let {
		open = $bindable(false),
		nodes,
		edges,
		canvasId,
		projectName
	}: {
		open: boolean;
		nodes: CanvasFlowNode[];
		edges: PageFlowEdge[];
		canvasId: string;
		projectName: string;
	} = $props();

	function readStorage(storage: 'session' | 'local', key: string, fallback: string): string {
		if (typeof window === 'undefined') return fallback;

		try {
			const target = storage === 'session' ? window.sessionStorage : window.localStorage;
			return target.getItem(key) ?? fallback;
		} catch {
			return fallback;
		}
	}

	function writeStorage(storage: 'session' | 'local', key: string, value: string) {
		if (typeof window === 'undefined') return;

		try {
			const target = storage === 'session' ? window.sessionStorage : window.localStorage;
			target.setItem(key, value);
		} catch {
			// Exporting can continue when browser storage is unavailable.
		}
	}

	function removeStorage(storage: 'session' | 'local', key: string) {
		if (typeof window === 'undefined') return;

		try {
			const target = storage === 'session' ? window.sessionStorage : window.localStorage;
			target.removeItem(key);
		} catch {
			// Exporting can continue when browser storage is unavailable.
		}
	}

	function readInitialApiKey(): string {
		const sessionKey = readStorage('session', API_KEY_STORAGE, '');
		if (sessionKey !== '') return sessionKey;

		return readStorage('local', REMEMBER_API_KEY_STORAGE, 'false') === 'true'
			? readStorage('local', API_KEY_STORAGE, '')
			: '';
	}

	let includeAiArtifacts = $state(false);
	let rememberApiKey = $state(readStorage('local', REMEMBER_API_KEY_STORAGE, 'false') === 'true');
	let apiKey = $state(readInitialApiKey());
	let model = $state(readStorage('local', MODEL_STORAGE, DEFAULT_OPENAI_MODEL));
	let isExporting = $state(false);
	let aiExportController = $state<AbortController | null>(null);
	let errorMessage = $state('');

	function handleOpenChange(next: boolean) {
		open = next;
		if (next) errorMessage = '';
	}

	function setAiArtifactsEnabled(enabled: boolean) {
		includeAiArtifacts = enabled;
	}

	function setRememberApiKey(enabled: boolean) {
		rememberApiKey = enabled;
		if (!enabled) {
			removeStorage('local', API_KEY_STORAGE);
			removeStorage('local', REMEMBER_API_KEY_STORAGE);
			return;
		}

		if (enabled && apiKey === '') {
			apiKey = readStorage('local', API_KEY_STORAGE, '');
		}
	}

	function slugify(value: string): string {
		const slug = value
			.trim()
			.normalize('NFKD')
			.replace(/[\u0300-\u036f]/g, '')
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-+|-+$/g, '');
		return slug || 'untitled-project';
	}

	function downloadZip(contents: Uint8Array, filename: string) {
		const blob = new Blob([new Uint8Array(contents).buffer], { type: 'application/zip' });
		const url = URL.createObjectURL(blob);
		const anchor = document.createElement('a');
		anchor.href = url;
		anchor.download = filename;
		anchor.style.display = 'none';
		document.body.append(anchor);
		anchor.click();
		anchor.remove();
		setTimeout(() => URL.revokeObjectURL(url), 0);
	}

	function saveAiPreferences(apiKey: string, selectedModel: string) {
		writeStorage('session', API_KEY_STORAGE, apiKey);
		writeStorage('local', MODEL_STORAGE, selectedModel);
		if (rememberApiKey) {
			writeStorage('local', API_KEY_STORAGE, apiKey);
			writeStorage('local', REMEMBER_API_KEY_STORAGE, 'true');
		} else {
			removeStorage('local', API_KEY_STORAGE);
			removeStorage('local', REMEMBER_API_KEY_STORAGE);
		}
	}

	function formatError(error: unknown, fallback: string): string {
		return error instanceof OpenAiError || error instanceof Error ? error.message : fallback;
	}

	function handleCancel() {
		if (aiExportController) {
			aiExportController.abort();
			return;
		}

		open = false;
	}

	async function handleExport() {
		if (isExporting) return;

		errorMessage = '';
		const trimmedKey = apiKey.trim();
		if (trimmedKey === '') {
			errorMessage = 'Enter your OpenAI API key to continue.';
			return;
		}

		isExporting = true;
		const controller = new AbortController();
		aiExportController = controller;
		try {
			const canonicalModel = buildCanonicalExportModel(nodes, edges, {
				id: canvasId,
				name: projectName
			});
			buildSpecPackage(canonicalModel);
			const filename = `${slugify(projectName)}-specs.zip`;
			const selectedModel = model.trim() || DEFAULT_OPENAI_MODEL;
			saveAiPreferences(trimmedKey, selectedModel);
			const context = `${JSON.stringify(canonicalModel, null, 2)}\n`;

			let introduction: string;
			try {
				introduction = await generateProjectIntroduction({
					apiKey: trimmedKey,
					context,
					model: selectedModel,
					signal: controller.signal
				});
			} catch (error) {
				errorMessage = controller.signal.aborted
					? 'Project introduction generation was cancelled. No package was downloaded.'
					: `Could not generate the project introduction: ${formatError(error, 'Unknown error.')}. No package was downloaded.`;
				return;
			}

			const specPackage = buildSpecPackage(canonicalModel, { introduction });
			const baseZip = zipSpecFiles(specPackage.files);

			if (!includeAiArtifacts) {
				downloadZip(baseZip, filename);
				open = false;
				return;
			}

			try {
				const artifacts = await generateImplementationArtifacts({
					apiKey: trimmedKey,
					context,
					model: selectedModel,
					signal: controller.signal
				});
				const enrichedZip = zipSpecFiles([
					...specPackage.files,
					{
						path: `${specPackage.rootPath}/generated/implementation-plan.md`,
						contents: artifacts.implementationPlan
					},
					{ path: `${specPackage.rootPath}/generated/todo.md`, contents: artifacts.todo }
				]);

				downloadZip(enrichedZip, filename);
				open = false;
			} catch (error) {
				downloadZip(baseZip, filename);
				errorMessage = `AI enrichment failed: ${formatError(error, 'Unable to generate implementation artifacts.')}. The base package was downloaded.`;
			}
		} catch (error) {
			errorMessage = `Could not build the spec package: ${formatError(error, 'Unknown validation error.')}`;
		} finally {
			if (aiExportController === controller) {
				aiExportController = null;
			}
			isExporting = false;
		}
	}
</script>

<Dialog.Root bind:open onOpenChange={handleOpenChange}>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>Export spec package</Dialog.Title>
			<Dialog.Description>
				Generates a project introduction for the README, then downloads a structured ZIP package.
			</Dialog.Description>
		</Dialog.Header>

		<div class="flex flex-col gap-3">
			<label class="flex flex-col gap-1.5">
				<span class="font-medium text-foreground">OpenAI API key</span>
				<Input
					type="password"
					bind:value={apiKey}
					placeholder="sk-..."
					autocomplete="off"
					spellcheck={false}
					disabled={isExporting}
				/>
				<span class="text-muted-foreground">
					Stored locally on your device.
				</span>
			</label>

			<label class="flex flex-col gap-1.5">
				<span class="font-medium text-foreground">Model</span>
				<Input bind:value={model} placeholder={DEFAULT_OPENAI_MODEL} disabled={isExporting} />
			</label>

			<label class="flex items-center gap-2 text-sm text-foreground">
				<input
					type="checkbox"
					checked={rememberApiKey}
					onchange={(event) => setRememberApiKey(event.currentTarget.checked)}
					disabled={isExporting}
				/>
				Remember API key on this device
			</label>

			<label class="flex items-center gap-2 text-sm font-medium text-foreground">
				<input
					type="checkbox"
					checked={includeAiArtifacts}
					onchange={(event) => setAiArtifactsEnabled(event.currentTarget.checked)}
					disabled={isExporting}
				/>
				Add implementation plan and checklist
			</label>

			{#if errorMessage}
				<p class="text-destructive" role="alert">{errorMessage}</p>
			{/if}
		</div>

		<Dialog.Footer>
			<Button type="button" variant="outline" onclick={handleCancel} disabled={isExporting && !aiExportController}>
				Cancel
			</Button>
			<Button type="button" onclick={handleExport} disabled={isExporting}>
				{#if isExporting}
					<HugeiconsIcon
						icon={Loading03Icon}
						data-icon="inline-start"
						class="animate-spin"
						strokeWidth={2}
						aria-hidden="true"
					/>
					Generating…
				{:else if includeAiArtifacts}
					<HugeiconsIcon icon={AiMagicIcon} data-icon="inline-start" strokeWidth={2} aria-hidden="true" />
					Generate specs
				{:else}
					Generate specs
				{/if}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
