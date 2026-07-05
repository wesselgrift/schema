<script lang="ts">
	import { NodeResizer, NodeToolbar, Position, useSvelteFlow, type NodeProps } from '@xyflow/svelte';
	import type { Attachment } from 'svelte/attachments';
	import { MIN_SECTION_SIZE, type SectionFlowNode } from '../flow';

	type FocusableSectionFlowNode = SectionFlowNode & {
		data: SectionFlowNode['data'] & {
			focusTitle?: boolean;
		};
	};

	let { id, data, selected = false }: NodeProps<FocusableSectionFlowNode> = $props();

	const { updateNode, updateNodeData } = useSvelteFlow<FocusableSectionFlowNode>();

	let isActive = $derived(selected || data.isDropTarget);

	function stopCanvasEvent(event: Event) {
		event.stopPropagation();
	}

	function handleTitleInput(event: Event & { currentTarget: HTMLInputElement }) {
		updateNodeData(id, { title: event.currentTarget.value });
	}

	function handleTitleKeydown(event: KeyboardEvent & { currentTarget: HTMLInputElement }) {
		event.stopPropagation();

		if (event.key === 'Escape') {
			event.preventDefault();
			event.currentTarget.blur();
		}
	}

	function syncSectionSize({ width, height }: { width: number; height: number }) {
		updateNodeData(id, { width, height });
		updateNode(id, {
			style: `width: ${width}px; height: ${height}px;`
		});
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

<NodeToolbar nodeId={id} position={Position.Top} offset={10} isVisible>
	<input
		{@attach titleFocusAttachment(data.focusTitle)}
		class="nodrag nopan max-w-56 rounded-md border border-border bg-background px-2 py-1 text-xs font-medium text-foreground shadow-sm outline-none select-text focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20"
		aria-label={`Section ${data.sectionId} title`}
		value={data.title}
		onpointerdown={stopCanvasEvent}
		onpointermove={stopCanvasEvent}
		onpointerup={stopCanvasEvent}
		onpointercancel={stopCanvasEvent}
		onkeydown={handleTitleKeydown}
		oninput={handleTitleInput}
	/>
</NodeToolbar>

<NodeResizer
	minWidth={MIN_SECTION_SIZE.width}
	minHeight={MIN_SECTION_SIZE.height}
	isVisible={selected}
	lineClass="border-blue-400"
	handleClass="h-2.5! w-2.5! border-blue-400! bg-background!"
	onResize={(_, params) => syncSectionSize(params)}
	onResizeEnd={(_, params) => syncSectionSize(params)}
/>

<div
	class={[
		'section-flow-node h-full w-full rounded-2xl border-2 border-dashed bg-muted/20 transition-colors',
		{
			'border-blue-400 bg-blue-50/60 shadow-[0_0_0_1px_hsl(217_91%_60%_/_0.12)]': isActive,
			'border-border/80': !isActive
		}
	]}
	aria-label={`Section ${data.title}`}
></div>
