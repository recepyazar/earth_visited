import { test } from 'node:test';
import assert from 'node:assert/strict';
import { I18N, WORLD } from '../helpers.mjs';

const CODES = I18N.list.map((l) => l.code);
const KEYS = Object.keys(I18N.s.en);

test('every language carries every string', () => {
  for (const code of CODES) {
    const missing = KEYS.filter((k) => !I18N.s[code] || !I18N.s[code][k]);
    assert.deepEqual(missing, [], `${code} is missing: ${missing.join(', ')}`);
    const extra = Object.keys(I18N.s[code]).filter((k) => !KEYS.includes(k));
    assert.deepEqual(extra, [], `${code} has strings English does not: ${extra.join(', ')}`);
  }
});

test('placeholders survive translation', () => {
  for (const key of KEYS) {
    const wanted = (I18N.s.en[key].match(/\{\w+\}/g) || []).sort();
    for (const code of CODES) {
      const got = (I18N.s[code][key].match(/\{\w+\}/g) || []).sort();
      assert.deepEqual(got, wanted, `${code}.${key} keeps ${wanted.join(' ') || 'no placeholders'}`);
    }
  }
});

test('every language names every continent', () => {
  const regions = [...new Set(WORLD.f.map((f) => f.r))].filter((r) => r !== 'Antarctic' && r !== '—');
  for (const code of CODES) {
    for (const region of regions) {
      assert.ok(I18N.regions[code] && I18N.regions[code][region], `${code} names ${region}`);
    }
  }
});

test('each language declares a locale that Intl accepts', () => {
  for (const { code, locale } of I18N.list) {
    assert.doesNotThrow(() => new Intl.NumberFormat(locale).format(1234.5), `${code} → ${locale}`);
  }
});

test('Turkish shows the percent sign before the number, English after', () => {
  const pct = (locale) => new Intl.NumberFormat(locale, { style: 'percent' }).format(0.11);
  assert.match(pct('tr-TR'), /^%/);
  assert.match(pct('en-US'), /%$/);
});

test('the site opens in the visitor’s language when we speak it', () => {
  const pick = (preferred, saved) => I18N.pick(preferred, saved);
  assert.equal(pick(['tr-TR', 'en-US']), 'tr', 'a Turkish phone gets Turkish');
  assert.equal(pick(['de-AT']), 'de', 'regional variants resolve to the base language');
  assert.equal(pick(['PT-br']), 'pt', 'case does not matter');
  assert.equal(pick(['zh-CN', 'tr']), 'zh', 'Chinese is one of ours now');
  assert.equal(pick(['hi-IN', 'tr-TR']), 'tr', 'we look past a language we do not speak');
  assert.equal(pick(['hi-IN', 'th-TH']), 'en', 'nothing we speak falls back to English');
  assert.equal(pick(['ar-EG']), 'ar', 'Arabic, right to left and all');
  assert.equal(pick([]), 'en', 'no preference at all falls back to English');
  assert.equal(pick(undefined), 'en', 'a browser that tells us nothing still works');
});

test('a language the visitor chose beats the system default', () => {
  assert.equal(I18N.pick(['de-DE'], 'tr'), 'tr', 'the saved choice wins');
  assert.equal(I18N.pick(['de-DE'], 'xx'), 'de', 'a bogus saved value is ignored');
  assert.equal(I18N.pick(['de-DE'], null), 'de', 'no saved choice yet');
});
