<script lang="ts">
	import { Handle, Position, useSvelteFlow, type NodeProps } from '@xyflow/svelte';
	import type { Attachment } from 'svelte/attachments';
	import { Textarea } from '$lib/components/ui/textarea';
	import PageIconPicker from './PageIconPicker.svelte';
	import { PAGE_SOURCE_HANDLE, PAGE_TARGET_HANDLE, type PageFlowNode } from '../flow';

	type FocusablePageFlowNode = PageFlowNode & {
		data: PageFlowNode['data'] & {
			focusTitle?: boolean;
		};
	};

	let { id, data, selected = false }: NodeProps<FocusablePageFlowNode> = $props();

	const { updateNodeData } = useSvelteFlow<FocusablePageFlowNode>();

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

	function handleIconReset() {
		updateNodeData(id, { icon: 'FileEmpty01Icon' });
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
		'page-card group/page-card w-[270px] overflow-hidden rounded-lg border-2 border-border bg-card shadow-[var(--shadow-card)]',
		{
			'selected border-blue-400!': selected
		}
	]}
>
	<div
		class={[
			'page-header-row flex min-h-10 w-full cursor-grab touch-none items-center gap-0.5 px-1 select-none active:cursor-grabbing',
			{
				'bg-blue-50': selected,
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
			onIconReset={handleIconReset}
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
		type="target"
		position={Position.Left}
		class="h-3.5! w-3.5! border-2! border-white! bg-blue-500! opacity-0 shadow-sm transition-opacity group-hover/page-card:opacity-100 group-focus-within/page-card:opacity-100 [&.connectingfrom]:opacity-100 [&.connectingto]:opacity-100 [&.valid]:opacity-100"
	/>
	<Handle
		id={PAGE_SOURCE_HANDLE}
		type="source"
		position={Position.Right}
		class="h-3.5! w-3.5! border-2! border-white! bg-blue-500! opacity-0 shadow-sm transition-opacity group-hover/page-card:opacity-100 group-focus-within/page-card:opacity-100 [&.connectingfrom]:opacity-100 [&.connectingto]:opacity-100 [&.valid]:opacity-100"
	/>
</div>
