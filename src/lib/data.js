import { assetUrl } from './assets.js';

let cache = null;

export async function loadAll() {
  if (cache) return cache;
  const files = [
    'data/questions.json',
    'data/days.json',
    'data/flashcards.json',
    'data/clusters.json',
    'data/sets.json',
    'data/manifest.json',
    'data/furigana.json',
    'data/yoten_sections.json',
  ];
  const [questions, days, flashcards, clusters, sets, manifest, furigana, yoten] = await Promise.all(
    files.map((f) => fetch(assetUrl(f)).then((r) => {
      if (!r.ok) throw new Error(`Failed to load ${f}: ${r.status}`);
      return r.json();
    }))
  );
  const qById = Object.fromEntries(questions.map((q) => [q.id, q]));
  const dayByN = Object.fromEntries(days.map((d) => [d.day, d]));
  const cardById = Object.fromEntries(flashcards.map((c) => [c.id, c]));
  cache = { questions, days, flashcards, clusters, sets, manifest, furigana, yoten, qById, dayByN, cardById };
  return cache;
}
