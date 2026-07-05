<script lang="ts">
	import {
		BaseEdge,
		EdgeLabel,
		getBezierPath,
		useSvelteFlow,
		type EdgeProps,
		type Node
	} from '@xyflow/svelte';
	import type { Attachment } from 'svelte/attachments';
	import type { PageFlowEdge } from '../flow';

	let {
		id,
		sourceX,
		sourceY,
		targetX,
		targetY,
		sourcePosition,
		targetPosition,
		markerStart,
		markerEnd,
		interactionWidth,
		data,
		selected = false,
		style
	}: EdgeProps<PageFlowEdge> = $props();

	const { updateEdge } = useSvelteFlow<Node, PageFlowEdge>();
	let labelTextarea = $state<HTMLTextAreaElement | undefined>();

	let [path, labelX, labelY] = $derived(
		getBezierPath({
			sourceX,
			sourceY,
			targetX,
			targetY,
			sourcePosition,
			targetPosition
		})
	);

	function stopCanvasEvent(event: Event) {
		event.stopPropagation();
	}

	function selectLabel(event: Event) {
		event.stopPropagation();

		updateEdge(id, (edge) => ({
			...edge,
			selected: false,
			data: {
				...edge.data,
				labelSelected: true
			}
		}));
	}

	function focusLabel(event: Event) {
		event.preventDefault();
		event.stopPropagation();
		labelTextarea?.focus({ preventScroll: true });
	}

	function handleLabelWrapperKeydown(event: KeyboardEvent) {
		if (event.key !== 'Enter' && event.key !== ' ') return;

		focusLabel(event);
	}

	function addLabel(event: Event) {
		event.stopPropagation();

		if (data?.label !== undefined) return;

		updateEdge(id, (edge) => ({
			...edge,
			data: {
				...edge.data,
				label: ''
			}
		}));
	}

	let labelRows = $derived((data?.label ?? '').split('\n').length);

	function handleLabelInput(event: Event & { currentTarget: HTMLTextAreaElement }) {
		updateEdge(id, (edge) => ({
			...edge,
			data: {
				...edge.data,
				label: event.currentTarget.value
			}
		}));
	}

	function handleLabelKeydown(event: KeyboardEvent & { currentTarget: HTMLTextAreaElement }) {
		event.stopPropagation();

		if (event.key === 'Escape') {
			event.preventDefault();
			event.currentTarget.blur();
		}
	}

	function handleInteractionKeydown(event: KeyboardEvent) {
		if (event.key !== 'Enter' && event.key !== ' ') return;

		event.preventDefault();
		addLabel(event);
	}

	function labelInteractionAttachment(element: SVGPathElement) {
		element.addEventListener('dblclick', addLabel);
		element.addEventListener('keydown', handleInteractionKeydown);

		return () => {
			element.removeEventListener('dblclick', addLabel);
			element.removeEventListener('keydown', handleInteractionKeydown);
		};
	}

	function labelFocusAttachment(shouldFocus: boolean): Attachment<HTMLTextAreaElement> | undefined {
		if (!shouldFocus) return undefined;

		return (element) => {
			const frame = requestAnimationFrame(() => {
				element.focus({ preventScroll: true });
				element.select();
			});

			return () => cancelAnimationFrame(frame);
		};
	}

	function trackLabelTextarea(element: HTMLTextAreaElement) {
		labelTextarea = element;

		return () => {
			if (labelTextarea === element) {
				labelTextarea = undefined;
			}
		};
	}
</script>

<BaseEdge
	{id}
	{path}
	{markerStart}
	{markerEnd}
	interactionWidth={0}
	{style}
	class={[
		'page-flow-edge stroke-2! transition-colors',
		{
			'stroke-blue-500!': selected
		}
	]}
/>

<path
	d={path}
	fill="none"
	stroke="transparent"
	stroke-width={interactionWidth ?? 20}
	class="page-flow-edge-interaction"
	role="button"
	tabindex="0"
	aria-label="Add connector label"
	{@attach labelInteractionAttachment}
/>

{#if data?.label !== undefined}
	<EdgeLabel x={labelX} y={labelY} selectEdgeOnClick>
		<div
			class="page-flow-label nodrag nopan"
			data-edge-id={id}
			role="button"
			tabindex="0"
			aria-label="Select connector label"
			onpointerdown={selectLabel}
			onclick={selectLabel}
			ondblclick={focusLabel}
			onkeydown={handleLabelWrapperKeydown}
		>
			<textarea
				{@attach trackLabelTextarea}
				{@attach labelFocusAttachment(data.label === '')}
				value={data.label}
				placeholder="Label"
				aria-label="Flow label"
				rows={labelRows}
				class={[
					'page-flow-label-input nodrag nopan resize-none overflow-hidden rounded-lg border-0 bg-muted px-2 py-1 text-xs text-black shadow-none placeholder:text-muted-foreground focus-visible:outline-none',
					{
						'bg-blue-500! text-white! placeholder:text-white/70!': data.labelSelected
					}
				]}
				oninput={handleLabelInput}
				onkeydown={handleLabelKeydown}
				onpointerdown={selectLabel}
				onpointermove={stopCanvasEvent}
				onpointerup={stopCanvasEvent}
				onpointercancel={stopCanvasEvent}
				onclick={selectLabel}
				ondblclick={focusLabel}
			></textarea>
		</div>
	</EdgeLabel>
{/if}

<style>
	.page-flow-edge-interaction {
		pointer-events: stroke;
	}

	.page-flow-edge-interaction:focus,
	.page-flow-edge-interaction:focus-visible,
	:global(.svelte-flow__edge:focus),
	:global(.svelte-flow__edge:focus-visible) {
		outline: none;
	}

	:global(.svelte-flow__edge:has(.page-flow-edge-interaction:hover) .page-flow-edge),
	:global(.svelte-flow__edge:has(.page-flow-edge-interaction:focus-visible) .page-flow-edge) {
		stroke: var(--color-blue-500);
	}

	.page-flow-label-input {
		field-sizing: content;
		min-width: 3rem;
		max-width: 15rem;
	}
</style>
