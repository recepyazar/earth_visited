// Builds ../js/admin1/<CC>.js — provinces and states for the countries listed in
// COUNTRIES, projected with the very same Natural Earth projection as the world
// map, so a province drops straight onto the country it belongs to.
//
// Source: Natural Earth 1:10m admin-1 (40 MB), cached in .cache/ and never shipped.
// Run:  npm run build:admin1   (add --refresh to re-download the source)
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { geoNaturalEarth1, geoPath } from 'd3-geo';

const SOURCE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_1_states_provinces.geojson';
const CACHE = fileURLToPath(new URL('./.cache/admin1.geojson', import.meta.url));
const OUT_DIR = fileURLToPath(new URL('../js/admin1/', import.meta.url));

// Countries that get a detail layer. Adding one is a line here plus a rebuild.
const COUNTRIES = ['TR', 'US', 'DE', 'FR', 'IT', 'ES', 'GB', 'JP', 'CA', 'AU', 'BR', 'RU'];

const WIDTH = 1000; // same viewBox as the world map
const PATH_SCALE = 100; // finer than the world layer: these are looked at zoomed in
// Detail is only ever seen with the country zoomed to fit, so the useful precision
// scales with how wide the country is: half a pixel at that zoom. Russia gets a
// coarse tolerance and Luxembourg a fine one, and neither wastes bytes.
const VIEW_PX = 700;
const tolFor = (widthInUnits) => Math.max(0.02, widthInUnits / VIEW_PX / 2);
const LANGS = ['tr', 'de', 'es', 'fr', 'it', 'pt', 'ru', 'zh', 'ar', 'ja', 'ko'];

/* ---------- same serializer as gen.mjs, at this layer's scale ---------- */
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
if (process.argv.includes('--refresh') || !existsSync(CACHE)) {
  console.log('downloading Natural Earth admin-1 (40 MB, once)…');
  const res = await fetch(SOURCE);
  if (!res.ok) throw new Error(`source returned ${res.status}`);
  mkdirSync(fileURLToPath(new URL('./.cache/', import.meta.url)), { recursive: true });
  writeFileSync(CACHE, Buffer.from(await res.arrayBuffer()));
}
const source = JSON.parse(readFileSync(CACHE, 'utf8'));

/* ---------- projection: identical to the world map's ---------- */
const proj = geoNaturalEarth1().precision(0.1);
proj.fitWidth(WIDTH, { type: 'Sphere' });
const measure = geoPath(proj);
const [[, y0]] = measure.bounds({ type: 'Sphere' });
proj.translate([proj.translate()[0], proj.translate()[1] - y0]);

const round1 = (v) => Math.round(v * 10) / 10;

/* ---------- emit one file per country ---------- */
mkdirSync(OUT_DIR, { recursive: true });
const built = [];
const skipped = [];
const merged = [];

for (const country of COUNTRIES) {
  const features = source.features.filter((f) => f.properties.iso_a2 === country);
  if (!features.length) {
    console.warn(`${country}: nothing in the source, skipped`);
    continue;
  }

  // Alaska and Hawaii would otherwise say the United States is 900 units wide and
  // flatten every state in between, so the extent is percentile-trimmed the same
  // way the continent boxes are.
  const boxes = features.map((f) => measure.bounds(f));
  const pct = (values, p) => {
    const a = [...values].sort((x, y) => x - y);
    const i = (a.length - 1) * p;
    const lo = Math.floor(i);
    return a[lo] + (a[Math.ceil(i)] - a[lo]) * (i - lo);
  };
  const view = [
    pct(boxes.map((b) => b[0][0]), 0.04),
    pct(boxes.map((b) => b[0][1]), 0.04),
    pct(boxes.map((b) => b[1][0]), 0.96),
    pct(boxes.map((b) => b[1][1]), 0.96),
  ].map(round1);
  const tol = tolFor(view[2] - view[0]);
  const ctx = makeCtx(tol);
  const draw = geoPath(proj, ctx);

  // Some polygons share a code with the unit they belong to — Lord Howe Island is
  // administratively New South Wales — so they merge rather than appear twice.
  const units = [];
  const byCode = new Map();
  for (const f of features) {
    const p = f.properties;
    draw(f);
    const d = ctx.result();
    if (!d) continue;

    // one Russian polygon in the source has no name in any language — nothing we
    // could label or list, so it is left out
    const label = p.name_en || p.name || p.name_local;
    if (!label) {
      skipped.push(`${country} ${p.iso_3166_2 || p.adm1_code}`);
      continue;
    }

    const names = {};
    for (const lang of LANGS) {
      const name = p[`name_${lang}`];
      if (name && name !== label) names[lang] = name;
    }
    const [cx, cy] = measure.centroid(f);
    const code = p.iso_3166_2 || `${country}-${p.adm1_code}`;
    const area = Math.round(Math.abs(measure.area(f)) * 100) / 100;

    const existing = byCode.get(code);
    if (existing) {
      existing.d += d;
      if (area > existing.a) Object.assign(existing, { a: area, x: round1(cx), y: round1(cy) });
      merged.push(`${code} ← ${label}`);
      continue;
    }

    const unit = { c: code, n: label, L: names, a: area, x: round1(cx), y: round1(cy), d };
    byCode.set(code, unit);
    units.push(unit);
  }

  // sorted by code, not by name: the share link numbers units by position, and a
  // name-based order would shuffle when a translation changes
  units.sort((a, b) => a.c.localeCompare(b.c, 'en'));
  const js =
    `// GENERATED FILE — do not edit. Run \`npm run build:admin1\` in tools/.\n` +
    `// ${units.length} units of ${country}, Natural Earth 1:10m, same projection as the world map.\n` +
    `window.ADMIN1 = window.ADMIN1 || {};\n` +
    `window.ADMIN1[${JSON.stringify(country)}] = ${JSON.stringify({ ps: PATH_SCALE, box: view, u: units })};\n`;
  writeFileSync(`${OUT_DIR}${country}.js`, js);
  built.push({ country, units: units.length, kb: Math.round(js.length / 1024), tol: Math.round(tol * 1000) / 1000 });
}

// a tiny index so the app knows which countries can be opened without asking
const index =
  `// GENERATED FILE — do not edit. Run \`npm run build:admin1\` in tools/.\n` +
  `window.ADMIN1_INDEX = ${JSON.stringify(
    Object.fromEntries(built.map((b) => [b.country, b.units]))
  )};\n`;
writeFileSync(`${OUT_DIR}index.js`, index);

for (const b of built) console.log(`${b.country}  ${String(b.units).padStart(4)} units  ${String(b.kb).padStart(4)} KB  tol ${b.tol}`);
console.log(`total ${built.reduce((s, b) => s + b.kb, 0)} KB across ${built.length} countries`);
console.log(`countries with detail: ${built.map((b) => b.country).join(', ')}`);
if (skipped.length) console.log(`skipped (no name in any language): ${skipped.join(', ')}`);
if (merged.length) console.log(`merged into the unit sharing their code: ${merged.join(', ')}`);
