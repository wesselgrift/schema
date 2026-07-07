<script lang="ts">
	import { Handle, Position, useSvelteFlow, type NodeProps } from '@xyflow/svelte';
	import type { Attachment } from 'svelte/attachments';
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import { UnfoldMoreIcon } from '@hugeicons/core-free-icons';
	import { Button } from '$lib/components/ui/button';
	import { Textarea } from '$lib/components/ui/textarea';
	import ItemTypePicker from './ItemTypePicker.svelte';
	import ItemDetailDialog from './ItemDetailDialog.svelte';
	import type { ItemType } from '../item-types';
	import {
		PAGE_BOTTOM_HANDLE,
		PAGE_SOURCE_HANDLE,
		PAGE_TARGET_HANDLE,
		PAGE_TOP_HANDLE,
		type ItemFlowNode
	} from '../flow';

	type FocusableItemFlowNode = ItemFlowNode & {
		data: ItemFlowNode['data'] & {
			focusTitle?: boolean;
		};
	};

	let { id, data, selected = false }: NodeProps<FocusableItemFlowNode> = $props();

	const { updateNodeData } = useSvelteFlow<FocusableItemFlowNode>();
	const HANDLE_CLASS =
		"h-8! w-8! border-0! bg-transparent! opacity-0 shadow-none! transition-opacity before:pointer-events-none before:absolute before:left-1/2 before:top-1/2 before:h-3.5 before:w-3.5 before:-translate-x-1/2 before:-translate-y-1/2 before:rounded-full before:border-2 before:border-white before:bg-blue-500 before:shadow-sm before:content-[''] hover:opacity-100 group-hover/item-card:opacity-100 group-focus-within/item-card:opacity-100 [&.connectingfrom]:opacity-100 [&.connectingto]:opacity-100 [&.valid]:opacity-100";

	let typePickerOpen = $state(false);
	let detailOpen = $state(false);

	function stopCanvasEvent(event: Event) {
		event.stopPropagation();
	}

	function openDetail(event: Event) {
		event.stopPropagation();
		detailOpen = true;
	}

	function handleEditableKeydown(event: KeyboardEvent & { currentTarget: HTMLInputElement | HTMLTextAreaElement }) {
		event.stopPropagation();

		if (event.key === 'Escape') {
			event.preventDefault();
			event.currentTarget.blur();
		}
	}

	function handleTitleInput(event: Event & { currentTarget: HTMLInputElement }) {
		updateNodeData(id, { title: event.currentTarget.value });
	}

	function handleDescriptionInput(event: Event & { currentTarget: HTMLTextAreaElement }) {
		updateNodeData(id, { description: event.currentTarget.value });
	}

	function handleTypeChange(_: number, type: ItemType) {
		updateNodeData(id, { type });
		typePickerOpen = false;
	}

	function titleFocusAttachment(shouldFocus: boolean | undefined): Attachment<HTMLInputElement> {
		return (element) => {
			if (!shouldFocus) return;

			let disposed = false;
			let timeout: ReturnType<typeof setTimeout> | undefined;
			let attempts = 0;

			function tryFocus() {
				if (disposed) return;

				attempts += 1;
				element.focus({ preventScroll: true });
				element.select();

				if (document.activeElement === element || attempts >= 5) {
					updateNodeData(id, { focusTitle: false });
					return;
				}

				timeout = setTimeout(tryFocus, 25);
			}

			const frame = requestAnimationFrame(() => {
				tryFocus();
			});

			return () => {
				disposed = true;
				cancelAnimationFrame(frame);
				clearTimeout(timeout);
			};
		};
	}
</script>

<div
	class={[
		'item-card group/item-card w-[270px] overflow-visible rounded-lg border-2 border-border bg-card shadow-[var(--shadow-card)]',
		{
			'selected border-blue-500!': selected
		}
	]}
