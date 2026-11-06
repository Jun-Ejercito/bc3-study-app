/** Root-relative to Vite `base` (e.g. `/bc3-study-app/`). */
export function assetUrl(path) {
  const base = import.meta.env.BASE_URL || '/';
  const clean = String(path || '').replace(/^\/+/, '');
  return base.endsWith('/') ? base + clean : `${base}/${clean}`;
}
