import '@testing-library/jest-dom';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/svelte';

// Set test environment variables before any imports
if (typeof process !== 'undefined') {
	process.env.VITEST = 'true';
	process.env.NODE_ENV = 'test';
}

// Cleanup after each test
afterEach(() => {
	cleanup();
});

// Mock browser APIs for testing
global.fetch = global.fetch || (() => Promise.resolve(new Response()));
Object.defineProperty(window, 'matchMedia', {
	writable: true,
	value: vi.fn().mockImplementation(query => ({
		matches: false,
		media: query,
		onchange: null,
		addListener: vi.fn(),
		removeListener: vi.fn(),
		addEventListener: vi.fn(),
		removeEventListener: vi.fn(),
		dispatchEvent: vi.fn(),
	})),
});

