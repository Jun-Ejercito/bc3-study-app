import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRound, priorityScore, isDue, orderForRound,
  nextInterval, applyRating, INTERVALS,
} from '../src/lib/scheduler.js';

const cards = [
  { id: 'a', variant_group: 'g1' },
  { id: 'b', variant_group: 'g1' },
  { id: 'c', variant_group: 'g2' },
  { id: 'd', variant_group: 'g3' },
  { id: 'e', variant_group: 'g4' },
];

test('interval ladder all: 0→1→3→7', () => {
  assert.equal(nextInterval(0, 'all'), 1);
  assert.equal(nextInterval(1, 'all'), 3);
  assert.equal(nextInterval(3, 'all'), 7);
  assert.ok(nextInterval(7, 'all') >= 7);
});

test('missed resets to 1-day due', () => {
  assert.equal(nextInterval(7, 'none'), 1);
  const s = applyRating({ interval: 7, status: 'mastered', easiness: 2.5, reps: 4 }, 'none', 1_000_000);
  assert.equal(s.interval, 1);
  assert.equal(s.status, 'missed');
  assert.equal(s.due, 1_000_000 + 1 * 86400000);
});

test('partial ladder 1 then 3 then 7', () => {
  assert.equal(nextInterval(0, 'partial'), 1);
  assert.equal(nextInterval(1, 'partial'), 3);
  assert.equal(nextInterval(3, 'partial'), 7);
});

test('unseen ranks above practiced', () => {
  const state = {
    c: { status: 'learning', easiness: 2.3, interval: 1, due: Date.now() - 1000, reps: 3, lastRating: 'all' },
  };
  assert.ok(priorityScore(cards[0], null) > priorityScore(cards[2], state.c));
});

test('mastered not-due is excluded from round', () => {
  const now = Date.now();
  const round = buildRound(cards, {
    a: { status: 'mastered', easiness: 2.8, interval: 14, due: now + 86400000 * 10, reps: 8, lastRating: 'all' },
  }, { limit: 10, now });
  assert.ok(!round.find((c) => c.id === 'a'));
  assert.ok(round.find((c) => c.id === 'c'));
});

test('round avoids same variant_group until fill needed', () => {
  const round = buildRound(cards, {}, { limit: 3 });
  const groups = round.map((c) => c.variant_group);
  assert.equal(new Set(groups).size, groups.length);
});

test('no duplicate ids in a round', () => {
  const round = orderForRound(cards, {});
  assert.equal(round.length, new Set(round.map((c) => c.id)).size);
});

test('missed due sooner gets boost vs comfortable all', () => {
  const now = Date.now();
  const missed = { status: 'missed', easiness: 1.5, interval: 1, due: now - 100, reps: 2, lastRating: 'none' };
  const easy = { status: 'learning', easiness: 2.8, interval: 3, due: now - 100, reps: 5, lastRating: 'all' };
  assert.ok(priorityScore({ id: 'x' }, missed, now) > priorityScore({ id: 'y' }, easy, now));
});

test('isDue true for unseen', () => {
  assert.equal(isDue(null), true);
});

test('INTERVALS constants are 1/3/7', () => {
  assert.deepEqual(INTERVALS, { first: 1, second: 3, third: 7 });
});
