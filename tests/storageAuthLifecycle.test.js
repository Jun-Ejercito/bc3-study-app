/**
 * Exercises real storage.js recordCard/recordQuestion hooks + sessionBridge lifecycle.
 * Uses in-memory localStorage; does not invent a separate progress model.
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

function makeStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    clear: () => map.clear(),
    _map: map,
  };
}

describe('storage.js hooks emit events when signed in', () => {
  let storage;
  let mod;
  let bridge;

  beforeEach(async () => {
    storage = makeStorage();
    globalThis.localStorage = storage;
    // Fresh module state via query cache bust is hard for ESM; reset via setActiveStudentId(null)
    mod = await import('../src/lib/storage.js');
    bridge = await import('../src/lib/supabase/sessionBridge.js');
    mod.setActiveStudentId(null);
    storage.clear();
  });

  it('guest recordCard does not append pending sync events', () => {
    mod.setActiveStudentId(null);
    const state = mod.loadState();
    mod.recordCard(state, 'fc-0001', 'all', 1);
    assert.equal(state.cards['fc-0001'].lastRating, 'all');
    assert.equal((state.eventLog || []).length, 0);
    assert.equal((state.pendingEventIds || []).length, 0);
    assert.ok(storage.getItem('bc3-study-v1'));
  });

  it('signed-in recordCard/recordQuestion append events and write account key only', () => {
    const uid = '11111111-1111-1111-1111-111111111111';
    bridge.activateAccountLocalState(uid);
    assert.equal(mod.getActiveStudentId(), uid);

    // Seed guest data that must not be overwritten
    storage.setItem(
      'bc3-study-v1',
      JSON.stringify({ version: 1, cards: { guestOnly: { reps: 1 } }, questions: {}, daysTouched: {}, settings: {} }),
    );

    let state = mod.loadState();
    mod.recordCard(state, 'fc-0001', 'partial', 3);
    mod.recordQuestion(state, 'R5後-1', 'エ', 'エ', 11);

    state = mod.loadState();
    assert.equal(state.cards['fc-0001'].lastRating, 'partial');
    assert.equal(state.questions['R5後-1'].correct, 1);
    assert.ok(state.eventLog.length >= 2);
    assert.ok(state.pendingEventIds.length >= 2);
    assert.ok(state.eventLog.every((e) => e.studentId === uid));
    assert.ok(state.eventLog.some((e) => e.type === 'card_rating'));
    assert.ok(state.eventLog.some((e) => e.type === 'quiz_answer'));

    const acctRaw = storage.getItem(`bc3-study-acct:${uid}`);
    assert.ok(acctRaw);
    const guest = JSON.parse(storage.getItem('bc3-study-v1'));
    assert.equal(guest.cards.guestOnly.reps, 1, 'anonymous key must not be overwritten by account save');
  });

  it('logout restores anonymous without wiping guest; account cache kept', () => {
    const uid = '22222222-2222-2222-2222-222222222222';
    storage.setItem(
      'bc3-study-v1',
      JSON.stringify({
        version: 1,
        cards: { guestCard: { reps: 9, lastRating: 'all' } },
        questions: {},
        daysTouched: {},
        settings: { lang: 'ja' },
      }),
    );
    bridge.activateAccountLocalState(uid);
    let state = mod.loadState();
    mod.recordCard(state, 'fc-acct', 'none', 2);

    const out = bridge.logoutLocal(uid);
    assert.equal(mod.getActiveStudentId(), null);
    assert.equal(out.anonymousPreserved, true);
    assert.equal(out.state.cards.guestCard.reps, 9);
    // Account disk still present for next login
    assert.ok(storage.getItem(`bc3-study-acct:${uid}`));
    // Guest key unchanged by account work
    assert.equal(JSON.parse(storage.getItem('bc3-study-v1')).cards.guestCard.reps, 9);
  });

  it('account switch bumps generation and clears in-memory to next account state', () => {
    const a = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const b = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    const { generation: g1 } = bridge.activateAccountLocalState(a);
    let state = mod.loadState();
    mod.recordCard(state, 'fc-a', 'all', 1);
    const gBefore = mod.getSyncGeneration();

    const switched = bridge.switchAccount(b);
    assert.ok(switched.generation > gBefore);
    assert.equal(mod.getActiveStudentId(), b);
    state = mod.loadState();
    assert.equal(state.cards['fc-a'], undefined, 'B must not see A memory');
    mod.recordQuestion(state, 'q-b', 'ア', 'ア', 1);
    assert.ok(state.questions['q-b']);

    // A's disk intact
    const aDisk = JSON.parse(storage.getItem(`bc3-study-acct:${a}`));
    assert.ok(aDisk.cards['fc-a']);
  });

  it('stale sync generation rejects late flush from previous account', async () => {
    const engine = await import('../src/lib/supabase/syncEngine.js');
    const a = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
    const b = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
    const { generation: genA } = bridge.activateAccountLocalState(a);
    let state = mod.loadState();
    mod.recordCard(state, 'fc-a', 'all', 1);
    // Switch away — any in-flight A flush must no-op
    bridge.switchAccount(b);
    const result = await engine.flushPending({ generation: genA, studentId: a });
    assert.equal(result.reason, 'stale_generation');
    assert.equal(result.flushed, 0);
    // B disk must not receive A's pending flush side effects via saveState
    const bState = mod.loadState();
    assert.equal(bState.cards['fc-a'], undefined);
  });

  it('explicit import is opt-in only', () => {
    const uid = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
    storage.setItem(
      'bc3-study-v1',
      JSON.stringify({ version: 1, cards: { fromGuest: { reps: 2 } }, questions: {}, daysTouched: {}, settings: {} }),
    );
    // Login without import → empty account (no auto-copy)
    bridge.activateAccountLocalState(uid);
    assert.equal(mod.loadState().cards.fromGuest, undefined);
    // Existing empty account → skip without overwrite
    const skipped = bridge.explicitImportAnonymousIntoAccount(uid, { overwrite: false });
    assert.equal(skipped.imported, false);
    assert.equal(skipped.reason, 'account_exists');
    // Explicit overwrite opt-in
    const r = bridge.explicitImportAnonymousIntoAccount(uid, { overwrite: true });
    assert.equal(r.imported, true);
    bridge.activateAccountLocalState(uid);
    assert.equal(mod.loadState().cards.fromGuest.reps, 2);
    assert.ok(JSON.parse(storage.getItem('bc3-study-v1')).cards.fromGuest);
  });

  it('rebuild from recorded events restores SRS via applyRating path', async () => {
    const { rebuildProgressFromEvents } = await import('../src/lib/sync/replay.js');
    const uid = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
    bridge.activateAccountLocalState(uid);
    let state = mod.loadState();
    mod.recordCard(state, 'fc-srs', 'all', 5);
    mod.recordCard(state, 'fc-srs', 'all', 5);
    state = mod.loadState();
    const rebuilt = rebuildProgressFromEvents(state.eventLog, uid, {});
    assert.equal(rebuilt.cards['fc-srs'].reps, 2);
    assert.equal(rebuilt.cards['fc-srs'].lastRating, 'all');
    assert.ok(rebuilt.cards['fc-srs'].interval >= 1);
    assert.ok(rebuilt.daysTouched[5]);
  });
});
