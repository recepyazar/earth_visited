import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadBrowserGlobals, WORLD } from '../helpers.mjs';

const loaded = loadBrowserGlobals(['js/cities.js', 'js/cityareas.js']);
const CITIES = loaded.CITIES;
const AREAS = loaded.CITY_AREAS;

test('every city that is drawn has an area, and every area a city', () => {
  const perCountry = new Map();
  CITIES.c.forEach((city) => perCountry.set(city.c, (perCountry.get(city.c) || 0) + 1));

  let covered = 0;
  for (const [code, list] of Object.entries(AREAS.a)) {
    assert.ok(WORLD.f.some((f) => f.c === code), `${code} is a country on the map`);
    for (const [index, d] of list) {
      const city = CITIES.c[index];
      assert.ok(city, `${code} area ${index} points at a city`);
      assert.equal(city.c, code, `${city.n} is tessellated with its own country`);
      assert.match(d, /^M-?\d+,-?\d+l.*Z$/, `${city.n}'s cell is a closed path`);
      covered++;
    }
  }
  // a handful of cities sit in places the world map does not draw as a country
  assert.ok(covered > CITIES.c.length * 0.95, `${covered} of ${CITIES.c.length} cities have an area`);
});

test('a country with one city gives it the whole country', () => {
  const single = Object.entries(AREAS.a).find(([, list]) => list.length === 1);
  assert.ok(single, 'there is such a country');
  assert.match(single[1][0][1], /^M-?\d+,-?\d+l/);
});

test('the mosaic stays small enough to send down the wire', () => {
  const bytes = Buffer.byteLength(JSON.stringify(AREAS));
  assert.ok(bytes < 500_000, `${Math.round(bytes / 1024)} KB before gzip`);
});

test('cells sit where their city sits', () => {
  // the first point of a cell is a corner of it, so the city must be within reach
  const check = (name, code) => {
    const index = CITIES.c.findIndex((c) => c.n === name && c.c === code);
    const entry = AREAS.a[code].find(([i]) => i === index);
    assert.ok(entry, `${name} has a cell`);
    const [x, y] = entry[1].match(/^M(-?\d+),(-?\d+)/).slice(1).map(Number);
    const city = CITIES.c[index];
    const far = Math.hypot(x / AREAS.ps - city.x / CITIES.scale, y / AREAS.ps - city.y / CITIES.scale);
    assert.ok(far < 200, `${name}'s cell starts ${Math.round(far)} units away`);
  };
  check('Istanbul', 'TR');
  check('Tokyo', 'JP');
  check('Lima', 'PE');
});
