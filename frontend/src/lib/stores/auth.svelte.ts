import { getContext, setContext } from 'svelte';
import { browser } from '$app/environment';
import { supabase } from '$lib/supabaseClient';
import type { User } from '@supabase/supabase-js';

export { supabase };

const AUTH_CONTEXT_KEY = Symbol('auth');

class AuthStore {
	user = $state<User | null>(null);
	initialized = $state(false);

	constructor() {
		// Only initialize on client to avoid hydration mismatch
		if (browser) {
			this.initializeAuth();
		}
	}

	async initializeAuth() {
		const { data: { session } } = await supabase.auth.getSession();
		if (session) {
			this.user = session.user;
		}

		supabase.auth.onAuthStateChange((event, session) => {
			this.user = session?.user ?? null;
		});
		
		this.initialized = true;
	}
}

export function createAuthContext() {
	const authStore = new AuthStore();
	setContext(AUTH_CONTEXT_KEY, authStore);
	return authStore;
}

export function getAuthContext(): AuthStore {
	const context = getContext<AuthStore>(AUTH_CONTEXT_KEY);
	if (!context) {
		throw new Error('Auth context not found. Make sure to call createAuthContext() in the root layout.');
	}
	return context;
}

