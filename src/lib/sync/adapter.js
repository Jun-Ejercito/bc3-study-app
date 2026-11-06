/**
 * Provider-neutral sync adapter interface (Stage 1 stub).
 * No Firebase/Supabase imports. Parent chooses provider before any implementation.
 *
 * Implementations MUST:
 *  - authenticate and use stable UID as studentId
 *  - enforce class membership + teacher access in database rules / RLS
 *  - reject client-supplied role escalation
 *  - never embed service-role / admin keys in the frontend or GitHub
 */

export class SyncAdapterNotConfiguredError extends Error {
  constructor(msg = 'Sync backend not configured') {
    super(msg);
    this.name = 'SyncAdapterNotConfiguredError';
  }
}

export function createNullSyncAdapter() {
  return {
    provider: 'none',
    async getSession() {
      return null;
    },
    async signIn() {
      throw new SyncAdapterNotConfiguredError();
    },
    async signOut() {
      return;
    },
    async pushEvents() {
      throw new SyncAdapterNotConfiguredError();
    },
    async pullEvents() {
      throw new SyncAdapterNotConfiguredError();
    },
    async fetchClassSummary() {
      throw new SyncAdapterNotConfiguredError();
    },
  };
}

/** Contract documentation for future providers (not executed). */
export const SYNC_ADAPTER_CONTRACT = Object.freeze({
  requiredMethods: ['getSession', 'signIn', 'signOut', 'pushEvents', 'pullEvents', 'fetchClassSummary'],
  identity: 'auth UID only — never email in URLs or as primary key in client routes',
  authorization: 'database/RLS — UI hiding is not security',
  forbiddenInFrontend: ['serviceRoleKey', 'adminSdk', 'firebaseAdmin', 'supabaseServiceRole'],
});
