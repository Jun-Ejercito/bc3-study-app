/** Understated 答 emblem + compact ◎/△/× rating controls for flashcards. */

export function answerRevealMarkup() {
  return `<div class="answer-reveal-zone" data-flip role="button" tabindex="0" aria-label="答えを表示">
  <span class="answer-emblem" aria-hidden="true">答</span>
</div>`;
}

/** Compact self-rate controls. data-rate values unchanged: all | partial | none */
export function rateButtonsMarkup() {
  const items = [
    { rate: 'all', emblem: '◎', label: '全部できた' },
    { rate: 'partial', emblem: '△', label: '一部できた' },
    { rate: 'none', emblem: '×', label: 'できなかった' },
  ];
  return `<div class="rate-btns" role="group" aria-label="自己評価">
  ${items.map(({ rate, emblem, label }) =>
    `<button type="button" class="rate-emblem" data-rate="${rate}" title="${label}" aria-label="${label}"><span class="rate-glyph" aria-hidden="true">${emblem}</span></button>`
  ).join('')}
</div>`;
}

/**
 * Bind reveal once. Rating buttons stay inert until revealed.
 * @returns {{ revealed: () => boolean }}
 */
export function bindAnswerReveal(root, { onReveal } = {}) {
  const zone = root.querySelector('[data-flip]');
  const back = root.querySelector('[data-back]');
  let revealed = false;
  if (!zone || !back) return { revealed: () => false };

  const reveal = (ev) => {
    if (revealed) return;
    const t = ev?.target;
    if (t && typeof t.closest === 'function' && t.closest('[data-rate]')) return;
    revealed = true;
    back.hidden = false;
    zone.hidden = true;
    zone.setAttribute('aria-hidden', 'true');
    zone.removeAttribute('tabindex');
    onReveal?.();
  };

  zone.addEventListener('click', (ev) => {
    ev.preventDefault();
    reveal(ev);
  });
  zone.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' || ev.key === ' ') {
      ev.preventDefault();
      reveal(ev);
    }
  });

  root.querySelectorAll('[data-rate]').forEach((b) => {
    b.addEventListener('click', (ev) => {
      if (revealed) return;
      ev.preventDefault();
      ev.stopPropagation();
      ev.stopImmediatePropagation();
    }, true);
  });

  return { revealed: () => revealed };
}
