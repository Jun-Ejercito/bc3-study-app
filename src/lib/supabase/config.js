/**
 * Public client config only. Never put service_role here.
 * Build env: VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY (or VITE_SUPABASE_PUBLISHABLE_KEY).
 * Values for Pages CI come from workflow env (public keys). See livePublicConfig.js.
 */

export function readSupabaseConfig(env = import.meta.env) {
  const url = String(env?.VITE_SUPABASE_URL || '').trim();
  const anonKey = String(
    env?.VITE_SUPABASE_ANON_KEY || env?.VITE_SUPABASE_PUBLISHABLE_KEY || '',
  ).trim();
  const looksService = keyLooksLikeServiceRole(anonKey);
  const configured = Boolean(url && anonKey) && !looksService;
  return {
    url,
    anonKey: looksService ? '' : anonKey,
    configured,
    blockedReason: looksService ? 'service_key_refused' : url && anonKey ? null : 'missing_config',
  };
}

function keyLooksLikeServiceRole(key) {
  if (!key) return false;
  if (/service_role/i.test(key)) return true;
  try {
    const part = key.split('.')[1];
    if (!part) return false;
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const json =
      typeof atob === 'function'
        ? atob(b64)
        : Buffer.from(b64, 'base64').toString('utf8');
    return /"role"\s*:\s*"service_role"/.test(json) || /service_role/.test(json);
  } catch {
    return false;
  }
}

export function isSyncConfigured() {
  return readSupabaseConfig().configured;
}
