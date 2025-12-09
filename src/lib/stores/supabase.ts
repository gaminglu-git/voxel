import { readable } from 'svelte/store';

export const supabaseUrl = readable(import.meta.env.VITE_SUPABASE_URL);
export const supabaseAnonKey = readable(import.meta.env.VITE_SUPABASE_ANON_KEY);
