<script lang="ts">
  import { supabase } from '$lib/supabaseClient';
  import { getAuthContext } from '$lib/stores/auth';
  import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import { Alert, AlertDescription } from '$lib/components/ui/alert';

  const auth = getAuthContext();

  let email = $state('');
  let password = $state('');
  let loading = $state(false);
  let error = $state<string | null>(null);

  async function handleLogin() {
    try {
      loading = true;
      error = null;
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (signInError) throw signInError;
    } catch (err: any) {
      // Handle network errors
      if (err.message?.includes('Failed to fetch') || err.message?.includes('ERR_NAME_NOT_RESOLVED')) {
        error = 'Netzwerkfehler: Supabase-URL kann nicht erreicht werden. Bitte überprüfe deine .env Datei.';
      } else {
        error = err.error_description || err.message || 'Ein Fehler ist aufgetreten';
      }
    } finally {
      loading = false;
    }
  }

  async function handleLogout() {
    try {
      loading = true;
      const { error: signOutError } = await supabase.auth.signOut();
      if (signOutError) throw signOutError;
    } catch (err: any) {
      error = err.error_description || err.message;
    } finally {
      loading = false;
    }
  }
</script>

<Card class="p-8 max-w-md mx-auto my-16">
  {#if auth.user}
    <CardContent class="text-center pt-6">
      <h2 class="text-2xl font-semibold mb-4">Angemeldet</h2>
      <p class="mb-4">Sie sind angemeldet als: <br><strong>{auth.user.email}</strong></p>
      <Button class="w-full" onclick={handleLogout} disabled={loading}>
        {loading ? 'Abmelden...' : 'Abmelden'}
      </Button>
    </CardContent>
  {:else}
    <CardHeader>
      <CardTitle class="text-center">Login</CardTitle>
    </CardHeader>
    <CardContent>
      <form class="space-y-4" onsubmit={(e: SubmitEvent) => { e.preventDefault(); handleLogin(); }}>
        <div class="space-y-2">
          <Label for="email">Email</Label>
          <Input type="email" id="email" autocomplete="email" bind:value={email} placeholder="test@example.com" />
        </div>
        <div class="space-y-2">
          <Label for="password">Passwort</Label>
          <Input type="password" id="password" autocomplete="current-password" bind:value={password} placeholder="••••••••" />
        </div>
        <Button type="submit" class="w-full" disabled={loading}>
          {loading ? 'Anmelden...' : 'Anmelden'}
        </Button>
        {#if error}
          <Alert variant="destructive" class="mt-4">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        {/if}
      </form>
    </CardContent>
  {/if}
</Card>


