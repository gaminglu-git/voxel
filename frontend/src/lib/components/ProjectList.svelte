<script lang="ts">
  import { onMount } from 'svelte';
  import { get, post } from '$lib/services/api';
  import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';
  import { Button } from '$lib/components/ui/button';
  import { Alert, AlertDescription } from '$lib/components/ui/alert';
  import ProjectShareDialog from './ProjectShareDialog.svelte';
  import { getAuthContext } from '$lib/stores/auth';

  type Project = {
    id: string;
    name: string;
    description?: string;
    file_path: string;
    file_name: string;
    file_size?: number;
    file_type?: string;
    owner_user_id?: string;
    owner_team_id?: string;
    owner_company_id?: string;
    created_at: string;
    updated_at: string;
    tags?: string[];
  };

  let { onSelect, onAnalysisComplete } = $props<{
    onSelect?: (event: { url: string; projectId: string }) => void;
    onAnalysisComplete?: (event: { result: any }) => void;
  }>();

  let projects = $state<Project[]>([]);
  let isLoading = $state(true);
  let error = $state<string | null>(null);
  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
  
  // Share dialog state
  let selectedProjectForShare = $state<Project | null>(null);
  let shareDialogOpen = $state(false);
  
  const auth = getAuthContext();

  onMount(async () => {
    await loadProjects();
  });

  async function loadProjects() {
    try {
      isLoading = true;
      error = null;
      projects = await get('projects');
    } catch (err: any) {
      console.error('Error loading projects:', err);
      error = `Fehler beim Laden der Projekte: ${err.message}`;
    } finally {
      isLoading = false;
    }
  }

  function selectProject(project: Project) {
    // Validate project data before constructing URL
    if (!project.file_path) {
      console.error('Project file_path is missing:', project);
      error = `Projekt "${project.name}" hat keinen gültigen Dateipfad.`;
      return;
    }
    
    // Validate SUPABASE_URL is set
    if (!SUPABASE_URL) {
      console.error('VITE_SUPABASE_URL is not set in environment variables');
      error = 'Supabase URL ist nicht konfiguriert. Bitte setzen Sie VITE_SUPABASE_URL in der .env Datei.';
      return;
    }
    
    // Construct download URL - try public first, will fallback to signed URL in viewer
    const url = `${SUPABASE_URL}/storage/v1/object/public/bim-files/${project.file_path}`;
    onSelect?.({ url, projectId: project.id });
  }

  async function handleAnalyze(project: Project) {
    try {
      const result = await post('analyze', { file_path: project.file_path });
      onAnalysisComplete?.({ result });
    } catch (err: any) {
      alert(`Fehler bei der Analyse: ${err.message}`);
    }
  }

  function isProjectOwner(project: Project): boolean {
    if (!auth.user) return false;
    return (
      project.owner_user_id === auth.user.id ||
      project.owner_team_id !== null ||
      project.owner_company_id !== null
    );
  }

  function openShareDialog(project: Project) {
    selectedProjectForShare = project;
    shareDialogOpen = true;
  }
</script>

<Card class="w-full h-full flex flex-col">
  <CardHeader class="p-3">
    <CardTitle class="text-xs font-bold uppercase tracking-widest text-muted-foreground">
      Projekte
    </CardTitle>
  </CardHeader>
  <CardContent class="flex-1 overflow-y-auto p-2">
    {#if isLoading}
      <div class="p-4 text-center">Lade Projekte...</div>
    {:else if error}
      <Alert variant="destructive" class="p-4">
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    {:else if projects.length === 0}
      <div class="p-4 text-center text-sm text-muted-foreground">Keine Projekte gefunden.</div>
    {:else}
      {#each projects as project}
        <div
          class="w-full flex justify-between items-center p-2 rounded-md hover:bg-muted transition-colors"
        >
          <button
            class="text-left flex-1"
            onclick={() => selectProject(project)}
          >
            <div class="font-medium">{project.name}</div>
            {#if project.description}
              <div class="text-xs text-muted-foreground truncate">{project.description}</div>
            {/if}
            <div class="text-xs text-muted-foreground">
              {#if project.file_size}
                {(project.file_size / 1024 / 1024).toFixed(2)} MB
              {/if}
            </div>
          </button>
            <div class="flex gap-1">
            {#if isProjectOwner(project)}
              <Button 
                size="sm"
                variant="outline"
                onclick={(e: MouseEvent) => { e.stopPropagation(); openShareDialog(project); }}
                title="Projekt freigeben"
              >
                Share
              </Button>
            {/if}
            <Button 
              size="sm"
              variant="secondary"
              onclick={(e: MouseEvent) => { e.stopPropagation(); handleAnalyze(project); }}
            >
              Analyze
            </Button>
          </div>
        </div>
      {/each}
      {/if}
  </CardContent>
</Card>

<!-- Share Dialog -->
<ProjectShareDialog project={selectedProjectForShare} bind:open={shareDialogOpen} />
