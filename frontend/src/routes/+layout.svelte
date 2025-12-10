<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import '../app.css';
	import { createAuthContext, supabase } from '$lib/stores/auth';
	import { Button } from '$lib/components/ui/button';

	let { children } = $props();

	const auth = createAuthContext();
	let mounted = $state(false);

	onMount(() => {
		mounted = true;
	});

	async function handleLogout() {
		const { error } = await supabase.auth.signOut();
		if (error) {
			console.error('Error logging out:', error.message);
		}
	}
</script>

<div class="flex flex-col h-screen">
	<header class="border-b bg-background">
		<div class="flex items-center justify-between px-4 py-3">
			<strong class="text-xl uppercase">Voxel</strong>
			{#if mounted && auth.user}
				<div class="flex items-center gap-4">
					<span class="text-sm">{auth.user.email}</span>
					<Button size="sm" onclick={handleLogout}>Logout</Button>
				</div>
			{/if}
		</div>
	</header>

	<!-- Main Content -->
	<main class="flex-1 overflow-hidden">
		{@render children()}
	</main>
</div>


