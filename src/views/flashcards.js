import { applyFurigana } from '../lib/furigana.js';
import { recordCard, saveState } from '../lib/storage.js';
import { buildRound } from '../lib/scheduler.js';
import { answerRevealMarkup, bindAnswerReveal } from '../lib/flashReveal.js';

export function renderFlashcards(root, { data, state, refreshChip }) {
  const onlyLearned = state.settings.overallOnlyLearned;
  const learnedDays = new Set(Object.keys(state.daysTouched).map(Number));
  let pool = data.flashcards;
  if (onlyLearned && learnedDays.size) {
    pool = pool.filter((c) => c.day == null || learnedDays.has(c.day));
  }
  let mode = 'overall';
  let round = [];
  let i = 0;
  let revealed = false;

  const mount = () => {
    root.innerHTML = `
      <h2>フラッシュカード</h2>
      <div class="tabs">
        <button type="button" data-mode="overall" aria-selected="${mode==='overall'}">全体 Overall</button>
        <button type="button" data-mode="due" aria-selected="${mode==='due'}">復習 Due</button>
      </div>
      <label class="row"><input type="checkbox" id="only-learned" ${onlyLearned?'checked':''}/> 触った日のカードだけ (overall)</label>
      <p class="muted">Self-rate: 全部 / 一部 / できなかった · Unseen first · variant cooldown</p>
      <div id="fc-panel"></div>`;
    root.querySelectorAll('[data-mode]').forEach((b) => b.onclick = () => { mode = b.dataset.mode; startRound(); });
    root.querySelector('#only-learned').onchange = (e) => {
      state.settings.overallOnlyLearned = e.target.checked;
      saveState(state);
      startRound();
    };
    startRound();
  };

  const startRound = () => {
    let cards = pool;
    if (mode === 'due') {
      const now = Date.now();
      cards = pool.filter((c) => {
        const s = state.cards[c.id];
        return !s || (s.due || 0) <= now;
      });
    }
    round = buildRound(cards, state.cards, { limit: 20 });
    i = 0; revealed = false;
    draw();
  };

  const draw = () => {
    const panel = root.querySelector('#fc-panel');
    if (!round.length) {
      panel.innerHTML = '<div class="card"><p>No cards in this filter. Touch a day first, or disable “learned only”.</p></div>';
      return;
    }
    if (i >= round.length) {
      panel.innerHTML = '<div class="card"><p>ラウンド完了。Export backup from Settings if you like.</p><button class="btn" data-again>Another round</button></div>';
      panel.querySelector('[data-again]').onclick = startRound;
      return;
    }
    const c = round[i];
    revealed = false;
    panel.innerHTML = `
      <div class="card spacious">
        <div class="row"><span class="badge">${c.type}</span>
          <span class="muted">Day ${c.day ?? '—'} · ${i+1}/${round.length}</span></div>
        <p>${applyFurigana(c.prompt_ja, data.furigana)}</p>
        ${answerRevealMarkup()}
        <div class="reveal-box" hidden data-back>
          <p><strong>${applyFurigana(c.answer_ja, data.furigana)}</strong></p>
          ${c.hints?.length ? `<p class="muted">hints: ${c.hints.join(' / ')}</p>` : ''}
          <div class="btn-row rate-btns">
            <button class="btn all" data-rate="all">全部できた</button>
            <button class="btn partial" data-rate="partial">一部</button>
            <button class="btn none" data-rate="none">できなかった</button>
          </div>
        </div>
      </div>`;
    const gate = bindAnswerReveal(panel, { onReveal: () => { revealed = true; } });
    panel.querySelectorAll('[data-rate]').forEach((b) => b.onclick = (ev) => {
      ev.stopPropagation();
      if (!revealed || !gate.revealed()) return;
      recordCard(state, c.id, b.dataset.rate, c.day);
      refreshChip?.();
      i += 1; draw();
    });
  };

  mount();
}
