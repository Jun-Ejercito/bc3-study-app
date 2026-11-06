import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createProgressEvent,
  eventFromQuizAnswer,
  eventFromCardRating,
  eventLessonVisited,
  eventLessonCompleted,
  assertEventShape,
  EVENT_SCHEMA_VERSION,
} from '../src/lib/sync/events.js';
import { formatJst, nowUtcIso, DISPLAY_TZ } from '../src/lib/sync/time.js';
import { evaluateLessonCompletion } from '../src/lib/sync/lessonCompletion.js';
import { mergeEventLogs, upsertEvent, deriveProgressFromEvents } from '../src/lib/sync/merge.js';
import { buildStudentSummary, buildClassSummary } from '../src/lib/sync/summaries.js';
import {
  accountStorageKey,
  clearSessionOnly,
  wipeAccountCache,
  explicitImportAnonymousIntoAccount,
  readScopedState,
  writeScopedState,
  ANON_STORAGE_KEY,
  setSession,
} from '../src/lib/sync/accountScope.js';
import { createNullSyncAdapter, SyncAdapterNotConfiguredError, SYNC_ADAPTER_CONTRACT } from '../src/lib/sync/adapter.js';

function memoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

describe('sync stage1 event schema', () => {
  it('creates UTC idempotent events with uuid', () => {
    const a = eventFromQuizAnswer({
      studentId: 'uid_abc',
      questionId: 'R5後-1',
      choice: 'ア',
      correctLetter: 'ア',
      day: 1,
    });
    assertEventShape(a);
    assert.equal(a.schemaVersion, EVENT_SCHEMA_VERSION);
    assert.equal(a.payload.correct, true);
    assert.equal(a.payload.practiceOnly, true);
    assert.match(a.occurredAt, /Z$/);
    assert.ok(a.id.length >= 8);
    const b = createProgressEvent({ ...a, id: a.id, type: a.type, studentId: a.studentId, payload: a.payload, occurredAt: a.occurredAt });
    assert.equal(b.id, a.id);
  });

  it('card ratings marked selfRated; lesson visited ≠ completed type', () => {
    const c = eventFromCardRating({ studentId: 'uid_abc', cardId: 'fc-0001', rating: 'all', day: 1 });
    assert.equal(c.payload.selfRated, true);
    const v = eventLessonVisited({ studentId: 'uid_abc', day: 1 });
    const done = eventLessonCompleted({ studentId: 'uid_abc', day: 1, criteria: 'default_v1' });
    assert.equal(v.type, 'lesson_visited');
    assert.equal(done.type, 'lesson_completed');
  });
});

describe('sync stage1 time', () => {
  it('formats JST with zone label', () => {
    assert.equal(DISPLAY_TZ, 'Asia/Tokyo');
    const s = formatJst('2026-11-06T03:00:00.000Z');
    assert.match(s, /JST/);
    assert.match(s, /2026-11-06/);
    // 03:00 UTC = 12:00 JST
    assert.match(s, /12:00/);
    assert.match(nowUtcIso(), /Z$/);
  });
});

describe('sync stage1 lesson completion', () => {
  it('visit alone does not complete; full quiz+cards does', () => {
    const day = { day: 1, kind: 'lesson', question_ids: ['q1', 'q2'], card_ids: ['c1'] };
    const visitedOnly = evaluateLessonCompletion(day, { questions: {}, cards: {} });
    assert.equal(visitedOnly.complete, false);
    const partial = evaluateLessonCompletion(day, {
      questions: { q1: { attempts: 1 } },
      cards: { c1: { reps: 1, history: [{ rating: 'all' }] } },
    });
    assert.equal(partial.complete, false);
    const full = evaluateLessonCompletion(day, {
      questions: { q1: { attempts: 1 }, q2: { attempts: 2 } },
      cards: { c1: { reps: 1, history: [{ rating: 'partial' }] } },
    });
    assert.equal(full.complete, true);
  });

  it('mock days require questions not all cards', () => {
    const day = { day: 28, kind: 'mock', question_ids: ['q1'], card_ids: ['c1', 'c2'] };
    const ev = evaluateLessonCompletion(day, { questions: { q1: { attempts: 1 } }, cards: {} });
    assert.equal(ev.complete, true);
  });
});

