import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'path';

// Vitest configuration for SvelteKit
// Workaround: Wrap the Svelte plugin to intercept configureServer and prevent hot-update errors
const sveltePlugin = svelte({
	hot: false, // Disable hot reload in test environment
	compilerOptions: {
		dev: true
	}
});

// Create a wrapper plugin that safely handles configureServer
const safeSveltePlugin = {
	...sveltePlugin,
	configureServer(server: any) {
		// Only call configureServer if environments exists (not available in Vitest)
		if (server && server.environments && typeof server.environments === 'object') {
			return sveltePlugin.configureServer?.(server);
		}
		// In Vitest, skip configureServer to avoid the error
		return;
	}
};

export default defineConfig({
	plugins: [
		tailwindcss(),
		// Use wrapped Svelte plugin that safely handles Vitest environment
		safeSveltePlugin as any
	],
	resolve: {
		dedupe: ['three'],
		alias: {
			$lib: resolve(__dirname, './src/lib')
		}
	},
	test: {
		include: ['src/**/*.{test,spec}.{js,ts}'],
		environment: 'jsdom',
		setupFiles: ['./src/tests/setup.ts'],
		globals: true,
		coverage: {
			provider: 'v8',
			reporter: ['text', 'json', 'html'],
			exclude: [
				'node_modules/',
				'src/tests/',
				'**/*.d.ts',
				'**/*.config.*',
				'**/routes/**'
			]
		}
	}
});

