import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export interface SupabaseConfig {
  url: string;
  key: string;
}

const DEFAULT_SUPABASE_URL = 'https://bbmgrpynuqerbgkoasmk.supabase.co';
const DEFAULT_SUPABASE_KEY = 'sb_publishable_z3z7bVxecowgDnU6r0p4SQ_cSxeaJYq';

export function getSupabaseConfig(): SupabaseConfig {
  const env = import.meta.env;
  const url =
    (env.VITE_SUPABASE_URL as string) ||
    localStorage.getItem('void_empires_supabase_url') ||
    localStorage.getItem('sc2_supabase_url') ||
    DEFAULT_SUPABASE_URL;
  const key =
    (env.VITE_SUPABASE_KEY as string) ||
    (env.VITE_SUPABASE_ANON_KEY as string) ||
    localStorage.getItem('void_empires_supabase_key') ||
    localStorage.getItem('sc2_supabase_key') ||
    DEFAULT_SUPABASE_KEY;
  return { url, key };
}

export function saveSupabaseConfig(url: string, key: string) {
  if (url && key) {
    localStorage.setItem('void_empires_supabase_url', url.trim());
    localStorage.setItem('void_empires_supabase_key', key.trim());
  } else {
    localStorage.removeItem('void_empires_supabase_url');
    localStorage.removeItem('void_empires_supabase_key');
  }
  _client = null;
}

export function isSupabaseConfigured(): boolean {
  const { url, key } = getSupabaseConfig();
  return url.length > 0 && key.length > 0;
}

let _client: SupabaseClient<any, 'public', any> | null = null;

export function getSupabaseClient(): SupabaseClient<any, 'public', any> | null {
  const { url, key } = getSupabaseConfig();
  if (!url || !key) return null;
  if (!_client) {
    try {
      _client = createClient<any, 'public', any>(url, key, {
        realtime: { params: { eventsPerSecond: 10 } }
      });
    } catch (err) {
      console.error('Error creating Supabase client:', err);
      return null;
    }
  }
  return _client;
}
