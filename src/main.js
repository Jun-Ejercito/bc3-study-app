import { loadAll } from './lib/data.js';
import { loadState } from './lib/storage.js';
import { renderHome } from './views/home.js';
import { renderDaysList, renderDay } from './views/days.js';
import { renderFlashcards } from './views/flashcards.js';
import { renderExams } from './views/exams.js';
import { renderProgress } from './views/progress.js';
import { renderSettings } from './views/settings.js';

const main = document.getElementById('main');
const nav = document.getElementById('nav');
const toggle = document.getElementById('nav-toggle');
const chip = document.getElementById('progress-chip');

let data = null;
let state = loadState();
let route = { name: 'home', params: {} };

toggle.addEventListener('click', () => {
  const willOpen = nav.hasAttribute('hidden');
  if (willOpen) {
    nav.removeAttribute('hidden');
    toggle.setAttribute('aria-expanded', 'true');
  } else {
    nav.setAttribute('hidden', '');
    toggle.setAttribute('aria-expanded', 'false');
  }
});

nav.querySelectorAll('[data-route]').forEach((b) => {
  b.addEventListener('click', () => {
    go(b.dataset.route);
    nav.setAttribute('hidden', '');
    toggle.setAttribute('aria-expanded', 'false');
  });
});

function refreshChip() {
  const q = Object.keys(state.questions).length;
  const c = Object.keys(state.cards).length;
  chip.textContent = `Q ${q}/200 · Cards ${c}`;
}

function setState(next) {
  state = next;
  refreshChip();
  render();
}

function encodeHash(name, params = {}) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    q.set(k, String(v));
  }
  const qs = q.toString();
  return qs ? `#/${name}?${qs}` : `#/${name}`;
}

function parseHash() {
  const raw = (location.hash || '#/home').replace(/^#\/?/, '');
  const [path, query = ''] = raw.split('?');
  const name = path || 'home';
  const params = {};
  new URLSearchParams(query).forEach((v, k) => {
    params[k] = /^\d+$/.test(v) ? Number(v) : v;
  });
  return { name, params };
}

function go(name, params = {}, { replace = false } = {}) {
  route = { name, params };
  const next = encodeHash(name, params);
  if (replace) history.replaceState(null, '', next);
  else if (location.hash !== next) location.hash = next;
  nav.querySelectorAll('[data-route]').forEach((b) => {
    b.setAttribute(
      'aria-current',
      b.dataset.route === name || (name === 'day' && b.dataset.route === 'days') ? 'page' : 'false'
    );
  });
  render();
  main.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}

function render() {
  const ctx = { data, state, go, params: route.params, refreshChip, setState };
  const map = {
    home: renderHome,
    days: renderDaysList,
    day: renderDay,
    flashcards: renderFlashcards,
    exams: renderExams,
    progress: renderProgress,
    settings: renderSettings,
  };
  (map[route.name] || renderHome)(main, ctx);
}

window.addEventListener('hashchange', () => {
  if (!data) return;
  route = parseHash();
  render();
});

(async function init() {
  main.innerHTML = '<p class="muted">Loading…</p>';
  data = await loadAll();
  refreshChip();
  const initial = parseHash();
  go(initial.name || 'home', initial.params || {}, { replace: true });
})();

window.__bc3 = { go, getState: () => state, getData: () => data };
