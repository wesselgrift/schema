<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import * as Command from '$lib/components/ui/command';
	import * as Popover from '$lib/components/ui/popover';
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import { ITEM_TYPES, getItemTypeIcon, type ItemType } from '../item-types';

	interface Props {
		itemId: number;
		itemTitle: string;
		currentType: ItemType;
		open: boolean;
		onOpenChange: (itemId: number, open: boolean) => void;
		onTypeChange: (itemId: number, type: ItemType) => void;
		onStopCanvasEvent: (event: Event) => void;
	}

	let {
		itemId,
		itemTitle,
		currentType,
		open,
		onOpenChange,
		onTypeChange,
		onStopCanvasEvent
	}: Props = $props();
</script>

<Popover.Root {open} onOpenChange={(nextOpen) => onOpenChange(itemId, nextOpen)}>
	<Popover.Trigger data-item-header-control>
		{#snippet child({ props })}
			<Button
				{...props}
				type="button"
				variant="outline"
				size="icon-lg"
				class="item-type-trigger nodrag nopan shrink-0 border-none"
				aria-label={`Change type for ${itemTitle || `item ${itemId}`}`}
				onpointerdown={onStopCanvasEvent}
				onpointermove={onStopCanvasEvent}
				onpointerup={onStopCanvasEvent}
				onpointercancel={onStopCanvasEvent}
				onkeydown={onStopCanvasEvent}
			>
				{#key currentType}
					<HugeiconsIcon icon={getItemTypeIcon(currentType)} strokeWidth={2} aria-hidden="true" />
				{/key}
			</Button>
		{/snippet}
	</Popover.Trigger>
	<Popover.Content
		align="start"
		class="item-type-picker nodrag nopan"
		data-item-header-control
		onpointerdown={onStopCanvasEvent}
		onpointermove={onStopCanvasEvent}
		onpointerup={onStopCanvasEvent}
		onpointercancel={onStopCanvasEvent}
		onkeydown={onStopCanvasEvent}
	>
		<Command.Root class="type-picker-command">
			<Command.Input placeholder="Search types..." />
			<Command.List>
				<Command.Empty>No types found.</Command.Empty>
				<Command.Group>
					{#each ITEM_TYPES as option (option.type)}
						<Command.Item
							value={`${option.label} ${option.type}`}
							onSelect={() => onTypeChange(itemId, option.type)}
							onclick={() => onTypeChange(itemId, option.type)}
						>
							<HugeiconsIcon icon={getItemTypeIcon(option.type)} strokeWidth={2} aria-hidden="true" />
							<span>{option.label}</span>
						</Command.Item>
					{/each}
				</Command.Group>
			</Command.List>
		</Command.Root>
	</Popover.Content>
</Popover.Root>

<style>
	:global(.item-type-picker) {
		width: 17rem;
		gap: 0.25rem;
		padding: 0.375rem;
	}

	:global(.type-picker-command) {
		border-radius: var(--radius-md);
	}
</style>
