<script lang="ts">
  import { supabase } from '$lib/supabaseClient';
  import { user } from '$lib/stores/auth';

  let email = '';
  let password = '';
  let loading = false;
  let error: string | null = null;

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
      error = err.error_description || err.message;
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

<div class="card p-8 max-w-md mx-auto my-16">
  {#if $user}
    <div class="text-center">
      <h2 class="h2 mb-4">Angemeldet</h2>
      <p class="mb-4">Sie sind angemeldet als: <br><strong>{$user.email}</strong></p>
      <button class="btn variant-filled-primary w-full" on:click={handleLogout} disabled={loading}>
        {loading ? 'Abmelden...' : 'Abmelden'}
      </button>
    </div>
  {:else}
    <form class="space-y-4" on:submit|preventDefault={handleLogin}>
      <h2 class="h2 text-center">Login</h2>
      <div>
        <label for="email" class="label">Email</label>
        <input class="input" type="email" id="email" bind:value={email} placeholder="test@example.com" />
      </div>
      <div>
        <label for="password" class="label">Passwort</label>
        <input class="input" type="password" id="password" bind:value={password} placeholder="••••••••" />
      </div>
      <button type="submit" class="btn variant-filled-primary w-full" disabled={loading}>
        {loading ? 'Anmelden...' : 'Anmelden'}
      </button>
      {#if error}
        <div class="alert variant-soft-error mt-4">
          <p>{error}</p>
        </div>
      {/if}
    </form>
  {/if}
</div>
