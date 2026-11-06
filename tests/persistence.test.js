import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { pathToFileURL } from 'node:url';

// Minimal localStorage polyfill
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

test('recordCard + export/import roundtrip', async () => {
  const localStorage = makeStorage();
  globalThis.localStorage = localStorage;
  const mod = await import('../src/lib/storage.js');
  let state = mod.loadState();
  mod.recordCard(state, 'fc-0001', 'partial', 3);
  mod.recordQuestion(state, 'R5後-1', 'エ', 'エ', 11);
  const json = mod.exportJson(state);
  localStorage.clear();
  const restored = mod.importJson(json);
  assert.equal(restored.cards['fc-0001'].lastRating, 'partial');
  assert.equal(restored.questions['R5後-1'].correct, 1);
  assert.ok(restored.daysTouched[3]);
  assert.ok(restored.daysTouched[11]);
});

test('shared question id history single store', async () => {
  const localStorage = makeStorage();
  globalThis.localStorage = localStorage;
  const mod = await import('../src/lib/storage.js');
  let state = mod.loadState();
  mod.recordQuestion(state, 'R7後-26', 'ア', 'ア', 1);
  // same id from another view
  mod.recordQuestion(state, 'R7後-26', 'イ', 'ア', 1);
  assert.equal(state.questions['R7後-26'].attempts, 2);
  assert.equal(state.questions['R7後-26'].correct, 1);
});
