<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import * as Command from '$lib/components/ui/command';
	import * as Popover from '$lib/components/ui/popover';
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import { PAGE_ICON_CATEGORIES, getPageIcon } from '../page-icons';

	interface Props {
		pageId: number;
		pageTitle: string;
		iconKey: string;
		open: boolean;
		onOpenChange: (pageId: number, open: boolean) => void;
		onIconChange: (pageId: number, iconKey: string) => void;
		onIconReset: (pageId: number) => void;
		onStopCanvasEvent: (event: Event) => void;
	}

	let {
		pageId,
		pageTitle,
		iconKey,
		open,
		onOpenChange,
		onIconChange,
		onIconReset,
		onStopCanvasEvent
	}: Props = $props();
</script>

<Popover.Root {open} onOpenChange={(nextOpen) => onOpenChange(pageId, nextOpen)}>
	<Popover.Trigger data-page-header-control>
		{#snippet child({ props })}
			<Button
				{...props}
				type="button"
				variant="outline"
				size="icon-lg"
				class="page-icon-trigger shrink-0 border-none"
				aria-label={`Change icon for ${pageTitle || `page ${pageId}`}`}
				onpointerdown={onStopCanvasEvent}
				onpointermove={onStopCanvasEvent}
				onpointerup={onStopCanvasEvent}
				onpointercancel={onStopCanvasEvent}
			>
				{#key iconKey}
					<HugeiconsIcon icon={getPageIcon(iconKey)} strokeWidth={2} aria-hidden="true" />
				{/key}
			</Button>
		{/snippet}
	</Popover.Trigger>
	<Popover.Content
		align="start"
		class="page-icon-picker"
		data-page-header-control
		onpointerdown={onStopCanvasEvent}
		onpointermove={onStopCanvasEvent}
		onpointerup={onStopCanvasEvent}
		onpointercancel={onStopCanvasEvent}
	>
		<div class="icon-picker-header">
			<span class="icon-picker-title">Icons</span>
			<Button
				type="button"
				variant="ghost"
				size="xs"
				onclick={() => onIconReset(pageId)}
				onpointerdown={onStopCanvasEvent}
			>
				Remove
			</Button>
		</div>
		<Command.Root class="icon-picker-command">
			<Command.Input placeholder="Search icons..." />
			<Command.List>
				<Command.Empty>No icons found.</Command.Empty>
				{#each PAGE_ICON_CATEGORIES as category (category.label)}
					<Command.Group heading={category.label}>
						{#each category.options as option (option.key)}
							<Command.Item
								value={`${option.label} ${option.key} ${category.label}`}
								onSelect={() => onIconChange(pageId, option.key)}
								onclick={() => onIconChange(pageId, option.key)}
							>
								<HugeiconsIcon icon={getPageIcon(option.key)} strokeWidth={2} aria-hidden="true" />
								<span>{option.label}</span>
							</Command.Item>
						{/each}
					</Command.Group>
				{/each}
			</Command.List>
		</Command.Root>
	</Popover.Content>
</Popover.Root>

<style>
	:global(.page-icon-picker) {
		width: 17rem;
		gap: 0.25rem;
		padding: 0.375rem;
	}

	.icon-picker-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		padding: 0 0.25rem 0.125rem 0.5rem;
	}

	.icon-picker-title {
		color: var(--foreground);
		font-size: 0.75rem;
		font-weight: 600;
		line-height: 1;
	}

	:global(.icon-picker-command) {
		border-radius: var(--radius-md);
	}
</style>