>
	<div
		class={[
			'item-header-row flex min-h-10 w-full cursor-grab touch-none items-center gap-0.5 rounded-t-md px-1 select-none active:cursor-grabbing',
			{
				'bg-muted/80': selected,
				'bg-muted/50': !selected
			}
		]}
	>
		<ItemTypePicker
			itemId={data.itemId}
			itemTitle={data.title}
			currentType={data.type}
			open={typePickerOpen}
			onOpenChange={(_, open) => {
				typePickerOpen = open;
			}}
			onTypeChange={handleTypeChange}
			onStopCanvasEvent={stopCanvasEvent}
		/>
		<input
			{@attach titleFocusAttachment(data.focusTitle)}
			class="item-title-input nodrag nopan h-8 w-auto min-w-0 flex-[0_1_auto] cursor-text rounded-sm border-0 bg-transparent p-0 text-[0.78rem] leading-none font-medium text-secondary-foreground select-text focus:outline-none"
			aria-label={`Item ${data.itemId} title`}
			size={Math.max(data.title.length, 4)}
			value={data.title}
			onpointerdown={stopCanvasEvent}
			onpointermove={stopCanvasEvent}
			onpointerup={stopCanvasEvent}
			onpointercancel={stopCanvasEvent}
			onkeydown={handleEditableKeydown}
			oninput={handleTitleInput}
		/>
		<Button
			type="button"
			variant="outline"
			size="icon-lg"
			data-item-header-control
			class="item-expand-trigger nodrag nopan ml-auto shrink-0 border-none opacity-0 text-muted-foreground transition-[opacity,color] group-hover/item-card:opacity-100 group-hover/item-card:text-muted-foreground group-focus-within/item-card:opacity-100 group-focus-within/item-card:text-muted-foreground hover:text-foreground"
			aria-label={`Expand ${data.title || `item ${data.itemId}`}`}
			onpointerdown={stopCanvasEvent}
			onpointermove={stopCanvasEvent}
			onpointerup={stopCanvasEvent}
			onpointercancel={stopCanvasEvent}
			onkeydown={stopCanvasEvent}
			onclick={openDetail}
		>
			<HugeiconsIcon icon={UnfoldMoreIcon} strokeWidth={2} aria-hidden="true" />
		</Button>
	</div>

	<div class="item-content grid min-h-24 gap-[10px] bg-transparent p-3 text-card-foreground select-none">
		<Textarea
			value={data.description}
			placeholder="Describe this item"
			aria-label={`Description for ${data.title || `item ${data.itemId}`}`}
			class="nodrag nopan max-h-30 min-h-24 resize-none overflow-y-auto border-0 bg-transparent p-0 text-[0.78rem] leading-[1.35] shadow-none placeholder:text-muted-foreground focus-visible:border-transparent focus-visible:ring-0"
			oninput={handleDescriptionInput}
			onpointerdown={stopCanvasEvent}
			onpointermove={stopCanvasEvent}
			onpointerup={stopCanvasEvent}
			onpointercancel={stopCanvasEvent}
			onkeydown={handleEditableKeydown}
		/>
	</div>

	<Handle
		id={PAGE_TARGET_HANDLE}
		type="source"
		position={Position.Left}
		class={`${HANDLE_CLASS} left-[-12px]!`}
	/>
	<Handle
		id={PAGE_TOP_HANDLE}
		type="source"
		position={Position.Top}
		class={`${HANDLE_CLASS} top-[-12px]!`}
	/>
	<Handle
		id={PAGE_SOURCE_HANDLE}
		type="source"
		position={Position.Right}
		class={`${HANDLE_CLASS} right-[-12px]!`}
	/>
	<Handle
		id={PAGE_BOTTOM_HANDLE}
		type="source"
		position={Position.Bottom}
		class={`${HANDLE_CLASS} bottom-[-12px]!`}
	/>
</div>

<ItemDetailDialog
	bind:open={detailOpen}
	itemId={data.itemId}
	title={data.title}
	description={data.description}
	type={data.type}
	onTitleChange={(value) => updateNodeData(id, { title: value })}
	onDescriptionChange={(value) => updateNodeData(id, { description: value })}
	onTypeChange={(type) => updateNodeData(id, { type })}
/>
