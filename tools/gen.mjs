// Builds ../js/data.js — the projected world map + country metadata.
//
// Sources:
//   world-atlas    Natural Earth 1:50m country polygons (TopoJSON)
//   world-countries ISO codes, English/Turkish names, region, UN membership, flag emoji
//
// Run:  npm install && npm run build
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { geoNaturalEarth1, geoPath, geoCentroid } from 'd3-geo';
import { feature } from 'topojson-client';
import { presimplify, simplify } from 'topojson-simplify';
import wcRaw from 'world-countries/countries.json' with { type: 'json' };
import population from './population.json' with { type: 'json' };

// UI language code -> world-countries translation key. English is the base name,
// so a translation is only stored when it differs from it.
const LANGS = { tr: 'tur', de: 'deu', es: 'spa', fr: 'fra', it: 'ita', pt: 'por', ru: 'rus' };

const WIDTH = 1000; // viewBox width the paths are baked for
const SIMPLIFY = 0.0004; // topojson weight: drops sub-pixel detail before projecting
const TOL = 0.2; // px: consecutive points closer than this are merged
const OUT = fileURLToPath(new URL('../js/data.js', import.meta.url));
const OUT_GLOBE = fileURLToPath(new URL('../js/globe-data.js', import.meta.url));
const GLOBE_SIMPLIFY = 0.005; // the globe is drawn small, so it can be coarser than the map

/* ---------- path serializer: rounds to 0.1px and drops near-duplicate points ---------- */
function makeCtx(tol, dec = 1) {
  const k = 10 ** dec;
  const r = (v) => Math.round(v * k) / k;
  let out = [];
  let first = null;
  let prev = null;
  let pending = null;
  const flush = () => {
    if (pending) {
      out.push(`L${pending[0]},${pending[1]}`);
      prev = pending;
      pending = null;
    }
  };
  return {
    moveTo(x, y) {
      flush();
      first = prev = [r(x), r(y)];
      out.push(`M${first[0]},${first[1]}`);
    },
    lineTo(x, y) {
      const p = [r(x), r(y)];
      if (Math.abs(p[0] - prev[0]) < tol && Math.abs(p[1] - prev[1]) < tol) {
        pending = p; // keep it around in case it is the ring's last point
        return;
      }
      pending = null;
      out.push(`L${p[0]},${p[1]}`);
      prev = p;
    },
    closePath() {
      pending = null;
      out.push('Z');
      prev = first;
    },
    arc() {},
    result() {
      const s = out.join('');
      out = [];
      first = prev = pending = null;
      return s;
    },
  };
}

/* ---------- projection ---------- */
const topoPath = fileURLToPath(new URL('./node_modules/world-atlas/countries-50m.json', import.meta.url));
const topo = simplify(presimplify(JSON.parse(readFileSync(topoPath, 'utf8'))), SIMPLIFY);
const fc = feature(topo, topo.objects.countries);

const proj = geoNaturalEarth1().precision(0.1);
proj.fitWidth(WIDTH, { type: 'Sphere' });
const measure = geoPath(proj);
const [[, y0], [, y1]] = measure.bounds({ type: 'Sphere' });
proj.translate([proj.translate()[0], proj.translate()[1] - y0]); // sphere top -> y=0
const HEIGHT = Math.round((y1 - y0) * 10) / 10;

const ctx = makeCtx(TOL);
const draw = geoPath(proj, ctx);
const toPath = (geo) => {
  draw(geo);
  return ctx.result();
};

/* ---------- metadata ---------- */
const byN3 = new Map(wcRaw.map((c) => [c.ccn3, c]));
const byA2 = new Map(wcRaw.map((c) => [c.cca2, c]));
// UN members + the two observer states = the canonical 195.
const isSovereign = (c) => c.unMember || c.cca2 === 'VA' || c.cca2 === 'PS';

// world-countries reports Cyprus as the whole island; the north is its own entry
// above, so take those square kilometres off the Republic to avoid counting twice.
const AREA_OVERRIDE = { CY: 9251 - 3355 };

// Entities added after the v2 share layout froze. They go at the END of the share
// order so every previously shared link keeps decoding the same way.
const SHARE_APPEND = ['XN'];

