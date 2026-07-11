<script lang="ts">
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import { ChevronDownIcon, Loading03Icon } from '@hugeicons/core-free-icons';
	import { tick } from 'svelte';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import * as Command from '$lib/components/ui/command';
	import * as Field from '$lib/components/ui/field';
	import { Input } from '$lib/components/ui/input';
	import * as Popover from '$lib/components/ui/popover';
	import { buildCanonicalExportModel, buildSpecPackage, zipSpecFiles } from './export';
	import {
		LlmProviderError,
		generateProjectIntroduction,
		generateImplementationArtifacts,
		type LlmSelection
	} from '$lib/llm/generate';
	import {
		LLM_PROVIDERS,
		getDefaultModel,
		getProvider,
		type LlmProviderId
	} from '$lib/llm/providers';
	import {
		loadProviderPreferences,
		saveProviderPreferences,
		setProviderRemembered
	} from '$lib/llm/provider-preferences';
	import type { CanvasFlowNode, PageFlowEdge } from './flow';

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

	const initialPreferences = loadProviderPreferences('openai');
	let providerId = $state<LlmProviderId>('openai');
	let modelId = $state(initialPreferences.modelId);
	let rememberApiKey = $state(initialPreferences.rememberApiKey);
	let apiKey = $state(initialPreferences.apiKey);
	let isExporting = $state(false);
	let aiExportController = $state<AbortController | null>(null);
	let errorMessage = $state('');
	let providerPopoverOpen = $state(false);
	let modelPopoverOpen = $state(false);
	let providerTrigger = $state<HTMLButtonElement | null>(null);
	let modelTrigger = $state<HTMLButtonElement | null>(null);
	let selectedProvider = $derived(getProvider(providerId));
	let selectedModel = $derived(
		selectedProvider.models.find((candidate) => candidate.id === modelId) ??
			getDefaultModel(providerId)
	);

	function handleOpenChange(next: boolean) {
		if (!next) aiExportController?.abort();
		if (next) errorMessage = '';
	}

	function setRememberApiKey(enabled: boolean) {
		rememberApiKey = enabled;
		setProviderRemembered(providerId, enabled, apiKey);
	}

	async function selectProvider(nextProviderId: LlmProviderId) {
		const currentProvider = getProvider(providerId);
		const currentModelId = currentProvider.models.some((candidate) => candidate.id === modelId)
			? modelId
			: getDefaultModel(providerId).id;
		saveProviderPreferences(providerId, {
			apiKey,
			modelId: currentModelId,
			rememberApiKey
		});

		const preferences = loadProviderPreferences(nextProviderId);
		const provider = getProvider(nextProviderId);
		const nextModelId = provider.models.some((candidate) => candidate.id === preferences.modelId)
			? preferences.modelId
			: getDefaultModel(nextProviderId).id;

		providerId = nextProviderId;
		modelId = nextModelId;
		apiKey = preferences.apiKey;
		rememberApiKey = preferences.rememberApiKey;
		errorMessage = '';
		providerPopoverOpen = false;

		await tick();
		providerTrigger?.focus();
	}

	async function selectModel(nextModelId: string) {
		const model = selectedProvider.models.find((candidate) => candidate.id === nextModelId);
		if (!model) return;

		modelId = model.id;
		modelPopoverOpen = false;

		await tick();
		modelTrigger?.focus();
	}

	function saveActivePreferences(trimmedApiKey: string, selection: LlmSelection) {
		saveProviderPreferences(selection.provider, {
			apiKey: trimmedApiKey,
			modelId: selection.modelId,
			rememberApiKey
		});
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

	function formatError(error: unknown, fallback: string): string {
		return error instanceof LlmProviderError || error instanceof Error ? error.message : fallback;
	}

	function handleCancel() {
		aiExportController?.abort();
		open = false;
	}

	function wasExportCancelled(controller: AbortController): boolean {
		if (!controller.signal.aborted) return false;
		errorMessage = 'Spec generation was cancelled. No package was downloaded.';
		return true;
	}

	async function handleExport() {
		if (isExporting) return;

		errorMessage = '';
		const trimmedKey = apiKey.trim();
		if (trimmedKey === '') {
			errorMessage = `Enter your ${selectedProvider.label} API key to continue.`;
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
			const filename = `${slugify(projectName)}-specs.zip`;
			const selection: LlmSelection = { provider: providerId, modelId };
			saveActivePreferences(trimmedKey, selection);
			const context = `${JSON.stringify(canonicalModel, null, 2)}\n`;

			let introduction: string;
			try {
				introduction = await generateProjectIntroduction({
					apiKey: trimmedKey,
					context,
					selection,
					signal: controller.signal
				});
			} catch (error) {
				if (wasExportCancelled(controller)) return;
				errorMessage = `Could not generate the project introduction: ${formatError(error, 'Unknown error.')}. No package was downloaded.`;
				return;
			}

			if (wasExportCancelled(controller)) return;

			try {
				const artifacts = await generateImplementationArtifacts({
					apiKey: trimmedKey,
					context,
					selection,
					signal: controller.signal
				});
				if (wasExportCancelled(controller)) return;
				const specPackage = buildSpecPackage(canonicalModel, {
					introduction,
					implementationArtifacts: artifacts
				});

				if (wasExportCancelled(controller)) return;
				downloadZip(zipSpecFiles(specPackage.files), filename);
				open = false;
			} catch (error) {
				if (wasExportCancelled(controller)) return;
				errorMessage = `Could not generate the implementation plan and checklist: ${formatError(error, 'Unknown error.')}. No package was downloaded.`;
			}
		} catch (error) {
			if (wasExportCancelled(controller)) return;
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
				Generates the README introduction, implementation plan, and checklist, then downloads a structured ZIP package.
			</Dialog.Description>
		</Dialog.Header>

		<div class="flex flex-col gap-3">
			<Field.Group>
				<Field.Field data-disabled={isExporting}>
					<Field.Label for="llm-provider">Provider</Field.Label>
					<Popover.Root bind:open={providerPopoverOpen}>
						<Popover.Trigger bind:ref={providerTrigger}>
							{#snippet child({ props })}
								<Button
									{...props}
									id="llm-provider"
									type="button"
									variant="outline"
									class="w-full justify-between"
									role="combobox"
									aria-expanded={providerPopoverOpen}
									aria-controls="llm-provider-listbox"
									disabled={isExporting}
								>
									{providerId === 'gemini' ? `Google ${selectedProvider.label}` : selectedProvider.label}
									<HugeiconsIcon
										icon={ChevronDownIcon}
										data-icon="inline-end"
										strokeWidth={2}
										aria-hidden="true"
									/>
								</Button>
							{/snippet}
						</Popover.Trigger>
						{#if providerPopoverOpen}
							<Popover.Content
								align="start"
								class="w-(--bits-popover-anchor-width) p-0"
								portalProps={{ disabled: true }}
							>
								<Command.Root>
									<Command.Input placeholder="Search providers..." aria-label="Search providers" />
									<Command.List id="llm-provider-listbox">
										<Command.Empty>No providers found.</Command.Empty>
										<Command.Group>
											{#each LLM_PROVIDERS as provider (provider.id)}
												<Command.Item
													value={provider.id === 'gemini' ? `Google ${provider.label}` : provider.label}
													data-checked={provider.id === providerId}
													onSelect={() => void selectProvider(provider.id)}
												>
													{provider.id === 'gemini' ? `Google ${provider.label}` : provider.label}
												</Command.Item>
											{/each}
										</Command.Group>
									</Command.List>
								</Command.Root>
							</Popover.Content>
						{/if}
					</Popover.Root>
					<Field.Description>Used for the README, implementation plan, and checklist.</Field.Description>
				</Field.Field>

				<Field.Field data-disabled={isExporting}>
					<Field.Label for="llm-model">Model</Field.Label>
					<Popover.Root bind:open={modelPopoverOpen}>
						<Popover.Trigger bind:ref={modelTrigger}>
							{#snippet child({ props })}
								<Button
									{...props}
									id="llm-model"
									type="button"
									variant="outline"
									class="w-full justify-between"
									role="combobox"
									aria-expanded={modelPopoverOpen}
									aria-controls="llm-model-listbox"
									disabled={isExporting}
								>
									{selectedModel.label}
									<HugeiconsIcon
										icon={ChevronDownIcon}
										data-icon="inline-end"
										strokeWidth={2}
										aria-hidden="true"
									/>
								</Button>
							{/snippet}
						</Popover.Trigger>
						{#if modelPopoverOpen}
							<Popover.Content
								align="start"
								class="w-(--bits-popover-anchor-width) p-0"
								portalProps={{ disabled: true }}
							>
								<Command.Root>
									<Command.Input placeholder="Search models..." aria-label="Search models" />
									<Command.List id="llm-model-listbox">
										<Command.Empty>No models found.</Command.Empty>
										<Command.Group>
											{#each selectedProvider.models as candidate (candidate.id)}
												<Command.Item
													value={candidate.label}
													data-checked={candidate.id === modelId}
													onSelect={() => void selectModel(candidate.id)}
												>
													<span>{candidate.label}</span>
													{#if candidate.recommended}
														<span class="text-muted-foreground">Recommended</span>
													{/if}
												</Command.Item>
											{/each}
										</Command.Group>
									</Command.List>
								</Command.Root>
							</Popover.Content>
						{/if}
					</Popover.Root>
					<Field.Description>Recommended models are marked.</Field.Description>
				</Field.Field>

				<Field.Field data-disabled={isExporting}>
					<Field.Label for="llm-api-key">{selectedProvider.apiKeyLabel}</Field.Label>
					<Input
						id="llm-api-key"
						type="password"
						bind:value={apiKey}
						placeholder={selectedProvider.apiKeyPlaceholder}
						autocomplete="off"
						spellcheck={false}
						disabled={isExporting}
					/>
					<Field.Description>Stored locally on your device.</Field.Description>
				</Field.Field>
			</Field.Group>

			<label class="flex items-center gap-2 text-sm text-foreground">
				<input
					type="checkbox"
					checked={rememberApiKey}
					onchange={(event) => setRememberApiKey(event.currentTarget.checked)}
					disabled={isExporting}
				/>
				Remember API key on this device
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
				{:else}
					Generate specs
				{/if}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
