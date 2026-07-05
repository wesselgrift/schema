<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import * as Tabs from '$lib/components/ui/tabs';
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import {
		ChevronDownIcon,
		ChevronLeftIcon,
		Cursor02Icon,
		FileAddIcon,
		GroupIcon,
		Refresh01Icon,
		Search01Icon
	} from '@hugeicons/core-free-icons';
	import {
		Background,
		BackgroundVariant,
		ConnectionMode,
		PanOnScrollMode,
		SelectionMode,
		SvelteFlow,
		type Connection,
		type EdgeTypes,
		type NodeTargetEventWithPointer,
		type OnBeforeDelete,
		type OnSelectionChange,
		type NodeOrigin,
		type NodeTypes,
		type Viewport,
		type XYPosition
	} from '@xyflow/svelte';
	import { isTextEntryTarget } from './keyboard';
	import { createPage } from './pages';
	import {
		DEFAULT_SECTION_SIZE,
		MIN_SECTION_SIZE,
		SECTION_NODE_TYPE,
		createSectionNode,
		createPageFlowEdge,
		getNextNumericSectionId,
		getNodeAbsolutePosition,
		hasPageFlowEdge,
		isPointInsideSection,
		orderNodesForParenting,
		PAGE_FLOW_EDGE_TYPE,
		PAGE_NODE_TYPE,
		pageToNode,
		reparentPageNode,
		unparentSectionChildren,
		type CanvasFlowNode,
		type PageFlowEdge as PageFlowEdgeType,
		type PageFlowNode as PageFlowNodeType,
		type SectionFlowNode
	} from './flow';
	import PageFlowEdge from './components/PageFlowEdge.svelte';
	import PageFlowNode from './components/PageFlowNode.svelte';
	import SectionFlowNodeComponent from './components/SectionFlowNode.svelte';

	type Tool = 'select' | 'add-page' | 'add-section';
	type SectionDragState = {
		pointerId: number;
		startClient: XYPosition;
		currentClient: XYPosition;
		startFlow: XYPosition;
	};
	type MarqueeRect = {
		left: number;
		top: number;
		width: number;
		height: number;
	};

	const nodeTypes = {
		[PAGE_NODE_TYPE]: PageFlowNode,
		[SECTION_NODE_TYPE]: SectionFlowNodeComponent
	} satisfies NodeTypes;
	const edgeTypes = { [PAGE_FLOW_EDGE_TYPE]: PageFlowEdge } satisfies EdgeTypes;
	const NODE_ORIGIN: NodeOrigin = [0.5, 0.5];
	const DELETE_KEYS = ['Backspace', 'Delete'];
	const INITIAL_VIEWPORT: Viewport = { x: 0, y: 0, zoom: 1 };
	const SECTION_CLICK_DRAG_THRESHOLD = 8;

	let nodes = $state.raw<CanvasFlowNode[]>([]);
	let edges = $state.raw<PageFlowEdgeType[]>([]);
	let viewport = $state<Viewport>({ ...INITIAL_VIEWPORT });
	let activeTool = $state<Tool>('select');
	let nextPageId = 1;
	let nextEdgeId = 1;
	let flowWrapper: HTMLElement | undefined;
	let selectionStart: { x: number; y: number } | null = null;
	let sectionDrag = $state<SectionDragState | null>(null);

	let zoomPercent = $derived(Math.round(viewport.zoom * 100));
	let sectionMarquee = $derived.by<MarqueeRect | null>(() => {
		if (!sectionDrag) return null;

		return {
			left: Math.min(sectionDrag.startClient.x, sectionDrag.currentClient.x),
			top: Math.min(sectionDrag.startClient.y, sectionDrag.currentClient.y),
			width: Math.abs(sectionDrag.currentClient.x - sectionDrag.startClient.x),
			height: Math.abs(sectionDrag.currentClient.y - sectionDrag.startClient.y)
		};
	});

	function trackFlowWrapper(node: HTMLElement) {
		flowWrapper = node;
		node.addEventListener('pointerdown', handleCanvasPointerdown, { capture: true });

		return () => {
			node.removeEventListener('pointerdown', handleCanvasPointerdown, { capture: true });
			if (flowWrapper === node) {
				flowWrapper = undefined;
			}
		};
	}

	function handlePaneClick({ event }: { event: MouseEvent }) {
		if (activeTool !== 'add-page') {
			clearEdgeLabelSelection();
			return;
		}

		const flowPoint = clientPointToFlowPoint({ x: event.clientX, y: event.clientY });
		if (!flowPoint) return;

		const page = createPage(nextPageId++, flowPoint);

		nodes = orderNodesForParenting([...nodes, pageToNode(page, { focusTitle: true })]);
		activeTool = 'select';
	}

	function handleCanvasPointerdown(event: PointerEvent) {
		if (activeTool !== 'add-section' || event.button !== 0) return;
		if (isSectionToolInteractiveTarget(event.target)) return;

		const startFlow = clientPointToFlowPoint({ x: event.clientX, y: event.clientY });
		if (!startFlow) return;

		sectionDrag = {
			pointerId: event.pointerId,
			startClient: { x: event.clientX, y: event.clientY },
			currentClient: { x: event.clientX, y: event.clientY },
			startFlow
		};

		flowWrapper?.setPointerCapture(event.pointerId);
		event.preventDefault();
		event.stopPropagation();
	}

	function handleCanvasPointermove(event: PointerEvent) {
		if (!sectionDrag || event.pointerId !== sectionDrag.pointerId) return;

		sectionDrag = {
			...sectionDrag,
			currentClient: { x: event.clientX, y: event.clientY }
		};
		event.preventDefault();
	}

	function handleCanvasPointerup(event: PointerEvent) {
		if (!sectionDrag || event.pointerId !== sectionDrag.pointerId) return;

		const dragState = sectionDrag;
		sectionDrag = null;
		flowWrapper?.releasePointerCapture(event.pointerId);

		const endFlow = clientPointToFlowPoint({ x: event.clientX, y: event.clientY });
		if (!endFlow) return;

		createSectionFromDrag(dragState.startFlow, endFlow, {
			x: event.clientX - dragState.startClient.x,
			y: event.clientY - dragState.startClient.y
		});

		event.preventDefault();
		event.stopPropagation();
	}

	function handleCanvasPointercancel(event: PointerEvent) {
		if (!sectionDrag || event.pointerId !== sectionDrag.pointerId) return;

		sectionDrag = null;
		flowWrapper?.releasePointerCapture(event.pointerId);
	}

	function createSectionFromDrag(startFlow: XYPosition, endFlow: XYPosition, dragDelta: XYPosition) {
		const isTinyDrag =
			Math.hypot(dragDelta.x, dragDelta.y) < SECTION_CLICK_DRAG_THRESHOLD ||
			Math.abs(endFlow.x - startFlow.x) < 1 ||
			Math.abs(endFlow.y - startFlow.y) < 1;

		const width = isTinyDrag
			? DEFAULT_SECTION_SIZE.width
			: Math.max(Math.abs(endFlow.x - startFlow.x), MIN_SECTION_SIZE.width);
		const height = isTinyDrag
			? DEFAULT_SECTION_SIZE.height
			: Math.max(Math.abs(endFlow.y - startFlow.y), MIN_SECTION_SIZE.height);
		const position = isTinyDrag
			? startFlow
			: {
					x: (startFlow.x + endFlow.x) / 2,
					y: (startFlow.y + endFlow.y) / 2
				};

		const section = createSectionNode(getNextNumericSectionId(nodes), position, {
			width,
			height,
			focusTitle: true
		});

		let nextNodes: CanvasFlowNode[] = [...nodes, section];

		if (!isTinyDrag) {
			const enclosedPageIds = new Set(
				nodes
					.filter((node): node is PageFlowNodeType => node.type === PAGE_NODE_TYPE)
					.filter((node) => isPointInsideSection(getNodeAbsolutePosition(node, nodes), section))
					.map((node) => node.id)
			);

			if (enclosedPageIds.size > 0) {
				nextNodes = nextNodes.map((node) => {
					if (node.type !== PAGE_NODE_TYPE || !enclosedPageIds.has(node.id)) return node;

					return reparentPageNode(node, section, nextNodes);
				});
			}
		}

		nodes = orderNodesForParenting(nextNodes);
		activeTool = 'select';
	}

	function clientPointToFlowPoint(point: XYPosition): XYPosition | null {
		if (!flowWrapper) return null;

		const rect = flowWrapper.getBoundingClientRect();
		return {
			x: (point.x - rect.left - viewport.x) / viewport.zoom,
			y: (point.y - rect.top - viewport.y) / viewport.zoom
		};
	}

	function isSectionToolInteractiveTarget(target: EventTarget | null): boolean {
		if (!(target instanceof Element)) return true;

		return Boolean(
			target.closest(
				[
					'button',
					'a',
					'input',
					'textarea',
					'select',
					'[contenteditable="true"]',
					'[role="button"]',
					'[role="textbox"]',
					'.nodrag',
					'.nopan',
					'.svelte-flow__handle',
					'.svelte-flow__edge',
					'.svelte-flow__resize-control',
					'.svelte-flow__resize-control-line',
					'.svelte-flow__resize-control-handle'
				].join(',')
			)
		);
	}

	function handleBeforeConnect(connection: Connection): PageFlowEdgeType | false {
		if (hasPageFlowEdge(edges, connection)) return false;

		return createPageFlowEdge(`edge-${nextEdgeId++}`, connection);
	}

	const handleBeforeDelete: OnBeforeDelete<CanvasFlowNode, PageFlowEdgeType> = async ({
		nodes: nodesToDelete,
		edges: edgesToDelete
	}) => {
		const labeledEdgeIds = new Set(
			edgesToDelete.filter((edge) => edge.data?.labelSelected).map((edge) => edge.id)
		);

		if (labeledEdgeIds.size === 0) {
			return preserveSectionChildrenOnDelete(nodesToDelete, edgesToDelete);
		}

		edges = edges.map((edge) =>
			labeledEdgeIds.has(edge.id) ? { ...edge, data: {}, selected: false } : edge
		);

		return false;
	};

	function preserveSectionChildrenOnDelete(
		nodesToDelete: CanvasFlowNode[],
		edgesToDelete: PageFlowEdgeType[]
	): { nodes: CanvasFlowNode[]; edges: PageFlowEdgeType[] } | true {
		const deletedSectionIds = new Set(
			nodesToDelete.filter((node) => node.type === SECTION_NODE_TYPE).map((node) => node.id)
		);
		if (deletedSectionIds.size === 0) return true;

		let nextNodes = nodes;
		for (const sectionId of deletedSectionIds) {
			nextNodes = unparentSectionChildren(nextNodes, sectionId);
		}
		nodes = orderNodesForParenting(nextNodes);

		const preservedChildIds = new Set(
			nodesToDelete
				.filter((node) => node.type === PAGE_NODE_TYPE && deletedSectionIds.has(node.parentId ?? ''))
				.map((node) => node.id)
		);

		return {
			nodes: nodesToDelete.filter((node) => !preservedChildIds.has(node.id)),
			edges: edgesToDelete.filter(
				(edge) => !preservedChildIds.has(edge.source) && !preservedChildIds.has(edge.target)
			)
		};
	}

	function clearSelectedEdgeLabels(): boolean {
		const selectedLabeledEdgeIds = new Set(edges.filter((edge) => edge.data?.labelSelected).map((edge) => edge.id));

		if (selectedLabeledEdgeIds.size === 0) return false;

		edges = edges.map((edge) =>
			selectedLabeledEdgeIds.has(edge.id) ? { ...edge, data: {}, selected: false } : edge
		);

		return true;
	}

	function clearEdgeLabelSelection() {
		if (!edges.some((edge) => edge.data?.labelSelected)) return;

		edges = edges.map((edge) =>
			edge.data?.labelSelected ? { ...edge, data: { ...edge.data, labelSelected: false } } : edge
		);
	}

	function handleSelectionStart(event: PointerEvent) {
		selectionStart = { x: event.clientX, y: event.clientY };
	}

	function handleSelectionEnd(event: PointerEvent) {
		if (!selectionStart) return;

		const selectionRect = {
			left: Math.min(selectionStart.x, event.clientX),
			right: Math.max(selectionStart.x, event.clientX),
			top: Math.min(selectionStart.y, event.clientY),
			bottom: Math.max(selectionStart.y, event.clientY)
		};
		selectionStart = null;

		const selectedLabelEdgeIds: string[] = [];
		document.querySelectorAll<HTMLElement>('.page-flow-label').forEach((label) => {
			const edgeId = label.dataset.edgeId;
			if (!edgeId) return;

			const labelRect = label.getBoundingClientRect();
			const intersects =
				labelRect.left <= selectionRect.right &&
				labelRect.right >= selectionRect.left &&
				labelRect.top <= selectionRect.bottom &&
				labelRect.bottom >= selectionRect.top;

			if (intersects) {
				selectedLabelEdgeIds.push(edgeId);
			}
		});

		if (selectedLabelEdgeIds.length === 0) return;

		edges = edges.map((edge) =>
			selectedLabelEdgeIds.includes(edge.id)
				? { ...edge, data: { ...edge.data, labelSelected: true } }
				: edge
		);
	}

	const handleSelectionChange: OnSelectionChange<CanvasFlowNode, PageFlowEdgeType> = ({
		nodes: selectedNodes,
		edges: selectedEdges
	}) => {
		const selectedEdgeIds = selectedEdges.map((edge) => edge.id);
		const shouldClearAllLabels = selectedNodes.length > 0;
		const hasLabelSelectionToClear = edges.some(
			(edge) =>
				edge.data?.labelSelected &&
				(shouldClearAllLabels || selectedEdgeIds.includes(edge.id))
		);

		if (!hasLabelSelectionToClear) return;

		edges = edges.map((edge) =>
			edge.data?.labelSelected && (shouldClearAllLabels || selectedEdgeIds.includes(edge.id))
				? { ...edge, data: { ...edge.data, labelSelected: false } }
				: edge
		);
	};

	function handleNodeDrag({
		nodes: draggedNodes
	}: Parameters<NodeTargetEventWithPointer<MouseEvent | TouchEvent, CanvasFlowNode>>[0]) {
		const draggedPage = draggedNodes.find((node): node is PageFlowNodeType => node.type === PAGE_NODE_TYPE);
		if (!draggedPage) {
			setDropTargetSection(null);
			return;
		}

		const nextNodes = mergeEventNodes(nodes, draggedNodes);

		const section = getTopmostSectionContainingPoint(getNodeAbsolutePosition(draggedPage, nextNodes), nextNodes);
		setDropTargetSection(section?.id ?? null);
	}

	function handleNodeDragStop({
		nodes: draggedNodes
	}: Parameters<NodeTargetEventWithPointer<MouseEvent | TouchEvent, CanvasFlowNode>>[0]) {
		const draggedPageIds = new Set(
			draggedNodes.filter((node) => node.type === PAGE_NODE_TYPE).map((node) => node.id)
		);

		if (draggedPageIds.size === 0) {
			setDropTargetSection(null);
			return;
		}

		let nextNodes = clearDropTargetSections(mergeEventNodes(nodes, draggedNodes));

		for (const pageId of draggedPageIds) {
			const pageNode = nextNodes.find(
				(node): node is PageFlowNodeType => node.id === pageId && node.type === PAGE_NODE_TYPE
			);
			if (!pageNode) continue;

			const section = getTopmostSectionContainingPoint(getNodeAbsolutePosition(pageNode, nextNodes), nextNodes);
			const reparentedPage = reparentPageNode(pageNode, section, nextNodes);

			nextNodes = nextNodes.map((node) => (node.id === pageId ? reparentedPage : node));
		}

		nodes = orderNodesForParenting(nextNodes);
	}

	function mergeEventNodes(
		sourceNodes: CanvasFlowNode[],
		eventNodes: CanvasFlowNode[]
	): CanvasFlowNode[] {
		if (eventNodes.length === 0) return sourceNodes;

		const eventNodeById = new Map(eventNodes.map((node) => [node.id, node]));
		return sourceNodes.map((node) => eventNodeById.get(node.id) ?? node);
	}

	function clearDropTargetSections(sourceNodes: CanvasFlowNode[]): CanvasFlowNode[] {
		return sourceNodes.map((node) =>
			node.type === SECTION_NODE_TYPE && node.data.isDropTarget
				? { ...node, data: { ...node.data, isDropTarget: false } }
				: node
		);
	}

	function getTopmostSectionContainingPoint(
		point: XYPosition,
		sourceNodes: CanvasFlowNode[] = nodes
	): SectionFlowNode | null {
		const sections = sourceNodes.filter(
			(node): node is SectionFlowNode => node.type === SECTION_NODE_TYPE
		);

		for (let index = sections.length - 1; index >= 0; index -= 1) {
			const section = sections[index];
			if (isPointInsideSection(point, section)) return section;
		}

		return null;
	}

	function setDropTargetSection(sectionId: string | null) {
		if (
			!nodes.some(
				(node) =>
					node.type === SECTION_NODE_TYPE && Boolean(node.data.isDropTarget) !== (node.id === sectionId)
			)
		) {
			return;
		}

		nodes = nodes.map((node) =>
			node.type === SECTION_NODE_TYPE
				? { ...node, data: { ...node.data, isDropTarget: node.id === sectionId } }
				: node
		);
	}

	function handleWindowKeydown(event: KeyboardEvent) {
		if (isTextEntryTarget(event.target) || event.repeat) return;

		if (event.key === 'Backspace' || event.key === 'Delete') {
			if (clearSelectedEdgeLabels()) {
				event.preventDefault();
			}
			return;
		}

		const nextTool = getToolForShortcut(event.key);
		if (!nextTool) return;

		activeTool = nextTool;
		event.preventDefault();
	}

	function getToolForShortcut(key: string): Tool | null {
		switch (key.toLowerCase()) {
			case 'v':
				return 'select';
			case 'p':
				return 'add-page';
			case 's':
				return 'add-section';
			default:
				return null;
		}
	}

	function resetView() {
		viewport = { ...INITIAL_VIEWPORT };
	}
