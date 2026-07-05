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
		screenToWorld,
		worldToScreen,
		zoomAtPoint,
		type Point,
		type Viewport
	} from './viewport';
	import { isTextEntryTarget } from './keyboard';
	import {
		createPage,
		movePage,
		removePagesById,
		resetPageIcon,
		setPageIcon,
		setPageDescription,
		type Page
	} from './pages';
	import { findPagesInRect, normalizeRect, type SelectionRect } from './selection';
	import PageCard from './components/PageCard.svelte';

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

	type Tool = 'select' | 'add-page';

	const GRID_SIZE = 32;
	const PAGE_WIDTH = 270;
	const PAGE_MIN_HEIGHT = 96;
	const DRAG_THRESHOLD = 4;
	const ZOOM_SPEED = 0.0015;
	const KEYBOARD_PAN_STEP = 48;
	const INITIAL_VIEWPORT: Viewport = { x: 0, y: 0, scale: 1 };

	let viewport: Viewport = $state({ ...INITIAL_VIEWPORT });
	let pages: Page[] = $state([]);
	let pendingFocusPageId: number | null = $state(null);
	let openIconPickerPageId: number | null = $state(null);
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
	let surfaceElement: HTMLElement | undefined;
	const titleInputElements: Record<number, HTMLInputElement | undefined> = {};

	let zoomPercent = $derived(Math.round(viewport.scale * 100));
	let gridSize = $derived(GRID_SIZE * viewport.scale);
	let gridOffsetX = $derived(wrap(viewport.x, gridSize));
	let gridOffsetY = $derived(wrap(viewport.y, gridSize));
	let isPanActive = $derived(isSpacePanning);
	let marqueeRect: SelectionRect | null = $derived(
		marqueeDrag?.hasDragged ? normalizeRect(marqueeDrag.start, marqueeDrag.current) : null
	);
	let visibleSelectedPageIds: number[] = $derived(
		marqueeRect ? findPagesInRect(pages, marqueeRect) : selectedPageIds
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

	function stopCanvasEvent(event: Event) {
		event.stopPropagation();
	}

	function stopCanvasDragEvent(event: PointerEvent) {
		event.preventDefault();
		event.stopPropagation();
	}

	function isPageHeaderControlTarget(target: EventTarget | null): boolean {
		if (!(target instanceof Element)) return false;

		return Boolean(
			target.closest(
				'button,input,select,textarea,[contenteditable],[data-page-header-control],[data-slot="popover-content"]'
			)
		);
	}

	function isPageTarget(target: EventTarget | null): boolean {
		return target instanceof Element && Boolean(target.closest('.page-card'));
	}

	function trackSurface(node: HTMLElement) {
		surfaceElement = node;

		return () => {
			if (surfaceElement === node) {
				surfaceElement = undefined;
			}
		};
	}

	function trackTitleInput(pageId: number) {
		return (node: HTMLInputElement) => {
			titleInputElements[pageId] = node;

			if (pendingFocusPageId === pageId && focusedPageId !== pageId) {
				node.focus();
				node.select();
				focusedPageId = pageId;
			}

			return () => {
				if (titleInputElements[pageId] === node) {
					delete titleInputElements[pageId];
				}
			};
		};
	}

	function addPage(screenPoint: Point) {
		const worldPoint = screenToWorld(screenPoint, viewport);
		const page = createPage(nextPageId++, worldPoint);

		pages.push(page);
		pendingFocusPageId = page.id;
		activeTool = 'select';
	}

	function movePageById(pageId: number, point: Point) {
		pages = pages.map((page) => (page.id === pageId ? movePage(page, point) : page));
	}

	function updatePageTitle(pageId: number, title: string) {
		pages = pages.map((page) => (page.id === pageId ? { ...page, title } : page));
	}

	function updatePageDescription(pageId: number, description: string) {
		pages = pages.map((page) =>
			page.id === pageId ? setPageDescription(page, description) : page
		);
	}

	function setPageIconById(pageId: number, iconKey: string) {
		pages = pages.map((page) => (page.id === pageId ? setPageIcon(page, iconKey) : page));
		openIconPickerPageId = null;
	}

	function resetPageIconById(pageId: number) {
		pages = pages.map((page) => (page.id === pageId ? resetPageIcon(page) : page));
		openIconPickerPageId = null;
	}

	function setIconPickerOpen(pageId: number, open: boolean) {
		openIconPickerPageId = open ? pageId : null;
	}

	function isSelected(pageId: number): boolean {
		return selectedPageIds.includes(pageId);
	}

	function isVisiblySelected(pageId: number): boolean {
		return visibleSelectedPageIds.includes(pageId);
	}

	function selectOnly(pageId: number) {
		selectedPageIds = [pageId];
	}

	function deleteSelectedPages() {
		if (selectedPageIds.length === 0) return false;

		pages = removePagesById(pages, selectedPageIds);
		selectedPageIds = [];
		selectionDrag = null;
		marqueeDrag = null;
		pendingFocusPageId = null;
		focusedPageId = null;

		return true;
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

		if (isPageHeaderControlTarget(event.target)) {
			stopCanvasEvent(event);
			return;
		}

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

	function handlePageControlPointerDown(event: PointerEvent, page: Page) {
		if (activeTool === 'select' && !isSpacePanning) {
			selectOnly(page.id);
		}

		stopCanvasEvent(event);
	}

	function blurActivePageControl() {
		const activeElement = document.activeElement;

		if (!(activeElement instanceof HTMLElement) || !activeElement.closest('.page-card')) return;

		if (activeElement.classList.contains('page-title-input')) {
			pendingFocusPageId = null;
			focusedPageId = null;
		}

		activeElement.blur();
	}

	function returnFocusToCanvas() {
		surfaceElement?.focus();
	}

	function handleTitleInputKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			event.preventDefault();
			blurActivePageControl();
			returnFocusToCanvas();
		}

		event.stopPropagation();
	}

	function handlePointerDown(event: PointerEvent) {
		if (event.button !== 0) return;

		const surface = event.currentTarget as HTMLElement;
		const point = getLocalPoint(event, surface);

		event.preventDefault();
		blurActivePageControl();

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

			if (!isPageTarget(event.target)) {
				selectedPageIds = [];
			}

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
		if (isTextEntryTarget(event.target) || event.repeat) return;

		if (event.key === 'Backspace' || event.key === 'Delete') {
			if (deleteSelectedPages()) {
				event.preventDefault();
			}
			return;
		}

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
</script>

<svelte:window onkeydown={handleWindowKeydown} onkeyup={handleWindowKeyup} />

<section class="canvas-view" aria-label="Prototype infinite canvas">
	<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
	<div
		{@attach trackSurface}
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
					class="selection-marquee absolute z-[1] pointer-events-none rounded-sm border border-blue-500 bg-blue-500/10"
					style:left={`${marqueeRect.x}px`}
					style:top={`${marqueeRect.y}px`}
					style:width={`${marqueeRect.width}px`}
					style:height={`${marqueeRect.height}px`}
				></div>
			{/if}
			{#each pages as page (page.id)}
				{@const screenPoint = worldToScreen(page, INITIAL_VIEWPORT)}
				<PageCard
					{page}
					{screenPoint}
					selected={isVisiblySelected(page.id)}
					pageWidth={PAGE_WIDTH}
					pageMinHeight={PAGE_MIN_HEIGHT}
					iconPickerOpen={openIconPickerPageId === page.id}
					titleInputAttachment={trackTitleInput(page.id)}
					onHeaderPointerDown={handlePagePointerDown}
					onHeaderPointerMove={handlePagePointerMove}
					onHeaderPointerUp={finishPagePointer}
					onHeaderPointerCancel={cancelPagePointer}
					onPageControlPointerDown={handlePageControlPointerDown}
					onStopCanvasEvent={stopCanvasEvent}
					onTitleKeydown={handleTitleInputKeydown}
					onTitleInput={updatePageTitle}
					onDescriptionInput={updatePageDescription}
					onIconPickerOpenChange={setIconPickerOpen}
					onIconChange={setPageIconById}
					onIconReset={resetPageIconById}
				/>
			{/each}
		</div>
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

	.surface:focus {
		outline: none;
	}

	.world {
		position: absolute;
		inset: 0;
		transform-origin: 0 0;
		will-change: transform;
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
