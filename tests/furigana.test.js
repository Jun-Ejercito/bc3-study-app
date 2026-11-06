import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { applyFurigana } from '../src/lib/furigana.js';

const dict = JSON.parse(readFileSync(new URL('../public/data/furigana.json', import.meta.url), 'utf8'));

describe('furigana compound 実績値', () => {
  it('読みはじっせきち（実績+値の分割ではない）', () => {
    const html = applyFurigana('実績値', dict);
    assert.match(html, /<ruby>実績値<rp>\(<\/rp><rt>じっせきち<\/rt><rp>\)<\/rp><\/ruby>/);
    assert.doesNotMatch(html, /あたい/);
    assert.doesNotMatch(html, /じっせきあたい/);
  });

  it('単独の値はあたいのまま', () => {
    assert.equal(dict['値'], 'あたい');
    const html = applyFurigana('値', dict);
    assert.match(html, /<ruby>値<rp>\(<\/rp><rt>あたい<\/rt><rp>\)<\/rp><\/ruby>/);
  });

  it('文中の実績値も複合優先（要点・解説と同じ経路）', () => {
    const html = applyFurigana('標準値と実績値を比較する', dict);
    assert.match(html, /実績値.*じっせきち|じっせきち/);
    assert.doesNotMatch(html, /じっせき<\/rt>.*値.*あたい/);
  });

  it('辞書に複合オーバーライドがある', () => {
    assert.equal(dict['実績値'], 'じっせきち');
    assert.equal(dict['実績'], 'じっせき');
  });
});
