<script lang="ts">
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import { AiMagicIcon, Loading03Icon } from '@hugeicons/core-free-icons';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { buildIaModel, renderContextMarkdown } from './export';
	import { DEFAULT_OPENAI_MODEL, OpenAiError, generateSpec } from '$lib/llm/openai';
	import type { CanvasFlowNode, PageFlowEdge } from './flow';

	const API_KEY_STORAGE = 'schema:openai-api-key';
	const MODEL_STORAGE = 'schema:openai-model';

	let {
		open = $bindable(false),
		nodes,
		edges,
		projectName
	}: {
		open: boolean;
		nodes: CanvasFlowNode[];
		edges: PageFlowEdge[];
		projectName: string;
	} = $props();

	function readStorage(key: string, fallback: string): string {
		if (typeof localStorage === 'undefined') return fallback;
		return localStorage.getItem(key) ?? fallback;
	}

	let apiKey = $state(readStorage(API_KEY_STORAGE, ''));
	let model = $state(readStorage(MODEL_STORAGE, DEFAULT_OPENAI_MODEL));
	let isGenerating = $state(false);
	let errorMessage = $state('');

	function handleOpenChange(next: boolean) {
		open = next;
		if (next) errorMessage = '';
	}

	function slugify(value: string): string {
		const slug = value
			.trim()
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-+|-+$/g, '');
		return slug || 'information-architecture';
	}

	function downloadMarkdown(contents: string, filename: string) {
		const blob = new Blob([contents], { type: 'text/markdown' });
		const url = URL.createObjectURL(blob);
		const anchor = document.createElement('a');
		anchor.href = url;
		anchor.download = filename;
		anchor.click();
		URL.revokeObjectURL(url);
	}

	async function handleGenerate() {
		if (isGenerating) return;

		errorMessage = '';
		const trimmedKey = apiKey.trim();
		if (trimmedKey === '') {
			errorMessage = 'Enter your OpenAI API key to continue.';
			return;
		}

		isGenerating = true;
		try {
			const context = renderContextMarkdown(buildIaModel(nodes, edges), projectName);
			const spec = await generateSpec({ apiKey: trimmedKey, context, model: model.trim() });

			localStorage.setItem(API_KEY_STORAGE, trimmedKey);
			localStorage.setItem(MODEL_STORAGE, model.trim() || DEFAULT_OPENAI_MODEL);

			downloadMarkdown(spec, `${slugify(projectName)}-spec.md`);
			open = false;
		} catch (error) {
			errorMessage =
				error instanceof OpenAiError
					? error.message
					: 'Something went wrong generating the spec.';
		} finally {
			isGenerating = false;
		}
	}
</script>

<Dialog.Root bind:open onOpenChange={handleOpenChange}>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>Export spec document</Dialog.Title>
			<Dialog.Description>
				Turns your pages, descriptions, and flow conditions into a Markdown spec you can load into
				an LLM IDE.
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
					disabled={isGenerating}
				/>
				<span class="text-muted-foreground">Stored locally in your browser only.</span>
			</label>

			<label class="flex flex-col gap-1.5">
				<span class="font-medium text-foreground">Model</span>
				<Input bind:value={model} placeholder={DEFAULT_OPENAI_MODEL} disabled={isGenerating} />
			</label>

			{#if errorMessage}
				<p class="text-destructive" role="alert">{errorMessage}</p>
			{/if}
		</div>

		<Dialog.Footer>
			<Button type="button" variant="outline" onclick={() => (open = false)} disabled={isGenerating}>
				Cancel
			</Button>
			<Button type="button" onclick={handleGenerate} disabled={isGenerating}>
				{#if isGenerating}
					<HugeiconsIcon
						icon={Loading03Icon}
						data-icon="inline-start"
						class="animate-spin"
						strokeWidth={2}
						aria-hidden="true"
					/>
					Generating…
				{:else}
					<HugeiconsIcon icon={AiMagicIcon} data-icon="inline-start" strokeWidth={2} aria-hidden="true" />
					Generate & download
				{/if}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
