// Builds ../js/admin1/world.js — every country's provinces and states in one file,
// for the city view: on the world map each country is split into the units it is
// actually made of, and each one can be marked on its own.
//
// The per-country files (gen-admin1.mjs) are the same units drawn finely, for when
// you open one country. This one is the whole world at world-map precision, so the
// two must agree on the ORDER of a country's units — the share link numbers them by
// position. Both sort by ISO code and skip the same nameless polygons.
//
// Source: Natural Earth 1:10m admin-1, cached in .cache/ by gen-admin1.mjs.
// Run:  npm run build:admin1-world
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { geoNaturalEarth1, geoPath } from 'd3-geo';
import { topology } from 'topojson-server';
import { presimplify, simplify, quantile } from 'topojson-simplify';
import { feature } from 'topojson-client';

const SOURCE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_1_states_provinces.geojson';
const CACHE = fileURLToPath(new URL('./.cache/admin1.geojson', import.meta.url));
const WORLD_FILE = fileURLToPath(new URL('../js/data.js', import.meta.url));
const OUT = fileURLToPath(new URL('../js/admin1/world.js', import.meta.url));
const OUT_NAMES = fileURLToPath(new URL('../js/admin1/names/', import.meta.url));

const WIDTH = 1000;
const PATH_SCALE = 10; // 0.1 map units, like the world layer's country outlines
// Every province in the world at full detail is 3 MB. Simplifying through a topology
// keeps the shared borders shared — neighbours still meet exactly — and throws away
// the points that carry the least area. KEEP is the share of them that survives.
const KEEP = Number(process.env.KEEP || 0.15);
const LANGS = ['tr', 'de', 'es', 'fr', 'it', 'pt', 'ru', 'zh', 'ar', 'ja', 'ko'];

/* ---------- the same serializer the other layers use ---------- */
function makeCtx(tol) {
  const t = tol * PATH_SCALE;
  let out = '';
  let first = null;
  let prev = null;
  let pending = null;

  const put = (a, b) => {
    if (out && /[\d.]$/.test(out) && a >= 0) out += ',';
    out += a;
    if (b >= 0) out += ',';
    out += b;
  };
  const flush = () => {
    if (pending) {
      put(pending[0] - prev[0], pending[1] - prev[1]);
      prev = pending;
      pending = null;
    }
  };

  return {
    moveTo(x, y) {
      flush();
      const p = [Math.round(x * PATH_SCALE), Math.round(y * PATH_SCALE)];
      if (!prev) out += `M${p[0]},${p[1]}`;
      else {
        out += 'm';
        put(p[0] - prev[0], p[1] - prev[1]);
      }
      first = prev = p;
      out += 'l';
    },
    lineTo(x, y) {
      const p = [Math.round(x * PATH_SCALE), Math.round(y * PATH_SCALE)];
      if (Math.abs(p[0] - prev[0]) < t && Math.abs(p[1] - prev[1]) < t) {
        pending = p;
        return;
      }
      pending = null;
      put(p[0] - prev[0], p[1] - prev[1]);
      prev = p;
    },
    closePath() {
      pending = null;
      out += 'Z';
      prev = first;
    },
    arc() {},
    result() {
      const s = out.replace(/l(?=[Zm]|$)/g, '');
      out = '';
      first = prev = pending = null;
      return s;
    },
  };
}

/* ---------- source ---------- */
if (!existsSync(CACHE)) {
  console.log('downloading Natural Earth admin-1 (40 MB, once)…');
  const res = await fetch(SOURCE);
  if (!res.ok) throw new Error(`source returned ${res.status}`);
  mkdirSync(fileURLToPath(new URL('./.cache/', import.meta.url)), { recursive: true });
  writeFileSync(CACHE, Buffer.from(await res.arrayBuffer()));
}
const source = JSON.parse(readFileSync(CACHE, 'utf8'));

// only countries the world map itself draws: the layer is clipped to their shapes,
// so a unit of anything else could never appear
const worldWindow = {};
new Function('window', readFileSync(WORLD_FILE, 'utf8'))(worldWindow);
const drawn = new Set(worldWindow.WORLD.f.filter((f) => f.d).map((f) => f.c));

/* ---------- simplify as one topology, so borders stay shared ---------- */
const keepable = source.features.filter((f) => f.geometry && drawn.has(f.properties.iso_a2));
let topo = topology(
  { u: { type: 'FeatureCollection', features: keepable.map((f) => ({ type: 'Feature', properties: f.properties, geometry: f.geometry })) } },
  1e5
);
topo = presimplify(topo);
topo = simplify(topo, quantile(topo, KEEP));
const simplified = feature(topo, topo.objects.u).features;
// feature order survives the round trip, so each simplified shape can be checked
// against the one it came from
simplified.forEach((f, i) => {
  f.properties = keepable[i].properties;
  f.source = keepable[i].geometry;
});

/* ---------- projection: identical to the world map's ---------- */
const proj = geoNaturalEarth1().precision(0.1);
proj.fitWidth(WIDTH, { type: 'Sphere' });
const measure = geoPath(proj);
const [[, y0]] = measure.bounds({ type: 'Sphere' });
proj.translate([proj.translate()[0], proj.translate()[1] - y0]);

