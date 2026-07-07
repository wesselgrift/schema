<script lang="ts">
	import { untrack } from 'svelte';
	import type { Attachment } from 'svelte/attachments';
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import { Cancel01Icon } from '@hugeicons/core-free-icons';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import ItemTypePicker from './ItemTypePicker.svelte';
	import MarkdownEditor from './MarkdownEditor.svelte';
	import type { ItemType } from '../item-types';

	interface Props {
		open: boolean;
		itemId: number;
		title: string;
		description: string;
		type: ItemType;
		onTitleChange: (value: string) => void;
		onDescriptionChange: (value: string) => void;
		onTypeChange: (type: ItemType) => void;
	}

	let {
		open = $bindable(),
		itemId,
		title,
		description,
		type,
		onTitleChange,
		onDescriptionChange,
		onTypeChange
	}: Props = $props();

	let typePickerOpen = $state(false);

	function handleTypeChange(_: number, next: ItemType) {
		onTypeChange(next);
		typePickerOpen = false;
	}

	function noop() {}

	// Focus the title only when it is empty at open time. `untrack` reads the
	// current title without re-running this attachment on every keystroke.
	function focusOnMount(): Attachment<HTMLInputElement> {
		return (element) => {
			if (untrack(() => title).trim() !== '') return;
			const frame = requestAnimationFrame(() => {
				element.focus();
				element.select();
			});
			return () => cancelAnimationFrame(frame);
		};
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content showCloseButton={false} class="flex max-h-[85vh] flex-col gap-4 sm:max-w-2xl">
		<Dialog.Title class="sr-only">Edit item</Dialog.Title>
		<Dialog.Description class="sr-only">
			Edit the item title and its markdown description.
		</Dialog.Description>

		<div class="flex items-center gap-1.5">
			<ItemTypePicker
				{itemId}
				itemTitle={title}
				currentType={type}
				open={typePickerOpen}
				onOpenChange={(_, next) => {
					typePickerOpen = next;
				}}
				onTypeChange={handleTypeChange}
				onStopCanvasEvent={noop}
			/>
			<input
				{@attach focusOnMount()}
				class="min-w-0 flex-1 rounded-sm border-0 bg-transparent p-0 text-lg font-semibold text-foreground focus:outline-none"
				aria-label={`Item ${itemId} title`}
				placeholder="Untitled item"
				value={title}
				oninput={(event) => onTitleChange(event.currentTarget.value)}
			/>
			<Dialog.Close>
				{#snippet child({ props })}
					<Button
						{...props}
						type="button"
						variant="outline"
						size="icon-lg"
						class="shrink-0"
						aria-label="Close"
					>
						<HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} aria-hidden="true" />
						<span class="sr-only">Close</span>
					</Button>
				{/snippet}
			</Dialog.Close>
		</div>

		<div class="flex min-h-[50vh] flex-1 flex-col overflow-y-auto rounded-md border border-border bg-card p-3">
			<MarkdownEditor
				value={description}
				oninput={onDescriptionChange}
				autofocus={title.trim() !== ''}
				ariaLabel={`Description for ${title.trim() || `item ${itemId}`}`}
				class="min-h-0 flex-1"
			/>
		</div>
	</Dialog.Content>
</Dialog.Root>