// Places the World Bank's indicator does not cover, by alpha-2. Rounded UN /
// national estimates, ~2023; only Taiwan and Kosovo move the world total at all.
// France's overseas departments are absent on purpose: Natural Earth draws them
// as part of France, so their people are already counted under FR.
const POP_EXTRA = {
  TW: 23400000, XK: 1760000, EH: 590000, VA: 825, JE: 103000, GG: 64000, AX: 30500,
  BQ: 27000, AI: 15900, CK: 15000, WF: 11500, PM: 5800, SH: 5300, MS: 4400, FK: 3700,
  BL: 11000, SJ: 2900, NF: 2200, NU: 1900, CX: 1700, TK: 1600, CC: 600, PN: 50,
  AQ: 0, BV: 0, GS: 0, HM: 0, IO: 0, TF: 0, UM: 0,
};

// Natural Earth shapes that carry no ISO code of their own.
const SPECIAL = {
  Somaliland: { merge: 'SO' },
  // Northern Cyprus is drawn separately by Natural Earth and kept separate here.
  // s: 3 — counted as a country by this map even though it is not a UN member, so
  // it carries no "territory" tag. No emoji flag exists for it, hence the SVG file.
  'N. Cyprus': {
    own: {
      c: 'XN',
      n: 'Turkish Republic of Northern Cyprus',
      L: {
        tr: 'Kuzey Kıbrıs Türk Cumhuriyeti',
        de: 'Türkische Republik Nordzypern',
        es: 'República Turca del Norte de Chipre',
        fr: 'République turque de Chypre du Nord',
        it: 'Repubblica Turca di Cipro del Nord',
        pt: 'República Turca de Chipre do Norte',
        ru: 'Турецкая Республика Северного Кипра',
      },
      g: '', fi: 'assets/flags/xn.svg', r: 'Europe', s: 3, k: 3355, p: 382000,
    },
  },
  Kosovo: {
    own: {
      c: 'XK', n: 'Kosovo', L: { tr: 'Kosova', ru: 'Косово' }, g: '🇽🇰', r: 'Europe', s: 2,
      k: 10908, p: POP_EXTRA.XK,
    },
  },
  'Indian Ocean Ter.': { decor: true },
  'Siachen Glacier': { decor: true },
};

// Too small for Natural Earth 50m to include at all.
const EXTRA_POINTS = [{ a2: 'TV', lon: 179.2, lat: -8.52 }];


const popOf = (a2, a3) => POP_EXTRA[a2] ?? population[a3]?.p ?? 0;

const namesOf = (wc) => {
  const out = {};
  for (const [code, key] of Object.entries(LANGS)) {
    const name = wc.translations?.[key]?.common;
    if (name && name !== wc.name.common) out[code] = name;
  }
  return out;
};

const metaOf = (wc) => ({
  c: wc.cca2,
  n: wc.name.common,
  L: namesOf(wc),
  g: wc.flag,
  r: wc.region || '—',
  s: isSovereign(wc) ? 1 : 2,
  k: AREA_OVERRIDE[wc.cca2] ?? Math.round(wc.area || 0), // km²
  p: popOf(wc.cca2, wc.cca3),
});

const out = new Map();
const decor = [];
const unmatched = [];

// The box of a country's *largest* landmass — overseas bits (French Guiana for
// France, Guam for the US) would otherwise smear a continent across the map.
const mainBox = (geo) => {
  const polys = geo.geometry.type === 'Polygon' ? [geo.geometry.coordinates] : geo.geometry.coordinates;
  let best = null;
  for (const coordinates of polys) {
    const part = { type: 'Polygon', coordinates };
    const area = Math.abs(measure.area(part));
    if (!best || area > best.area) best = { area, bounds: measure.bounds(part) };
  }
  return best;
};

const add = (meta, geo) => {
  const d = toPath(geo);
  const area = Math.round(Math.abs(measure.area(geo)) * 10) / 10;
  const [cx, cy] = measure.centroid(geo);
  const main = mainBox(geo);
  const rec = out.get(meta.c);
  if (rec) {
    rec.d += d;
    if (area > rec.a) Object.assign(rec, { a: area, x: round1(cx), y: round1(cy), main });
    return;
  }
  out.set(meta.c, { ...meta, a: area, x: round1(cx), y: round1(cy), d, main });
};
const round1 = (v) => Math.round(v * 10) / 10;

