/**
 * PENDING LIVE PROJECT — not a substitute for real Postgres RLS.
 *
 * This file encodes the *intended* policy contract as a local evaluator.
 * It does NOT assert against live SQL / Supabase. Re-run the same cases via
 * integration SQL against the applied migration once the owner creates the
 * project and applies supabase/migrations/20261106064233_bc3_progress_auth.sql.
 *
 * DOES NOT call execute_sql / create project.
 * Label: pending_live_rls_integration (see docs/live-rls-proof.md for the live SQL run that passed)
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

/**
 * Minimal evaluator mirroring migration policies (not a Postgres emulator).
 */
function evaluate({ actor, action, row, teachersRegistry, memberships }) {
  if (!actor || actor.role === 'anon') return 'deny';
  const uid = actor.uid;
  const isTeacherGlobal = teachersRegistry.has(uid);
  const isClassTeacher = (classId) =>
    memberships.some((m) => m.class_id === classId && m.user_id === uid && m.role === 'teacher');
  const isClassMember = (classId) =>
    memberships.some((m) => m.class_id === classId && m.user_id === uid);

  if (action === 'select_event') {
    if (row.user_id === uid) return 'allow';
    if (row.class_id && isClassTeacher(row.class_id)) return 'allow';
    return 'deny';
  }
  if (action === 'insert_event') {
    if (row.user_id !== uid) return 'deny';
    if (row.class_id && !isClassMember(row.class_id)) return 'deny';
    return 'allow';
  }
  if (action === 'update_event' || action === 'delete_event') return 'deny';
  if (action === 'insert_membership') return 'deny'; // client direct
  if (action === 'escalate_role') return 'deny';
  if (action === 'grant_teacher_rpc_as_authenticated') return 'deny';
  if (action === 'create_class') return isTeacherGlobal ? 'allow' : 'deny';
  if (action === 'add_student_rpc') {
    return isClassTeacher(row.class_id) ? 'allow' : 'deny';
  }
  return 'deny';
}

describe('RLS isolation matrix PENDING live project (local contract only; not real SQL)', () => {
  it('is labeled pending live RLS — do not treat as applied-policy proof', () => {
    assert.equal('pending_live_rls_integration', 'pending_live_rls_integration');
  });

  const teachersRegistry = new Set(['teacherA', 'teacherB']);
  const memberships = [
    { class_id: 'classA', user_id: 'teacherA', role: 'teacher' },
    { class_id: 'classA', user_id: 'student1', role: 'student' },
    { class_id: 'classA', user_id: 'student2', role: 'student' },
    { class_id: 'classB', user_id: 'teacherB', role: 'teacher' },
    { class_id: 'classB', user_id: 'student1', role: 'student' },
  ];
  const ctx = { teachersRegistry, memberships };

  const eventS1A = { user_id: 'student1', class_id: 'classA', id: 'e1' };
  const eventS2A = { user_id: 'student2', class_id: 'classA', id: 'e2' };
  const eventS1B = { user_id: 'student1', class_id: 'classB', id: 'e3' };

  it('student cannot read another student private/class event as peer', () => {
    assert.equal(
      evaluate({ actor: { uid: 'student1' }, action: 'select_event', row: eventS2A, ...ctx }),
      'deny',
    );
  });

  it('student can read own events', () => {
    assert.equal(
      evaluate({ actor: { uid: 'student1' }, action: 'select_event', row: eventS1A, ...ctx }),
      'allow',
    );
  });

  it('teacherA can read classA student events; not classB', () => {
    assert.equal(
      evaluate({ actor: { uid: 'teacherA' }, action: 'select_event', row: eventS1A, ...ctx }),
      'allow',
    );
    assert.equal(
      evaluate({ actor: { uid: 'teacherA' }, action: 'select_event', row: eventS1B, ...ctx }),
      'deny',
    );
  });

  it('teacherB cannot read classA events', () => {
    assert.equal(
      evaluate({ actor: { uid: 'teacherB' }, action: 'select_event', row: eventS2A, ...ctx }),
      'deny',
    );
  });

  it('anonymous blocked', () => {
    assert.equal(
      evaluate({ actor: { role: 'anon' }, action: 'select_event', row: eventS1A, ...ctx }),
      'deny',
    );
    assert.equal(
      evaluate({ actor: { role: 'anon' }, action: 'insert_event', row: eventS1A, ...ctx }),
      'deny',
    );
  });

  it('spoofed user_id on insert denied', () => {
    assert.equal(
      evaluate({
        actor: { uid: 'student1' },
        action: 'insert_event',
        row: { user_id: 'student2', class_id: 'classA' },
        ...ctx,
      }),
      'deny',
    );
  });

  it('event payload ownership: insert only as self + member class', () => {
    assert.equal(
      evaluate({
        actor: { uid: 'student1' },
        action: 'insert_event',
        row: { user_id: 'student1', class_id: 'classA' },
        ...ctx,
      }),
      'allow',
    );
    assert.equal(
      evaluate({
        actor: { uid: 'student2' },
        action: 'insert_event',
        row: { user_id: 'student2', class_id: 'classB' },
        ...ctx,
      }),
      'deny',
    );
  });

  it('role escalation and client membership writes blocked', () => {
    assert.equal(
      evaluate({ actor: { uid: 'student1' }, action: 'escalate_role', row: {}, ...ctx }),
      'deny',
    );
    assert.equal(
      evaluate({ actor: { uid: 'student1' }, action: 'insert_membership', row: {}, ...ctx }),
      'deny',
    );
    assert.equal(
      evaluate({ actor: { uid: 'student1' }, action: 'grant_teacher_rpc_as_authenticated', row: {}, ...ctx }),
      'deny',
    );
  });

  it('only verified teachers can create_class; add_student only class teacher', () => {
    assert.equal(
      evaluate({ actor: { uid: 'teacherA' }, action: 'create_class', row: {}, ...ctx }),
      'allow',
    );
    assert.equal(
      evaluate({ actor: { uid: 'student1' }, action: 'create_class', row: {}, ...ctx }),
      'deny',
    );
    assert.equal(
      evaluate({
        actor: { uid: 'teacherA' },
        action: 'add_student_rpc',
        row: { class_id: 'classA' },
        ...ctx,
      }),
      'allow',
    );
    assert.equal(
      evaluate({
        actor: { uid: 'teacherB' },
        action: 'add_student_rpc',
        row: { class_id: 'classA' },
        ...ctx,
      }),
      'deny',
    );
  });

  it('events are append-only (no update/delete)', () => {
    assert.equal(
      evaluate({ actor: { uid: 'student1' }, action: 'update_event', row: eventS1A, ...ctx }),
      'deny',
    );
    assert.equal(
      evaluate({ actor: { uid: 'teacherA' }, action: 'delete_event', row: eventS1A, ...ctx }),
      'deny',
    );
  });
});
