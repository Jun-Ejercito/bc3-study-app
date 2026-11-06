import { createClient } from '@supabase/supabase-js';
import { readSupabaseConfig } from './config.js';

let singleton = null;

/** Browser client with anon/publishable key only. Null when not configured. */
export function getSupabaseClient() {
  const cfg = readSupabaseConfig();
  if (!cfg.configured) return null;
  if (singleton) return singleton;
  singleton = createClient(cfg.url, cfg.anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce',
    },
  });
  return singleton;
}

/** Test helper */
export function _resetSupabaseClientForTests() {
  singleton = null;
}
