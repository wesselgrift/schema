<script lang="ts">
	import type { Attachment } from 'svelte/attachments';
	import { Textarea } from '$lib/components/ui/textarea';
	import PageIconPicker from './PageIconPicker.svelte';
	import type { Page } from '../pages';
	import type { Point } from '../viewport';

	interface Props {
		page: Page;
		screenPoint: Point;
		selected: boolean;
		pageWidth: number;
		pageMinHeight: number;
		iconPickerOpen: boolean;
		titleInputAttachment: Attachment<HTMLInputElement>;
		onHeaderPointerDown: (event: PointerEvent, page: Page) => void;
		onHeaderPointerMove: (event: PointerEvent) => void;
		onHeaderPointerUp: (event: PointerEvent) => void;
		onHeaderPointerCancel: (event: PointerEvent) => void;
		onPageControlPointerDown: (event: PointerEvent, page: Page) => void;
		onStopCanvasEvent: (event: Event) => void;
		onTitleKeydown: (event: KeyboardEvent) => void;
		onTitleInput: (pageId: number, title: string) => void;
		onDescriptionInput: (pageId: number, description: string) => void;
		onIconPickerOpenChange: (pageId: number, open: boolean) => void;
		onIconChange: (pageId: number, iconKey: string) => void;
	}

	let {
		page,
		screenPoint,
		selected,
		pageWidth,
		pageMinHeight,
		iconPickerOpen,
		titleInputAttachment,
		onHeaderPointerDown,
		onHeaderPointerMove,
		onHeaderPointerUp,
		onHeaderPointerCancel,
		onPageControlPointerDown,
		onStopCanvasEvent,
		onTitleKeydown,
		onTitleInput,
		onDescriptionInput,
		onIconPickerOpenChange,
		onIconChange
	}: Props = $props();
</script>

<div
	class={[
		'page-card absolute z-[2] w-[var(--page-width)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-lg border border-border bg-card shadow-[var(--shadow-card)]',
		{
			'selected border-blue-400!': selected
		}
	]}
	style:left={`${screenPoint.x}px`}
	style:top={`${screenPoint.y}px`}
	style:--page-width={`${pageWidth}px`}
	style:--page-min-height={`${pageMinHeight}px`}
>
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class={[
			'page-header-row flex w-full min-h-10 items-center gap-0.5 px-1 cursor-grab active:cursor-grabbing touch-none select-none',
			{
				'bg-blue-50': selected,
				'bg-muted/50': !selected
			}
		]}
		onpointerdown={(event) => onHeaderPointerDown(event, page)}
		onpointermove={onHeaderPointerMove}
		onpointerup={onHeaderPointerUp}
		onpointercancel={onHeaderPointerCancel}
	>
		<PageIconPicker
			pageId={page.id}
			pageTitle={page.title}
			iconKey={page.icon}
			open={iconPickerOpen}
			onOpenChange={onIconPickerOpenChange}
			onIconChange={onIconChange}
			onStopCanvasEvent={onStopCanvasEvent}
		/>
		<input
			{@attach titleInputAttachment}
			class="page-title-input flex-[0_1_auto] min-w-0 w-auto max-w-full border-0 rounded-sm h-8 p-0 text-secondary-foreground bg-transparent text-[0.78rem] font-medium leading-none cursor-text select-text focus:outline-none"
			aria-label={`Page ${page.id} title`}
			size={Math.max(page.title.length, 4)}
			value={page.title}
			onpointerdown={(event) => onPageControlPointerDown(event, page)}
			onpointermove={onStopCanvasEvent}
			onpointerup={onStopCanvasEvent}
			onpointercancel={onStopCanvasEvent}
			onkeydown={onTitleKeydown}
			oninput={(event) => onTitleInput(page.id, event.currentTarget.value)}
		/>
	</div>
	<div class="page-content grid gap-[10px] min-h-[var(--page-min-height)] p-3 text-card-foreground bg-transparent select-none">
		<Textarea
			value={page.description}
			placeholder="Describe this page"
			aria-label={`Description for ${page.title || `page ${page.id}`}`}
			class="min-h-24 resize-none border-0 bg-transparent p-0 text-[0.78rem] leading-[1.35] shadow-none focus-visible:ring-0 focus-visible:border-transparent placeholder:text-muted-foreground"
			oninput={(event) => onDescriptionInput(page.id, event.currentTarget.value)}
			onpointerdown={(event) => onPageControlPointerDown(event, page)}
			onpointermove={onStopCanvasEvent}
			onpointerup={onStopCanvasEvent}
			onpointercancel={onStopCanvasEvent}
			onkeydown={onStopCanvasEvent}
		/>
	</div>
</div>
