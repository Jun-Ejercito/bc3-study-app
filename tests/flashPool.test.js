import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  resolveFlashParams,
  selectFlashPool,
  cardsForDay,
  emptyFlashMessage,
} from '../src/lib/flashPool.js';
import { buildRound } from '../src/lib/scheduler.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const load = (n) => JSON.parse(readFileSync(join(root, 'public/data', n), 'utf8'));

function makeData() {
  const flashcards = load('flashcards.json');
  const days = load('days.json');
  const cardById = Object.fromEntries(flashcards.map((c) => [c.id, c]));
  const dayByN = Object.fromEntries(days.map((d) => [d.day, d]));
  return { flashcards, days, cardById, dayByN };
}

describe('flash pool daily vs overall vs due', () => {
  const data = makeData();

  it('daily day1 and day2 banks are disjoint and match day card_ids', () => {
    const d1 = cardsForDay(data, 1);
    const d2 = cardsForDay(data, 2);
    assert.ok(d1.length >= 1);
    assert.ok(d2.length >= 1);
    const ids1 = new Set(d1.map((c) => c.id));
    const ids2 = new Set(d2.map((c) => c.id));
    for (const id of ids1) assert.equal(ids2.has(id), false, `overlap ${id}`);
    assert.deepEqual(
      d1.map((c) => c.id).sort(),
      [...data.dayByN[1].card_ids].sort(),
    );
    assert.deepEqual(
      selectFlashPool(data, { cards: {}, daysTouched: {} }, { mode: 'daily', day: 1 }).map((c) => c.id).sort(),
      d1.map((c) => c.id).sort(),
    );
    assert.deepEqual(
      selectFlashPool(data, { cards: {}, daysTouched: {} }, { mode: 'daily', day: 2 }).map((c) => c.id).sort(),
      d2.map((c) => c.id).sort(),
    );
  });

  it('overall with studied-days-only uses touched days; overall without uses all', () => {
    const state = { cards: {}, daysTouched: { 1: { first: 'x', last: 'x' } } };
    const learned = selectFlashPool(data, state, { mode: 'overall', onlyLearned: true });
    assert.ok(learned.every((c) => c.day == null || c.day === 1));
    const all = selectFlashPool(data, state, { mode: 'overall', onlyLearned: false });
    assert.ok(all.length > learned.length);
    assert.equal(all.length, data.flashcards.length);
  });

  it('due ignores studied-days filter and shares card ids with history map', () => {
    const now = 1_700_000_000_000;
    const dueId = data.dayByN[1].card_ids[0];
    const laterId = data.dayByN[2].card_ids[0];
    const state = {
      daysTouched: {},
      cards: {
        [dueId]: { due: now - 1000, easiness: 2.3, interval: 1, repetitions: 1 },
        [laterId]: { due: now + 86_400_000, easiness: 2.3, interval: 3, repetitions: 2 },
      },
    };
    const due = selectFlashPool(data, state, { mode: 'due', onlyLearned: true, now });
    const ids = new Set(due.map((c) => c.id));
    assert.equal(ids.has(dueId), true);
    assert.equal(ids.has(laterId), false);
    // same history object used by buildRound
    const round = buildRound(due, state.cards, { limit: 5, now });
    assert.ok(round.every((c) => state.cards[c.id] === undefined || state.cards[c.id].due <= now || !state.cards[c.id]));
  });

  it('same card id appears in daily bank and overall — shared history key', () => {
    const id = data.dayByN[1].card_ids[0];
    const daily = selectFlashPool(data, { cards: {}, daysTouched: {} }, { mode: 'daily', day: 1 });
    const overall = selectFlashPool(data, { cards: {}, daysTouched: {} }, { mode: 'overall', onlyLearned: false });
    assert.ok(daily.some((c) => c.id === id));
    assert.ok(overall.some((c) => c.id === id));
  });

  it('resolveFlashParams prefers URL; clamps day; defaults mode', () => {
    assert.deepEqual(resolveFlashParams({ mode: 'daily', day: 3 }, {}), { mode: 'daily', day: 3 });
    assert.deepEqual(resolveFlashParams({}, { flashMode: 'due', flashDay: 5 }), { mode: 'due', day: 5 });
    assert.deepEqual(resolveFlashParams({ mode: 'daily', day: 99 }, {}), { mode: 'daily', day: 1 });
    assert.deepEqual(resolveFlashParams({ mode: 'nope' }, {}), { mode: 'overall', day: 1 });
  });

  it('empty messages are clear per mode', () => {
    assert.match(emptyFlashMessage('daily'), /この日/);
    assert.match(emptyFlashMessage('due'), /復習/);
    assert.match(emptyFlashMessage('overall', { onlyLearned: true }), /触った日/);
  });

  it('view wires 日別/全体/復習 and hash-oriented syncRoute pattern', () => {
    const src = readFileSync(join(root, 'src/views/flashcards.js'), 'utf8');
    assert.match(src, /日別/);
    assert.match(src, /全体/);
    assert.match(src, /復習/);
    assert.match(src, /go\('flashcards'/);
    assert.match(src, /mode: nextMode/);
    assert.doesNotMatch(src, /Overall|Due/);
    assert.match(src, /answerRevealMarkup/);
    assert.match(src, /rateButtonsMarkup/);
  });
});
