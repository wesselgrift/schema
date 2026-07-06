<script lang="ts">
	import { Handle, Position, useSvelteFlow, type NodeProps } from '@xyflow/svelte';
	import type { Attachment } from 'svelte/attachments';
	import { Textarea } from '$lib/components/ui/textarea';
	import PageIconPicker from './PageIconPicker.svelte';
	import {
		PAGE_BOTTOM_HANDLE,
		PAGE_SOURCE_HANDLE,
		PAGE_TARGET_HANDLE,
		PAGE_TOP_HANDLE,
		type PageFlowNode
	} from '../flow';

	type FocusablePageFlowNode = PageFlowNode & {
		data: PageFlowNode['data'] & {
			focusTitle?: boolean;
		};
	};

	let { id, data, selected = false }: NodeProps<FocusablePageFlowNode> = $props();

	const { updateNodeData } = useSvelteFlow<FocusablePageFlowNode>();
	const HANDLE_CLASS =
		"h-8! w-8! border-0! bg-transparent! opacity-0 shadow-none! transition-opacity before:pointer-events-none before:absolute before:left-1/2 before:top-1/2 before:h-3.5 before:w-3.5 before:-translate-x-1/2 before:-translate-y-1/2 before:rounded-full before:border-2 before:border-white before:bg-blue-500 before:shadow-sm before:content-[''] hover:opacity-100 group-hover/page-card:opacity-100 group-focus-within/page-card:opacity-100 [&.connectingfrom]:opacity-100 [&.connectingto]:opacity-100 [&.valid]:opacity-100";

	let iconPickerOpen = $state(false);

	function stopCanvasEvent(event: Event) {
		event.stopPropagation();
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

	function handleIconChange(_: number, iconKey: string) {
		updateNodeData(id, { icon: iconKey });
		iconPickerOpen = false;
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
		'page-card group/page-card w-[270px] overflow-visible rounded-lg border-2 border-border bg-card shadow-[var(--shadow-card)]',
		{
			'selected border-blue-500!': selected
		}
	]}
>
	<div
		class={[
			'page-header-row flex min-h-10 w-full cursor-grab touch-none items-center gap-0.5 rounded-t-md px-1 select-none active:cursor-grabbing',
			{
				'bg-muted/80': selected,
				'bg-muted/50': !selected
			}
		]}
	>
		<PageIconPicker
			pageId={data.pageId}
			pageTitle={data.title}
			iconKey={data.icon}
			open={iconPickerOpen}
			onOpenChange={(_, open) => {
				iconPickerOpen = open;
			}}
			onIconChange={handleIconChange}
			onStopCanvasEvent={stopCanvasEvent}
		/>
		<input
			{@attach titleFocusAttachment(data.focusTitle)}
			class="page-title-input nodrag nopan h-8 w-auto min-w-0 flex-[0_1_auto] cursor-text rounded-sm border-0 bg-transparent p-0 text-[0.78rem] leading-none font-medium text-secondary-foreground select-text focus:outline-none"
			aria-label={`Page ${data.pageId} title`}
			size={Math.max(data.title.length, 4)}
			value={data.title}
			onpointerdown={stopCanvasEvent}
			onpointermove={stopCanvasEvent}
			onpointerup={stopCanvasEvent}
			onpointercancel={stopCanvasEvent}
			onkeydown={handleEditableKeydown}
			oninput={handleTitleInput}
		/>
	</div>

	<div class="page-content grid min-h-24 gap-[10px] bg-transparent p-3 text-card-foreground select-none">
		<Textarea
			value={data.description}
			placeholder="Describe this page"
			aria-label={`Description for ${data.title || `page ${data.pageId}`}`}
			class="nodrag nopan min-h-24 resize-none border-0 bg-transparent p-0 text-[0.78rem] leading-[1.35] shadow-none placeholder:text-muted-foreground focus-visible:border-transparent focus-visible:ring-0"
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
