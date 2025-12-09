<script lang="ts">
	import { user } from '$lib/stores/auth';
	import BimViewer from '$lib/components/BimViewer.svelte';
	import Auth from '$lib/components/Auth.svelte';
  import ProjectList from '$lib/components/ProjectList.svelte';

  let selectedModelUrl: string | null = null;

  function handleProjectSelect(event: CustomEvent) {
    selectedModelUrl = event.detail.url;
  }
</script>

<div class="w-full h-screen">
	{#if $user}
		<div class="flex h-full">
			<div class="w-64 h-full bg-surface-100 dark:bg-surface-900 border-r border-surface-200 dark:border-surface-700">
				<ProjectList on:select={handleProjectSelect} />
			</div>
			<div class="flex-1 h-full">
				<BimViewer modelUrl={selectedModelUrl} />
			</div>
		</div>
	{:else}
		<div class="w-full h-full flex items-center justify-center bg-surface-50 dark:bg-surface-900">
			<Auth />
		</div>
	{/if}
</div>