import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadBrowserGlobals, WORLD } from '../helpers.mjs';

const DIR = fileURLToPath(new URL('../../../js/admin1/', import.meta.url));
const files = readdirSync(DIR).filter((f) => f.endsWith('.js') && f !== 'index.js');
const win = loadBrowserGlobals(['js/admin1/index.js', ...files.map((f) => `js/admin1/${f}`)]);
const INDEX = win.ADMIN1_INDEX;
const ADMIN1 = win.ADMIN1;

test('the index and the files agree', () => {
  assert.deepEqual(Object.keys(INDEX).sort(), Object.keys(ADMIN1).sort());
  for (const [country, count] of Object.entries(INDEX)) {
    assert.equal(ADMIN1[country].u.length, count, `${country} has the unit count the index promises`);
  }
});

test('every detail country is a country the world map knows', () => {
  for (const country of Object.keys(INDEX)) {
    assert.ok(WORLD.f.some((f) => f.c === country), `${country} exists on the world map`);
  }
});

test('Türkiye has its 81 provinces, İstanbul among them', () => {
  const tr = ADMIN1.TR;
  assert.equal(tr.u.length, 81);
  const istanbul = tr.u.find((u) => u.c === 'TR-34');
  assert.ok(istanbul, 'TR-34 is there');
  assert.equal(istanbul.L.tr, 'İstanbul', 'named properly in Turkish');
  assert.equal(istanbul.n, 'Istanbul');
});

test('units are complete, uniquely coded and ordered by code', () => {
  for (const [country, data] of Object.entries(ADMIN1)) {
    const codes = data.u.map((u) => u.c);
    assert.deepEqual(codes, [...codes].sort(), `${country} keeps the order the share link counts on`);
    assert.equal(new Set(codes).size, codes.length, `${country} has no duplicate codes`);
    for (const u of data.u) {
      assert.ok(u.n && u.n.length, `${country} ${u.c} has a name`);
      assert.ok(u.d && u.d.startsWith('M'), `${country} ${u.c} has geometry`);
      assert.ok(!/NaN|undefined/.test(u.d), `${country} ${u.c} geometry is clean`);
      assert.ok(Number.isFinite(u.x) && Number.isFinite(u.y), `${country} ${u.c} has a centroid`);
    }
  }
});

test('provinces sit inside their country on the shared map', () => {
  // both layers are drawn in the same projection, so a province centroid has to
  // land within the country's own box — if this fails the layers have drifted
  for (const [country, data] of Object.entries(ADMIN1)) {
    const [x0, y0, x1, y1] = data.box;
    assert.ok(x1 > x0 && y1 > y0, `${country} has a sane view box`);
    const inside = data.u.filter((u) => u.x >= x0 - 5 && u.x <= x1 + 5 && u.y >= y0 - 5 && u.y <= y1 + 5);
    assert.ok(inside.length / data.u.length > 0.8, `${country}: most units sit in its box`);
  }
  const tr = ADMIN1.TR;
  const istanbul = tr.u.find((u) => u.c === 'TR-34');
  const turkey = WORLD.f.find((f) => f.c === 'TR');
  assert.ok(Math.hypot(istanbul.x - turkey.x, istanbul.y - turkey.y) < 40, 'İstanbul is near Türkiye');
});

test('the detail layer stays worth loading on demand', () => {
  for (const [country, data] of Object.entries(ADMIN1)) {
    const bytes = JSON.stringify(data).length;
    assert.ok(bytes < 400_000, `${country} is ${Math.round(bytes / 1024)} KB, still a reasonable fetch`);
    assert.equal(data.ps, 100, `${country} declares the path scale the app scales by`);
  }
});
