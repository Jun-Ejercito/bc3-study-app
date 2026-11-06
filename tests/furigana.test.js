import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { applyFurigana, escapeHtml, FURIGANA_RULES } from '../src/lib/furigana.js';

const dict = JSON.parse(readFileSync(new URL('../public/data/furigana.json', import.meta.url), 'utf8'));

const SCREENSHOT =
  '不適合品の数のように数えて得られる値を（　）、長さや重さのように測って得られる値を（　）という。';

function rts(html) {
  return [...html.matchAll(/<rt>([^<]*)<\/rt>/g)].map((m) => m[1]);
}

describe('furigana screenshot cloze sentence', () => {
  it('不適合品の数→かず and 数えて→かぞ+えて (not すう/すうえて)', () => {
    const html = applyFurigana(SCREENSHOT, dict);
    assert.match(html, /<ruby>不適合品<rp>\(<\/rp><rt>ふてきごうひん<\/rt>/);
    assert.match(html, /の<ruby>数<rp>\(<\/rp><rt>かず<\/rt>/);
    assert.match(html, /<ruby>数<rp>\(<\/rp><rt>かぞ<\/rt><rp>\)<\/rp><\/ruby>えて/);
    assert.doesNotMatch(html, /<rt>すう<\/rt>/); // no bare すう in this sentence
    assert.doesNotMatch(html, /すうえて/);
    assert.match(html, /<ruby>長さ<rp>\(<\/rp><rt>ながさ<\/rt>/);
    assert.match(html, /<ruby>重さ<rp>\(<\/rp><rt>おもさ<\/rt>/);
    assert.match(html, /<ruby>測<rp>\(<\/rp><rt>はか<\/rt><rp>\)<\/rp><\/ruby>って/);
    assert.match(html, /<rt>あたい<\/rt>/);
    // visible surface keeps 数えて letters once
    assert.equal((html.match(/えて/g) || []).length, 1);
  });
});

describe('furigana compound 実績値 (prior fix)', () => {
  it('読みはじっせきち', () => {
    const html = applyFurigana('実績値', dict);
    assert.match(html, /<ruby>実績値<rp>\(<\/rp><rt>じっせきち<\/rt>/);
    assert.doesNotMatch(html, /あたい/);
  });
  it('単独の値はあたい', () => {
    assert.equal(dict['値'], 'あたい');
    assert.match(applyFurigana('値', dict), /<rt>あたい<\/rt>/);
  });
});

describe('数: compounds keep すう; verb/noun context differ', () => {
  it('onyomi compounds unchanged', () => {
    for (const [w, y] of [
      ['個数', 'こすう'], ['計数値', 'けいすうち'], ['数量', 'すうりょう'],
      ['数値', 'すうち'], ['多数', 'たすう'], ['数式', 'すうしき'],
      ['計数', 'けいすう'], ['指数', 'しすう'],
    ]) {
      assert.match(applyFurigana(w, dict), new RegExp(`<rt>${y}</rt>`), w);
    }
  });
  it('X数 suffix after kanji stays すう', () => {
    assert.match(applyFurigana('適合品数', dict), /てきごうひんすう/);
    assert.match(applyFurigana('検査数', dict), /けんさすう/);
    assert.match(applyFurigana('労働者数', dict), /ろうどうしゃすう/);
  });
  it('数える conjugations use かぞ without duplicating okurigana in rt', () => {
    for (const w of ['数える', '数えて', '数えた']) {
      const html = applyFurigana(w, dict);
      assert.match(html, /<ruby>数<rp>\(<\/rp><rt>かぞ<\/rt>/, w);
      assert.doesNotMatch(html, /<rt>かぞえ/, w);
      assert.doesNotMatch(html, /すう/, w);
    }
  });
  it('BARE_NOUN rule exists for 数→かず', () => {
    assert.equal(FURIGANA_RULES.BARE_NOUN['数'], 'かず');
  });
});

describe('測/図/計 okurigana and technical terms', () => {
  it('測って→はか+って', () => {
    assert.match(applyFurigana('測って', dict), /<rt>はか<\/rt><rp>\)<\/rp><\/ruby>って/);
  });
  it('図る→はか+る (not ず)', () => {
    const html = applyFurigana('向上を図る', dict);
    assert.match(html, /<ruby>図<rp>\(<\/rp><rt>はか<\/rt><rp>\)<\/rp><\/ruby>る/);
    assert.doesNotMatch(html, /<ruby>図[^<]*<rt>ず<\/rt>/);
  });
  it('図示 compound ずし; 図面 stays ずめん', () => {
    assert.match(applyFurigana('図示', dict), /<rt>ずし<\/rt>/);
    assert.match(applyFurigana('図面', dict), /<rt>ずめん<\/rt>/);
  });
  it('良品/不良品/不適合品', () => {
    assert.match(applyFurigana('良品', dict), /りょうひん/);
    assert.match(applyFurigana('不良品', dict), /ふりょうひん/);
    assert.match(applyFurigana('不適合品', dict), /ふてきごうひん/);
  });
});

describe('safety: escape, no double ruby, surface preserved', () => {
  it('escapes HTML in plain text', () => {
    assert.equal(escapeHtml('a<b>&"'), 'a&lt;b&gt;&amp;&quot;');
    const html = applyFurigana('値<x>', dict);
    assert.match(html, /&lt;x&gt;/);
  });
  it('does not re-annotate strings that already contain ruby', () => {
    const pre = '<ruby>数<rt>かず</rt></ruby>';
    assert.equal(applyFurigana(pre, dict), pre);
  });
  it('visible kanji sequence for screenshot prompt preserved in order', () => {
    const html = applyFurigana(SCREENSHOT, dict);
    // Strip ruby chrome (<ruby>, <rt>…, <rp>…) leaving base characters only
    const surface = html
      .replace(/<rt>[^<]*<\/rt>/g, '')
      .replace(/<rp>[^<]*<\/rp>/g, '')
      .replace(/<\/?ruby>/g, '')
      .replace(/<[^>]+>/g, '');
    assert.equal(surface, SCREENSHOT);
  });
});
