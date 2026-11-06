import { applyFurigana } from '../lib/furigana.js';
import { recordCard, saveState } from '../lib/storage.js';
import { buildRound } from '../lib/scheduler.js';
import { answerRevealMarkup, rateButtonsMarkup, bindAnswerReveal } from '../lib/flashReveal.js';
import {
  resolveFlashParams,
  selectFlashPool,
  emptyFlashMessage,
  dayOptionLabel,
} from '../lib/flashPool.js';

export function renderFlashcards(root, { data, state, go, params, refreshChip }) {
  const { mode, day } = resolveFlashParams(params, state.settings);
  const onlyLearned = !!state.settings.overallOnlyLearned;

  // Persist for bare #/flashcards navigations
  let settingsDirty = false;
  if (state.settings.flashMode !== mode) {
    state.settings.flashMode = mode;
    settingsDirty = true;
  }
  if (mode === 'daily' && state.settings.flashDay !== day) {
    state.settings.flashDay = day;
    settingsDirty = true;
  }
  if (settingsDirty) saveState(state);

  let round = [];
  let i = 0;
  let revealed = false;

  const syncRoute = (nextMode, nextDay) => {
    const p = { mode: nextMode };
    if (nextMode === 'daily') p.day = nextDay;
    // Reset concealed card / rating without logging — re-render via go
    go('flashcards', p, { replace: true });
  };

  const mount = () => {
    const days = data.days || [];
    root.innerHTML = `
      <h2>フラッシュカード</h2>
      <div class="tabs" role="tablist">
        <button type="button" data-mode="daily" aria-selected="${mode === 'daily'}">日別</button>
        <button type="button" data-mode="overall" aria-selected="${mode === 'overall'}">全体</button>
        <button type="button" data-mode="due" aria-selected="${mode === 'due'}">復習</button>
      </div>
      <div id="fc-filters" class="row" style="margin:.4rem 0 .6rem;gap:.75rem;align-items:center;"></div>
      <p class="muted">Self-rate: ◎ 全部できた · △ 一部できた · × できなかった · Unseen first · variant cooldown</p>
      <div id="fc-panel"></div>`;

    const filters = root.querySelector('#fc-filters');
    if (mode === 'daily') {
      filters.innerHTML = `
        <label class="row" style="gap:.4rem;">日
          <select id="fc-day" aria-label="学習日">
            ${days.map((d) =>
              `<option value="${d.day}" ${d.day === day ? 'selected' : ''}>${escapeAttr(dayOptionLabel(d))}</option>`
            ).join('')}
          </select>
        </label>`;
      filters.querySelector('#fc-day').onchange = (e) => {
        syncRoute('daily', Number(e.target.value));
      };
    } else if (mode === 'overall') {
      filters.innerHTML = `
        <label class="row"><input type="checkbox" id="only-learned" ${onlyLearned ? 'checked' : ''}/>
          触った日のカードだけ</label>`;
      filters.querySelector('#only-learned').onchange = (e) => {
        state.settings.overallOnlyLearned = e.target.checked;
        saveState(state);
        startRound();
      };
    } else {
      filters.innerHTML = `<span class="muted">期限到来・未学習のカード</span>`;
    }

    root.querySelectorAll('[data-mode]').forEach((b) => {
      b.onclick = () => {
        const m = b.dataset.mode;
        syncRoute(m, m === 'daily' ? (state.settings.flashDay || day) : day);
      };
    });

    startRound();
  };

  const startRound = () => {
    const cards = selectFlashPool(data, state, {
      mode,
      day,
      onlyLearned: state.settings.overallOnlyLearned,
    });
    round = buildRound(cards, state.cards, { limit: 20 });
    i = 0;
    revealed = false;
    draw();
  };

  const draw = () => {
    const panel = root.querySelector('#fc-panel');
    if (!round.length) {
      panel.innerHTML = `<div class="card"><p>${emptyFlashMessage(mode, {
        onlyLearned: state.settings.overallOnlyLearned,
      })}</p></div>`;
      return;
    }
    if (i >= round.length) {
      panel.innerHTML = `<div class="card"><p>ラウンド完了。</p>
        <button type="button" class="btn secondary" data-again>もう一度</button></div>`;
      panel.querySelector('[data-again]').onclick = startRound;
      return;
    }
    const c = round[i];
    revealed = false;
    panel.innerHTML = `
      <div class="card spacious">
        <div class="row"><span class="badge">${c.type}</span>
          <span class="muted">Day ${c.day ?? '—'} · ${i + 1}/${round.length}</span></div>
        <p>${applyFurigana(c.prompt_ja, data.furigana)}</p>
        ${answerRevealMarkup()}
        <div class="reveal-box" hidden data-back>
          <p><strong>${applyFurigana(c.answer_ja, data.furigana)}</strong></p>
          ${c.hints?.length ? `<p class="muted">hints: ${c.hints.join(' / ')}</p>` : ''}
          ${rateButtonsMarkup()}
        </div>
      </div>`;
    const gate = bindAnswerReveal(panel, {
      onReveal: () => {
        revealed = true;
      },
    });
    panel.querySelectorAll('[data-rate]').forEach((b) => {
      b.onclick = (ev) => {
        ev.stopPropagation();
        if (!revealed || !gate.revealed()) return;
        recordCard(state, c.id, b.dataset.rate, c.day);
        refreshChip?.();
        i += 1;
        draw();
      };
    });
  };

  mount();
}

function escapeAttr(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;');
}
