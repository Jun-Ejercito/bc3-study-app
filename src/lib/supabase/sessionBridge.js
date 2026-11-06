/**
 * Auth ↔ scoped storage. Never writes account state into the anonymous key.
 */

import {
  clearSessionOnly,
  setSession,
  readScopedState,
  writeScopedState,
  getSession as getLocalSession,
  getOrCreateDeviceId,
  ANON_STORAGE_KEY,
  explicitImportAnonymousIntoAccount as explicitImportFn,
} from '../sync/accountScope.js';
import {
  setActiveStudentId,
  loadState,
  saveState,
  getSyncGeneration,
} from '../storage.js';
import { syncAfterLogin, scheduleFlush } from './syncEngine.js';
import { setFlushScheduler } from '../storage.js';

// Wire flush scheduler once
setFlushScheduler(scheduleFlush);

export { getOrCreateDeviceId };

/**
 * Activate account scope in memory + disk account key.
 * Does NOT touch bc3-study-v1.
 */
export function activateAccountLocalState(studentId, { roleCached = 'student', classIdsCached = [] } = {}) {
  // Persist previous account scope before switching (A must not lose in-memory to B)
  const prev = getLocalSession(localStorage)?.studentId;
  if (prev && prev !== studentId) {
    try {
      writeScopedState(localStorage, loadState(), { studentId: prev });
    } catch {
      /* ignore */
    }
  }
  setSession(localStorage, { studentId, role: roleCached, classIds: classIdsCached });
  setActiveStudentId(studentId);
  let scoped = readScopedState(localStorage, { studentId });
  if (!scoped || scoped.version !== 1) {
    scoped = {
      version: 1,
      cards: {},
      questions: {},
      daysTouched: {},
      lessonsCompleted: {},
      settings: { lang: 'ja', overallOnlyLearned: true },
      exportedAt: null,
      eventLog: [],
      pendingEventIds: [],
    };
    writeScopedState(localStorage, scoped, { studentId });
  }
  // saveState now writes account key only (activeStudentId set)
  saveState(scoped);
  return { state: loadState(), generation: getSyncGeneration() };
}

export async function activateAndSync(studentId, { daysCatalog = [], roleCached, classIdsCached } = {}) {
  const { state, generation } = activateAccountLocalState(studentId, { roleCached, classIdsCached });
  const sync = await syncAfterLogin({ studentId, daysCatalog });
  if (sync.pull?.ok && sync.pull.state) {
    return { state: sync.pull.state, generation, sync };
  }
  return { state: loadState(), generation, sync };
}

/** Logout: persist is already on account key; clear session; switch to guest load. */
export function logoutLocal(studentId) {
  // Ensure latest in-memory was saved under account before switch
  try {
    const cur = loadState();
    if (studentId && getLocalSession(localStorage)?.studentId === studentId) {
      writeScopedState(localStorage, cur, { studentId });
    }
  } catch {
    /* ignore */
  }
  clearSessionOnly(localStorage);
  setActiveStudentId(null);
  const anon = loadState(); // reads ANON_STORAGE_KEY
  return {
    anonymousPreserved: localStorage.getItem(ANON_STORAGE_KEY) != null,
    state: anon,
    generation: getSyncGeneration(),
  };
}

export function switchAccount(nextStudentId, { roleCached, classIdsCached } = {}) {
  const prev = getLocalSession(localStorage)?.studentId;
  if (prev) {
    try {
      writeScopedState(localStorage, loadState(), { studentId: prev });
    } catch {
      /* ignore */
    }
  }
  return activateAccountLocalState(nextStudentId, { roleCached, classIdsCached });
}

export function explicitImportAnonymousIntoAccount(studentId, opts) {
  return explicitImportFn(localStorage, studentId, opts);
}

export function currentCachedRole() {
  return getLocalSession(localStorage)?.roleCached || null;
}
