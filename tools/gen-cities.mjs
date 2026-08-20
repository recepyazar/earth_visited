// Builds ../js/cities.js — the city layer for the world map.
//
// Source: GeoNames cities15000 (34k places over 15,000 people), cached in .cache/
// and never shipped. We keep the ones over MIN_POP and project them with the same
// Natural Earth projection as everything else, so a dot lands on its country.
//
// It also writes ../js/cities/<lang>.js — the names of those cities in each of our
// languages, from GeoNames' alternateNamesV2, one file per language so a visitor
// downloads their own and no one else's.
//
// Run:  npm run build:cities     (add --refresh to re-download the sources)
import { readFileSync, writeFileSync, mkdirSync, existsSync, createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { geoNaturalEarth1 } from 'd3-geo';

const SOURCE = 'https://download.geonames.org/export/dump/cities15000.zip';
// names in our twelve languages: "Roma" has to find Rome for a Turkish visitor
const ALT_SOURCE = 'https://download.geonames.org/export/dump/alternateNamesV2.zip';
const CACHE_DIR = fileURLToPath(new URL('./.cache/', import.meta.url));
const CACHE = `${CACHE_DIR}cities15000.txt`;
const ALT_CACHE = `${CACHE_DIR}alternateNamesV2.txt`;
const LANGS = ['tr', 'de', 'es', 'fr', 'it', 'pt', 'ru', 'zh', 'ar', 'ja', 'ko'];
const OUT = fileURLToPath(new URL('../js/cities.js', import.meta.url));
const OUT_NAMES = fileURLToPath(new URL('../js/cities/', import.meta.url));

const MIN_POP = 100_000; // ~6,200 cities: everything a traveller is likely to tick
const WIDTH = 1000;
const SCALE = 10; // coordinates as integers at 10x, like the country paths

/* ---------- source ---------- */
if (process.argv.includes('--refresh') || !existsSync(CACHE)) {
  console.log('downloading GeoNames cities15000 (3 MB, once)…');
  const res = await fetch(SOURCE);
  if (!res.ok) throw new Error(`source returned ${res.status}`);
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(`${CACHE_DIR}cities.zip`, Buffer.from(await res.arrayBuffer()));
  execFileSync('unzip', ['-o', '-q', `${CACHE_DIR}cities.zip`, '-d', CACHE_DIR]);
}
if (process.argv.includes('--refresh') || !existsSync(ALT_CACHE)) {
  console.log('downloading GeoNames alternate names (200 MB, once)…');
  const res = await fetch(ALT_SOURCE);
  if (!res.ok) throw new Error(`alternate names returned ${res.status}`);
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(`${CACHE_DIR}altnames.zip`, Buffer.from(await res.arrayBuffer()));
  execFileSync('unzip', ['-o', '-q', `${CACHE_DIR}altnames.zip`, 'alternateNamesV2.txt', '-d', CACHE_DIR]);
}

/* ---------- projection: the same one the map is drawn in ---------- */
const proj = geoNaturalEarth1().precision(0.1);
proj.fitWidth(WIDTH, { type: 'Sphere' });
// sphere top to y = 0, exactly as gen.mjs does it
const top = proj([0, 90])[1];
proj.translate([proj.translate()[0], proj.translate()[1] - top]);

/* ---------- read, filter, project ---------- */
const rows = readFileSync(CACHE, 'utf8').trim().split('\n');
const cities = [];
for (const line of rows) {
  const f = line.split('\t');
  const pop = +f[14];
  if (!(pop >= MIN_POP)) continue;
  const [lon, lat] = [+f[5], +f[4]];
  const [x, y] = proj([lon, lat]);
  if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
  cities.push({
    i: +f[0], // geonameid: the stable id share links count on
    n: f[1],
    c: f[8], // ISO alpha-2 of the country
    x: Math.round(x * SCALE),
    y: Math.round(y * SCALE),
    p: Math.round(pop / 1000), // thousands of people, enough for sizing and sorting
  }); // .L (names in other languages) is filled in below
}

// sorted by id so the share link's bit order survives a rebuild
cities.sort((a, b) => a.i - b.i);

/* ---------- the same city in our twelve languages ---------- */
// alternateNamesV2 is 780 MB, so it is streamed, and only the names of cities we
// actually ship, in languages we actually speak, survive the filter.
const wanted = new Map(cities.map((c) => [c.i, c]));
const langs = new Set(LANGS);
const picked = new Map(); // geonameid -> { lang: { n, score } }
const fold = (v) => v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

const lines = createInterface({ input: createReadStream(ALT_CACHE), crlfDelay: Infinity });
for await (const line of lines) {
  // id, geonameid, language, name, preferred, short, colloquial, historic
  const f = line.split('\t');
  if (!langs.has(f[2])) continue;
  const id = +f[1];
  if (!wanted.has(id)) continue;
  if (f[6] === '1' || f[7] === '1') continue; // slang and names no one uses any more
  const score = (f[4] === '1' ? 2 : 0) + (f[5] === '1' ? 1 : 0);
  let per = picked.get(id);
  if (!per) picked.set(id, (per = {}));
  if (!per[f[2]] || score > per[f[2]].score) per[f[2]] = { n: f[3], score };
}

// One file per language rather than one fat file with all of them: a Turkish
// visitor should not download the Japanese names of 4,000 cities. Keys are
// positions in the city array, which is frozen anyway — the share link counts on it.
const at = new Map(cities.map((c, i) => [c.i, i]));
const packs = new Map(LANGS.map((lang) => [lang, {}]));
for (const [id, per] of picked) {
  const city = wanted.get(id);
  for (const lang of LANGS) {
    const alt = per[lang];
    // a name that only differs by its accents is not worth the bytes: the search
    // folds accents away and the list would show the same word twice
    if (alt && fold(alt.n) !== fold(city.n)) packs.get(lang)[at.get(id)] = alt.n;
  }
}

const js =
  `// GENERATED FILE — do not edit. Run \`npm run build:cities\` in tools/.\n` +
  `// ${cities.length} cities over ${MIN_POP.toLocaleString('en-US')} people, GeoNames,\n` +
  `// projected like the map: coordinates are integers at ${SCALE}x, population in thousands.\n` +
  `window.CITIES = ${JSON.stringify({ scale: SCALE, minPop: MIN_POP, c: cities })};\n`;
writeFileSync(OUT, js);

mkdirSync(OUT_NAMES, { recursive: true });
const packSizes = [];
for (const [lang, names] of packs) {
  const body =
    `// GENERATED FILE — do not edit. Run \`npm run build:cities\` in tools/.\n` +
    `// city names in ${lang}, keyed by position in window.CITIES.c\n` +
    `window.CITY_NAMES = window.CITY_NAMES || {};\n` +
    `window.CITY_NAMES[${JSON.stringify(lang)}] = ${JSON.stringify(names)};\n`;
  writeFileSync(`${OUT_NAMES}${lang}.js`, body);
  packSizes.push(`${lang} ${Object.keys(names).length}/${Math.round(body.length / 1024)}KB`);
}

const byCountry = new Map();
for (const c of cities) byCountry.set(c.c, (byCountry.get(c.c) || 0) + 1);
console.log(`cities.js      ${cities.length} cities, ${Math.round(js.length / 1024)} KB`);
console.log(`name packs     ${packSizes.join('  ')}`);
console.log(`countries      ${byCountry.size}`);
console.log(`tiers          ${[5000, 1000, 500, 200, 100].map((t) => `>${t}k: ${cities.filter((c) => c.p >= t).length}`).join('  ')}`);
console.log(`biggest        ${[...cities].sort((a, b) => b.p - a.p).slice(0, 3).map((c) => `${c.n} (${c.p}k)`).join(', ')}`);