const ctx = makeCtx(0);
const draw = geoPath(proj, ctx);
// A province's outlying islets cost as much as its mainland and cannot be seen at
// world scale; the country layer underneath still draws the land, so they are
// dropped here. MIN_POLY is in square map units.
const MIN_POLY = Number(process.env.MIN_POLY || 0.05);
const bigEnough = (geometry) => {
  if (!geometry) return null;
  if (geometry.type === 'Polygon') return geometry;
  const rings = geometry.coordinates.filter((poly) => {
    const area = Math.abs(measure.area({ type: 'Polygon', coordinates: poly }));
    return area >= MIN_POLY;
  });
  if (!rings.length) return geometry.coordinates.length ? { type: 'MultiPolygon', coordinates: [geometry.coordinates[0]] } : null;
  return { type: 'MultiPolygon', coordinates: rings };
};
const round1 = (v) => Math.round(v * 10) / 10;

/* ---------- group by country ---------- */
const byCountry = new Map();
for (const f of simplified) {
  const code = f.properties.iso_a2;
  if (!drawn.has(code)) continue;
  if (!byCountry.has(code)) byCountry.set(code, []);
  byCountry.get(code).push(f);
}

const out = {};
const packs = Object.fromEntries(LANGS.map((l) => [l, {}]));
let units = 0;
let skipped = 0;
let merged = 0;
const repaired = [];

for (const [country, features] of byCountry) {
  const list = [];
  const byCode = new Map();
  for (const f of features) {
    const p = f.properties;
    let geometry = bigEnough(f.geometry);
    if (!geometry) continue;

    // Simplifying the whole world as one topology mangles a few shapes — North
    // Carolina came out spanning the entire map, invisible but swallowing every
    // click over the United States. Anything that grew is redrawn from its source.
    const want = measure.bounds({ type: 'Feature', geometry: f.source });
    const got = measure.bounds({ type: 'Feature', geometry });
    const grew =
      got[0][0] < want[0][0] - 1 || got[0][1] < want[0][1] - 1 ||
      got[1][0] > want[1][0] + 1 || got[1][1] > want[1][1] + 1;
    if (grew) {
      geometry = bigEnough(f.source) || f.source;
      repaired.push(`${p.iso_3166_2 || p.adm1_code} ${p.name_en || p.name || ''}`);
    }

    draw({ type: 'Feature', properties: p, geometry });
    const d = ctx.result();
    if (!d) continue;

    const label = p.name_en || p.name || p.name_local;
    if (!label) {
      skipped++;
      continue; // the per-country files leave these out too, so the order matches
    }

    const code = p.iso_3166_2 || `${country}-${p.adm1_code}`;
    const area = Math.round(Math.abs(measure.area(f)) * 100) / 100;
    const [cx, cy] = measure.centroid(f);

    const existing = byCode.get(code);
    if (existing) {
      existing.d += d;
      if (area > existing.a) Object.assign(existing, { a: area, x: round1(cx), y: round1(cy) });
      merged++;
      continue;
    }
    const unit = { c: code, n: label, a: area, x: round1(cx), y: round1(cy), d, p };
    byCode.set(code, unit);
    list.push(unit);
  }
  if (!list.length) continue;
  // sorted by code, exactly like the per-country files: the share link counts on it
  list.sort((a, b) => a.c.localeCompare(b.c, 'en'));
  // names in other languages ship per language, so a visitor downloads one
  list.forEach((unit, i) => {
    for (const lang of LANGS) {
      const name = unit.p[`name_${lang}`];
      if (name && name !== unit.n) {
        if (!packs[lang][country]) packs[lang][country] = {};
        packs[lang][country][i] = name;
      }
    }
    delete unit.p;
  });
  out[country] = list;
  units += list.length;
}

const js =
  `// GENERATED FILE — do not edit. Run \`npm run build:admin1-world\` in tools/.\n` +
  `// ${units} provinces and states across ${Object.keys(out).length} countries, Natural Earth 1:10m,\n` +
  `// same projection and unit order as js/admin1/<CC>.js, drawn for the world map.\n` +
  `window.ADMIN1_WORLD = ${JSON.stringify({ ps: PATH_SCALE, u: out })};\n`;
writeFileSync(OUT, js);

mkdirSync(OUT_NAMES, { recursive: true });
const packSizes = [];
for (const lang of LANGS) {
  const body =
    `// GENERATED FILE — do not edit. Run \`npm run build:admin1-world\` in tools/.\n` +
    `// province names in ${lang}, keyed by country and position in window.ADMIN1_WORLD.u\n` +
    `window.SUB_NAMES = window.SUB_NAMES || {};\n` +
    `window.SUB_NAMES[${JSON.stringify(lang)}] = ${JSON.stringify(packs[lang])};\n`;
  writeFileSync(`${OUT_NAMES}${lang}.js`, body);
  packSizes.push(`${lang} ${Math.round(body.length / 1024)}KB`);
}

const big = Object.entries(out).sort((a, b) => b[1].length - a[1].length).slice(0, 5);
console.log(`world.js       ${units} units in ${Object.keys(out).length} countries, ${Math.round(js.length / 1024)} KB (keep ${KEEP})`);
console.log(`biggest        ${big.map(([c, l]) => `${c} ${l.length}`).join('  ')}`);
if (skipped) console.log(`skipped        ${skipped} polygons with no name in any language`);
console.log(`name packs     ${packSizes.join('  ')}`);
if (repaired.length) console.log(`repaired       ${repaired.length} shapes the simplifier mangled: ${repaired.slice(0, 8).join(', ')}${repaired.length > 8 ? '…' : ''}`);
if (merged) console.log(`merged         ${merged} polygons into the unit sharing their code`);
