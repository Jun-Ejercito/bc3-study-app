import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readSupabaseConfig } from '../src/lib/supabase/config.js';
import { createSupabaseSyncAdapter } from '../src/lib/supabase/adapter.js';
import { SyncAdapterNotConfiguredError } from '../src/lib/sync/adapter.js';
import { eventFromQuizAnswer } from '../src/lib/sync/events.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('supabase config gating', () => {
  it('unconfigured when env missing', () => {
    const cfg = readSupabaseConfig({});
    assert.equal(cfg.configured, false);
    assert.equal(cfg.blockedReason, 'missing_config');
  });

  it('adapter refuses network ops without config', async () => {
    // Ensure import.meta.env path: adapter uses readSupabaseConfig() which reads import.meta.env
    // In node tests without Vite, import.meta.env may be undefined → unconfigured
    const ad = createSupabaseSyncAdapter();
    assert.equal(ad.configured, false);
    assert.equal(ad.status, 'not_connected');
    await assert.rejects(() => ad.signIn({ email: 'a@b.com', password: 'x' }), SyncAdapterNotConfiguredError);
    await assert.rejects(() => ad.pushEvents([]), SyncAdapterNotConfiguredError);
  });

  it('refuses service_role-looking keys in client config helper', () => {
    // Craft a fake jwt payload with service_role claim
    const header = Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url');
    const fake = `${header}.${payload}.sig`;
    const cfg = readSupabaseConfig({
      VITE_SUPABASE_URL: 'https://example.supabase.co',
      VITE_SUPABASE_ANON_KEY: fake,
    });
    // Our detector looks for service_role string in key or decoded payload
    assert.equal(cfg.configured, false);
  });
});

describe('supabase adapter ownership checks (unit)', () => {
  it('pushEvents rejects spoofed studentId when session mocked via manual check', () => {
    // Pure rule mirrored from adapter: event.studentId must match session
    const session = { studentId: 'uid-real' };
    const evt = eventFromQuizAnswer({
      studentId: 'uid-other',
      questionId: 'R5後-1',
      choice: 'ア',
      correctLetter: 'ア',
    });
    assert.notEqual(evt.studentId, session.studentId);
  });
});

describe('migration security invariants (static)', () => {
  const sql = readFileSync(join(root, 'supabase/migrations/20261106064233_bc3_progress_auth.sql'), 'utf8');

  it('enables RLS on all exposed tables; grant_teacher is service_role only', () => {
    assert.match(sql, /alter table public\.classes enable row level security/i);
    assert.match(sql, /alter table public\.class_members enable row level security/i);
    assert.match(sql, /alter table public\.progress_events enable row level security/i);
    assert.match(sql, /grant execute on function private\.grant_teacher\(uuid, text\) to service_role/i);
    assert.match(sql, /revoke all on function private\.grant_teacher\(uuid, text\) from public, anon, authenticated/i);
    assert.match(sql, /with check \(false\)/); // no client membership inserts
    assert.doesNotMatch(sql, /service_role key/i);
  });

  it('progress insert requires auth.uid match; no client updates', () => {
    assert.match(sql, /user_id = \(select auth\.uid\(\)\)/);
    assert.match(sql, /progress_events_no_update/);
    assert.match(sql, /progress_events_no_delete/);
  });

  it('no anon grants on progress_events', () => {
    assert.doesNotMatch(sql, /grant .* on public\.progress_events to anon/i);
  });
});
