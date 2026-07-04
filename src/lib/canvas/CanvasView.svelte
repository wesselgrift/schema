<script lang="ts">
	import {
		screenToWorld,
		worldToScreen,
		zoomAtPoint,
		type Point,
		type Viewport
	} from './viewport';
	import { createTextNode, moveTextNode, type TextNode } from './nodes';
	import { createFlowEdge, hasFlowEdge, type FlowEdge } from './edges';
	import { findNodesInRect, normalizeRect, type SelectionRect } from './selection';

	type DragState = {
		pointerId: number;
		start: Point;
		last: Point;
		viewportStart: Viewport;
		hasDragged: boolean;
	};

	type NoteDragState = {
		pointerId: number;
		nodeId: number;
		startScreen: Point;
		startWorld: Point;
	};

	type SelectionNodeStart = Point & {
		id: number;
	};

	type SelectionDragState = {
		pointerId: number;
		startScreen: Point;
		startWorld: Point;
		nodes: SelectionNodeStart[];
		hasDragged: boolean;
	};

	type MarqueeDragState = {
		pointerId: number;
		startScreen: Point;
		start: Point;
		current: Point;
		hasDragged: boolean;
	};

	type AddClickState = {
		pointerId: number;
		start: Point;
		hasDragged: boolean;
	};

	type Tool = 'select' | 'add-note' | 'pan' | 'connect';

	const GRID_SIZE = 32;
	const NOTE_WIDTH = 180;
	const NOTE_MIN_HEIGHT = 96;
	const DRAG_THRESHOLD = 4;
	const ZOOM_SPEED = 0.0015;
	const KEYBOARD_PAN_STEP = 48;
	const INITIAL_VIEWPORT: Viewport = { x: 0, y: 0, scale: 1 };

	let viewport: Viewport = $state({ ...INITIAL_VIEWPORT });
	let textNodes: TextNode[] = $state([]);
	let flowEdges: FlowEdge[] = $state([]);
	let pendingFocusNodeId: number | null = $state(null);
