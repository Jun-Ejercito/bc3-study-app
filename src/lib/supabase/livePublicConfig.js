/**
 * Public client config only (URL + publishable/anon). Safe to ship in the browser.
 * NEVER put service_role / secret keys here.
 * Project: Business Career Class (wtgvcdxuxebzgdfrrfbj), region ap-northeast-1.
 */
export const LIVE_PUBLIC_SUPABASE = {
  url: 'https://wtgvcdxuxebzgdfrrfbj.supabase.co',
  /** Modern publishable key (preferred). */
  publishableKey: 'sb_publishable_nJzxAlolOuDxzdmm0sZZrQ_n6aChjr_',
  /** Legacy anon JWT (compatible with supabase-js). */
  anonKey:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind0Z3ZjZHh1eGViemdkZnJyZmJqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM5NDQxMjEsImV4cCI6MjEwOTUyMDEyMX0.NrljYSNe2IB2qGHe4AGf7GYs6ITipLvukAYWB8mOe68',
};
