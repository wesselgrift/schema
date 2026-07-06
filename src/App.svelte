<script lang="ts">
	import { SvelteFlowProvider } from '@xyflow/svelte';
	import CanvasView from './lib/canvas/CanvasView.svelte';
</script>

<main class="app-shell">
	<SvelteFlowProvider>
		<CanvasView />
	</SvelteFlowProvider>
</main>

<style>
	.app-shell {
		width: 100%;
		height: 100%;
	}
</style>