</script>

<svelte:window onkeydown={handleWindowKeydown} />

<section class="canvas-view" aria-label="Prototype infinite canvas">
	<div
		{@attach trackFlowWrapper}
		class="canvas-flow-wrapper"
		role="presentation"
		onpointermove={handleCanvasPointermove}
		onpointerup={handleCanvasPointerup}
		onpointercancel={handleCanvasPointercancel}
	>
		<SvelteFlow
			bind:nodes
			bind:edges
			bind:viewport
			{nodeTypes}
			{edgeTypes}
			nodeOrigin={NODE_ORIGIN}
			connectionMode={ConnectionMode.Loose}
			deleteKey={DELETE_KEYS}
			panOnScroll={true}
			panOnScrollMode={PanOnScrollMode.Free}
			panOnDrag={false}
			selectionOnDrag={activeTool === 'select'}
			selectionMode={SelectionMode.Partial}
			class={[
				'canvas-flow',
				{
					'canvas-flow--add-node': activeTool === 'add-page' || activeTool === 'add-section'
				}
			]}
			aria-label="Canvas. Select pages, connect handles, press P to add a page, or press S to add a section."
			onpaneclick={handlePaneClick}
			onbeforeconnect={handleBeforeConnect}
			onbeforedelete={handleBeforeDelete}
			onselectionchange={handleSelectionChange}
			onselectionstart={handleSelectionStart}
			onselectionend={handleSelectionEnd}
			onnodedrag={handleNodeDrag}
			onnodedragstop={handleNodeDragStop}
		>
			<Background
				variant={BackgroundVariant.Dots}
				gap={32}
				size={1.25}
				patternColor="var(--canvas-grid)"
			/>
		</SvelteFlow>

		{#if sectionMarquee && sectionMarquee.width > 0 && sectionMarquee.height > 0}
			<div
				class="section-marquee"
				style:left={`${sectionMarquee.left}px`}
				style:top={`${sectionMarquee.top}px`}
				style:width={`${sectionMarquee.width}px`}
				style:height={`${sectionMarquee.height}px`}
				aria-hidden="true"
			></div>
		{/if}
	</div>

	<div class="top-controls gap-2" role="group" aria-label="Project controls">
		<Button
			type="button"
			size="icon"
			variant="outline"
			class="floating-control-button bg-background hover:bg-secondary"
			aria-label="Go back"
		>
			<HugeiconsIcon
				icon={ChevronLeftIcon}
				data-icon="inline-start"
				strokeWidth={2}
				aria-hidden="true"
			/>
		</Button>
		<Button type="button" variant="outline" class="floating-control-button bg-background hover:bg-secondary">
			Untitled project
			<HugeiconsIcon
				icon={ChevronDownIcon}
				data-icon="inline-end"
				strokeWidth={2}
				aria-hidden="true"
			/>
		</Button>
	</div>

	<div class="bottom-controls">
		<div
			class="zoom-pill bg-background text-muted-foreground"
			aria-live="polite"
			aria-label="Zoom {zoomPercent}%"
		>
			<HugeiconsIcon icon={Search01Icon} size={14} strokeWidth={2} aria-hidden="true" />
			<span class="text-xs font-medium leading-none">{zoomPercent}%</span>
		</div>
		<Button
			type="button"
			variant="outline"
			class="floating-control-button bg-background hover:bg-secondary"
			onclick={resetView}
		>
			<HugeiconsIcon
				icon={Refresh01Icon}
				data-icon="inline-start"
				strokeWidth={2}
				aria-hidden="true"
			/>
			Reset view
		</Button>
	</div>

	<div class="tool-dock">
		<Tabs.Root bind:value={activeTool} class="gap-0">
			<Tabs.List aria-label="Canvas tools" class="h-7 p-0.5">
				<Tabs.Trigger value="select" class="px-2 py-0">
					<HugeiconsIcon
						icon={Cursor02Icon}
						data-icon="inline-start"
						strokeWidth={2}
						aria-hidden="true"
					/>
					Select
				</Tabs.Trigger>
				<Tabs.Trigger value="add-page" class="px-2 py-0">
					<HugeiconsIcon
						icon={FileAddIcon}
						data-icon="inline-start"
						strokeWidth={2}
						aria-hidden="true"
					/>
					Add page
				</Tabs.Trigger>
				<Tabs.Trigger value="add-section" class="px-2 py-0">
					<HugeiconsIcon
						icon={GroupIcon}
						data-icon="inline-start"
						strokeWidth={2}
						aria-hidden="true"
					/>
					Add section
				</Tabs.Trigger>
			</Tabs.List>
		</Tabs.Root>
	</div>
</section>

<style>
	.canvas-view {
		position: relative;
		width: 100%;
		height: 100%;
		overflow: hidden;
		background: var(--background);
	}

	.canvas-flow-wrapper,
	:global(.canvas-flow) {
		width: 100%;
		height: 100%;
		background: var(--background);
		--xy-selection-border: 1px solid hsl(217 91% 60%);
	}

	:global(.canvas-flow .svelte-flow__pane) {
		cursor: default;
	}

	:global(.canvas-flow.canvas-flow--add-node .svelte-flow__pane) {
		cursor: crosshair;
	}

	.section-marquee {
		position: fixed;
		z-index: 2;
		pointer-events: none;
		border: 1px solid hsl(217 91% 60%);
		background: hsl(217 91% 60% / 0.08);
		box-shadow: inset 0 0 0 1px hsl(217 91% 60% / 0.16);
	}

	:global(.canvas-flow .svelte-flow__connection-path) {
		stroke-width: 2px;
	}

	.top-controls {
		position: absolute;
		top: 16px;
		left: 16px;
		z-index: 1;
		display: flex;
		align-items: center;
	}

	:global(.floating-control-button) {
		box-shadow: var(--shadow-popover);
	}

	.tool-dock {
		position: absolute;
		bottom: 24px;
		left: 50%;
		z-index: 1;
		display: flex;
		align-items: center;
		padding: 4px;
		border: 1px solid color-mix(in srgb, var(--border) 75%, transparent);
		border-radius: calc(var(--radius-lg) + 4px);
		background: color-mix(in srgb, var(--popover) 95%, var(--card));
		box-shadow: var(--shadow-popover);
		transform: translateX(-50%);
		backdrop-filter: blur(10px);
		overflow: hidden;
	}

	.bottom-controls {
		position: absolute;
		bottom: 24px;
		left: 16px;
		z-index: 1;
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.zoom-pill {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 4.25rem;
		height: 1.75rem;
		gap: 0.25rem;
		padding: 0 0.5rem;
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-popover);
	}
</style>