let activeTool = $state<Tool>('select');
	let isSpacePanning = $state(false);
	let nextNodeId = 1;
	let nextEdgeId = 1;
	let pendingConnectionNodeId: number | null = $state(null);
	let selectedNodeIds = $state<number[]>([]);
	let selectionDrag = $state<SelectionDragState | null>(null);
	let marqueeDrag = $state<MarqueeDragState | null>(null);
	let drag: DragState | null = null;
	let addClick: AddClickState | null = null;
	let noteDrag: NoteDragState | null = null;
	let focusedNodeId: number | null = null;
	const textareaElements: Record<number, HTMLTextAreaElement | undefined> = {};

	let zoomPercent = $derived(Math.round(viewport.scale * 100));
	let gridSize = $derived(GRID_SIZE * viewport.scale);
	let gridOffsetX = $derived(wrap(viewport.x, gridSize));
	let gridOffsetY = $derived(wrap(viewport.y, gridSize));
	let isPanActive = $derived(activeTool === 'pan' || isSpacePanning);
	let marqueeRect: SelectionRect | null = $derived(
		marqueeDrag?.hasDragged ? normalizeRect(marqueeDrag.start, marqueeDrag.current) : null
	);
	let surfaceCursor = $derived(
		drag || selectionDrag ? 'grabbing' : isPanActive ? 'grab' : activeTool === 'select' ? 'default' : 'crosshair'
	);
	let surfaceAriaLabel = $derived(
		activeTool === 'connect'
			? 'Canvas. Use note connector handles to draw directed flow lines, hold Space and drag to pan, command or control wheel to zoom.'
			: activeTool === 'select'
			? 'Canvas. Click notes to select, drag empty canvas to marquee select, hold Space and drag to pan, command or control wheel to zoom.'
			: isPanActive
			? 'Canvas. Drag to pan, wheel or trackpad scroll to pan, command or control wheel to zoom.'
			: 'Canvas. Click empty canvas or press Enter to add a note, hold Space and drag to pan, command or control wheel to zoom.'
	);

	function wrap(value: number, size: number): number {
		return ((value % size) + size) % size;
	}

	function getLocalPoint(event: PointerEvent | WheelEvent, element: HTMLElement): Point {
		const rect = element.getBoundingClientRect();

		return {
			x: event.clientX - rect.left,
			y: event.clientY - rect.top
		};
	}

	function getElementCenter(element: HTMLElement): Point {
		const rect = element.getBoundingClientRect();

		return {
			x: rect.width / 2,
			y: rect.height / 2
		};
	}

	function getSurfaceFromCurrentTarget(event: PointerEvent): HTMLElement | null {
		const element = event.currentTarget;
		if (!(element instanceof HTMLElement)) return null;

		if (element.classList.contains('surface')) return element;

		const surface = element.closest('.surface');
		return surface instanceof HTMLElement ? surface : null;
	}

	function getWorldPoint(event: PointerEvent, surface: HTMLElement): Point {
		return screenToWorld(getLocalPoint(event, surface), viewport);
	}

	function normalizeWheelDelta(event: WheelEvent): number {
		if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) return event.deltaY * 16;
		if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) return event.deltaY * 800;

		return event.deltaY;
	}

	function normalizeWheelDeltaAxis(delta: number, event: WheelEvent): number {
		if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) return delta * 16;
		if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) return delta * 800;

		return delta;
	}

	function isEditableTarget(target: EventTarget | null): boolean {
		if (!(target instanceof HTMLElement)) return false;

		return Boolean(target.closest('textarea, input, select, button, [contenteditable]'));
	}

	$effect(() => {
		const nodeId = pendingFocusNodeId;
		if (nodeId === null || focusedNodeId === nodeId) return;

		const textarea = textareaElements[nodeId];
		if (!textarea) return;

		textarea.focus();
		textarea.select();
		focusedNodeId = nodeId;
	});

	function stopCanvasEvent(event: Event) {
		event.stopPropagation();
	}

	function stopCanvasDragEvent(event: PointerEvent) {
		event.preventDefault();
		event.stopPropagation();
	}

	function handleToolbarEvent(event: Event) {
		event.stopPropagation();
	}

	function trackTextarea(nodeId: number) {
		return (node: HTMLTextAreaElement) => {
			textareaElements[nodeId] = node;

			return () => {
				if (textareaElements[nodeId] === node) {
					delete textareaElements[nodeId];
				}
			};
		};
	}

	function addTextNode(screenPoint: Point) {
		const worldPoint = screenToWorld(screenPoint, viewport);
		const node = createTextNode(nextNodeId++, worldPoint);

		textNodes.push(node);
		pendingFocusNodeId = node.id;
	}

	function moveTextNodeById(nodeId: number, point: Point) {
		textNodes = textNodes.map((node) => (node.id === nodeId ? moveTextNode(node, point) : node));
	}

	function isSelected(nodeId: number): boolean {
		return selectedNodeIds.includes(nodeId);
	}

	function selectOnly(nodeId: number) {
		selectedNodeIds = [nodeId];
	}

	function moveSelectedNodes(delta: Point, starts: SelectionNodeStart[]) {
		const startPositions = new Map(starts.map((node) => [node.id, node]));

		textNodes = textNodes.map((node) => {
			const start = startPositions.get(node.id);
			return start ? moveTextNode(node, { x: start.x + delta.x, y: start.y + delta.y }) : node;
		});
	}

	function getNodeById(nodeId: number): TextNode | undefined {
		return textNodes.find((node) => node.id === nodeId);
	}

	function getEdgePath(fromNode: TextNode, toNode: TextNode): string {
		const dx = toNode.x - fromNode.x;
		const controlDistance = Math.max(Math.abs(dx) * 0.5, NOTE_WIDTH * 0.45);
		const direction = dx >= 0 ? 1 : -1;
		const sourceControlX = fromNode.x + controlDistance * direction;
		const targetControlX = toNode.x - controlDistance * direction;

		return `M ${fromNode.x} ${fromNode.y} C ${sourceControlX} ${fromNode.y}, ${targetControlX} ${toNode.y}, ${toNode.x} ${toNode.y}`;
	}

	function handleConnectorPointerEvent(event: PointerEvent) {
		stopCanvasDragEvent(event);
	}

	function handleConnectorClick(event: MouseEvent, nodeId: number) {
		event.preventDefault();
		event.stopPropagation();

		if (pendingConnectionNodeId === null) {
			pendingConnectionNodeId = nodeId;
			return;
		}

		if (pendingConnectionNodeId === nodeId) {
			pendingConnectionNodeId = null;
			return;
		}

		if (!hasFlowEdge(flowEdges, pendingConnectionNodeId, nodeId)) {
			flowEdges.push(createFlowEdge(nextEdgeId++, pendingConnectionNodeId, nodeId));
		}

		pendingConnectionNodeId = null;
	}

	function handleNotePointerDown(event: PointerEvent, node: TextNode) {
		if (event.button !== 0) return;

		const header = event.currentTarget as HTMLElement;

		stopCanvasDragEvent(event);
		header.setPointerCapture(event.pointerId);

		if (activeTool === 'select' && !isSpacePanning) {
			const surface = getSurfaceFromCurrentTarget(event);
			if (!surface) return;

			if (!isSelected(node.id)) {
				selectOnly(node.id);
			}

			selectionDrag = {
				pointerId: event.pointerId,
				startScreen: { x: event.clientX, y: event.clientY },
				startWorld: getWorldPoint(event, surface),
				nodes: textNodes
					.filter((textNode) => selectedNodeIds.includes(textNode.id))
					.map((textNode) => ({ id: textNode.id, x: textNode.x, y: textNode.y })),
				hasDragged: false
			};
			return;
		}

		noteDrag = {
			pointerId: event.pointerId,
			nodeId: node.id,
			startScreen: { x: event.clientX, y: event.clientY },
			startWorld: { x: node.x, y: node.y }
		};
	}

	function handleNotePointerMove(event: PointerEvent) {
		stopCanvasDragEvent(event);

		if (selectionDrag?.pointerId === event.pointerId) {
			const surface = getSurfaceFromCurrentTarget(event);
			if (!surface) return;

			const totalDx = event.clientX - selectionDrag.startScreen.x;
			const totalDy = event.clientY - selectionDrag.startScreen.y;

			if (Math.hypot(totalDx, totalDy) > DRAG_THRESHOLD) {
				selectionDrag.hasDragged = true;
			}

			if (selectionDrag.hasDragged) {
				const currentWorld = getWorldPoint(event, surface);
				moveSelectedNodes(
					{
						x: currentWorld.x - selectionDrag.startWorld.x,
						y: currentWorld.y - selectionDrag.startWorld.y
					},
					selectionDrag.nodes
				);
			}
			return;
		}

		if (!noteDrag || noteDrag.pointerId !== event.pointerId) return;

		const dx = (event.clientX - noteDrag.startScreen.x) / viewport.scale;
		const dy = (event.clientY - noteDrag.startScreen.y) / viewport.scale;

		moveTextNodeById(noteDrag.nodeId, {
			x: noteDrag.startWorld.x + dx,
			y: noteDrag.startWorld.y + dy
		});
	}

	function finishNotePointer(event: PointerEvent) {
		stopCanvasDragEvent(event);

		if (selectionDrag?.pointerId === event.pointerId) {
			const header = event.currentTarget as HTMLElement;

			if (header.hasPointerCapture(event.pointerId)) {
				header.releasePointerCapture(event.pointerId);
			}

			selectionDrag = null;
			return;
		}

		if (!noteDrag || noteDrag.pointerId !== event.pointerId) return;

		const header = event.currentTarget as HTMLElement;

		if (header.hasPointerCapture(event.pointerId)) {
			header.releasePointerCapture(event.pointerId);
		}

		noteDrag = null;
	}

	function cancelNotePointer(event: PointerEvent) {
		stopCanvasDragEvent(event);

		if (selectionDrag?.pointerId === event.pointerId) {
			const header = event.currentTarget as HTMLElement;

			if (header.hasPointerCapture(event.pointerId)) {
				header.releasePointerCapture(event.pointerId);
			}

			selectionDrag = null;
			return;
		}

		if (!noteDrag || noteDrag.pointerId !== event.pointerId) return;

		const header = event.currentTarget as HTMLElement;

		if (header.hasPointerCapture(event.pointerId)) {
			header.releasePointerCapture(event.pointerId);
		}

		noteDrag = null;
	}

	function handleTextareaPointerDown(event: PointerEvent, node: TextNode) {
		if (activeTool === 'select' && !isSpacePanning) {
			selectOnly(node.id);
		}

		stopCanvasEvent(event);
	}

	function handlePointerDown(event: PointerEvent) {
		if (event.button !== 0) return;

		const surface = event.currentTarget as HTMLElement;
		const point = getLocalPoint(event, surface);

		event.preventDefault();

		if (isPanActive) {
			surface.setPointerCapture(event.pointerId);
			drag = {
				pointerId: event.pointerId,
				start: point,
				last: point,
				viewportStart: { ...viewport },
				hasDragged: false
			};
			return;
		}

		if (activeTool === 'select') {
			const worldPoint = screenToWorld(point, viewport);

			surface.setPointerCapture(event.pointerId);
			marqueeDrag = {
				pointerId: event.pointerId,
				startScreen: point,
				start: worldPoint,
				current: worldPoint,
				hasDragged: false
			};
			return;
		}

		if (activeTool === 'add-note' && !isSpacePanning) {
			surface.setPointerCapture(event.pointerId);
			addClick = {
				pointerId: event.pointerId,
				start: point,
				hasDragged: false
			};
		}
	}

	function handlePointerMove(event: PointerEvent) {
		if (marqueeDrag?.pointerId === event.pointerId) {
			const surface = event.currentTarget as HTMLElement;
			const point = getLocalPoint(event, surface);
			const totalDx = point.x - marqueeDrag.startScreen.x;
			const totalDy = point.y - marqueeDrag.startScreen.y;

			marqueeDrag.current = screenToWorld(point, viewport);

			if (Math.hypot(totalDx, totalDy) > DRAG_THRESHOLD) {
				marqueeDrag.hasDragged = true;
			}
			return;
		}

		if (addClick?.pointerId === event.pointerId) {
			const surface = event.currentTarget as HTMLElement;
			const point = getLocalPoint(event, surface);
			const totalDx = point.x - addClick.start.x;
			const totalDy = point.y - addClick.start.y;

			if (Math.hypot(totalDx, totalDy) > DRAG_THRESHOLD) {
				addClick.hasDragged = true;
			}
		}

		if (!drag || drag.pointerId !== event.pointerId) return;

		const surface = event.currentTarget as HTMLElement;
		const point = getLocalPoint(event, surface);
		const totalDx = point.x - drag.start.x;
		const totalDy = point.y - drag.start.y;

		drag.last = point;

		if (Math.hypot(totalDx, totalDy) > DRAG_THRESHOLD) {
			drag.hasDragged = true;
		}

		if (drag.hasDragged) {
			viewport.x = drag.viewportStart.x + totalDx;
			viewport.y = drag.viewportStart.y + totalDy;
		}
	}

	function finishPointer(event: PointerEvent) {
		const surface = event.currentTarget as HTMLElement;
		const point = getLocalPoint(event, surface);

		if (marqueeDrag?.pointerId === event.pointerId) {
			if (surface.hasPointerCapture(event.pointerId)) {
				surface.releasePointerCapture(event.pointerId);
			}

			marqueeDrag.current = screenToWorld(point, viewport);
			selectedNodeIds = findNodesInRect(textNodes, normalizeRect(marqueeDrag.start, marqueeDrag.current));
			marqueeDrag = null;
			return;
		}

		if (addClick?.pointerId === event.pointerId) {
			if (surface.hasPointerCapture(event.pointerId)) {
				surface.releasePointerCapture(event.pointerId);
			}

			if (activeTool === 'add-note' && !isSpacePanning && !addClick.hasDragged) {
				addTextNode(point);
			}

			addClick = null;
			return;
		}

		if (!drag || drag.pointerId !== event.pointerId) return;

		if (surface.hasPointerCapture(event.pointerId)) {
			surface.releasePointerCapture(event.pointerId);
		}

		drag = null;
	}

	function cancelPointer(event: PointerEvent) {
		if (marqueeDrag?.pointerId === event.pointerId) {
			const surface = event.currentTarget as HTMLElement;

			if (surface.hasPointerCapture(event.pointerId)) {
				surface.releasePointerCapture(event.pointerId);
			}

			marqueeDrag = null;
			return;
		}

		if (addClick?.pointerId === event.pointerId) {
			const surface = event.currentTarget as HTMLElement;

			if (surface.hasPointerCapture(event.pointerId)) {
				surface.releasePointerCapture(event.pointerId);
			}

			addClick = null;
			return;
		}

		if (!drag || drag.pointerId !== event.pointerId) return;

		const surface = event.currentTarget as HTMLElement;

		if (surface.hasPointerCapture(event.pointerId)) {
			surface.releasePointerCapture(event.pointerId);
		}

		drag = null;
	}

	function handleWheel(event: WheelEvent) {
		const surface = event.currentTarget as HTMLElement;
		const point = getLocalPoint(event, surface);

		event.preventDefault();

		if (event.metaKey || event.ctrlKey) {
			const zoomFactor = Math.exp(-normalizeWheelDelta(event) * ZOOM_SPEED);
			viewport = zoomAtPoint(viewport, point, viewport.scale * zoomFactor);
			return;
		}

		const normalizedDeltaX = normalizeWheelDeltaAxis(event.deltaX, event);
		const normalizedDeltaY = normalizeWheelDeltaAxis(event.deltaY, event);
		const panX = event.shiftKey && event.deltaX === 0 ? normalizedDeltaY : normalizedDeltaX;

		viewport.x -= panX;
		viewport.y -= event.shiftKey && event.deltaX === 0 ? 0 : normalizedDeltaY;
	}

	function handleKeydown(event: KeyboardEvent) {
		const surface = event.currentTarget as HTMLElement;
		const center = getElementCenter(surface);
		let handled = true;

		switch (event.key) {
			case 'ArrowUp':
				viewport.y -= KEYBOARD_PAN_STEP;
				break;
			case 'ArrowDown':
				viewport.y += KEYBOARD_PAN_STEP;
				break;
			case 'ArrowLeft':
				viewport.x -= KEYBOARD_PAN_STEP;
				break;
			case 'ArrowRight':
				viewport.x += KEYBOARD_PAN_STEP;
				break;
			case '+':
			case '=':
				viewport = zoomAtPoint(viewport, center, viewport.scale * Math.exp(KEYBOARD_PAN_STEP * ZOOM_SPEED));
				break;
			case '-':
			case '_':
				viewport = zoomAtPoint(viewport, center, viewport.scale * Math.exp(-KEYBOARD_PAN_STEP * ZOOM_SPEED));
				break;
			case 'Enter':
				if (activeTool !== 'add-note' || isSpacePanning) {
					handled = false;
					break;
				}
				addTextNode(center);
				break;
			default:
				handled = false;
		}

		if (handled) {
			event.preventDefault();
		}
	}

	function handleWindowKeydown(event: KeyboardEvent) {
		if (isEditableTarget(event.target) || event.repeat) return;

		if (event.key === ' ') {
			isSpacePanning = true;
			event.preventDefault();
			return;
		}

		const nextTool = getToolForShortcut(event.key);
		if (!nextTool) return;

		activeTool = nextTool;
		pendingConnectionNodeId = null;
		event.preventDefault();
	}

	function getToolForShortcut(key: string): Tool | null {
		switch (key.toLowerCase()) {
			case 'v':
				return 'select';
			case 'n':
				return 'add-note';
			case 'p':
				return 'pan';
			case 'c':
				return 'connect';
			default:
				return null;
		}
	}

	function handleWindowKeyup(event: KeyboardEvent) {
		if (event.key !== ' ') return;

		if (isSpacePanning) {
			event.preventDefault();
		}

		isSpacePanning = false;
	}

	function resetView() {
		viewport = { ...INITIAL_VIEWPORT };
	}

	function clearTextNodes() {
		textNodes = [];
		flowEdges = [];
		selectedNodeIds = [];
		selectionDrag = null;
		marqueeDrag = null;
		pendingFocusNodeId = null;
		pendingConnectionNodeId = null;
	}
