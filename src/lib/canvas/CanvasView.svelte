<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import * as Tabs from '$lib/components/ui/tabs';
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import {
		ChevronDownIcon,
		ChevronLeftIcon,
		Cursor02Icon,
		FileAddIcon,
		Refresh01Icon,
		Search01Icon
	} from '@hugeicons/core-free-icons';
	import {
		Background,
		BackgroundVariant,
		PanOnScrollMode,
		SelectionMode,
		SvelteFlow,
		type Connection,
		type EdgeTypes,
		type OnBeforeDelete,
		type OnSelectionChange,
		type NodeOrigin,
		type NodeTypes,
		type Viewport
	} from '@xyflow/svelte';
	import { isTextEntryTarget } from './keyboard';
	import { createPage } from './pages';
	import {
		createPageFlowEdge,
		hasPageFlowEdge,
		PAGE_FLOW_EDGE_TYPE,
		PAGE_NODE_TYPE,
		pageToNode,
		type PageFlowEdge as PageFlowEdgeType,
		type PageFlowNode as PageFlowNodeType
	} from './flow';
	import PageFlowEdge from './components/PageFlowEdge.svelte';
	import PageFlowNode from './components/PageFlowNode.svelte';

	type Tool = 'select' | 'add-page';

	const nodeTypes = { [PAGE_NODE_TYPE]: PageFlowNode } satisfies NodeTypes;
	const edgeTypes = { [PAGE_FLOW_EDGE_TYPE]: PageFlowEdge } satisfies EdgeTypes;
	const NODE_ORIGIN: NodeOrigin = [0.5, 0.5];
	const DELETE_KEYS = ['Backspace', 'Delete'];
	const INITIAL_VIEWPORT: Viewport = { x: 0, y: 0, zoom: 1 };

	let nodes = $state.raw<PageFlowNodeType[]>([]);
	let edges = $state.raw<PageFlowEdgeType[]>([]);
	let viewport = $state<Viewport>({ ...INITIAL_VIEWPORT });
	let activeTool = $state<Tool>('select');
	let nextPageId = 1;
	let nextEdgeId = 1;
	let flowWrapper: HTMLElement | undefined;
	let selectionStart: { x: number; y: number } | null = null;

	let zoomPercent = $derived(Math.round(viewport.zoom * 100));

	function trackFlowWrapper(node: HTMLElement) {
		flowWrapper = node;

		return () => {
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

		if (!flowWrapper) return;

		const rect = flowWrapper.getBoundingClientRect();
		const flowPoint = {
			x: (event.clientX - rect.left - viewport.x) / viewport.zoom,
			y: (event.clientY - rect.top - viewport.y) / viewport.zoom
		};
		const page = createPage(nextPageId++, flowPoint);

		nodes = [...nodes, pageToNode(page, { focusTitle: true })];
		activeTool = 'select';
	}

	function handleBeforeConnect(connection: Connection): PageFlowEdgeType | false {
		if (hasPageFlowEdge(edges, connection)) return false;

		return createPageFlowEdge(`edge-${nextEdgeId++}`, connection);
	}

	const handleBeforeDelete: OnBeforeDelete<PageFlowNodeType, PageFlowEdgeType> = async ({
		edges: edgesToDelete
	}) => {
		const labeledEdgeIds = new Set(
			edgesToDelete.filter((edge) => edge.data?.labelSelected).map((edge) => edge.id)
		);

		if (labeledEdgeIds.size === 0) return true;

		edges = edges.map((edge) =>
			labeledEdgeIds.has(edge.id) ? { ...edge, data: {}, selected: false } : edge
		);

		return false;
	};

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

	const handleSelectionChange: OnSelectionChange<PageFlowNodeType, PageFlowEdgeType> = ({
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
	<div {@attach trackFlowWrapper} class="canvas-flow-wrapper">
		<SvelteFlow
			bind:nodes
			bind:edges
			bind:viewport
			{nodeTypes}
			{edgeTypes}
			nodeOrigin={NODE_ORIGIN}
			deleteKey={DELETE_KEYS}
			panOnScroll={true}
			panOnScrollMode={PanOnScrollMode.Free}
			panOnDrag={false}
			selectionOnDrag={activeTool === 'select'}
			selectionMode={SelectionMode.Partial}
			class={[
				'canvas-flow',
				{
					'canvas-flow--add-page': activeTool === 'add-page'
				}
			]}
			aria-label="Canvas. Select pages, connect handles, or press P and click the pane to add a page."
			onpaneclick={handlePaneClick}
			onbeforeconnect={handleBeforeConnect}
			onbeforedelete={handleBeforeDelete}
			onselectionchange={handleSelectionChange}
			onselectionstart={handleSelectionStart}
			onselectionend={handleSelectionEnd}
		>
			<Background
				variant={BackgroundVariant.Dots}
				gap={32}
				size={1.25}
				patternColor="var(--canvas-grid)"
			/>
		</SvelteFlow>
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
	}

	:global(.canvas-flow .svelte-flow__pane) {
		cursor: default;
	}

	:global(.canvas-flow.canvas-flow--add-page .svelte-flow__pane) {
		cursor: crosshair;
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
