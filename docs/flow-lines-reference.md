# Flow Lines Reference

Flow lines were temporarily removed from the active canvas so page and element modeling can evolve first. This document preserves the previous approach for reintroducing directed page-to-page flows later.

## What It Did

- Stored directed edges between pages.
- Let the user click a connector handle on one page, then another page, to create a flow.
- Rendered each flow as an SVG cubic bezier curve.
- Recomputed paths from page positions, so lines followed pages while dragging.

## Data Model

```ts
export type FlowEdge = {
	id: number;
	fromPageId: number;
	toPageId: number;
};

export function createFlowEdge(id: number, fromPageId: number, toPageId: number): FlowEdge {
	return { id, fromPageId, toPageId };
}

export function hasFlowEdge(edges: FlowEdge[], fromPageId: number, toPageId: number): boolean {
	return edges.some((edge) => edge.fromPageId === fromPageId && edge.toPageId === toPageId);
}
```

## Canvas State

```ts
let flowEdges: FlowEdge[] = $state([]);
let nextEdgeId = 1;
let pendingConnectionPageId: number | null = $state(null);
```

`pendingConnectionPageId` represented the selected source page. Clicking the same page again cancelled the pending connection. Clicking another page created the edge when it did not already exist.

## Connection Handler

```ts
function handleConnectorClick(event: MouseEvent, pageId: number) {
	event.preventDefault();
	event.stopPropagation();

	if (pendingConnectionPageId === null) {
		pendingConnectionPageId = pageId;
		return;
	}

	if (pendingConnectionPageId === pageId) {
		pendingConnectionPageId = null;
		return;
	}

	if (!hasFlowEdge(flowEdges, pendingConnectionPageId, pageId)) {
		flowEdges.push(createFlowEdge(nextEdgeId++, pendingConnectionPageId, pageId));
	}

	pendingConnectionPageId = null;
}
```

## Path Rendering

```ts
function getEdgePath(fromPage: Page, toPage: Page): string {
	const dx = toPage.x - fromPage.x;
	const controlDistance = Math.max(Math.abs(dx) * 0.5, PAGE_WIDTH * 0.45);
	const direction = dx >= 0 ? 1 : -1;
	const sourceControlX = fromPage.x + controlDistance * direction;
	const targetControlX = toPage.x - controlDistance * direction;

	return `M ${fromPage.x} ${fromPage.y} C ${sourceControlX} ${fromPage.y}, ${targetControlX} ${toPage.y}, ${toPage.x} ${toPage.y}`;
}
```

The SVG layer sat inside the transformed world, before page cards, and used page world coordinates directly:

```svelte
<svg class="flow-layer" aria-hidden="true">
	<defs>
		<marker id="flow-arrow" markerWidth="10" markerHeight="10" refX="9" refY="5" orient="auto">
			<path class="flow-arrow-head" d="M 0 0 L 10 5 L 0 10 z" />
		</marker>
	</defs>
	{#each flowEdges as edge (edge.id)}
		{@const fromPage = getPageById(edge.fromPageId)}
		{@const toPage = getPageById(edge.toPageId)}
		{#if fromPage && toPage}
			<path class="flow-edge" d={getEdgePath(fromPage, toPage)} marker-end="url(#flow-arrow)" />
		{/if}
	{/each}
</svg>
```

## Reintroduction Notes

- Reintroduce flows only after page sub-elements have a clearer model.
- Decide whether flows connect pages, elements, or both.
- If flows connect elements, replace `fromPageId` / `toPageId` with endpoint objects such as `{ pageId, elementId? }`.
- Keep SVG rendering in the transformed world layer so paths stay aligned with panning and zooming.
- Preserve duplicate prevention with an endpoint-aware version of `hasFlowEdge`.
