<script lang="ts">
	import type { Attachment } from 'svelte/attachments';
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
		onAddElement: (pageId: number) => void;
		onIconPickerOpenChange: (pageId: number, open: boolean) => void;
		onIconChange: (pageId: number, iconKey: string) => void;
		onIconReset: (pageId: number) => void;
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
		onAddElement,
		onIconPickerOpenChange,
		onIconChange,
		onIconReset
	}: Props = $props();
</script>

<div
	class={[
		'page-card absolute z-[2] w-[var(--page-width)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-lg border border-border bg-card shadow-[var(--shadow-card)] focus-within:border-primary focus-within:shadow-[0_0_0_2px_color-mix(in_srgb,var(--primary)_28%,transparent),var(--shadow-card-active)]',
		{
			'selected border-accent-foreground/50 shadow-[var(--shadow-card-active)]': selected
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
				'bg-primary/20': selected,
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
			onIconReset={onIconReset}
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
		<button
			type="button"
			class="add-element-button justify-self-start border border-input rounded-md px-2 py-[5px] text-foreground bg-card text-[0.78rem] leading-[1.1] cursor-pointer hover:border-primary hover:text-accent-foreground focus-visible:border-primary focus-visible:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50"
			onclick={() => onAddElement(page.id)}
			onpointerdown={(event) => onPageControlPointerDown(event, page)}
			onpointermove={onStopCanvasEvent}
			onpointerup={onStopCanvasEvent}
			onpointercancel={onStopCanvasEvent}
			onkeydown={onStopCanvasEvent}
		>
			Add element
		</button>
		<ul class="page-elements grid gap-1.5 m-0 p-0 list-none font-[inherit] leading-[1.35]" aria-label={`Elements on ${page.title || `page ${page.id}`}`}>
			{#each page.elements as element (element.id)}
				<li
					class="border border-[color-mix(in_srgb,var(--border)_72%,transparent)] rounded-md px-2 py-[7px] bg-[color-mix(in_srgb,var(--card)_82%,var(--muted))] text-[0.78rem]"
				>
					{element.title}
				</li>
			{/each}
		</ul>
	</div>
</div>
