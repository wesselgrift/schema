<script lang="ts">
	import {
		screenToWorld,
		worldToScreen,
		zoomAtPoint,
		type Point,
		type Viewport
	} from './viewport';
	import { createPage, movePage, type Page } from './pages';
	import { findPagesInRect, normalizeRect, type SelectionRect } from './selection';

	type DragState = {
		pointerId: number;
		start: Point;
		last: Point;
		viewportStart: Viewport;
		hasDragged: boolean;
	};

	type PageDragState = {
		pointerId: number;
		pageId: number;
		startScreen: Point;
		startWorld: Point;
	};

	type SelectionPageStart = Point & {
		id: number;
	};

	type SelectionDragState = {
		pointerId: number;
		startScreen: Point;
		startWorld: Point;
		pages: SelectionPageStart[];
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

	type Tool = 'select' | 'add-page' | 'pan';

	const GRID_SIZE = 32;
	const PAGE_WIDTH = 180;
	const PAGE_MIN_HEIGHT = 96;
	const DRAG_THRESHOLD = 4;
	const ZOOM_SPEED = 0.0015;
	const KEYBOARD_PAN_STEP = 48;
	const INITIAL_VIEWPORT: Viewport = { x: 0, y: 0, scale: 1 };

	let viewport: Viewport = $state({ ...INITIAL_VIEWPORT });
	let pages: Page[] = $state([]);
	let pendingFocusPageId: number | null = $state(null);
	let activeTool = $state<Tool>('select');
	let isSpacePanning = $state(false);
	let nextPageId = 1;
	let selectedPageIds = $state<number[]>([]);
	let selectionDrag = $state<SelectionDragState | null>(null);
	let marqueeDrag = $state<MarqueeDragState | null>(null);
	let drag: DragState | null = null;
	let addClick: AddClickState | null = null;
	let pageDrag: PageDragState | null = null;
	let focusedPageId: number | null = null;
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
		activeTool === 'select'
			? 'Canvas. Click pages to select, drag empty canvas to marquee select, hold Space and drag to pan, command or control wheel to zoom.'
			: isPanActive
			? 'Canvas. Drag to pan, wheel or trackpad scroll to pan, command or control wheel to zoom.'
			: 'Canvas. Click empty canvas or press Enter to add a page, hold Space and drag to pan, command or control wheel to zoom.'
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

	function stopCanvasEvent(event: Event) {
		event.stopPropagation();
	}

	function stopCanvasDragEvent(event: PointerEvent) {
		event.preventDefault();
		event.stopPropagation();
	}

	function trackTextarea(pageId: number) {
		return (node: HTMLTextAreaElement) => {
			textareaElements[pageId] = node;

			if (pendingFocusPageId === pageId && focusedPageId !== pageId) {
				node.focus();
				node.select();
				focusedPageId = pageId;
			}

			return () => {
				if (textareaElements[pageId] === node) {
					delete textareaElements[pageId];
				}
			};
		};
	}

	function addPage(screenPoint: Point) {
		const worldPoint = screenToWorld(screenPoint, viewport);
		const page = createPage(nextPageId++, worldPoint);

		pages.push(page);
		pendingFocusPageId = page.id;
	}

	function movePageById(pageId: number, point: Point) {
		pages = pages.map((page) => (page.id === pageId ? movePage(page, point) : page));
	}

	function isSelected(pageId: number): boolean {
		return selectedPageIds.includes(pageId);
	}

	function selectOnly(pageId: number) {
		selectedPageIds = [pageId];
	}

	function moveSelectedPages(delta: Point, starts: SelectionPageStart[]) {
		const startPositions = new Map(starts.map((page) => [page.id, page]));

		pages = pages.map((page) => {
			const start = startPositions.get(page.id);
			return start ? movePage(page, { x: start.x + delta.x, y: start.y + delta.y }) : page;
		});
	}

	function handlePagePointerDown(event: PointerEvent, page: Page) {
		if (event.button !== 0) return;

		const header = event.currentTarget as HTMLElement;

		stopCanvasDragEvent(event);
		header.setPointerCapture(event.pointerId);

		if (activeTool === 'select' && !isSpacePanning) {
			const surface = getSurfaceFromCurrentTarget(event);
			if (!surface) return;

			if (!isSelected(page.id)) {
				selectOnly(page.id);
			}

			selectionDrag = {
				pointerId: event.pointerId,
				startScreen: { x: event.clientX, y: event.clientY },
				startWorld: getWorldPoint(event, surface),
				pages: pages
					.filter((selectedPage) => selectedPageIds.includes(selectedPage.id))
					.map((selectedPage) => ({ id: selectedPage.id, x: selectedPage.x, y: selectedPage.y })),
				hasDragged: false
			};
			return;
		}

		pageDrag = {
			pointerId: event.pointerId,
			pageId: page.id,
			startScreen: { x: event.clientX, y: event.clientY },
			startWorld: { x: page.x, y: page.y }
		};
	}

	function handlePagePointerMove(event: PointerEvent) {
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
				moveSelectedPages(
					{
						x: currentWorld.x - selectionDrag.startWorld.x,
						y: currentWorld.y - selectionDrag.startWorld.y
					},
					selectionDrag.pages
				);
			}
			return;
		}

		if (!pageDrag || pageDrag.pointerId !== event.pointerId) return;

		const dx = (event.clientX - pageDrag.startScreen.x) / viewport.scale;
		const dy = (event.clientY - pageDrag.startScreen.y) / viewport.scale;

		movePageById(pageDrag.pageId, {
			x: pageDrag.startWorld.x + dx,
			y: pageDrag.startWorld.y + dy
		});
	}

	function finishPagePointer(event: PointerEvent) {
		stopCanvasDragEvent(event);

		if (selectionDrag?.pointerId === event.pointerId) {
			const header = event.currentTarget as HTMLElement;

			if (header.hasPointerCapture(event.pointerId)) {
				header.releasePointerCapture(event.pointerId);
			}

			selectionDrag = null;
			return;
		}

		if (!pageDrag || pageDrag.pointerId !== event.pointerId) return;

		const header = event.currentTarget as HTMLElement;

		if (header.hasPointerCapture(event.pointerId)) {
			header.releasePointerCapture(event.pointerId);
		}

		pageDrag = null;
	}

	function cancelPagePointer(event: PointerEvent) {
		stopCanvasDragEvent(event);

		if (selectionDrag?.pointerId === event.pointerId) {
			const header = event.currentTarget as HTMLElement;

			if (header.hasPointerCapture(event.pointerId)) {
				header.releasePointerCapture(event.pointerId);
			}

			selectionDrag = null;
			return;
		}

		if (!pageDrag || pageDrag.pointerId !== event.pointerId) return;

		const header = event.currentTarget as HTMLElement;

		if (header.hasPointerCapture(event.pointerId)) {
			header.releasePointerCapture(event.pointerId);
		}

		pageDrag = null;
	}

	function handleTextareaPointerDown(event: PointerEvent, page: Page) {
		if (activeTool === 'select' && !isSpacePanning) {
			selectOnly(page.id);
		}

		stopCanvasEvent(event);
	}

	function blurActiveTextarea() {
		const activeElement = document.activeElement;
		if (activeElement instanceof HTMLTextAreaElement && activeElement.classList.contains('page-body')) {
			activeElement.blur();
			pendingFocusPageId = null;
			focusedPageId = null;
		}
	}

	function handleTextareaKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			event.preventDefault();
			blurActiveTextarea();
		}

		event.stopPropagation();
	}

	function handlePointerDown(event: PointerEvent) {
		if (event.button !== 0) return;

		const surface = event.currentTarget as HTMLElement;
		const point = getLocalPoint(event, surface);

		event.preventDefault();
		blurActiveTextarea();

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

		if (activeTool === 'add-page' && !isSpacePanning) {
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
			selectedPageIds = findPagesInRect(pages, normalizeRect(marqueeDrag.start, marqueeDrag.current));
			marqueeDrag = null;
			return;
		}

		if (addClick?.pointerId === event.pointerId) {
			if (surface.hasPointerCapture(event.pointerId)) {
				surface.releasePointerCapture(event.pointerId);
			}

			if (activeTool === 'add-page' && !isSpacePanning && !addClick.hasDragged) {
				addPage(point);
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
				if (activeTool !== 'add-page' || isSpacePanning) {
					handled = false;
					break;
				}
				addPage(center);
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

	function clearPages() {
		pages = [];
		selectedPageIds = [];
		selectionDrag = null;
		marqueeDrag = null;
		pendingFocusPageId = null;
	}
</script>

<svelte:window onkeydown={handleWindowKeydown} onkeyup={handleWindowKeyup} />

<section class="canvas-view" aria-label="Prototype infinite canvas">
	<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
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
			{#if marqueeRect}
				<div
					class="selection-marquee"
					style:left={`${marqueeRect.x}px`}
					style:top={`${marqueeRect.y}px`}
					style:width={`${marqueeRect.width}px`}
					style:height={`${marqueeRect.height}px`}
				></div>
			{/if}
			{#each pages as page (page.id)}
				{@const screenPoint = worldToScreen(page, INITIAL_VIEWPORT)}
				<div
					class="page-card"
					class:selected={isSelected(page.id)}
					style:left={`${screenPoint.x}px`}
					style:top={`${screenPoint.y}px`}
					style:--page-width={`${PAGE_WIDTH}px`}
					style:--page-min-height={`${PAGE_MIN_HEIGHT}px`}
				>
					<div class="page-header-row">
						<button
							type="button"
							class="page-header"
							aria-label={`Drag page ${page.id}`}
							onpointerdown={(event) => handlePagePointerDown(event, page)}
							onpointermove={handlePagePointerMove}
							onpointerup={finishPagePointer}
							onpointercancel={cancelPagePointer}
							onclick={stopCanvasEvent}
							onkeydown={stopCanvasEvent}
						>
							<span>{page.title}</span>
						</button>
					</div>
					<textarea
						{@attach trackTextarea(page.id)}
						class="page-body"
						aria-label={`Page ${page.id}`}
						placeholder="Describe this page..."
						bind:value={page.description}
						onpointerdown={(event) => handleTextareaPointerDown(event, page)}
						onpointermove={stopCanvasEvent}
						onpointerup={stopCanvasEvent}
						onpointercancel={stopCanvasEvent}
						onkeydown={handleTextareaKeydown}
					></textarea>
				</div>
			{/each}
		</div>
	</div>

	<div
		class="stats-panel"
		role="group"
		aria-label="Canvas controls"
	>
		<div class="stat">
			<span>Pages</span>
			<strong>{pages.length}</strong>
		</div>
		<div class="stat">
			<span>Zoom</span>
			<strong>{zoomPercent}%</strong>
		</div>
		<button type="button" onclick={resetView}>Reset view</button>
		<button type="button" onclick={clearPages} disabled={pages.length === 0}>Clear pages</button>
	</div>

	<div
		class="tool-dock"
		role="toolbar"
		tabindex="-1"
		aria-label="Canvas tools"
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
			class:active={activeTool === 'add-page'}
			aria-pressed={activeTool === 'add-page'}
			onclick={() => (activeTool = 'add-page')}
		>
			Add page
		</button>
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

	.surface {
		position: absolute;
		inset: 0;
		touch-action: none;
		user-select: none;
		background-image: radial-gradient(circle, var(--canvas-grid) 1px, transparent 1.25px);
		background-position: var(--grid-offset-x) var(--grid-offset-y);
		background-size: var(--grid-size) var(--grid-size);
	}

	.surface:active {
		cursor: grabbing;
	}

	.surface:focus-visible {
		outline: 2px solid var(--primary);
		outline-offset: -4px;
	}

	.world {
		position: absolute;
		inset: 0;
		transform-origin: 0 0;
		will-change: transform;
	}

	.selection-marquee {
		position: absolute;
		z-index: 1;
		border: 1px solid var(--selection-border);
		border-radius: var(--radius-sm);
		background: var(--selection);
		pointer-events: none;
	}

	.page-card {
		position: absolute;
		z-index: 2;
		width: var(--page-width, 180px);
		transform: translate(-50%, -50%);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		overflow: hidden;
		background: var(--card);
		box-shadow: var(--shadow-card);
	}

	.page-card.selected {
		border-color: color-mix(in srgb, var(--accent-foreground) 50%, transparent);
		background: var(--accent);
		box-shadow: var(--shadow-card-active);
	}

	.page-header-row {
		display: flex;
		align-items: center;
		gap: 8px;
		width: 100%;
		min-height: 28px;
		background: var(--muted);
	}

	.page-card.selected .page-header-row {
		background: color-mix(in srgb, var(--primary) 35%, var(--card));
	}

	.page-header {
		display: flex;
		flex: 1 1 auto;
		align-items: center;
		align-self: stretch;
		min-width: 0;
		border: 0;
		border-radius: 0;
		padding: 0 10px;
		color: var(--secondary-foreground);
		background: transparent;
		cursor: grab;
		font-size: 0.78rem;
		font-weight: 700;
		line-height: 1;
		touch-action: none;
		user-select: none;
	}

	.page-header:active {
		cursor: grabbing;
	}

	.page-header:focus-visible {
		outline: 2px solid var(--ring);
		outline-offset: -2px;
	}

	.page-body {
		display: block;
		width: 100%;
		min-height: var(--page-min-height, 96px);
		resize: both;
		border: 0;
		padding: 12px;
		color: var(--card-foreground);
		background: transparent;
		cursor: text;
		font: inherit;
		line-height: 1.35;
		user-select: text;
	}

	.page-card:focus-within {
		border-color: var(--primary);
		box-shadow:
			0 0 0 2px color-mix(in srgb, var(--primary) 28%, transparent),
			var(--shadow-card-active);
	}

	.page-body:focus {
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
		border: 1px solid color-mix(in srgb, var(--border) 75%, transparent);
		border-radius: var(--radius-xl);
		background: var(--popover);
		box-shadow: var(--shadow-popover);
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
		border: 1px solid color-mix(in srgb, var(--border) 75%, transparent);
		border-radius: var(--radius-2xl);
		background: color-mix(in srgb, var(--popover) 95%, var(--card));
		box-shadow: var(--shadow-popover);
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
		color: var(--muted-foreground);
		font-size: 0.72rem;
		line-height: 1;
	}

	.stat strong {
		color: var(--card-foreground);
		font-size: 0.92rem;
		line-height: 1.2;
	}

	button {
		border: 1px solid var(--input);
		border-radius: var(--radius-md);
		padding: 7px 10px;
		color: var(--foreground);
		background: var(--card);
		cursor: pointer;
	}

	button:hover:not(:disabled),
	button:focus-visible {
		border-color: var(--primary);
		color: var(--accent-foreground);
	}

	button.active {
		border-color: var(--primary);
		color: var(--accent-foreground);
		background: var(--accent);
	}

	button:disabled {
		cursor: not-allowed;
		opacity: 0.5;
	}
</style>
