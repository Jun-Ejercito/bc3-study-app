import { loadAll } from './lib/data.js';
import { loadState, setDaysCatalog, setActiveStudentId, getActiveStudentId } from './lib/storage.js';
import { getSession } from './lib/sync/accountScope.js';
import { activateAndSync, logoutLocal } from './lib/supabase/sessionBridge.js';
import { createSupabaseSyncAdapter } from './lib/supabase/adapter.js';
import { readSupabaseConfig } from './lib/supabase/config.js';
import { renderHome } from './views/home.js';
import { renderDaysList, renderDay } from './views/days.js';
import { renderFlashcards } from './views/flashcards.js';
import { renderExams } from './views/exams.js';
import { renderProgress } from './views/progress.js';
import { renderSettings } from './views/settings.js';
import { renderAuth } from './views/auth.js';
import { renderTeacher } from './views/teacher.js';

const main = document.getElementById('main');
const nav = document.getElementById('nav');
const toggle = document.getElementById('nav-toggle');
const chip = document.getElementById('progress-chip');

let data = null;
/** In-memory UI state — always mirrors active scope after resume. */
let state = null;
let route = { name: 'home', params: {} };
let bootReady = false;

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
  if (!state) {
    chip.textContent = '…';
    return;
  }
  const q = Object.keys(state.questions || {}).length;
  const c = Object.keys(state.cards || {}).length;
  const uid = getActiveStudentId();
  chip.textContent = uid
    ? `Q ${q}/200 · Cards ${c} · signed-in`
    : `Q ${q}/200 · Cards ${c}`;
}

function setState(next) {
  state = next;
  refreshChip();
  if (bootReady) render();
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
  if (!bootReady) return;
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
  if (!bootReady || !data || !state) return;
  const ctx = {
    data,
    state,
    go,
    params: route.params,
    refreshChip,
    setState,
    getActiveStudentId,
  };
  const map = {
    home: renderHome,
    days: renderDaysList,
    day: renderDay,
    flashcards: renderFlashcards,
    exams: renderExams,
    progress: renderProgress,
    settings: renderSettings,
    auth: renderAuth,
    teacher: renderTeacher,
  };
  (map[route.name] || renderHome)(main, ctx);
}

window.addEventListener('hashchange', () => {
  if (!bootReady) return;
  route = parseHash();
  render();
});

/**
 * Resume auth BEFORE first private progress render.
 * Order: load catalog → detect session → activate account scope → pull/replay → then paint.
 */
async function resumeAuthSession(daysCatalog) {
  const cfg = readSupabaseConfig();
  const cached = getSession(localStorage);

  if (!cfg.configured) {
    // Offline / unconfigured: honor local session cache for scoped disk only
    if (cached?.studentId) {
      setActiveStudentId(cached.studentId);
      return loadState();
    }
    setActiveStudentId(null);
    return loadState();
  }

  const adapter = createSupabaseSyncAdapter();
  let remoteSession = null;
  try {
    remoteSession = await adapter.getSession();
  } catch {
    remoteSession = null;
  }

  if (!remoteSession?.studentId) {
    // Stale local session without live auth → guest
    if (cached?.studentId) {
      logoutLocal(cached.studentId);
    } else {
      setActiveStudentId(null);
    }
    return loadState();
  }

  const { state: next } = await activateAndSync(remoteSession.studentId, {
    daysCatalog,
    roleCached: cached?.roleCached || 'student',
    classIdsCached: cached?.classIdsCached || [],
  });
  return next;
}

(async function init() {
  main.innerHTML = '<p class="muted">Loading…</p>';
  data = await loadAll();
  setDaysCatalog(data.days || []);

  // Do not paint progress until scope is known
  state = await resumeAuthSession(data.days || []);
  bootReady = true;
  refreshChip();
  updateSyncFooter();
  const initial = parseHash();
  go(initial.name || 'home', initial.params || {}, { replace: true });
})();

window.__bc3 = {
  go,
  getState: () => state,
  getData: () => data,
  getActiveStudentId,
};

function updateSyncFooter() {
  const el = document.getElementById('sync-footer');
  if (!el) return;
  const cfg = readSupabaseConfig();
  const uid = getActiveStudentId();
  if (!cfg.configured) {
    el.textContent = 'Guest local-only · Supabase not connected · Progress stays on this device';
  } else if (uid) {
    el.textContent = `Signed in · cloud sync enabled · account scope active`;
  } else {
    el.textContent =
      'Auth ready (config present) · Guest mode · Cloud project must be applied by owner';
  }
}
