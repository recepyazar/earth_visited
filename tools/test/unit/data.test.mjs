import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WORLD, isCountry } from '../helpers.mjs';

test('the country count is the one the UI promises', () => {
  const countries = WORLD.f.filter(isCountry);
  assert.equal(countries.length, 196, '195 UN members and observers + Northern Cyprus');
  assert.equal(WORLD.f.filter((f) => f.s === 2).length, 42, 'dependent territories');
});

test('every entity is complete and uniquely coded', () => {
  const seen = new Set();
  for (const f of WORLD.f) {
    assert.match(f.c, /^[A-Z]{2}$/, `${f.c} is a two-letter code`);
    assert.ok(!seen.has(f.c), `${f.c} appears once`);
    seen.add(f.c);
    assert.ok(f.n && f.n.length > 1, `${f.c} has an English name`);
    assert.ok([1, 2, 3].includes(f.s), `${f.c} has a known status`);
    assert.ok(Number.isFinite(f.k) && f.k >= 0, `${f.c} has an area`);
    assert.ok(Number.isFinite(f.p) && f.p >= 0, `${f.c} has a population`);
    assert.ok(Number.isFinite(f.x) && Number.isFinite(f.y), `${f.c} has a centroid`);
    assert.ok(f.d || f.a < 6, `${f.c} has geometry, or is small enough to be a marker`);
  }
});

test('countries people look for are present', () => {
  for (const [code, expect] of [
    ['PS', { s: 1, n: 'Palestine' }],
    ['XN', { s: 3, n: 'Turkish Republic of Northern Cyprus' }],
    ['TR', { s: 1 }],
    ['TV', { s: 1 }], // marker-only: absent from the 1:50m source
    ['XK', { s: 2 }],
  ]) {
    const f = WORLD.f.find((x) => x.c === code);
    assert.ok(f, `${code} exists`);
    if (expect.s) assert.equal(f.s, expect.s, `${code} status`);
    if (expect.n) assert.equal(f.n, expect.n, `${code} name`);
  }
});

test('Northern Cyprus does not double-count the island', () => {
  const cy = WORLD.f.find((f) => f.c === 'CY');
  const xn = WORLD.f.find((f) => f.c === 'XN');
  assert.equal(cy.k + xn.k, 9251, 'the two halves add up to Cyprus as ISO reports it');
});

test('paths are relative integer commands at the declared scale', () => {
  assert.equal(WORLD.ps, 10);
  const tr = WORLD.f.find((f) => f.c === 'TR');
  assert.match(tr.d, /^M-?\d+,-?\d+[lmZ]/, 'starts with an absolute move, then relative commands');
  assert.ok(!/[.]/.test(tr.d), 'no decimals — they are what the 10x scale removes');
  for (const f of WORLD.f) {
    if (!f.d) continue;
    assert.ok(!/NaN|undefined/.test(f.d), `${f.c} path has no holes in it`);
  }
});

test('world totals match the sum of the parts', () => {
  const land = WORLD.f.reduce((s, f) => s + f.k, 0);
  const people = WORLD.f.reduce((s, f) => s + f.p, 0);
  assert.equal(WORLD.totals.k, land);
  assert.equal(WORLD.totals.p, people);
  assert.ok(land > 140e6 && land < 155e6, `land total ${land} is near Earth's 149M km²`);
  assert.ok(people > 7.5e9 && people < 9e9, `population total ${people} is near 8 billion`);
});

test('every continent box sits inside the map', () => {
  for (const [region, box] of Object.entries(WORLD.regions)) {
    const [x0, y0, x1, y1] = box;
    assert.ok(x0 >= 0 && y0 >= 0 && x1 <= WORLD.w && y1 <= WORLD.h, `${region} box is on the canvas`);
    assert.ok(x1 - x0 > 40 && y1 - y0 > 40, `${region} box is not degenerate`);
  }
});

test('the share order covers every entity exactly once', () => {
  assert.equal(WORLD.order.length, WORLD.f.length);
  assert.deepEqual([...WORLD.order].sort(), WORLD.f.map((f) => f.c).sort());
});

test('entities added after v2 stay at the end of the share order', () => {
  // XN was added later: everything before it must still be plain alphabetical,
  // otherwise older links decode to shifted countries
  const alphabetical = WORLD.order.slice(0, -1);
  assert.deepEqual(alphabetical, [...alphabetical].sort());
  assert.equal(WORLD.order[WORLD.order.length - 1], 'XN');
});