for (const geo of fc.features) {
  const rule = SPECIAL[geo.properties.name];
  if (rule?.decor) {
    decor.push(toPath(geo));
    continue;
  }
  if (rule?.merge) {
    add(metaOf(byA2.get(rule.merge)), geo);
    continue;
  }
  if (rule?.own) {
    add(rule.own, geo);
    continue;
  }
  const wc = byN3.get(String(geo.id).padStart(3, '0'));
  if (!wc) {
    unmatched.push(`${geo.id}:${geo.properties.name}`);
    decor.push(toPath(geo));
    continue;
  }
  add(metaOf(wc), geo);
}

for (const { a2, lon, lat } of EXTRA_POINTS) {
  if (out.has(a2)) continue;
  const [x, y] = proj([lon, lat]);
  out.set(a2, { ...metaOf(byA2.get(a2)), a: 0, x: round1(x), y: round1(y), d: '' });
}

const feats = [...out.values()].sort((a, b) => b.a - a.a);
const sovereign = feats.filter((f) => f.s === 1 || f.s === 3);
const missing = wcRaw.filter((c) => isSovereign(c) && !out.has(c.cca2)).map((c) => c.cca2);

/* ---------- globe geometry ---------- */
// The map paths are baked into the flat projection, so the globe needs the raw
// lon/lat rings. Delta-encoded hundredths of a degree keeps the file small; it is
// only fetched when someone actually switches to the globe.
const globeTopo = simplify(presimplify(JSON.parse(readFileSync(topoPath, 'utf8'))), GLOBE_SIMPLIFY);
const globeFc = feature(globeTopo, globeTopo.objects.countries);

const codeOfGeometry = (geo) => {
  const rule = SPECIAL[geo.properties.name];
  if (rule?.decor) return null;
  if (rule?.merge) return rule.merge;
  if (rule?.own) return rule.own.c;
  return byN3.get(String(geo.id).padStart(3, '0'))?.cca2 || null;
};

const encodeRing = (ring) => {
  let px = 0;
  let py = 0;
  const out = [];
  for (const [lon, lat] of ring) {
    const x = Math.round(lon * 100);
    const y = Math.round(lat * 100);
    out.push(x - px, y - py);
    px = x;
    py = y;
  }
  return out.join(',');
};

// code -> polygons -> rings. The nesting has to survive: on a sphere a hole ring
// read as its own polygon has the opposite winding, which d3 reads as "everything
// except this shape" — one stray hole would paint the whole globe.
const globe = new Map();
let globeRings = 0;
for (const geo of globeFc.features) {
  const code = codeOfGeometry(geo);
  if (!code) continue;
  const polys = geo.geometry.type === 'Polygon' ? [geo.geometry.coordinates] : geo.geometry.coordinates;
  for (const poly of polys) {
    const rings = poly.filter((ring) => ring.length >= 4).map(encodeRing);
    if (!rings.length) continue;
    if (!globe.has(code)) globe.set(code, []);
    globe.get(code).push(rings);
    globeRings += rings.length;
  }
}

// lon/lat centroid per entity: where to put the marker for countries too small to
// draw, and where to spin the globe when one is picked from the list
const globeCentroids = {};
for (const geo of globeFc.features) {
  const code = codeOfGeometry(geo);
  if (!code || globeCentroids[code]) continue;
  const [lon, lat] = geoCentroid(geo);
  if (Number.isFinite(lon) && Number.isFinite(lat)) globeCentroids[code] = [round1(lon), round1(lat)];
}
for (const { a2, lon, lat } of EXTRA_POINTS) globeCentroids[a2] ??= [lon, lat];

const globeJs =
  `// GENERATED FILE — do not edit. Run \`npm run build\` in tools/.\n` +
  `// Country outlines in lon/lat for the globe view: rings of delta-encoded\n` +
  `// hundredths of a degree. Loaded on demand by js/globe.js.\n` +
  `window.GLOBE_DATA = ${JSON.stringify({ polys: Object.fromEntries(globe), at: globeCentroids })};\n`;
