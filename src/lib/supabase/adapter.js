/**
 * Supabase sync adapter — email/password auth (documented v1; no OAuth).
 * Feature-gated: returns null-like behavior when config absent.
 * Does not send invites; signUp only when user submits the form AND config exists.
 */

import { getSupabaseClient } from './client.js';
import { readSupabaseConfig } from './config.js';
import { SyncAdapterNotConfiguredError } from '../sync/adapter.js';
import { assertEventShape } from '../sync/events.js';

export function createSupabaseSyncAdapter() {
  const cfg = readSupabaseConfig();
  if (!cfg.configured) {
    return {
      provider: 'supabase',
      configured: false,
      status: 'not_connected',
      async getSession() {
        return null;
      },
      async signIn() {
        throw new SyncAdapterNotConfiguredError('Supabase URL/anon key not set');
      },
      async signUp() {
        throw new SyncAdapterNotConfiguredError('Supabase URL/anon key not set');
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
      async listMyClasses() {
        throw new SyncAdapterNotConfiguredError();
      },
      async fetchClassEvents() {
        throw new SyncAdapterNotConfiguredError();
      },
      async createClass() {
        throw new SyncAdapterNotConfiguredError();
      },
      async addClassStudent() {
        throw new SyncAdapterNotConfiguredError();
      },
    };
  }

  const sb = getSupabaseClient();

  return {
    provider: 'supabase',
    configured: true,
    status: 'configured_local_client', // not proof of live project until parent connects

    async getSession() {
      const { data, error } = await sb.auth.getSession();
      if (error) throw error;
      const session = data.session;
      if (!session?.user) return null;
      return {
        studentId: session.user.id,
        email: session.user.email || null, // display only — never use as identity key
        accessToken: session.access_token,
      };
    },

    async signIn({ email, password }) {
      if (!email || !password) throw new Error('email and password required');
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw error;
      return { studentId: data.user.id, email: data.user.email };
    },

    async signUp({ email, password }) {
      if (!email || !password) throw new Error('email and password required');
      if (password.length < 8) throw new Error('password must be at least 8 characters');
      // May trigger confirmation email depending on project Auth settings — parent must review.
      const { data, error } = await sb.auth.signUp({ email, password });
      if (error) throw error;
      return {
        studentId: data.user?.id || null,
        email: data.user?.email || email,
        needsEmailConfirmation: !data.session,
      };
    },

    async signOut() {
      const { error } = await sb.auth.signOut();
      if (error) throw error;
    },

    async pushEvents(events) {
      const session = await this.getSession();
      if (!session) throw new Error('not authenticated');
      const rows = events.map((e) => {
        assertEventShape(e);
        if (e.studentId && e.studentId !== session.studentId) {
          throw new Error('refusing to push event for another user');
        }
        return {
          id: e.id,
          user_id: session.studentId,
          class_id: e.classId || null,
          type: e.type,
          occurred_at: e.occurredAt,
          payload: e.payload,
          device_id: e.clientDeviceId || null,
        };
      });
      const { error } = await sb.from('progress_events').upsert(rows, { onConflict: 'id', ignoreDuplicates: true });
      if (error) throw error;
      return { pushed: rows.length };
    },

    async pullEvents({ sinceIso = null } = {}) {
      const session = await this.getSession();
      if (!session) throw new Error('not authenticated');
      let q = sb.from('progress_events').select('*').eq('user_id', session.studentId).order('occurred_at', { ascending: true });
      if (sinceIso) q = q.gte('occurred_at', sinceIso);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []).map(rowToEvent);
    },

    async listMyClasses() {
      const session = await this.getSession();
      if (!session) throw new Error('not authenticated');
      const { data, error } = await sb
        .from('class_members')
        .select('role, class_id, classes(id, title, created_at)')
        .eq('user_id', session.studentId);
      if (error) throw error;
      return data || [];
    },

    /** Teacher: events for a class (RLS must allow). */
    async fetchClassEvents(classId) {
      const session = await this.getSession();
      if (!session) throw new Error('not authenticated');
      const { data, error } = await sb
        .from('progress_events')
        .select('*')
        .eq('class_id', classId)
        .order('occurred_at', { ascending: false })
        .limit(2000);
      if (error) throw error;
      return (data || []).map(rowToEvent);
    },

    async createClass(title) {
      const { data, error } = await sb.rpc('create_class', { p_title: title });
      if (error) throw error;
      return data;
    },

    async addClassStudent(classId, studentUid) {
      if (!studentUid || String(studentUid).includes('@')) {
        throw new Error('student auth UID required (not email)');
      }
      const { error } = await sb.rpc('add_class_student', {
        p_class_id: classId,
        p_student_id: studentUid,
      });
      if (error) throw error;
    },
  };
}

function rowToEvent(row) {
  return {
    schemaVersion: 1,
    id: row.id,
    type: row.type,
    studentId: row.user_id,
    classId: row.class_id,
    occurredAt: row.occurred_at,
    clientDeviceId: row.device_id,
    payload: row.payload || {},
  };
}
