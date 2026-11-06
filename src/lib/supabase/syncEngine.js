/**
 * Idempotent flush + pull/replay. Generation + studentId guards reject stale work.
 */

import { mergeEventLogs } from '../sync/merge.js';
import { rebuildProgressFromEvents } from '../sync/replay.js';
import { getSyncGeneration, saveState, loadState, getActiveStudentId } from '../storage.js';
import { createSupabaseSyncAdapter } from './adapter.js';
import { readSupabaseConfig } from './config.js';

let flushTimer = null;

export function scheduleFlush({ state, generation, studentId }) {
  if (!readSupabaseConfig().configured) return;
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => {
    flushPending({ generation, studentId }).catch(() => {});
  }, 400);
}

export async function flushPending({ generation, studentId } = {}) {
  const gen = generation ?? getSyncGeneration();
  const uid = studentId ?? getActiveStudentId();
  // Generation/account guards first — late/inflight A must not affect B even when offline
  if (getSyncGeneration() !== gen || getActiveStudentId() !== uid) {
    return { flushed: 0, reason: 'stale_generation' };
  }
  if (!uid) return { flushed: 0, reason: 'guest' };
  if (!readSupabaseConfig().configured) return { flushed: 0, reason: 'not_configured' };

  const state = loadState();
  const pending = (state.pendingEventIds || [])
    .map((id) => (state.eventLog || []).find((e) => e.id === id))
    .filter(Boolean);
  if (!pending.length) return { flushed: 0, reason: 'empty' };

  const adapter = createSupabaseSyncAdapter();
  // Ensure ownership
  for (const e of pending) {
    if (e.studentId && e.studentId !== uid) {
      return { flushed: 0, reason: 'ownership_mismatch' };
    }
  }

  try {
    await adapter.pushEvents(pending.map((e) => ({ ...e, studentId: uid })));
  } catch (err) {
    return { flushed: 0, reason: 'push_failed', error: String(err?.message || err) };
  }

  if (getSyncGeneration() !== gen || getActiveStudentId() !== uid) {
    return { flushed: 0, reason: 'stale_after_push' };
  }

  const latest = loadState();
  const done = new Set(pending.map((e) => e.id));
  latest.pendingEventIds = (latest.pendingEventIds || []).filter((id) => !done.has(id));
  saveState(latest);
  return { flushed: pending.length, reason: 'ok' };
}

/**
 * Pull remote events, merge by UUID, rebuild SRS/progress, save to active account key only.
 */
export async function pullMergeReplay({ generation, studentId, daysCatalog = [] } = {}) {
  const gen = generation ?? getSyncGeneration();
  const uid = studentId ?? getActiveStudentId();
  if (getSyncGeneration() !== gen || getActiveStudentId() !== uid) {
    return { ok: false, reason: 'stale_generation' };
  }
  if (!uid) return { ok: false, reason: 'guest' };
  if (!readSupabaseConfig().configured) return { ok: false, reason: 'not_configured' };

  const adapter = createSupabaseSyncAdapter();
  let remote = [];
  try {
    remote = await adapter.pullEvents();
  } catch (err) {
    return { ok: false, reason: 'pull_failed', error: String(err?.message || err) };
  }

  if (getSyncGeneration() !== gen || getActiveStudentId() !== uid) {
    return { ok: false, reason: 'stale_after_pull' };
  }

  const local = loadState();
  const merged = mergeEventLogs(local.eventLog || [], remote);
  const rebuilt = rebuildProgressFromEvents(merged.events, uid, {
    daysCatalog,
    settings: local.settings,
  });

  const pendingIds = new Set(local.pendingEventIds || []);
  const remoteIds = new Set(remote.map((e) => e.id));
  const stillPending = [...pendingIds].filter((id) => !remoteIds.has(id));

  const next = {
    ...rebuilt,
    eventLog: merged.events,
    pendingEventIds: stillPending,
    settings: local.settings,
  };
  saveState(next);
  return { ok: true, state: next, totalEvents: merged.total, added: merged.added };
}

export async function syncAfterLogin({ studentId, daysCatalog = [] } = {}) {
  const uid = studentId || getActiveStudentId();
  const gen = getSyncGeneration();
  const pull = await pullMergeReplay({ generation: gen, studentId: uid, daysCatalog });
  const flush = await flushPending({ generation: gen, studentId: uid });
  return { pull, flush };
}