writeFileSync(OUT_GLOBE, globeJs);

/* ---------- region view boxes ---------- */
// Box the map zooms to when a continent is picked. Percentile-trimmed, because a
// handful of outliers (Russia counts as Europe, Hawaii as Oceania) would otherwise
// stretch a continent's box across half the world.
const REGIONS = ['Africa', 'Americas', 'Asia', 'Europe', 'Oceania'];
const pct = (values, p) => {
  const a = [...values].sort((x, y) => x - y);
  const i = (a.length - 1) * p;
  const lo = Math.floor(i);
  return a[lo] + (a[Math.ceil(i)] - a[lo]) * (i - lo);
};

const regions = {};
for (const r of REGIONS) {
  const inRegion = feats.filter((f) => f.r === r && f.main);
  const big = inRegion.filter((f) => f.main.area >= 3);
  const src = (big.length >= 6 ? big : inRegion).map((f) => f.main.bounds);
  let x0 = pct(src.map((b) => b[0][0]), 0.05);
  let y0 = pct(src.map((b) => b[0][1]), 0.05);
  let x1 = pct(src.map((b) => b[1][0]), 0.95);
  let y1 = pct(src.map((b) => b[1][1]), 0.95);
  const padX = (x1 - x0) * 0.06 + 8;
  const padY = (y1 - y0) * 0.06 + 8;
  x0 = Math.max(0, x0 - padX);
  y0 = Math.max(0, y0 - padY);
  x1 = Math.min(WIDTH, x1 + padX);
  y1 = Math.min(HEIGHT, y1 + padY);
  regions[r] = [x0, y0, x1, y1].map(round1);
}

/* ---------- emit ---------- */
for (const f of feats) delete f.main;

const codes = feats.map((f) => f.c);
const order = [
  ...codes.filter((c) => !SHARE_APPEND.includes(c)).sort(),
  ...SHARE_APPEND.filter((c) => codes.includes(c)),
];

// Denominators: every entity on the map, so Antarctica's 14M km² counts as land
// and the population total lands on the world figure.
const totals = {
  k: feats.reduce((sum, f) => sum + (f.k || 0), 0),
  p: feats.reduce((sum, f) => sum + (f.p || 0), 0),
};

const js =
  `// GENERATED FILE — do not edit. Run \`npm run build\` in tools/ to regenerate.\n` +
  `// Natural Earth 1:50m via world-atlas, metadata via world-countries.\n` +
  `// ${feats.length} selectable entities, of which ${sovereign.length} sovereign countries.\n` +
  `window.WORLD = ${JSON.stringify({ w: WIDTH, h: HEIGHT, regions, totals, order, decor, f: feats })};\n`;
writeFileSync(OUT, js);
for (const r of REGIONS) console.log(`region ${r.padEnd(9)} [${regions[r].join(', ')}]`);

console.log(`viewBox        0 0 ${WIDTH} ${HEIGHT}`);
console.log(`entities       ${feats.length} (${sovereign.length} counted as countries, ${feats.length - sovereign.length} territories)`);
console.log(`decor shapes   ${decor.length}${unmatched.length ? ` (unmatched: ${unmatched.join(', ')})` : ''}`);
console.log(`missing        ${missing.join(', ') || 'none'}`);
console.log(`marker-sized   ${feats.filter((f) => f.a < 6).length} entities under 6px²`);
console.log(`land total     ${(totals.k / 1e6).toFixed(1)} M km² (Earth's land ≈ 148.9)`);
console.log(`people total   ${(totals.p / 1e9).toFixed(2)} bn`);
console.log(`no population  ${feats.filter((f) => !f.p).map((f) => f.c).join(', ') || 'none'}`);
console.log(`share order    ${order.length} slots (appended: ${SHARE_APPEND.join(', ') || 'none'})`);
console.log(`languages      en + ${Object.keys(LANGS).join(', ')}`);
console.log(`data.js        ${Math.round(js.length / 1024)} KB`);
console.log(`globe-data.js  ${Math.round(globeJs.length / 1024)} KB (${globe.size} entities, ${globeRings} rings)`);
