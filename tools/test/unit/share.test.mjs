import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WORLD, SHARE } from '../helpers.mjs';

const ORDER = WORLD.order;
const marksOf = (pairs) => new Map(pairs);

test('a link survives the round trip, levels and all', () => {
  const marks = marksOf([['TR', 1], ['DE', 2], ['QA', 3], ['MN', 4], ['XN', 1], ['ZW', 4]]);
  const back = SHARE.decode(ORDER, SHARE.encode(ORDER, marks));
  assert.deepEqual(new Map(back), marks);
});

test('an empty selection makes an empty-looking link that decodes to nothing', () => {
  const link = SHARE.encode(ORDER, new Map());
  assert.deepEqual(SHARE.decode(ORDER, link), []);
});

test('every entity at every level round-trips', () => {
  for (const level of [1, 2, 3, 4]) {
    const marks = marksOf(ORDER.map((c) => [c, level]));
    const back = SHARE.decode(ORDER, SHARE.encode(ORDER, marks));
    assert.equal(back.length, ORDER.length, `level ${level} keeps every country`);
    assert.ok(back.every(([, lv]) => lv === level), `level ${level} survives`);
  }
});

test('links stay URL-safe', () => {
  const marks = marksOf(ORDER.map((c, i) => [c, (i % 4) + 1]));
  assert.match(SHARE.encode(ORDER, marks), /^[A-Za-z0-9_-]+$/);
});

test('a full map still fits in a short link', () => {
  const marks = marksOf(ORDER.map((c) => [c, 2]));
  assert.ok(SHARE.encode(ORDER, marks).length < 160, 'a link everyone can paste');
});

test('pre-levels links still open, as visited', () => {
  // built the old way: one bit per entity, in the same order
  const picked = ['TR', 'DE', 'ZW'];
  const bytes = new Uint8Array(Math.ceil(ORDER.length / 8));
  ORDER.forEach((c, i) => {
    if (picked.includes(c)) bytes[i >> 3] |= 1 << (i & 7);
  });
  const v1 = Buffer.from(bytes).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  assert.deepEqual(SHARE.decodeV1(ORDER, v1), [['DE', 2], ['TR', 2], ['ZW', 2]].sort());
});

test('adding an entity at the end leaves older links alone', () => {
  const oldOrder = ORDER.filter((c) => c !== 'XN'); // the order before Northern Cyprus
  const marks = marksOf([['CY', 2], ['TR', 1], ['ZW', 3], ['ZM', 4]]);
  const oldLink = SHARE.encode(oldOrder, marks);
  assert.deepEqual(new Map(SHARE.decode(ORDER, oldLink)), marks, 'today’s app reads yesterday’s link');
});

test('garbage in a link is refused, not guessed at', () => {
  assert.deepEqual(SHARE.decode(ORDER, ''), []);
  assert.deepEqual(SHARE.decode(ORDER, 'AAAA'), []);
  assert.equal(SHARE.decode(ORDER, '!!!not base64!!!'), null);
});
