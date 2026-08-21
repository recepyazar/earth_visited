import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadBrowserGlobals, WORLD, SHARE } from '../helpers.mjs';

const DETAILED = ['TR', 'US', 'DE', 'FR', 'IT', 'ES', 'GB', 'JP', 'CA', 'AU', 'BR', 'RU'];
const PACK_LANGS = ['tr', 'de', 'es', 'fr', 'it', 'pt', 'ru', 'zh', 'ar', 'ja', 'ko'];
const loaded = loadBrowserGlobals([
  'js/admin1/world.js',
  ...DETAILED.map((c) => `js/admin1/${c}.js`),
  ...PACK_LANGS.map((l) => `js/admin1/names/${l}.js`),
]);
const WORLD_SUBS = loaded.ADMIN1_WORLD;
const DETAIL = loaded.ADMIN1;
const NAMES = loaded.SUB_NAMES;

test('the world layer covers the world, province by province', () => {
  const countries = Object.keys(WORLD_SUBS.u);
  assert.ok(countries.length > 200, `${countries.length} countries are subdivided`);
  const units = Object.values(WORLD_SUBS.u).reduce((n, list) => n + list.length, 0);
  assert.ok(units > 4000 && units < 6000, `${units} units`);
  for (const [code, list] of Object.entries(WORLD_SUBS.u)) {
    assert.ok(WORLD.f.some((f) => f.c === code), `${code} is a country the map draws`);
    for (const unit of list) {
      assert.ok(unit.n && unit.n.length, `${unit.c} has a name`);
      assert.match(unit.d, /^M-?\d+,-?\d+/, `${unit.n} has a path`);
    }
  }
});

test('a province is the same province in both layers, in the same order', () => {
  // the share link numbers a country's units by position, so the coarse world layer
  // and the fine per-country file have to agree exactly
  for (const country of DETAILED) {
    const fine = DETAIL[country].u.map((u) => u.c);
    const coarse = WORLD_SUBS.u[country].map((u) => u.c);
    assert.deepEqual(coarse, fine, `${country} lists its units in one order`);
  }
});

test('a link written from either layer reads in the other', () => {
  const order = Object.fromEntries(Object.entries(WORLD_SUBS.u).map(([c, l]) => [c, l.map((u) => u.c)]));
  const marks = new Map([
    [WORLD_SUBS.u.TR[5].c, 2],
    [WORLD_SUBS.u.DE[1].c, 1],
    [WORLD_SUBS.u.JP[12].c, 3],
  ]);
  const link = SHARE.encodeSub(order, marks);
  assert.match(link, /^[\w~.-]+$/);
  assert.deepEqual(new Map(SHARE.decodeSub(order, link)), marks);

  // and against the fine files' order, which is where a country view reads it
  const fineOrder = Object.fromEntries(Object.entries(DETAIL).map(([c, d]) => [c, d.u.map((u) => u.c)]));
  const back = new Map(SHARE.decodeSub(fineOrder, link));
  for (const [code, level] of marks) assert.equal(back.get(code), level, `${code} survived the round trip`);
});

test('every language has province names, keyed by position', () => {
  for (const lang of PACK_LANGS) {
    const pack = NAMES[lang];
    assert.ok(pack, `${lang} has a pack`);
    for (const [country, names] of Object.entries(pack)) {
      assert.ok(WORLD_SUBS.u[country], `${lang} names provinces of a country we draw (${country})`);
      for (const [at, name] of Object.entries(names)) {
        assert.ok(WORLD_SUBS.u[country][+at], `${lang} ${country} ${at} points at a unit`);
        assert.ok(name.length, 'and names it');
      }
    }
  }
  const tr = (code, at) => NAMES.tr[code][WORLD_SUBS.u[code].findIndex((u) => u.c === at)];
  assert.equal(tr('DE', 'DE-BY'), 'Bavyera');
  assert.equal(tr('US', 'US-CA'), 'Kaliforniya');
});

// the path format is relative integers, so a box needs walking the whole thing
const boxOf = (d, scale) => {
  const tokens = d.match(/[MmlZ]|-?\d+/g) || [];
  let x = 0;
  let y = 0;
  let box = [Infinity, Infinity, -Infinity, -Infinity];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token === 'Z' || token === 'l') continue;
    if (token === 'M' || token === 'm') {
      const dx = +tokens[++i];
      const dy = +tokens[++i];
      x = token === 'M' ? dx : x + dx;
      y = token === 'M' ? dy : y + dy;
    } else {
      x += +token;
      y += +tokens[++i];
    }
    box = [Math.min(box[0], x), Math.min(box[1], y), Math.max(box[2], x), Math.max(box[3], y)];
  }
  return box.map((v) => v / scale);
};

test('no province is bigger than the country it belongs to', () => {
  // Simplifying the world as one topology mangled two shapes into map-wide
  // polygons — invisible, but they swallowed every click over their country.
  // (Position is no test: Bouvet Island is Norwegian and sits in the South
  // Atlantic. Size is: nothing inside a country is wider than the country.)
  const MARGIN = 4; // map units of slack for the coarser geometry
  for (const [code, list] of Object.entries(WORLD_SUBS.u)) {
    const country = WORLD.f.find((f) => f.c === code);
    if (!country || !country.d) continue;
    const outer = boxOf(country.d, WORLD.ps || 1);
    const wide = outer[2] - outer[0];
    const tall = outer[3] - outer[1];
    for (const unit of list) {
      const box = boxOf(unit.d, WORLD_SUBS.ps);
      assert.ok(box[2] - box[0] <= wide + MARGIN, `${unit.n} (${code}) is wider than its country`);
      assert.ok(box[3] - box[1] <= tall + MARGIN, `${unit.n} (${code}) is taller than its country`);
    }
  }
});

test('the layer stays small enough to fetch when the view opens', () => {
  const bytes = Buffer.byteLength(JSON.stringify(WORLD_SUBS));
  assert.ok(bytes < 1_200_000, `${Math.round(bytes / 1024)} KB before gzip`);
  for (const lang of PACK_LANGS) {
    const pack = Buffer.byteLength(JSON.stringify(NAMES[lang]));
    assert.ok(pack < 200_000, `${lang} names are ${Math.round(pack / 1024)} KB`);
  }
});
