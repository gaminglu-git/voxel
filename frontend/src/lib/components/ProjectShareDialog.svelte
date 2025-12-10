<script lang="ts">
  import { post, get, del } from '$lib/services/api';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetFooter,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
  } from '$lib/components/ui/sheet';
  import { Alert, AlertDescription } from '$lib/components/ui/alert';

  type Project = {
    id: string;
    name: string;
  };

  type Share = {
    id: string;
    project_id: string;
    shared_with_user_id?: string;
    shared_with_team_id?: string;
    shared_with_company_id?: string;
    permission: string;
    created_at: string;
    expires_at?: string;
    shared_by_user_id?: string;
  };

  let { project, open = $bindable(false) } = $props<{
    project: Project | null;
    open?: boolean;
  }>();

  let shares = $state<Share[]>([]);
  let isLoading = $state(false);
  let error = $state<string | null>(null);
  
  // Share form state
  let shareWithType = $state<'user' | 'team' | 'company'>('user');
  let shareWithId = $state('');
  let permission = $state<'read' | 'write' | 'admin'>('read');
  let isSharing = $state(false);

  // Load shares when dialog opens
  $effect(() => {
    if (open && project) {
      loadShares();
    }
  });

  async function loadShares() {
    if (!project) return;
    
    try {
      isLoading = true;
      error = null;
      const result = await get(`projects/${project.id}/shares`);
      shares = result.shares || [];
    } catch (err: any) {
      console.error('Error loading shares:', err);
      error = `Fehler beim Laden der Freigaben: ${err.message}`;
    } finally {
      isLoading = false;
    }
  }

  async function handleShare() {
    if (!project || !shareWithId.trim()) {
      error = 'Bitte geben Sie eine User/Team/Company ID ein';
      return;
    }

    try {
      isSharing = true;
      error = null;
      
      await post(`projects/${project.id}/share`, {
        project_id: project.id,
        share_with_type: shareWithType,
        share_with_id: shareWithId.trim(),
        permission: permission,
      });

      // Reload shares
      await loadShares();
      
      // Reset form
      shareWithId = '';
      
    } catch (err: any) {
      console.error('Error sharing project:', err);
      error = `Fehler beim Freigeben: ${err.message}`;
    } finally {
      isSharing = false;
    }
  }

  async function handleUnshare(shareId: string) {
    if (!project) return;

    try {
      await del(`projects/${project.id}/share/${shareId}`);
      await loadShares();
    } catch (err: any) {
      console.error('Error unsharing:', err);
      error = `Fehler beim Entfernen der Freigabe: ${err.message}`;
    }
  }

  function getShareTarget(share: Share): string {
    if (share.shared_with_user_id) {
      return `User: ${share.shared_with_user_id}`;
    }
    if (share.shared_with_team_id) {
      return `Team: ${share.shared_with_team_id}`;
    }
    if (share.shared_with_company_id) {
      return `Company: ${share.shared_with_company_id}`;
    }
    return 'Unknown';
  }
</script>

<Sheet bind:open>
  {#if project}
    <SheetContent class="w-[400px] sm:w-[540px]">
      <SheetHeader>
        <SheetTitle>Projekt freigeben: {project.name}</SheetTitle>
        <SheetDescription>
          Geben Sie dieses Projekt für andere User, Teams oder Companies frei.
        </SheetDescription>
      </SheetHeader>

      <div class="flex flex-col gap-4 py-4">
        {#if error}
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        {/if}

        <!-- Share Form -->
        <div class="space-y-4">
          <div class="space-y-2">
            <Label for="share-with-type">Freigeben für</Label>
            <select
              id="share-with-type"
              bind:value={shareWithType}
              class="w-full px-3 py-2 border rounded-md"
            >
              <option value="user">User</option>
              <option value="team">Team</option>
              <option value="company">Company</option>
            </select>
          </div>

          <div class="space-y-2">
            <Label for="share-with-id">
              {shareWithType === 'user' ? 'User ID' : shareWithType === 'team' ? 'Team ID' : 'Company ID'}
            </Label>
            <Input
              id="share-with-id"
              type="text"
              placeholder="UUID eingeben"
              bind:value={shareWithId}
            />
          </div>

          <div class="space-y-2">
            <Label for="permission">Berechtigung</Label>
            <select
              id="permission"
              bind:value={permission}
              class="w-full px-3 py-2 border rounded-md"
            >
              <option value="read">Lesen</option>
              <option value="write">Schreiben</option>
              <option value="admin">Administrator</option>
            </select>
          </div>

          <Button onclick={handleShare} disabled={isSharing || !shareWithId.trim()}>
            {isSharing ? 'Wird freigegeben...' : 'Freigeben'}
          </Button>
        </div>

        <!-- Existing Shares -->
        <div class="space-y-2">
          <h3 class="text-sm font-semibold">Bestehende Freigaben</h3>
          {#if isLoading}
            <div class="text-sm text-muted-foreground">Lädt...</div>
          {:else if shares.length === 0}
            <div class="text-sm text-muted-foreground">Keine Freigaben</div>
          {:else}
            <div class="space-y-2">
              {#each shares as share}
                <div class="flex items-center justify-between p-2 border rounded-md">
                  <div>
                    <div class="text-sm font-medium">{getShareTarget(share)}</div>
                    <div class="text-xs text-muted-foreground">
                      Berechtigung: {share.permission}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="destructive"
                    onclick={() => handleUnshare(share.id)}
                  >
                    Entfernen
                  </Button>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      </div>
    </SheetContent>
  {/if}
</Sheet>


