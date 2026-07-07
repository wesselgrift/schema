<script lang="ts">
	import { SvelteFlowProvider } from '@xyflow/svelte';
	import { Toaster } from '$lib/components/ui/sonner';
	import CanvasView from './lib/canvas/CanvasView.svelte';
</script>

<main class="app-shell">
	<SvelteFlowProvider>
		<CanvasView />
	</SvelteFlowProvider>
	<Toaster position="top-center" />
</main>

<style>
	.app-shell {
		width: 100%;
		height: 100%;
	}
</style>
