<script lang="ts">
  import { onMount } from 'svelte';
  import { get } from '$lib/services/api';
  import { createEventDispatcher } from 'svelte';

  const dispatch = createEventDispatcher();

  type Project = {
    name: string;
    url: string;
  };

  let projects: Project[] = [];
  let isLoading = true;
  let error: string | null = null;

  onMount(async () => {
    try {
      projects = await get('projects');
    } catch (err: any) {
      error = err.message;
    } finally {
      isLoading = false;
    }
  });

  function selectProject(url: string) {
    dispatch('select', { url });
  }
</script>

<div class="panel w-full h-full flex flex-col">
  <div class="panel-header p-3 text-xs font-bold uppercase tracking-widest text-surface-500 border-b border-surface-200 dark:border-surface-700">
    Projekte
  </div>
  <div class="flex-1 overflow-y-auto p-2">
    {#if isLoading}
      <div class="p-4 text-center">Lade Projekte...</div>
    {:else if error}
      <div class="alert variant-soft-error p-4">{error}</div>
    {:else if projects.length === 0}
      <div class="p-4 text-center text-sm text-surface-500">Keine Projekte gefunden.</div>
    {:else}
      {#each projects as project}
        <button
          class="w-full text-left p-2 rounded-md hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors"
          on:click={() => selectProject(project.url)}
        >
          {project.name}
        </button>
      {/each}
    {/if}
  </div>
</div>
