import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GLOBE, WORLD, isCountry } from '../helpers.mjs';

const decodeRing = (str) => {
  const nums = str.split(',');
  const ring = [];
  let x = 0;
  let y = 0;
  for (let i = 0; i < nums.length; i += 2) {
    x += +nums[i];
    y += +nums[i + 1];
    ring.push([x / 100, y / 100]);
  }
  return ring;
};

test('the globe covers the same countries as the map', () => {
  const drawable = WORLD.f.filter((f) => f.d).map((f) => f.c);
  const missing = drawable.filter((c) => !GLOBE.polys[c]);
  assert.deepEqual(missing, [], `missing outlines: ${missing.join(', ')}`);
});

test('every country has a place to put its marker', () => {
  const missing = WORLD.f.filter((f) => !GLOBE.at[f.c]).map((f) => f.c);
  assert.deepEqual(missing, [], `missing centroids: ${missing.join(', ')}`);
  for (const [code, [lon, lat]] of Object.entries(GLOBE.at)) {
    assert.ok(lon >= -180 && lon <= 180, `${code} longitude is on Earth`);
    assert.ok(lat >= -90 && lat <= 90, `${code} latitude is on Earth`);
  }
});

test('polygons keep their holes nested', () => {
  // a hole read as its own polygon winds the other way, which on a sphere means
  // "everything except this shape" — one of those would paint the whole globe
  for (const [code, polys] of Object.entries(GLOBE.polys)) {
    assert.ok(Array.isArray(polys) && polys.length, `${code} has polygons`);
    for (const rings of polys) {
      assert.ok(Array.isArray(rings) && rings.length, `${code} polygon has rings`);
      assert.equal(typeof rings[0], 'string', `${code} rings are encoded strings`);
    }
  }
  const za = GLOBE.polys.ZA; // South Africa wraps Lesotho
  assert.ok(za.some((rings) => rings.length > 1), 'South Africa still has its hole');
});

test('rings decode to closed shapes in range', () => {
  for (const [code, polys] of Object.entries(GLOBE.polys)) {
    for (const rings of polys) {
      for (const encoded of rings) {
        const ring = decodeRing(encoded);
        assert.ok(ring.length >= 4, `${code} ring has enough points`);
        const [x0, y0] = ring[0];
        const [xn, yn] = ring[ring.length - 1];
        assert.ok(Math.abs(x0 - xn) < 0.02 && Math.abs(y0 - yn) < 0.02, `${code} ring closes`);
        for (const [lon, lat] of ring) {
          assert.ok(lon >= -180.5 && lon <= 180.5 && lat >= -90.5 && lat <= 90.5, `${code} stays on Earth`);
        }
      }
    }
  }
});

test('a country lands where it should on the globe', () => {
  const near = (code, lon, lat) => {
    const at = GLOBE.at[code];
    assert.ok(Math.abs(at[0] - lon) < 6 && Math.abs(at[1] - lat) < 6, `${code} centroid ${at} ≈ ${[lon, lat]}`);
  };
  near('TR', 35, 39);
  near('BR', -53, -11);
  near('AU', 134, -26);
  near('XN', 33.6, 35.3);
});

test('the globe file stays worth lazy-loading, not bundling', () => {
  const codes = Object.keys(GLOBE.polys).length;
  assert.ok(codes > 200, 'it really does hold the world');
  assert.equal(WORLD.f.filter(isCountry).length, 196, 'and the map it mirrors still counts 196');
});
