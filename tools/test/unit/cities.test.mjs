import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadBrowserGlobals, WORLD, SHARE } from '../helpers.mjs';

const PACK_LANGS = ['tr', 'de', 'es', 'fr', 'it', 'pt', 'ru', 'zh', 'ar', 'ja', 'ko'];
const loaded = loadBrowserGlobals(['js/cities.js', ...PACK_LANGS.map((l) => `js/cities/${l}.js`)]);
const CITIES = loaded.CITIES;
const NAMES = loaded.CITY_NAMES;
const order = CITIES.c.map((c) => c.i);

test('the city layer covers the world without being a phone book', () => {
  assert.ok(CITIES.c.length > 5000 && CITIES.c.length < 8000, `${CITIES.c.length} cities`);
  assert.equal(CITIES.minPop, 100_000);
  const countries = new Set(CITIES.c.map((c) => c.c));
  assert.ok(countries.size > 150, `${countries.size} countries have at least one`);
});

test('every city is complete, sane and on the map', () => {
  const ids = new Set();
  for (const c of CITIES.c) {
    assert.ok(Number.isInteger(c.i) && !ids.has(c.i), `${c.n} has its own id`);
    ids.add(c.i);
    assert.ok(c.n && c.n.length, 'has a name');
    assert.match(c.c, /^[A-Z]{2}$/, `${c.n} has a country code`);
    assert.ok(c.p >= 100, `${c.n} is over the population floor`);
    assert.ok(c.x / CITIES.scale >= 0 && c.x / CITIES.scale <= WORLD.w, `${c.n} sits inside the map`);
    assert.ok(c.y / CITIES.scale >= 0 && c.y / CITIES.scale <= WORLD.h, `${c.n} sits inside the map`);
  }
});

test('ids are ordered, which is what the share link counts on', () => {
  assert.deepEqual(order, [...order].sort((a, b) => a - b));
});

test('cities land where their country is', () => {
  const near = (name, code) => {
    const city = CITIES.c.find((c) => c.n === name && c.c === code);
    const country = WORLD.f.find((f) => f.c === code);
    assert.ok(city, `${name} is in the data`);
    assert.ok(Math.hypot(city.x / CITIES.scale - country.x, city.y / CITIES.scale - country.y) < 60, `${name} is near ${code}`);
  };
  near('Istanbul', 'TR');
  near('Tokyo', 'JP');
  near('Buenos Aires', 'AR');
});

test('every language has its own names, keyed to the frozen city order', () => {
  const at = (name) => CITIES.c.findIndex((c) => c.n === name);
  for (const lang of PACK_LANGS) {
    const pack = NAMES[lang];
    assert.ok(pack, `${lang} has a pack`);
    for (const key of Object.keys(pack)) {
      const i = +key;
      assert.ok(Number.isInteger(i) && CITIES.c[i], `${lang} key ${key} points at a city`);
      assert.ok(pack[key].length, `${lang} ${key} is not empty`);
      assert.notEqual(pack[key], CITIES.c[i].n, 'a name identical to the original is dead weight');
    }
  }
  // the ones a Turkish visitor would actually type
  assert.equal(NAMES.tr[at('Rome')], 'Roma');
  assert.equal(NAMES.tr[at('Vienna')], 'Viyana');
  assert.equal(NAMES.tr[at('Moscow')], 'Moskova');
  assert.equal(NAMES.ru[at('Moscow')], 'Москва');
  assert.match(NAMES.ja[at('Tokyo')], /^東京/);
});

test('a name pack stays small enough to fetch on a phone', () => {
  for (const lang of PACK_LANGS) {
    // escaped as \uXXXX on disk, a third of this over the wire once gzipped
    const bytes = Buffer.byteLength(JSON.stringify(NAMES[lang]));
    assert.ok(bytes < 130_000, `${lang} is ${Math.round(bytes / 1024)} KB`);
  }
});

test('a handful of marked cities makes a link you can paste', () => {
  const marks = new Map(CITIES.c.filter((_, i) => i % 400 === 0).map((c) => [c.i, 2]));
  const link = SHARE.encodeCities(order, marks);
  assert.ok(link.length < 120, `${marks.size} cities cost ${link.length} characters`);
  assert.deepEqual(new Map(SHARE.decodeCities(order, link)), marks);
});

test('city links keep every level and stay URL-safe', () => {
  const marks = new Map(CITIES.c.slice(0, 40).map((c, i) => [c.i, (i % 4) + 1]));
  const link = SHARE.encodeCities(order, marks);
  assert.match(link, /^[A-Za-z0-9_-]+$/);
  assert.deepEqual(new Map(SHARE.decodeCities(order, link)), marks);
  assert.equal(SHARE.encodeCities(order, new Map()), '', 'no cities means no section');
  assert.deepEqual(SHARE.decodeCities(order, ''), []);
});

test('a link written before a city existed still reads', () => {
  // decoding against a shorter list must drop the unknown tail, not throw
  const marks = new Map([[order[0], 1], [order[order.length - 1], 3]]);
  const link = SHARE.encodeCities(order, marks);
  const shorter = order.slice(0, 100);
  const back = SHARE.decodeCities(shorter, link);
  assert.deepEqual(back, [[order[0], 1]]);
});
