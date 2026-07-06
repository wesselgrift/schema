<script lang="ts">
	import { tick } from 'svelte';
	import {
		BaseEdge,
		EdgeLabel,
		EdgeReconnectAnchor,
		Position,
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

	const { updateEdge, getNodes, updateNode } = useSvelteFlow<Node, PageFlowEdge>();
	const HANDLE_OFFSET = 12;
	const CARD_EDGE_OVERLAP = 16;
	const EDGE_ENDPOINT_INSET = HANDLE_OFFSET + CARD_EDGE_OVERLAP;
	const LABEL_POSITION_SAMPLES = 96;
	const LABEL_DRAG_THRESHOLD = 4;
	let labelTextarea = $state<HTMLTextAreaElement | undefined>();
	let interactionPath = $state<SVGPathElement | undefined>();
	let measurePath: SVGPathElement | undefined;
	let isEditing = $state(false);
	let reconnecting = $state(false);
	let dragPointerId: number | undefined;
	let labelDragStart: { x: number; y: number } | undefined;
	let hasDraggedLabel = false;
	let labelWasSelectedOnPointerdown = false;

	function getCardEdgePoint(x: number, y: number, position: Position) {
		switch (position) {
			case Position.Left:
				return { x: x + EDGE_ENDPOINT_INSET, y };
			case Position.Right:
				return { x: x - EDGE_ENDPOINT_INSET, y };
			case Position.Top:
				return { x, y: y + EDGE_ENDPOINT_INSET };
			case Position.Bottom:
				return { x, y: y - EDGE_ENDPOINT_INSET };
		}
	}

	let sourcePoint = $derived(getCardEdgePoint(sourceX, sourceY, sourcePosition));
	let targetPoint = $derived(getCardEdgePoint(targetX, targetY, targetPosition));

	let bezierPath = $derived(
		getBezierPath({
			sourceX: sourcePoint.x,
			sourceY: sourcePoint.y,
			targetX: targetPoint.x,
			targetY: targetPoint.y,
			sourcePosition,
			targetPosition
		})
	);
	let path = $derived(bezierPath[0]);
	let fallbackLabelX = $derived(bezierPath[1]);
	let fallbackLabelY = $derived(bezierPath[2]);
	let labelPosition = $derived(clampLabelPosition(data?.labelPosition ?? 0.5));
	let labelPoint = $derived(getPathPoint(path, labelPosition));

	function clampLabelPosition(position: number) {
		return Math.min(Math.max(position, 0), 1);
	}

	function getPathLength(pathElement: SVGPathElement): number | undefined {
		try {
			const totalLength = pathElement.getTotalLength();
			return Number.isFinite(totalLength) && totalLength > 0 ? totalLength : undefined;
		} catch {
			return undefined;
		}
	}

	function getMeasurePath(): SVGPathElement | undefined {
		if (typeof document === 'undefined') return undefined;

		measurePath ??= document.createElementNS('http://www.w3.org/2000/svg', 'path');
		return measurePath;
	}

	function getPathPoint(pathData: string, position: number) {
		const measure = getMeasurePath();
		if (!measure || pathData === '') {
			return { x: fallbackLabelX, y: fallbackLabelY };
		}

		measure.setAttribute('d', pathData);
		const totalLength = getPathLength(measure);
		if (!totalLength) {
			return { x: fallbackLabelX, y: fallbackLabelY };
		}

		const point = measure.getPointAtLength(totalLength * position);
		return { x: point.x, y: point.y };
	}

	function clearNodeSelection() {
		for (const node of getNodes()) {
			if (node.selected) {
				updateNode(node.id, { selected: false });
			}
		}
	}

	function selectLabel() {
		clearNodeSelection();
		updateEdge(id, (edge) => ({
			...edge,
			selected: false,
			data: {
				...edge.data,
				labelSelected: true
			}
		}));
	}

	async function enterLabelEditMode(event: Event) {
		event.preventDefault();
		event.stopPropagation();
		isEditing = true;
		await tick();
		labelTextarea?.focus({ preventScroll: true });
		labelTextarea?.select();
	}

	function handleLabelWrapperKeydown(event: KeyboardEvent) {
		if (event.key !== 'Enter' && event.key !== ' ') return;

		event.preventDefault();
		event.stopPropagation();
		selectLabel();
	}

	function addLabel(event: Event) {
		event.stopPropagation();

		if (data?.label !== undefined) return;

		updateEdge(id, (edge) => ({
			...edge,
			data: {
				...edge.data,
				label: '',
				labelPosition: 0.5
			}
		}));
		isEditing = true;
	}

	let labelRows = $derived((data?.label ?? '').split('\n').length);
	let isLabelSelected = $derived(data?.labelSelected || selected);

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
			isEditing = false;
			event.currentTarget.blur();
		}
	}

	function handleLabelBlur(event: FocusEvent & { currentTarget: HTMLTextAreaElement }) {
		isEditing = false;
		event.currentTarget.setSelectionRange(0, 0);
		window.getSelection()?.removeAllRanges();
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

	function trackInteractionPath(element: SVGPathElement) {
		interactionPath = element;

		return () => {
			if (interactionPath === element) {
				interactionPath = undefined;
			}
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

	function getSvgPoint(event: PointerEvent) {
		const svg = interactionPath?.ownerSVGElement;
		const screenMatrix = svg?.getScreenCTM();
		if (!svg || !screenMatrix) return undefined;

		const point = svg.createSVGPoint();
		point.x = event.clientX;
		point.y = event.clientY;

		return point.matrixTransform(screenMatrix.inverse());
	}

	function getNearestPathPosition(point: DOMPoint) {
		const pathElement = interactionPath;
		if (!pathElement) return labelPosition;

		const totalLength = getPathLength(pathElement);
		if (!totalLength) return labelPosition;

		let nearestPosition = labelPosition;
		let nearestDistance = Infinity;

		for (let sample = 0; sample <= LABEL_POSITION_SAMPLES; sample += 1) {
			const position = sample / LABEL_POSITION_SAMPLES;
			const pathPoint = pathElement.getPointAtLength(totalLength * position);
			const distance = (pathPoint.x - point.x) ** 2 + (pathPoint.y - point.y) ** 2;

			if (distance < nearestDistance) {
				nearestDistance = distance;
				nearestPosition = position;
			}
		}

		return nearestPosition;
	}

	function updateLabelPositionFromPointer(event: PointerEvent) {
		const point = getSvgPoint(event);
		if (!point) return;

		const nextPosition = getNearestPathPosition(point);

		updateEdge(id, (edge) => ({
			...edge,
			selected: false,
			data: {
				...edge.data,
				labelPosition: nextPosition,
				labelSelected: true
			}
		}));
	}

	function resetLabelDrag() {
		dragPointerId = undefined;
		labelDragStart = undefined;
		hasDraggedLabel = false;
		labelWasSelectedOnPointerdown = false;
	}

	function releaseLabelPointerCapture(element: HTMLElement, pointerId: number) {
		if (element.hasPointerCapture(pointerId)) {
			element.releasePointerCapture(pointerId);
		}
	}

	function handleLabelPointerdown(event: PointerEvent & { currentTarget: HTMLElement }) {
		event.stopPropagation();
		if (isEditing) return;

		event.preventDefault();

		labelWasSelectedOnPointerdown = Boolean(data?.labelSelected || selected);
		if (!labelWasSelectedOnPointerdown) {
			selectLabel();
		} else {
			clearNodeSelection();
		}

		dragPointerId = event.pointerId;
		labelDragStart = { x: event.clientX, y: event.clientY };
		hasDraggedLabel = false;
		event.currentTarget.setPointerCapture(event.pointerId);
	}

	function handleLabelPointermove(event: PointerEvent & { currentTarget: HTMLElement }) {
		event.stopPropagation();

		if (isEditing || dragPointerId !== event.pointerId) return;

		event.preventDefault();
		if (!hasDraggedLabel) {
			const distanceX = event.clientX - (labelDragStart?.x ?? event.clientX);
			const distanceY = event.clientY - (labelDragStart?.y ?? event.clientY);
			if (distanceX ** 2 + distanceY ** 2 < LABEL_DRAG_THRESHOLD ** 2) return;

			hasDraggedLabel = true;
		}

		updateLabelPositionFromPointer(event);
	}

	function handleLabelPointerup(event: PointerEvent & { currentTarget: HTMLElement }) {
		event.stopPropagation();

		if (dragPointerId !== event.pointerId) return;

		const shouldEdit = labelWasSelectedOnPointerdown && !hasDraggedLabel;
		releaseLabelPointerCapture(event.currentTarget, event.pointerId);
		resetLabelDrag();

		if (shouldEdit) {
			void enterLabelEditMode(event);
		}
	}

	function handleLabelPointercancel(event: PointerEvent & { currentTarget: HTMLElement }) {
		event.stopPropagation();

		if (dragPointerId === event.pointerId) {
			releaseLabelPointerCapture(event.currentTarget, event.pointerId);
			resetLabelDrag();
		}
	}

	function handleLabelClick(event: Event) {
		event.stopPropagation();
		selectLabel();
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
		'page-flow-edge stroke-2! transition-colors stroke-gray-300',
		{
			'stroke-blue-500!': selected,
			'opacity-0': reconnecting
		}
	]}
/>

{#if selected}
	<EdgeReconnectAnchor
		bind:reconnecting
		type="source"
		position={{ x: sourcePoint.x, y: sourcePoint.y }}
	/>
	<EdgeReconnectAnchor
		bind:reconnecting
		type="target"
		position={{ x: targetPoint.x, y: targetPoint.y }}
	/>
{/if}

<path
	d={path}
	fill="none"
	stroke="transparent"
	stroke-width={interactionWidth ?? 20}
	class="page-flow-edge-interaction"
	role="button"
	tabindex="0"
	aria-label="Add connector label"
	{@attach trackInteractionPath}
	{@attach labelInteractionAttachment}
/>

{#if data?.label !== undefined}
	<EdgeLabel class="bg-transparent" x={labelPoint.x} y={labelPoint.y} selectEdgeOnClick>
		<div
			class="page-flow-label nodrag nopan p-0 flex"
			data-edge-id={id}
			role="button"
			tabindex="0"
			aria-label="Select connector label"
			onpointerdown={handleLabelPointerdown}
			onpointermove={handleLabelPointermove}
			onpointerup={handleLabelPointerup}
			onpointercancel={handleLabelPointercancel}
			onlostpointercapture={handleLabelPointercancel}
			onclick={handleLabelClick}
			ondblclick={enterLabelEditMode}
			onkeydown={handleLabelWrapperKeydown}
		>
			<textarea
				{@attach trackLabelTextarea}
				{@attach labelFocusAttachment(data.label === '' && isEditing)}
				value={data.label}
				placeholder="Label"
				aria-label="Flow label"
				rows={labelRows}
				readonly={!isEditing}
				class={[
					'page-flow-label-input nodrag nopan resize-none overflow-hidden rounded-lg border-2 border-transparent bg-gray-200 px-2 py-1 text-xs text-black shadow-none placeholder:text-muted-foreground focus-visible:outline-none',
					{
						'bg-white border-blue-500!': isLabelSelected
					}
				]}
				oninput={handleLabelInput}
				onkeydown={handleLabelKeydown}
				onblur={handleLabelBlur}
				onclick={handleLabelClick}
				ondblclick={enterLabelEditMode}
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
	:global(.svelte-flow__edge:has(.page-flow-edge-interaction:focus-visible) .page-flow-edge),
	:global(.svelte-flow__edge.selected .page-flow-edge) {
		stroke: var(--color-blue-500);
	}

	:global(.svelte-flow__edge.selected .page-flow-label-input) {
		border-color: var(--color-blue-500);
	}

	.page-flow-label-input {
		cursor: text;
		field-sizing: content;
		max-width: 15rem;
	}

	.page-flow-label,
	.page-flow-label-input:read-only {
		cursor: pointer;
	}
</style>
