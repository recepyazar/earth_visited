import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CARD, WORLD, I18N } from '../helpers.mjs';

const LEVELS = [
  { id: 1, label: 'Lived', count: 2, color: '#4d94ff' },
  { id: 2, label: 'Visited', count: 3, color: '#34d399' },
  { id: 3, label: 'Transit', count: 1, color: '#f0a92e' },
  { id: 4, label: 'Want to go', count: 1, color: '#f4506b' },
];

const build = (size, marks) =>
  CARD.build({
    size,
    world: WORLD,
    marks,
    levels: LEVELS,
    stats: { sov: 5, terr: 1, total: 196, pct: 3 },
    regions: [{ label: 'Europe', have: 3, total: 46 }, { label: 'Asia', have: 2, total: 47 }],
    names: ['Türkiye', 'Germany', 'France'],
    extras: [
      { label: 'Land area', value: '4%', sub: '6M km²', ratio: 0.04 },
      { label: 'Population', value: '9%', sub: '740M people', ratio: 0.09 },
    ],
    texts: {
      title: 'Countries I have visited',
      countries: I18N.s.en.countries,
      territories: I18N.s.en.territories,
      pct: '3%',
      more: '+{n} more',
      url: 'example.org',
    },
    colors: { bg: '#111a2c', ocean: '#0d1626', land: '#22314d', on: '#34d399', ink: '#e8eefc', accent: '#34d399' },
  });

const marks = new Map([['TR', 1], ['DE', 2], ['FR', 2], ['QA', 3], ['MN', 4], ['GL', 2]]);

test('each format comes out at its declared size', () => {
  for (const [size, w, h] of [['link', 1200, 630], ['square', 1080, 1080], ['story', 1080, 1920]]) {
    const svg = build(size, marks);
    assert.match(svg, new RegExp(`width="${w}" height="${h}"`), `${size} canvas`);
    assert.match(svg, new RegExp(`viewBox="0 0 ${w} ${h}"`), `${size} viewBox`);
  }
});

test('cards carry the numbers and never leak a NaN', () => {
  for (const size of ['link', 'square', 'story']) {
    const svg = build(size, marks);
    assert.ok(!/NaN|undefined|Infinity/.test(svg), `${size} has no broken numbers`);
    assert.ok(svg.includes('>5<'), `${size} shows the country count`);
    assert.ok(svg.includes('3%'), `${size} shows the percentage`);
    assert.ok(svg.includes('Europe'), `${size} lists continents`);
  }
});

test('marked countries are painted with their level colour', () => {
  const svg = build('link', marks);
  for (const { color } of LEVELS) assert.ok(svg.includes(color), `${color} appears`);
});

test('the legend only shows up when more than one level is used', () => {
  const single = build('link', new Map([['TR', 2]]));
  const singleLevels = [{ id: 2, label: 'Visited', count: 1, color: '#34d399' }];
  const svg = CARD.build({
    ...JSON.parse(JSON.stringify({})),
    size: 'link',
    world: WORLD,
    marks: new Map([['TR', 2]]),
    levels: singleLevels,
    stats: { sov: 1, terr: 0, total: 196, pct: 1 },
    regions: [{ label: 'Europe', have: 1, total: 46 }],
    names: [],
    extras: [],
    texts: { title: 't', countries: 'c', territories: 'x', pct: '1%', more: '', url: 'u' },
    colors: { bg: '#111a2c', ocean: '#0d1626', land: '#22314d', on: '#34d399', ink: '#e8eefc', accent: '#34d399' },
  });
  assert.ok(!svg.includes('Visited 1'), 'no legend for a single level');
  assert.ok(single.includes('Visited'), 'sanity: the multi-level card does show it');
});

test('the map is drawn inside the scale group the encoding needs', () => {
  const svg = build('link', marks);
  assert.ok(svg.includes(`<g transform="scale(${1 / WORLD.ps})">`), 'paths are scaled back down');
});

test('escaping keeps a stray angle bracket out of the markup', () => {
  const svg = CARD.build({
    size: 'link',
    world: WORLD,
    marks,
    levels: LEVELS,
    stats: { sov: 1, terr: 0, total: 196, pct: 1 },
    regions: [{ label: '<script>', have: 1, total: 2 }],
    names: [],
    extras: [],
    texts: { title: 'a & b <c>', countries: 'c', territories: 'x', pct: '1%', more: '', url: 'u' },
    colors: { bg: '#111a2c', ocean: '#0d1626', land: '#22314d', on: '#34d399', ink: '#e8eefc', accent: '#34d399' },
  });
  assert.ok(svg.includes('a &amp; b &lt;c&gt;'), 'text is escaped');
  assert.ok(!svg.includes('<script>'), 'no raw markup slips through');
});
