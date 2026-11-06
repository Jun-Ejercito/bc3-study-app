/**
 * Local cache isolation per signed-in account.
 * Anonymous key (bc3-study-v1) is never written by account save paths.
 */

export const ANON_STORAGE_KEY = 'bc3-study-v1';
export const ACCOUNT_KEY_PREFIX = 'bc3-study-acct:';
export const SESSION_KEY = 'bc3-study-session-v1';

export function accountStorageKey(studentId) {
  if (!studentId || typeof studentId !== 'string') {
    throw new Error('accountStorageKey requires stable auth studentId');
  }
  if (studentId.includes('@')) {
    throw new Error('refusing email as studentId — use auth UID');
  }
  return `${ACCOUNT_KEY_PREFIX}${studentId}`;
}

export function readScopedState(storage, { studentId = null } = {}) {
  const key = studentId ? accountStorageKey(studentId) : ANON_STORAGE_KEY;
  const raw = storage.getItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function writeScopedState(storage, state, { studentId = null } = {}) {
  const key = studentId ? accountStorageKey(studentId) : ANON_STORAGE_KEY;
  storage.setItem(key, JSON.stringify(state));
}

/** End session only — keep per-account disk cache for next login; never touch anon. */
export function clearSessionOnly(storage) {
  storage.removeItem(SESSION_KEY);
  return { anonymousPreserved: storage.getItem(ANON_STORAGE_KEY) != null };
}

/** Optional hard forget of one account's local cache (not used on normal logout). */
export function wipeAccountCache(storage, studentId) {
  if (studentId) storage.removeItem(accountStorageKey(studentId));
  return clearSessionOnly(storage);
}

/**
 * Explicit opt-in copy of anonymous progress into an account scope.
 * Never called implicitly on login.
 */
export function explicitImportAnonymousIntoAccount(storage, studentId, { overwrite = false } = {}) {
  if (!studentId) throw new Error('studentId required');
  const anon = storage.getItem(ANON_STORAGE_KEY);
  if (!anon) return { imported: false, reason: 'no_anonymous' };
  const dest = accountStorageKey(studentId);
  if (storage.getItem(dest) && !overwrite) {
    return { imported: false, reason: 'account_exists' };
  }
  // Copy into account key only — leave ANON_STORAGE_KEY unchanged
  storage.setItem(dest, anon);
  return { imported: true, reason: 'explicit' };
}

export function setSession(storage, { studentId, role, classIds }) {
  if (!studentId || studentId.includes('@')) throw new Error('invalid studentId');
  storage.setItem(
    SESSION_KEY,
    JSON.stringify({
      studentId,
      roleCached: role || 'student',
      classIdsCached: classIds || [],
      untrustedClientCache: true,
    }),
  );
}

export function getSession(storage) {
  try {
    const raw = storage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

const DEVICE_KEY = 'bc3-device-id';

export function getOrCreateDeviceId(storage = globalThis.localStorage) {
  try {
    let id = storage.getItem(DEVICE_KEY);
    if (!id) {
      id = (globalThis.crypto && crypto.randomUUID) ? crypto.randomUUID() : `dev_${Date.now()}`;
      storage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return null;
  }
}
