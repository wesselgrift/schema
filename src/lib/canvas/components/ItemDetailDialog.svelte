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
	let editorAutofocusOnOpen = $state(false);
	let wasOpen = false;

	$effect(() => {
		const isOpen = open;
		if (isOpen && !wasOpen) {
			editorAutofocusOnOpen = title.trim() !== '';
		}
		wasOpen = isOpen;
	});

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
	<Dialog.Content showCloseButton={false} class="flex max-h-[92vh] flex-col gap-4 sm:max-w-[60rem]">
		<Dialog.Title class="sr-only">Edit item</Dialog.Title>
		<Dialog.Description class="sr-only">
			Edit the item title and its markdown description.
		</Dialog.Description>

		<div class="flex items-center gap-0.5">
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
				class="item-detail-title-input h-8 w-auto min-w-0 flex-[0_1_auto] rounded-md border-2 border-transparent bg-transparent px-2 text-lg font-semibold text-foreground outline-none transition-colors hover:bg-input/50 focus:border-blue-500 focus:bg-white placeholder:text-muted-foreground"
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
						class="ml-auto shrink-0"
						aria-label="Close"
					>
						<HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} aria-hidden="true" />
						<span class="sr-only">Close</span>
					</Button>
				{/snippet}
			</Dialog.Close>
		</div>

		<div
			class="relative flex min-h-[65vh] flex-1 flex-col overflow-y-auto rounded-md border border-border bg-card p-3"
		>
			<MarkdownEditor
				value={description}
				oninput={onDescriptionChange}
				autofocus={editorAutofocusOnOpen}
				ariaLabel={`Description for ${title.trim() || `item ${itemId}`}`}
				placeholder="Describe this item. Markdown supported."
				class="min-h-0 flex-1"
			/>
			<svg
				class="pointer-events-none absolute right-3 bottom-3 h-4 text-muted-foreground/50"
				viewBox="0 0 208 128"
				fill="currentColor"
				aria-hidden="true"
			>
				<path
					d="M15 10a5 5 0 0 0-5 5v98a5 5 0 0 0 5 5h178a5 5 0 0 0 5-5V15a5 5 0 0 0-5-5H15zm0-10h178c8.284 0 15 6.716 15 15v98c0 8.284-6.716 15-15 15H15c-8.284 0-15-6.716-15-15V15C0 6.716 6.716 0 15 0z"
				/>
				<path d="M30 98V30h20l20 25 20-25h20v68H90V59L70 84 50 59v39zm125 0l-30-33h20V30h20v35h20z" />
			</svg>
		</div>
	</Dialog.Content>
</Dialog.Root>

<style>
	.item-detail-title-input {
		field-sizing: content;
	}
</style>
