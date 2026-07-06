<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import * as Tabs from '$lib/components/ui/tabs';
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import {
		Add01Icon,
		AlertCircleIcon,
		CheckmarkCircle02Icon,
		ChevronDownIcon,
		Cursor02Icon,
		Delete02Icon,
		FileAddIcon,
		FileExportIcon,
		GroupIcon,
		Loading03Icon,
		Redo02Icon,
		Refresh01Icon,
		Search01Icon,
		Share08Icon,
		Tick02Icon,
		Undo02Icon
	} from '@hugeicons/core-free-icons';
	import { setContext, tick } from 'svelte';
	import {
		Background,
		BackgroundVariant,
		ConnectionMode,
		PanOnScrollMode,
		SelectionMode,
		SvelteFlow,
		useSvelteFlow,
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
		getNextNumericEdgeId,
		getNextNumericPageId,
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
	import {
		classifyChange,
		createContentSnapshot,
		decodeContentSnapshot,
		type ContentSnapshot
	} from './history';
	import PageFlowEdge from './components/PageFlowEdge.svelte';
	import PageFlowNode from './components/PageFlowNode.svelte';
	import SectionFlowNodeComponent from './components/SectionFlowNode.svelte';
	import ExportSpecDialog from './ExportSpecDialog.svelte';
	import {
		createCanvas,
		createEmptyStore,
		deleteCanvas,
		getActiveCanvas,
		importCanvas,
		listCanvases,
		loadStore,
		persistActiveCanvas,
		switchActiveCanvas,
		type StoredCanvas,
		type StoredState
	} from './persistence';
	import { buildShareUrl, decodeHashToPayload, encodeCanvasToHash, isShareTooLarge } from './share';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';

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

	type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

	let initialStore = loadStore() ?? createEmptyStore();
	const sharedPayload = typeof window !== 'undefined' ? decodeHashToPayload(location.hash) : null;
	if (sharedPayload) {
		initialStore = importCanvas(initialStore, sharedPayload);
		history.replaceState(null, '', location.pathname + location.search);
	}
	const activeCanvas = getActiveCanvas(initialStore);
	const { setViewport } = useSvelteFlow();

	let store = $state<StoredState>(initialStore);

	let canvases = $derived(listCanvases(store));
	let menuOpen = $state(false);
	let titleControlEl = $state<HTMLElement | null>(null);

	let nodes = $state.raw<CanvasFlowNode[]>(orderNodesForParenting(activeCanvas.nodes));
	let edges = $state.raw<PageFlowEdgeType[]>(activeCanvas.edges);
	let viewport = $state<Viewport>({ ...INITIAL_VIEWPORT, ...activeCanvas.viewport });
	let activeTool = $state<Tool>('select');
	let nextPageId = getNextNumericPageId(activeCanvas.nodes);
	let nextEdgeId = getNextNumericEdgeId(activeCanvas.edges);
	let flowWrapper: HTMLElement | undefined;
	let selectionStart: { x: number; y: number } | null = null;
	let sectionDrag = $state<SectionDragState | null>(null);
	let isExportOpen = $state(false);
	let projectName = $state(activeCanvas.name);

	type ShareStatus = 'idle' | 'copied' | 'too-large' | 'error';
	let shareStatus = $state<ShareStatus>('idle');
	let shareLink = $state('');
	let shareTimer: ReturnType<typeof setTimeout> | undefined;
	const SHARE_STATUS_VISIBLE_MS = 2400;

	let saveStatus = $state<SaveStatus>('idle');
	let saveTimer: ReturnType<typeof setTimeout> | undefined;
	let hideTimer: ReturnType<typeof setTimeout> | undefined;
	let pendingVisible = false;
	let lastContentSnapshot = serializeContent();
	let lastViewportSnapshot = serializeViewport();

	const SAVE_DEBOUNCE_MS = 500;
	const SAVED_VISIBLE_MS = 1200;
	const HISTORY_LIMIT = 100;
	const TEXT_COALESCE_MS = 500;

	let undoStack = $state<ContentSnapshot[]>([]);
	let redoStack = $state<ContentSnapshot[]>([]);
	let textBaseline = $state<ContentSnapshot | null>(null);
	let committed: ContentSnapshot = lastContentSnapshot;
	let textTimer: ReturnType<typeof setTimeout> | undefined;
	let isRestoring = false;
	let gestureActive = false;
	let gestureBaseline: ContentSnapshot | null = null;

	let canUndo = $derived(undoStack.length > 0 || textBaseline !== null);
	let canRedo = $derived(redoStack.length > 0);

	function serializeContent(): string {
		return createContentSnapshot({ name: projectName, nodes, edges });
	}

	function serializeViewport(): string {
		return JSON.stringify(viewport);
	}

	function scheduleSave(visible: boolean) {
		if (visible) {
			pendingVisible = true;
			clearTimeout(hideTimer);
			saveStatus = 'saving';
		}

		clearTimeout(saveTimer);
		saveTimer = setTimeout(() => {
			try {
				store = persistActiveCanvas(store, { name: projectName, nodes, edges, viewport });
				if (pendingVisible) {
					saveStatus = 'saved';
					clearTimeout(hideTimer);
					hideTimer = setTimeout(() => (saveStatus = 'idle'), SAVED_VISIBLE_MS);
				}
			} catch {
				saveStatus = 'error';
			} finally {
				pendingVisible = false;
			}
		}, SAVE_DEBOUNCE_MS);
	}

	$effect(() => {
		const snapshot = serializeContent();
		if (isRestoring) {
			committed = snapshot;
			lastContentSnapshot = snapshot;
			scheduleSave(true);
			return;
		}

		if (snapshot === lastContentSnapshot) return;

		const previous = lastContentSnapshot;
		lastContentSnapshot = snapshot;
		recordChange(previous, snapshot);
		scheduleSave(true);
	});

	function pushUndo(snapshot: ContentSnapshot) {
		const next = [...undoStack, snapshot];
		undoStack = next.length > HISTORY_LIMIT ? next.slice(next.length - HISTORY_LIMIT) : next;
	}

	function flushPendingText() {
		if (textBaseline === null) return;

		clearTimeout(textTimer);
		textTimer = undefined;
		pushUndo(textBaseline);
		committed = serializeContent();
		textBaseline = null;
	}

	function recordChange(previous: ContentSnapshot, snapshot: ContentSnapshot) {
		const kind = classifyChange(committed, snapshot);
		if (gestureActive) return;
		if (kind === 'none') return;

		if (kind === 'structural') {
			if (textBaseline !== null) {
				clearTimeout(textTimer);
				textTimer = undefined;
				pushUndo(textBaseline);
				pushUndo(previous);
				textBaseline = null;
			} else {
				pushUndo(committed);
			}
			committed = snapshot;
			redoStack = [];
			return;
		}

		// Text-only change: invalidate redo immediately, capture the baseline once,
		// and (re)start the coalescing timer so a typing burst becomes one entry.
		redoStack = [];
		if (textBaseline === null) {
			textBaseline = committed;
		}
		clearTimeout(textTimer);
		textTimer = setTimeout(flushPendingText, TEXT_COALESCE_MS);
	}

	async function restoreSnapshot(snapshot: ContentSnapshot) {
		isRestoring = true;

		const decoded = decodeContentSnapshot(snapshot);
		nodes = orderNodesForParenting(decoded.nodes);
		edges = decoded.edges;
		projectName = decoded.name;
		nextPageId = getNextNumericPageId(decoded.nodes);
		nextEdgeId = getNextNumericEdgeId(decoded.edges);

		await tick();

		const applied = serializeContent();
		committed = applied;
		lastContentSnapshot = applied;
		isRestoring = false;
	}

	function resetHistory() {
		clearTimeout(textTimer);
		textTimer = undefined;
		textBaseline = null;
		undoStack = [];
		redoStack = [];
		committed = serializeContent();
	}

	async function undo() {
		flushPendingText();
		if (undoStack.length === 0) return;

		const current = serializeContent();
		const target = undoStack[undoStack.length - 1];
		undoStack = undoStack.slice(0, -1);
		redoStack = [...redoStack, current];
		await restoreSnapshot(target);
	}

	async function redo() {
		if (redoStack.length === 0) return;

		const current = serializeContent();
		const target = redoStack[redoStack.length - 1];
		redoStack = redoStack.slice(0, -1);
		undoStack = [...undoStack, current];
		await restoreSnapshot(target);
	}

	// A continuous drag (node or label) mutates content every frame. Instead of
	// recording one entry per frame, we suppress recording for the duration of the
	// gesture and finalize a single entry from the pre-gesture baseline on end.
	function beginGesture() {
		if (gestureActive) return;

		flushPendingText();
		gestureBaseline = committed;
		gestureActive = true;
	}

	function endGesture() {
		if (!gestureActive) return;

		gestureActive = false;
		const baseline = gestureBaseline;
		gestureBaseline = null;
		if (baseline === null) return;

		const current = serializeContent();
		if (current === baseline) return;

		pushUndo(baseline);
		committed = current;
		lastContentSnapshot = current;
		redoStack = [];
	}

	setContext('canvas-history', { beginGesture, endGesture });

	$effect(() => {
		const snapshot = serializeViewport();
		if (snapshot === lastViewportSnapshot) return;

		lastViewportSnapshot = snapshot;
		scheduleSave(false);
	});

	$effect(() => {
		const onHashChange = () => {
			const decoded = decodeHashToPayload(location.hash);
			if (!decoded) return;

			flushPendingSave();
			store = importCanvas(store, decoded);
			loadCanvasIntoState(getActiveCanvas(store));
			history.replaceState(null, '', location.pathname + location.search);
		};
		window.addEventListener('hashchange', onHashChange);
		return () => {
			window.removeEventListener('hashchange', onHashChange);
			clearTimeout(saveTimer);
			clearTimeout(hideTimer);
			clearTimeout(textTimer);
			clearTimeout(shareTimer);
		};
	});

	function flushPendingSave() {
		if (!saveTimer) return;

		clearTimeout(saveTimer);
		saveTimer = undefined;
		store = persistActiveCanvas(store, { name: projectName, nodes, edges, viewport });
	}

	function loadCanvasIntoState(canvas: StoredCanvas) {
		clearTimeout(saveTimer);
		clearTimeout(hideTimer);
		saveTimer = undefined;
		hideTimer = undefined;
		pendingVisible = false;
		saveStatus = 'idle';

		nodes = orderNodesForParenting(canvas.nodes);
		edges = canvas.edges;
		viewport = { ...INITIAL_VIEWPORT, ...canvas.viewport };
		projectName = canvas.name;
		nextPageId = getNextNumericPageId(canvas.nodes);
		nextEdgeId = getNextNumericEdgeId(canvas.edges);

		lastContentSnapshot = serializeContent();
		lastViewportSnapshot = serializeViewport();
		resetHistory();
	}

	function switchCanvas(id: string) {
		menuOpen = false;
		if (id === store.activeCanvasId) return;

		flushPendingSave();
		store = switchActiveCanvas(store, id);
		loadCanvasIntoState(getActiveCanvas(store));
	}

	function createNewCanvas() {
		menuOpen = false;
		flushPendingSave();
		store = createCanvas(store);
		loadCanvasIntoState(getActiveCanvas(store));
	}

	function deleteCanvasById(id: string) {
		const wasActive = id === store.activeCanvasId;
		store = deleteCanvas(store, id);
		if (wasActive) {
			loadCanvasIntoState(getActiveCanvas(store));
		}
	}

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

	function addPageAtFlowPoint(flowPoint: XYPosition) {
		const page = createPage(nextPageId++, flowPoint);
		let pageNode = pageToNode(page, { focusTitle: true });

		const section = getTopmostSectionContainingPoint(flowPoint, nodes);
		let nextNodes: CanvasFlowNode[] = [...nodes, pageNode];

		if (section) {
			pageNode = reparentPageNode(pageNode, section, nextNodes);
			nextNodes = nextNodes.map((node) => (node.id === pageNode.id ? pageNode : node));
		}

		nodes = orderNodesForParenting(nextNodes);
		activeTool = 'select';
	}

	function handlePaneClick(_: { event: MouseEvent }) {
		clearEdgeLabelSelection();
	}

	function handleCanvasPointerdown(event: PointerEvent) {
		if (activeTool === 'add-page' && event.button === 0) {
			if (isCanvasToolBlockedTarget(event.target, ADD_PAGE_BLOCKED_SELECTORS)) return;

			const flowPoint = clientPointToFlowPoint({ x: event.clientX, y: event.clientY });
			if (!flowPoint) return;

			addPageAtFlowPoint(flowPoint);
			event.preventDefault();
			event.stopPropagation();
			return;
		}

		if (activeTool !== 'add-section' || event.button !== 0) return;
		if (isCanvasToolBlockedTarget(event.target)) return;

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

	// Interactive elements that should never trigger add-page placement. Note this
	// intentionally omits the generic `.nopan`/`.nodrag` wrapper classes: SvelteFlow
	// adds `.nopan` to every draggable node wrapper (sections included), and blocking
	// on it would stop pages from being placed inside sections. Page cards are still
	// blocked explicitly via `.page-card`.
	const ADD_PAGE_BLOCKED_SELECTORS = [
		'button',
		'a',
		'input',
		'textarea',
		'select',
		'[contenteditable="true"]',
		'[role="button"]',
		'[role="textbox"]',
		'.svelte-flow__handle',
		'.svelte-flow__edge',
		'.svelte-flow__resize-control',
		'.svelte-flow__resize-control-line',
		'.svelte-flow__resize-control-handle',
		'.page-card',
		'.page-header-row',
		'.page-flow-label',
		'.section-flow-title-input'
	];

	const CANVAS_TOOL_BLOCKED_SELECTORS = [
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
	];

	function isCanvasToolBlockedTarget(
		target: EventTarget | null,
		selectors: string[] = CANVAS_TOOL_BLOCKED_SELECTORS
	) {
		if (!(target instanceof Element)) return true;

		return Boolean(target.closest(selectors.join(',')));
	}

	function handleBeforeConnect(connection: Connection): PageFlowEdgeType | false {
		if (hasPageFlowEdge(edges, connection)) return false;

		return createPageFlowEdge(`edge-${nextEdgeId++}`, connection);
	}

	function handleBeforeReconnect(
		newEdge: PageFlowEdgeType,
		oldEdge: PageFlowEdgeType
	): PageFlowEdgeType | false {
		if (
			newEdge.source === oldEdge.source &&
			newEdge.target === oldEdge.target &&
			(newEdge.sourceHandle ?? null) === (oldEdge.sourceHandle ?? null) &&
			(newEdge.targetHandle ?? null) === (oldEdge.targetHandle ?? null)
		) {
			return false;
		}

		if (hasPageFlowEdge(edges, newEdge)) return false;

		return newEdge;
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

	function handleNodeDragStart() {
		beginGesture();
	}

	function handleNodeDragStop({
		nodes: draggedNodes
	}: Parameters<NodeTargetEventWithPointer<MouseEvent | TouchEvent, CanvasFlowNode>>[0]) {
		const draggedPageIds = new Set(
			draggedNodes.filter((node) => node.type === PAGE_NODE_TYPE).map((node) => node.id)
		);

		if (draggedPageIds.size === 0) {
			setDropTargetSection(null);
			endGesture();
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
		endGesture();
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
		if (isTextEntryTarget(event.target)) return;

		const withMod = event.metaKey || event.ctrlKey;
		const key = event.key.toLowerCase();
		if (withMod && key === 'z') {
			event.preventDefault();
			if (event.shiftKey) redo();
			else undo();
			return;
		}
		if (withMod && key === 'y') {
			event.preventDefault();
			redo();
			return;
		}

		if (event.repeat) return;

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

	function setShareStatus(status: ShareStatus) {
		shareStatus = status;
		clearTimeout(shareTimer);

		if (status === 'idle') return;

		shareTimer = setTimeout(() => {
			shareStatus = 'idle';
			shareLink = '';
		}, SHARE_STATUS_VISIBLE_MS);
	}

	async function shareCanvas() {
		flushPendingSave();

		const encoded = encodeCanvasToHash({ name: projectName, nodes, edges, viewport });
		const url = buildShareUrl(encoded);

		if (isShareTooLarge(url)) {
			shareLink = '';
			setShareStatus('too-large');
			return;
		}

		try {
			if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');

			await navigator.clipboard.writeText(url);
			shareLink = '';
			setShareStatus('copied');
		} catch {
			shareLink = url;
			setShareStatus('error');
		}
	}

	function resetView() {
		setViewport({ ...INITIAL_VIEWPORT });
	}

	function handleProjectTitleKeydown(event: KeyboardEvent & { currentTarget: HTMLInputElement }) {
		event.stopPropagation();

		if (event.key === 'Enter' || event.key === 'Escape') {
			event.preventDefault();
			event.currentTarget.blur();
		}
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
			onbeforereconnect={handleBeforeReconnect}
			onbeforedelete={handleBeforeDelete}
			onselectionchange={handleSelectionChange}
			onselectionstart={handleSelectionStart}
			onselectionend={handleSelectionEnd}
			onnodedragstart={handleNodeDragStart}
			onnodedrag={handleNodeDrag}
			onnodedragstop={handleNodeDragStop}
		>
			<Background
				variant={BackgroundVariant.Dots}
				gap={32}
				size={1.5}
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
		<div
			bind:this={titleControlEl}
			class="project-title-control floating-control-button flex h-7 items-center gap-1 rounded-md border border-border bg-background pr-1 pl-2 text-xs font-medium text-foreground"
		>
			<input
				bind:value={projectName}
				class="project-title-input min-w-0 bg-transparent text-foreground outline-none select-text placeholder:text-muted-foreground"
				aria-label="Project title"
				placeholder="Untitled project"
				onkeydown={handleProjectTitleKeydown}
			/>
			<DropdownMenu.Root bind:open={menuOpen}>
				<DropdownMenu.Trigger
					class="canvas-menu-trigger flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground"
					aria-label="Switch canvas"
				>
					<HugeiconsIcon icon={ChevronDownIcon} size={14} strokeWidth={2} aria-hidden="true" />
				</DropdownMenu.Trigger>
				<DropdownMenu.Content
					customAnchor={titleControlEl}
					align="start"
					sideOffset={2}
					class="w-56"
				>
					{#each canvases as canvas (canvas.id)}
						<div class="canvas-row flex items-center gap-1">
							<button
								type="button"
								class="canvas-row-switch flex h-7 flex-1 items-center gap-2 rounded-sm px-2 text-left text-xs outline-none hover:bg-secondary"
								onclick={() => switchCanvas(canvas.id)}
							>
								<span class="flex size-4 shrink-0 items-center justify-center text-green-600">
									{#if canvas.id === store.activeCanvasId}
										<HugeiconsIcon
											icon={Tick02Icon}
											size={14}
											strokeWidth={2}
											aria-hidden="true"
										/>
									{/if}
								</span>
								<span class="truncate">{canvas.name}</span>
							</button>
							<button
								type="button"
								class="canvas-row-delete flex size-7 shrink-0 items-center justify-center rounded-sm text-muted-foreground outline-none hover:bg-secondary hover:text-destructive"
								aria-label={`Delete ${canvas.name}`}
								onclick={() => deleteCanvasById(canvas.id)}
							>
								<HugeiconsIcon icon={Delete02Icon} size={14} strokeWidth={2} aria-hidden="true" />
							</button>
						</div>
					{/each}
					<DropdownMenu.Separator />
					<Button
						type="button"
						variant="outline"
						class="w-full justify-center"
						onclick={createNewCanvas}
					>
						<HugeiconsIcon
							icon={Add01Icon}
							data-icon="inline-start"
							strokeWidth={2}
							aria-hidden="true"
						/>
						New canvas
					</Button>
				</DropdownMenu.Content>
			</DropdownMenu.Root>
		</div>
		<div class="history-controls flex items-center gap-1" role="group" aria-label="History">
			<Button
				type="button"
				variant="outline"
				size="icon"
				class="floating-control-button bg-background hover:bg-secondary"
				disabled={!canUndo}
				aria-label="Undo"
				onclick={undo}
			>
				<HugeiconsIcon icon={Undo02Icon} strokeWidth={2} aria-hidden="true" />
			</Button>
			<Button
				type="button"
				variant="outline"
				size="icon"
				class="floating-control-button bg-background hover:bg-secondary"
				disabled={!canRedo}
				aria-label="Redo"
				onclick={redo}
			>
				<HugeiconsIcon icon={Redo02Icon} strokeWidth={2} aria-hidden="true" />
			</Button>
		</div>
	</div>

	<div class="top-controls-right" role="group" aria-label="Export and share controls">
		{#if shareStatus !== 'idle'}
			<div class="share-feedback" aria-live="polite">
				<span
					class="share-status text-xs font-medium"
					class:text-green-600={shareStatus === 'copied'}
					class:text-destructive={shareStatus === 'error'}
					class:text-muted-foreground={shareStatus === 'too-large'}
				>
					{#if shareStatus === 'copied'}
						Link copied
					{:else if shareStatus === 'too-large'}
						Canvas too large to share — use Export instead
					{:else}
						Couldn't copy — copy the link below
					{/if}
				</span>
				{#if shareStatus === 'error' && shareLink}
					<input
						class="share-fallback-input h-7 w-56 rounded-md border border-border bg-background px-2 text-xs text-foreground outline-none select-text"
						type="text"
						readonly
						value={shareLink}
						aria-label="Shareable link"
						onfocus={(event) => event.currentTarget.select()}
					/>
				{/if}
			</div>
		{/if}
		<Button
			type="button"
			variant="outline"
			class="floating-control-button bg-background hover:bg-secondary"
			onclick={shareCanvas}
		>
			<HugeiconsIcon
				icon={Share08Icon}
				data-icon="inline-start"
				strokeWidth={2}
				aria-hidden="true"
			/>
			Share
		</Button>
		{#if saveStatus !== 'idle'}
			<span
				class="save-status text-muted-foreground"
				aria-live="polite"
				title={saveStatus === 'saving'
					? 'Saving'
					: saveStatus === 'saved'
						? 'Saved'
						: 'Save failed'}
			>
				{#if saveStatus === 'saving'}
					<HugeiconsIcon
						icon={Loading03Icon}
						class="animate-spin"
						size={16}
						strokeWidth={2}
						aria-hidden="true"
					/>
					<span class="sr-only">Saving</span>
				{:else if saveStatus === 'saved'}
					<HugeiconsIcon
						icon={CheckmarkCircle02Icon}
						class="text-green-600"
						size={16}
						strokeWidth={2}
						aria-hidden="true"
					/>
					<span class="sr-only">Saved</span>
				{:else}
					<HugeiconsIcon
						icon={AlertCircleIcon}
						class="text-destructive"
						size={16}
						strokeWidth={2}
						aria-hidden="true"
					/>
					<span class="sr-only">Save failed</span>
				{/if}
			</span>
		{/if}
		<Button
			type="button"
			variant="outline"
			class="floating-control-button bg-background hover:bg-secondary"
			onclick={() => (isExportOpen = true)}
		>
			<HugeiconsIcon
				icon={FileExportIcon}
				data-icon="inline-start"
				strokeWidth={2}
				aria-hidden="true"
			/>
			Export
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

	<ExportSpecDialog bind:open={isExportOpen} {nodes} {edges} {projectName} />
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

	:global(.canvas-flow.canvas-flow--add-node .svelte-flow__node:has(.section-flow-node)) {
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
		stroke: var(--color-blue-500);
	}

	.top-controls {
		position: absolute;
		top: 16px;
		left: 16px;
		z-index: 1;
		display: flex;
		align-items: center;
	}

	.top-controls-right {
		position: absolute;
		top: 16px;
		right: 16px;
		z-index: 1;
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.save-status {
		display: inline-flex;
		align-items: center;
		justify-content: center;
	}

	.share-feedback {
		display: inline-flex;
		align-items: center;
		gap: 8px;
	}

	.share-status {
		white-space: nowrap;
	}

	.share-fallback-input {
		box-shadow: var(--shadow-popover);
	}

	:global(.floating-control-button) {
		box-shadow: var(--shadow-popover);
	}

	.project-title-control:focus-within {
		border-color: var(--color-blue-500);
	}

	.project-title-input {
		field-sizing: content;
		max-width: 16rem;
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
