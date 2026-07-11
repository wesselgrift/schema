<script lang="ts">
	import { SvelteFlowProvider } from '@xyflow/svelte';
	import { Toaster } from '$lib/components/ui/sonner';
	import { ModeWatcher, mode, setMode } from 'mode-watcher';
	import CanvasView from './lib/canvas/CanvasView.svelte';

	$effect(() => {
		if (mode.current === 'dark') {
			setMode('light');
		}
	});
</script>

<ModeWatcher defaultMode="light" track={false} />

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
