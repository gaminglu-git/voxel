<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { getAuthContext } from '$lib/stores/auth';
	import BimViewer from '$lib/components/BimViewer.svelte';
	import Auth from '$lib/components/Auth.svelte';
  import ProjectList from '$lib/components/ProjectList.svelte';
  import Marketplace from '$lib/components/Marketplace.svelte';
  import { Button } from '$lib/components/ui/button';
  import { post as apiPost } from '$lib/services/api';
  import type { SceneModelItem } from '$lib/components/BimViewer.svelte';

  const auth = getAuthContext();
  let mounted = $state(false);
  let activeTab = $state<'projects' | 'marketplace'>('projects');

  let selectedModelUrl = $state<string | null>(null);
  let analysisResult = $state<{ wall_count: number } | null>(null);
  let sceneModel = $state<SceneModelItem[]>([]);

  onMount(() => {
    mounted = true;
  });

  function handleProjectSelect(event: { url: string; projectId?: string }) {
    selectedModelUrl = event.url;
    analysisResult = null; // Reset analysis on new model select
  }

  function handleAnalysisComplete(event: { result: { wall_count: number } }) {
    analysisResult = event.result;
  }

  function handleSceneModelUpdate(event: { sceneModel: SceneModelItem[] }) {
    sceneModel = event.sceneModel;
  }

  async function handleExportToEnergyPlus() {
    if (sceneModel.length === 0) {
      alert('Keine Elemente in der Szene zum Exportieren.');
      return;
    }

    try {
      const response = await apiPost('simulate/export-energyplus', {
        sceneModel: sceneModel,
        name: 'Exported Model'
      });

      // Create a download link for the epJSON file
      const blob = new Blob([JSON.stringify(response.epjson, null, 2)], {
        type: 'application/json'
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'model.epjson';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      alert('EnergyPlus Export erfolgreich!');
    } catch (err: any) {
      console.error('Export error:', err);
      alert(`Fehler beim Export: ${err.message}`);
    }
  }
</script>

<div class="w-full h-full">
	{#if mounted && auth.user}
		<div class="flex h-full">
			<!-- Left Sidebar with Tabs -->
			<div class="w-72 h-full bg-background border-r border-border flex flex-col">
				<!-- Tab Switcher -->
				<div class="flex border-b border-border">
					<button
						class="flex-1 px-4 py-2 text-sm font-medium transition-colors {activeTab === 'projects' ? 'bg-muted border-b-2 border-primary' : 'hover:bg-muted/50'}"
						onclick={() => activeTab = 'projects'}
					>
						Projekte
					</button>
					<button
						class="flex-1 px-4 py-2 text-sm font-medium transition-colors {activeTab === 'marketplace' ? 'bg-muted border-b-2 border-primary' : 'hover:bg-muted/50'}"
						onclick={() => activeTab = 'marketplace'}
					>
						Marketplace
					</button>
				</div>

				<!-- Tab Content -->
				<div class="flex-1 overflow-hidden">
					{#if activeTab === 'projects'}
						<ProjectList onSelect={handleProjectSelect} onAnalysisComplete={handleAnalysisComplete} />
					{:else}
						<Marketplace />
					{/if}
				</div>

				<!-- Export Button -->
				{#if activeTab === 'marketplace' && sceneModel.length > 0}
					<div class="p-3 border-t border-border">
						<Button
							class="w-full"
							onclick={handleExportToEnergyPlus}
						>
							Export zu EnergyPlus ({sceneModel.length} Elemente)
						</Button>
					</div>
				{/if}
			</div>

			<!-- Main Viewer -->
			<div class="flex-1 h-full">
				<BimViewer
					modelUrl={selectedModelUrl}
					analysisResult={analysisResult}
					onSceneModelUpdate={handleSceneModelUpdate}
				/>
			</div>
		</div>
	{:else if mounted}
		<div class="w-full h-full flex items-center justify-center bg-muted">
			<Auth />
		</div>
	{/if}
</div>