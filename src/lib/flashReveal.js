/** Understated 答 emblem + generous tappable zone for flashcard answer reveal. */

export function answerRevealMarkup() {
  return `<div class="answer-reveal-zone" data-flip role="button" tabindex="0" aria-label="答えを表示">
  <span class="answer-emblem" aria-hidden="true">答</span>
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
    // Ignore clicks that originated on rate controls if somehow nested
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

  // Before reveal, swallow rate clicks (defensive if controls were somehow visible)
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
