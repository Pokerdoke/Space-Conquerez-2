import { createClient } from '@supabase/supabase-js';

export interface SupabaseConfig {
  url: string;
  key: string;
}

export function getSupabaseConfig(): SupabaseConfig {
  // Priority: env vars (baked in) → localStorage (user-configured) → empty
  const url =
    (import.meta.env.VITE_SUPABASE_URL as string) ||
    localStorage.getItem('sc2_supabase_url') ||
    '';
  const key =
    (import.meta.env.VITE_SUPABASE_ANON_KEY as string) ||
    localStorage.getItem('sc2_supabase_key') ||
    '';
  return { url, key };
}

export function saveSupabaseConfig(url: string, key: string) {
  if (url && key) {
    localStorage.setItem('sc2_supabase_url', url.trim());
    localStorage.setItem('sc2_supabase_key', key.trim());
  } else {
    localStorage.removeItem('sc2_supabase_url');
    localStorage.removeItem('sc2_supabase_key');
  }
}

export function isSupabaseConfigured(): boolean {
  const { url, key } = getSupabaseConfig();
  return url.length > 0 && key.length > 0;
}

let _client: ReturnType<typeof createClient> | null = null;

export function getSupabaseClient() {
  const { url, key } = getSupabaseConfig();
  if (!url || !key) return null;
  // Reuse singleton to avoid creating a new client on every call
  if (!_client) {
    try {
      _client = createClient(url, key);
    } catch (err) {
      console.error('Error creating Supabase client:', err);
      return null;
    }
  }
  return _client;
}
