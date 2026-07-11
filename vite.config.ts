import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
	base: '/schema/',
	plugins: [tailwindcss(), svelte()],
	resolve: {
		conditions: process.env.VITEST ? ['browser'] : undefined,
		alias: {
			$lib: fileURLToPath(new URL('./src/lib', import.meta.url))
		}
	}
});