describe('sync stage1 merge / multi-device', () => {
  it('dedupes by event id and never drops distinct events', () => {
    const e1 = eventFromQuizAnswer({
      studentId: 'uid_a',
      questionId: 'R5後-1',
      choice: 'ア',
      correctLetter: 'ア',
      occurredAt: '2026-11-01T00:00:00.000Z',
    });
    const e2 = eventFromQuizAnswer({
      studentId: 'uid_a',
      questionId: 'R5後-1',
      choice: 'イ',
      correctLetter: 'ア',
      occurredAt: '2026-11-02T00:00:00.000Z',
    });
    const merged = mergeEventLogs([e1], [e1, e2]);
    assert.equal(merged.total, 2);
    assert.equal(merged.duplicates, 1);
    assert.equal(merged.added, 1);
    const derived = deriveProgressFromEvents(merged.events, 'uid_a');
    assert.equal(derived.questions['R5後-1'].attempts, 2);
    assert.equal(derived.questions['R5後-1'].correct, 1);
  });

  it('upsertEvent is idempotent', () => {
    const e = eventLessonVisited({ studentId: 'uid_a', day: 3 });
    const once = upsertEvent([], e);
    assert.equal(once.inserted, true);
    const twice = upsertEvent(once.log, e);
    assert.equal(twice.inserted, false);
    assert.equal(twice.log.length, 1);
  });
});

describe('sync stage1 summaries', () => {
  it('builds student and class summaries without synthetic students', () => {
    const days = [{ day: 1, kind: 'lesson', question_ids: ['q1'], card_ids: ['c1'] }];
    const events = [
      eventLessonVisited({ studentId: 'uid_1', day: 1, occurredAt: '2026-11-05T01:00:00.000Z' }),
      eventFromQuizAnswer({
        studentId: 'uid_1',
        questionId: 'q1',
        choice: 'ア',
        correctLetter: 'ア',
        day: 1,
        occurredAt: '2026-11-05T02:00:00.000Z',
      }),
      eventFromCardRating({
        studentId: 'uid_1',
        cardId: 'c1',
        rating: 'all',
        day: 1,
        occurredAt: '2026-11-05T03:00:00.000Z',
      }),
      eventLessonCompleted({ studentId: 'uid_1', day: 1, occurredAt: '2026-11-05T03:05:00.000Z' }),
    ];
    const s = buildStudentSummary(events, 'uid_1', days);
    assert.equal(s.lessonsVisitedCount, 1);
    assert.ok(s.lessonsCompletedCount >= 1);
    assert.equal(s.quizAttempts, 1);
    assert.equal(s.scoresArePracticeOnly, true);
    assert.match(s.lastActivityJst, /JST/);
    const cls = buildClassSummary(events, ['uid_1', 'uid_2'], days);
    assert.equal(cls.classSize, 2);
    assert.equal(cls.includesSyntheticStudents, false);
    assert.equal(cls.studentsWithActivity, 1);
  });
});

describe('sync stage1 account isolation', () => {
  it('refuses email as studentId; logout keeps account cache, preserves anonymous', () => {
    assert.throws(() => accountStorageKey('a@b.com'));
    const storage = memoryStorage({ [ANON_STORAGE_KEY]: JSON.stringify({ version: 1, cards: { x: 1 } }) });
    writeScopedState(storage, { version: 1, cards: { y: 1 } }, { studentId: 'uid_9' });
    setSession(storage, { studentId: 'uid_9', role: 'student' });
    const cleared = clearSessionOnly(storage);
    assert.equal(cleared.anonymousPreserved, true);
    // Normal logout does NOT wipe account disk (resume on next login)
    assert.equal(readScopedState(storage, { studentId: 'uid_9' }).cards.y, 1);
    assert.ok(readScopedState(storage, {}));
    // Optional hard wipe available separately
    wipeAccountCache(storage, 'uid_9');
    assert.equal(readScopedState(storage, { studentId: 'uid_9' }), null);
    assert.ok(readScopedState(storage, {}));
  });

  it('does not auto-import anonymous; explicit import only', () => {
    const storage = memoryStorage({ [ANON_STORAGE_KEY]: JSON.stringify({ version: 1, cards: { a: 1 } }) });
    // login path must NOT copy — simulate by only setting session
    setSession(storage, { studentId: 'uid_z' });
    assert.equal(readScopedState(storage, { studentId: 'uid_z' }), null);
    const r = explicitImportAnonymousIntoAccount(storage, 'uid_z');
    assert.equal(r.imported, true);
    assert.equal(readScopedState(storage, { studentId: 'uid_z' }).cards.a, 1);
  });
});

describe('sync stage1 adapter stub', () => {
  it('null adapter refuses cloud ops; contract lists forbidden secrets', () => {
    const ad = createNullSyncAdapter();
    assert.equal(ad.provider, 'none');
    assert.rejects(() => ad.pushEvents([]), SyncAdapterNotConfiguredError);
    assert.ok(SYNC_ADAPTER_CONTRACT.forbiddenInFrontend.includes('serviceRoleKey'));
  });
});
