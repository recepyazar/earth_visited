// Builds ../js/cityareas.js — the city view's mosaic.
//
// A city in GeoNames is a point, and no free dataset draws the world's cities as
// areas. So each country is split among its own cities: every spot belongs to the
// city nearest to it (a Voronoi tessellation, computed per country so a Greek city
// never claims a piece of Türkiye). The cells are cut to the country's own outline
// in the browser, with the clip path the province layer already uses.
//
// Run:  npm run build:cityareas     (needs js/cities.js, so build:cities first)
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Delaunay } from 'd3-delaunay';

const CITIES_FILE = fileURLToPath(new URL('../js/cities.js', import.meta.url));
const DATA_FILE = fileURLToPath(new URL('../js/data.js', import.meta.url));
const OUT = fileURLToPath(new URL('../js/cityareas.js', import.meta.url));

const PATH_SCALE = 10; // integers at 10x, the same as the world layer
// How far a city's own sprawl reaches, in map units (1 unit is roughly 40 km at the
// equator). A town holds its 8 km; Istanbul's districts run 30 km out and are all
// still Istanbul to anyone who went there.
const reachOf = (thousands) => Math.min(0.85, 0.2 + 0.25 * Math.log10(Math.max(1, thousands / 100)));

/* ---------- the two generated files this one builds on ---------- */
const load = (file, name) => {
  const window = {};
  new Function('window', readFileSync(file, 'utf8'))(window);
  if (!window[name]) throw new Error(`${file} did not define ${name}`);
  return window[name];
};
const CITIES = load(CITIES_FILE, 'CITIES');
const WORLD = load(DATA_FILE, 'WORLD');

/* ---------- group the cities by country ---------- */
const byCountry = new Map();
CITIES.c.forEach((city, index) => {
  if (!byCountry.has(city.c)) byCountry.set(city.c, []);
  byCountry.get(city.c).push({ index, x: city.x / CITIES.scale, y: city.y / CITIES.scale, p: city.p });
});

/* ---------- a cell, written the way every other path here is ---------- */
function encode(points) {
  let out = '';
  let prev = null;
  for (const [px, py] of points) {
    const p = [Math.round(px * PATH_SCALE), Math.round(py * PATH_SCALE)];
    if (!prev) out += `M${p[0]},${p[1]}l`;
    else {
      const dx = p[0] - prev[0];
      const dy = p[1] - prev[1];
      if (!dx && !dy) continue;
      if (/[\d.]$/.test(out) && dx >= 0) out += ',';
      out += `${dx}${dy >= 0 ? ',' : ''}${dy}`;
    }
    prev = p;
  }
  return out ? `${out.replace(/l$/, '')}Z` : '';
}

/* ---------- one tessellation per country ---------- */
const areas = {};
const missing = [];
let cells = 0;
let single = 0;
let grouped = 0;

for (const [code, list] of byCountry) {
  const feature = WORLD.f.find((f) => f.c === code);
  if (!feature) continue; // a city in a country the map does not draw

  // The cells only have to cover the country: bound them by its box with room to
  // spare, since the clip decides the real edge anyway.
  const xs = list.map((c) => c.x);
  const ys = list.map((c) => c.y);
  const pad = 40;
  const bounds = [
    Math.min(...xs) - pad,
    Math.min(...ys) - pad,
    Math.max(...xs) + pad,
    Math.max(...ys) + pad,
  ];

  // GeoNames lists Bağcılar, Fatih and Esenler as cities of their own, so Istanbul
  // would end up with a sliver while Trabzon gets a province. Neighbours within
  // MERGE_AT of each other are one place: they share a single cell, centred on the
  // biggest of them, and marking any of them fills it. (Coincident points would
  // also break the tessellation outright — a Voronoi drops duplicate sites.)
  const sites = [];
  const taken = new Array(list.length).fill(false);
  const order = list.map((c, i) => i).sort((a, b) => list[b].p - list[a].p);
  for (const i of order) {
    if (taken[i]) continue;
    taken[i] = true;
    const centre = list[i];
    const reach = reachOf(centre.p);
    const group = [centre];
    for (const j of order) {
      if (taken[j]) continue;
      if (Math.hypot(centre.x - list[j].x, centre.y - list[j].y) <= reach) {
        taken[j] = true;
        group.push(list[j]);
      }
    }
    sites.push({ x: centre.x, y: centre.y, at: group.map((c) => c.index) });
    if (group.length > 1) grouped += group.length - 1;
  }

  if (sites.length === 1) {
    // one city, one cell: the whole country belongs to it once clipped
    const whole = encode([
      [bounds[0], bounds[1]], [bounds[2], bounds[1]], [bounds[2], bounds[3]], [bounds[0], bounds[3]],
    ]);
    areas[code] = sites[0].at.map((index) => [index, whole]);
    cells += areas[code].length;
    single++;
    continue;
  }

  const delaunay = Delaunay.from(sites, (c) => c.x, (c) => c.y);
  const voronoi = delaunay.voronoi(bounds);
  const out = [];
  sites.forEach((site, i) => {
    const polygon = voronoi.cellPolygon(i);
    if (!polygon) {
      missing.push(`${code} ${site.at.length}`);
      return;
    }
    const d = encode(polygon.slice(0, -1)); // the ring repeats its first point
    if (d) for (const index of site.at) out.push([index, d]);
  });
  areas[code] = out;
  cells += out.length;
}

const js =
  `// GENERATED FILE — do not edit. Run \`npm run build:cityareas\` in tools/.\n` +
  `// ${cells} city areas in ${Object.keys(areas).length} countries: each spot belongs to the\n` +
  `// city nearest to it, per country, keyed by position in window.CITIES.c.\n` +
  `window.CITY_AREAS = ${JSON.stringify({ ps: PATH_SCALE, a: areas })};\n`;
writeFileSync(OUT, js);

const big = Object.entries(areas).sort((a, b) => b[1].length - a[1].length).slice(0, 5);
console.log(`cityareas.js   ${cells} areas, ${Math.round(js.length / 1024)} KB`);
console.log(`countries      ${Object.keys(areas).length} (${single} of them with a single city)`);
console.log(`merged         ${grouped} cities share a neighbour's area (districts of the same place)`);
console.log(`biggest        ${big.map(([c, l]) => `${c} ${l.length}`).join('  ')}`);
if (missing.length) console.log(`no cell        ${missing.join(', ')}`);
