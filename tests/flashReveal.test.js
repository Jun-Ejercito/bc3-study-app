import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { answerRevealMarkup, rateButtonsMarkup, bindAnswerReveal } from '../src/lib/flashReveal.js';
import { readFileSync } from 'node:fs';

function mount() {
  const dom = new JSDOM(`<!doctype html><html><body>
    <div id="root">
      <p>prompt</p>
      ${answerRevealMarkup()}
      <div class="reveal-box" hidden data-back>
        <p>answer</p>
        ${rateButtonsMarkup()}
      </div>
    </div>
  </body></html>`);
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.HTMLElement = dom.window.HTMLElement;
  return document.getElementById('root');
}

describe('flash answer reveal emblem', () => {
  let root;
  beforeEach(() => { root = mount(); });

  it('markup is 答 emblem with aria 答えを表示, not large CTA text', () => {
    const html = answerRevealMarkup();
    assert.match(html, /aria-label="答えを表示"/);
    assert.match(html, />答</);
    assert.doesNotMatch(html, /タップして答え/);
    assert.doesNotMatch(html, /class="btn"/);
    const zone = root.querySelector('[data-flip]');
    assert.equal(zone.getAttribute('role'), 'button');
    assert.equal(zone.getAttribute('tabindex'), '0');
    assert.equal(zone.querySelector('.answer-emblem').textContent, '答');
  });

  it('keeps answer hidden until zone click; then hides emblem', () => {
    const back = root.querySelector('[data-back]');
    assert.equal(back.hidden, true);
    let called = 0;
    const gate = bindAnswerReveal(root, { onReveal: () => { called += 1; } });
    assert.equal(gate.revealed(), false);
    root.querySelector('[data-flip]').dispatchEvent(new window.Event('click', { bubbles: true }));
    assert.equal(gate.revealed(), true);
    assert.equal(called, 1);
    assert.equal(back.hidden, false);
    assert.equal(root.querySelector('[data-flip]').hidden, true);
    // second click does nothing extra
    root.querySelector('[data-flip]').dispatchEvent(new window.Event('click', { bubbles: true }));
    assert.equal(called, 1);
  });

  it('Enter and Space reveal', () => {
    for (const key of ['Enter', ' ']) {
      root = mount();
      const gate = bindAnswerReveal(root);
      const zone = root.querySelector('[data-flip]');
      zone.dispatchEvent(new window.KeyboardEvent('keydown', { key, bubbles: true }));
      assert.equal(gate.revealed(), true, `key ${JSON.stringify(key)}`);
      assert.equal(root.querySelector('[data-back]').hidden, false);
    }
  });

  it('rating click before reveal is blocked; after reveal rating handler can run', () => {
    let rated = 0;
    const gate = bindAnswerReveal(root, { onReveal: () => {} });
    const btn = root.querySelector('[data-rate]');
    btn.addEventListener('click', () => { rated += 1; });
    btn.dispatchEvent(new window.Event('click', { bubbles: true, cancelable: true }));
    assert.equal(rated, 0);
    assert.equal(gate.revealed(), false);
    root.querySelector('[data-flip]').dispatchEvent(new window.Event('click', { bubbles: true, cancelable: true }));
    assert.equal(gate.revealed(), true);
    btn.dispatchEvent(new window.Event('click', { bubbles: true, cancelable: true }));
    assert.equal(rated, 1);
  });

  it('CSS defines understated outlined emblem, min 44px zone, no dark fill on zone', () => {
    const css = readFileSync(new URL('../src/styles/app.css', import.meta.url), 'utf8');
    assert.match(css, /\.answer-reveal-zone\s*\{[^}]*min-height:\s*44px/s);
    assert.match(css, /\.answer-emblem\s*\{[^}]*border:\s*1\.5px solid/s);
    assert.match(css, /\.answer-reveal-zone\s*\{[^}]*background:\s*transparent/s);
  });

  it('daily and overall views use shared markup helper', () => {
    const fc = readFileSync(new URL('../src/views/flashcards.js', import.meta.url), 'utf8');
    const days = readFileSync(new URL('../src/views/days.js', import.meta.url), 'utf8');
    assert.match(fc, /answerRevealMarkup/);
    assert.match(fc, /bindAnswerReveal/);
    assert.doesNotMatch(fc, /タップして答え/);
    assert.match(days, /answerRevealMarkup/);
    assert.match(days, /bindAnswerReveal/);
    assert.doesNotMatch(days, /タップして答え/);
  });
});

describe('rate emblem buttons', () => {
  it('uses ◎ △ × with Japanese aria-label/title; no permanent text labels', () => {
    const html = rateButtonsMarkup();
    assert.match(html, /data-rate="all"[^>]*>[\s\S]*◎/);
    assert.match(html, /data-rate="partial"[^>]*>[\s\S]*△/);
    assert.match(html, /data-rate="none"[^>]*>[\s\S]*×/);
    assert.match(html, /aria-label="全部できた"/);
    assert.match(html, /aria-label="一部できた"/);
    assert.match(html, /aria-label="できなかった"/);
    assert.match(html, /title="全部できた"/);
    assert.match(html, /title="一部できた"/);
    assert.match(html, /title="できなかった"/);
    assert.doesNotMatch(html, />全部できた</);
    assert.doesNotMatch(html, />一部できた</);
    assert.doesNotMatch(html, />できなかった</);
    assert.doesNotMatch(html, /class="btn /);
  });

  it('CSS is compact outlined green on white, min 44px, no red/gold rate colors', () => {
    const css = readFileSync(new URL('../src/styles/app.css', import.meta.url), 'utf8');
    assert.match(css, /\.rate-emblem\s*\{[^}]*min-width:\s*44px/s);
    assert.match(css, /\.rate-emblem\s*\{[^}]*min-height:\s*44px/s);
    assert.match(css, /\.rate-emblem\s*\{[^}]*background:\s*#fff/s);
    assert.match(css, /\.rate-emblem\s*\{[^}]*border:\s*1\.5px solid var\(--g3\)/s);
    assert.match(css, /\.rate-btns\s*\{[^}]*justify-content:\s*center/s);
    // old status-colored rate rules gone
    assert.doesNotMatch(css, /\.rate-btns \.none \{[^}]*var\(--red\)/s);
    assert.doesNotMatch(css, /\.rate-btns \.partial \{[^}]*var\(--gold\)/s);
    assert.doesNotMatch(css, /\.rate-btns \.all \{[^}]*background:\s*var\(--g1\)/s);
  });

  it('daily and overall flashcard views use shared rateButtonsMarkup; data-rate keys preserved', () => {
    const fc = readFileSync(new URL('../src/views/flashcards.js', import.meta.url), 'utf8');
    const days = readFileSync(new URL('../src/views/days.js', import.meta.url), 'utf8');
    assert.match(fc, /rateButtonsMarkup/);
    assert.match(days, /rateButtonsMarkup/);
    assert.match(fc, /data-rate/);
    assert.match(days, /data-rate/);
    assert.doesNotMatch(fc, /全部できた</);
    assert.doesNotMatch(days, /全部できた</);
  });

  it('answer 答 emblem preserved alongside rate emblems', () => {
    assert.match(answerRevealMarkup(), />答</);
    assert.match(rateButtonsMarkup(), /◎/);
  });
});