</script>

<svelte:window onkeydown={handleWindowKeydown} onkeyup={handleWindowKeyup} />

<section class="canvas-view" aria-label="Prototype infinite canvas">
	<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions (custom canvas interaction surface) -->
	<div
		class="surface"
		role="application"
		tabindex="0"
		aria-label={surfaceAriaLabel}
		style:cursor={surfaceCursor}
		style:--grid-size={`${gridSize}px`}
		style:--grid-offset-x={`${gridOffsetX}px`}
		style:--grid-offset-y={`${gridOffsetY}px`}
		onpointerdown={handlePointerDown}
		onpointermove={handlePointerMove}
		onpointerup={finishPointer}
		onpointercancel={cancelPointer}
		onwheel={handleWheel}
		onkeydown={handleKeydown}
	>
		<div
			class="world"
			style:transform={`translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`}
		>
			<svg class="flow-layer" aria-hidden="true">
				<defs>
					<marker id="flow-arrow" markerWidth="10" markerHeight="10" refX="9" refY="5" orient="auto">
						<path class="flow-arrow-head" d="M 0 0 L 10 5 L 0 10 z" />
					</marker>
				</defs>
				{#each flowEdges as edge (edge.id)}
					{@const fromNode = getNodeById(edge.fromNodeId)}
					{@const toNode = getNodeById(edge.toNodeId)}
					{#if fromNode && toNode}
						<path class="flow-edge" d={getEdgePath(fromNode, toNode)} marker-end="url(#flow-arrow)" />
					{/if}
				{/each}
			</svg>
			{#if marqueeRect}
				<div
					class="selection-marquee"
					style:left={`${marqueeRect.x}px`}
					style:top={`${marqueeRect.y}px`}
					style:width={`${marqueeRect.width}px`}
					style:height={`${marqueeRect.height}px`}
				></div>
			{/if}
			{#each textNodes as node (node.id)}
				{@const screenPoint = worldToScreen(node, INITIAL_VIEWPORT)}
				<div
					class="text-node"
					class:selected={isSelected(node.id)}
					class:pending-source={pendingConnectionNodeId === node.id}
					style:left={`${screenPoint.x}px`}
					style:top={`${screenPoint.y}px`}
					style:--note-width={`${NOTE_WIDTH}px`}
					style:--note-min-height={`${NOTE_MIN_HEIGHT}px`}
				>
					<div class="text-node-header-row">
						<button
							type="button"
							class="text-node-header"
							aria-label={`Drag note ${node.id}`}
							onpointerdown={(event) => handleNotePointerDown(event, node)}
							onpointermove={handleNotePointerMove}
							onpointerup={finishNotePointer}
							onpointercancel={cancelNotePointer}
							onclick={stopCanvasEvent}
							onkeydown={stopCanvasEvent}
						>
							<span>Note {node.id}</span>
						</button>
						<button
							type="button"
							class="connector-button"
							class:pending={pendingConnectionNodeId === node.id}
							aria-label={
								pendingConnectionNodeId === node.id
									? `Cancel flow from note ${node.id}`
									: `Connect from note ${node.id}`
							}
							title="Connect note"
							onpointerdown={handleConnectorPointerEvent}
							onpointermove={handleConnectorPointerEvent}
							onpointerup={handleConnectorPointerEvent}
							onpointercancel={handleConnectorPointerEvent}
							onclick={(event) => handleConnectorClick(event, node.id)}
							onkeydown={stopCanvasEvent}
						>
							<span aria-hidden="true">→</span>
						</button>
					</div>
					<textarea
						{@attach trackTextarea(node.id)}
						class="text-node-body"
						aria-label={`Note ${node.id}`}
						placeholder="Type a note..."
						bind:value={node.text}
						onpointerdown={(event) => handleTextareaPointerDown(event, node)}
						onpointermove={stopCanvasEvent}
						onpointerup={stopCanvasEvent}
						onpointercancel={stopCanvasEvent}
						onwheel={stopCanvasEvent}
						onkeydown={stopCanvasEvent}
					></textarea>
				</div>
			{/each}
		</div>
	</div>

	<!-- svelte-ignore a11y_no_noninteractive_element_interactions (stats overlay stops events from reaching canvas interactions) -->
	<div
		class="stats-panel"
		role="group"
		aria-label="Canvas controls"
		onclick={handleToolbarEvent}
		onkeydown={handleToolbarEvent}
		onpointerdown={handleToolbarEvent}
		onpointermove={handleToolbarEvent}
		onpointerup={handleToolbarEvent}
		onpointercancel={handleToolbarEvent}
		onwheel={handleToolbarEvent}
	>
		<div class="stat">
			<span>Notes</span>
			<strong>{textNodes.length}</strong>
		</div>
		<div class="stat">
			<span>Zoom</span>
			<strong>{zoomPercent}%</strong>
		</div>
		<button type="button" onclick={resetView}>Reset view</button>
		<button type="button" onclick={clearTextNodes} disabled={textNodes.length === 0}>Clear notes</button>
	</div>

	<!-- svelte-ignore a11y_no_noninteractive_element_interactions (toolbar overlay stops events from reaching canvas interactions) -->
	<div
		class="tool-dock"
		role="toolbar"
		tabindex="-1"
		aria-label="Canvas tools"
		onclick={handleToolbarEvent}
		onkeydown={handleToolbarEvent}
		onpointerdown={handleToolbarEvent}
		onpointermove={handleToolbarEvent}
		onpointerup={handleToolbarEvent}
		onpointercancel={handleToolbarEvent}
		onwheel={handleToolbarEvent}
	>
		<button
			type="button"
			class:active={activeTool === 'select'}
			aria-pressed={activeTool === 'select'}
			onclick={() => (activeTool = 'select')}
		>
			Select
		</button>
		<button
			type="button"
			class:active={activeTool === 'add-note'}
			aria-pressed={activeTool === 'add-note'}
			onclick={() => (activeTool = 'add-note')}
		>
			Add note
		</button>
	</div>
</section>

<style>
	.canvas-view {
		position: relative;
		width: 100%;
		height: 100%;
		overflow: hidden;
		background: #f8fafc;
	}

	.surface {
		position: absolute;
		inset: 0;
		touch-action: none;
		user-select: none;
		background-image: radial-gradient(circle, rgba(59, 130, 246, 0.34) 1px, transparent 1.25px);
		background-position: var(--grid-offset-x) var(--grid-offset-y);
		background-size: var(--grid-size) var(--grid-size);
	}

	.surface:active {
		cursor: grabbing;
	}

	.surface:focus-visible {
		outline: 2px solid #2563eb;
		outline-offset: -4px;
	}

	.world {
		position: absolute;
		inset: 0;
		transform-origin: 0 0;
		will-change: transform;
	}

	.flow-layer {
		position: absolute;
		inset: 0;
		z-index: 0;
		width: 100%;
		height: 100%;
		overflow: visible;
		pointer-events: none;
	}

	.flow-edge {
		fill: none;
		stroke: #2563eb;
		stroke-linecap: round;
		stroke-width: 2.5;
		opacity: 0.72;
	}

	.flow-arrow-head {
		fill: #2563eb;
		opacity: 0.72;
	}

	.selection-marquee {
		position: absolute;
		z-index: 1;
		border: 1px solid rgba(37, 99, 235, 0.7);
		border-radius: 6px;
		background: rgba(59, 130, 246, 0.18);
		pointer-events: none;
	}

	.text-node {
		position: absolute;
		z-index: 2;
		width: var(--note-width, 180px);
		transform: translate(-50%, -50%);
		border: 1px solid rgba(148, 163, 184, 0.48);
		border-radius: 12px;
		overflow: hidden;
		background: #ffffff;
		box-shadow: 0 10px 24px rgba(15, 23, 42, 0.14);
	}

	.text-node.selected {
		border-color: rgba(29, 78, 216, 0.5);
		background: #dbeafe;
		box-shadow: 0 10px 24px rgba(37, 99, 235, 0.28);
	}

	.text-node-header-row {
		display: flex;
		align-items: center;
		gap: 8px;
		width: 100%;
		min-height: 28px;
		padding: 0 8px 0 0;
		background: rgba(241, 245, 249, 0.92);
	}

	.text-node.selected .text-node-header-row {
		background: rgba(147, 197, 253, 0.8);
	}

	.text-node-header {
		display: flex;
		flex: 1 1 auto;
		align-items: center;
		align-self: stretch;
		min-width: 0;
		border: 0;
		border-radius: 0;
		padding: 0 10px;
		color: #1e3a8a;
		background: transparent;
		cursor: grab;
		font-size: 0.78rem;
		font-weight: 700;
		line-height: 1;
		touch-action: none;
		user-select: none;
	}

	.connector-button {
		display: inline-grid;
		flex: 0 0 auto;
		place-items: center;
		width: 20px;
		height: 20px;
		border-color: rgba(37, 99, 235, 0.4);
		border-radius: 999px;
		padding: 0;
		color: #1d4ed8;
		background: rgba(255, 255, 255, 0.86);
		cursor: crosshair;
		font-size: 0.78rem;
		font-weight: 800;
		line-height: 1;
		touch-action: none;
	}

	.connector-button.pending,
	.text-node.pending-source .connector-button {
		border-color: #1d4ed8;
		color: #ffffff;
		background: #2563eb;
	}

	.text-node-header:active {
		cursor: grabbing;
	}

	.text-node-header:focus-visible {
		outline: 2px solid rgba(37, 99, 235, 0.55);
		outline-offset: -2px;
	}

	.text-node-body {
		display: block;
		width: 100%;
		min-height: var(--note-min-height, 96px);
		resize: both;
		border: 0;
		padding: 12px;
		color: #0f172a;
		background: transparent;
		cursor: text;
		font: inherit;
		line-height: 1.35;
		user-select: text;
	}

	.text-node:focus-within {
		border-color: #2563eb;
		box-shadow:
			0 0 0 2px rgba(37, 99, 235, 0.28),
			0 10px 24px rgba(37, 99, 235, 0.28);
	}

	.text-node.pending-source {
		border-color: #1d4ed8;
		box-shadow:
			0 0 0 3px rgba(37, 99, 235, 0.3),
			0 10px 24px rgba(37, 99, 235, 0.28);
	}

	.text-node-body:focus {
		outline: none;
	}

	.stats-panel {
		position: absolute;
		top: 16px;
		left: 16px;
		z-index: 1;
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px;
		border: 1px solid rgba(148, 163, 184, 0.36);
		border-radius: 14px;
		background: rgba(255, 255, 255, 0.88);
		box-shadow: 0 16px 40px rgba(15, 23, 42, 0.12);
		backdrop-filter: blur(10px);
	}

	.tool-dock {
		position: absolute;
		bottom: 24px;
		left: 50%;
		z-index: 1;
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 8px;
		border: 1px solid rgba(148, 163, 184, 0.36);
		border-radius: 16px;
		background: rgba(255, 255, 255, 0.9);
		box-shadow: 0 16px 40px rgba(15, 23, 42, 0.14);
		transform: translateX(-50%);
		backdrop-filter: blur(10px);
	}

	.stat {
		display: grid;
		gap: 1px;
		min-width: 72px;
		padding: 4px 8px;
	}

	.stat span {
		color: #64748b;
		font-size: 0.72rem;
		line-height: 1;
	}

	.stat strong {
		color: #0f172a;
		font-size: 0.92rem;
		line-height: 1.2;
	}

	button {
		border: 1px solid #cbd5e1;
		border-radius: 10px;
		padding: 7px 10px;
		color: #172033;
		background: #ffffff;
		cursor: pointer;
	}

	button:hover:not(:disabled),
	button:focus-visible {
		border-color: #2563eb;
		color: #1d4ed8;
	}

	button.active {
		border-color: #2563eb;
		color: #1d4ed8;
		background: #dbeafe;
	}

	button:disabled {
		cursor: not-allowed;
		opacity: 0.5;
	}
</style>
