// Refreshes population.json from the World Bank's SP.POP.TOTL indicator.
// Run it when you want newer numbers:  npm run population
// gen.mjs only reads the committed JSON, so the map build itself stays offline.
// Places the World Bank does not track (Taiwan, Kosovo, Vatican, small territories)
// are filled in from POP_EXTRA in gen.mjs.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const URL_ = 'https://api.worldbank.org/v2/country/all/indicator/SP.POP.TOTL?format=json&mrnev=1&per_page=400';
const OUT = fileURLToPath(new URL('./population.json', import.meta.url));

const res = await fetch(URL_);
if (!res.ok) throw new Error(`World Bank returned ${res.status}`);
const [, rows] = await res.json();

const out = {};
for (const row of rows) {
  // rows without a country ISO3 are aggregates (EU, "Africa Eastern and Southern", …)
  if (!row.countryiso3code || !row.value) continue;
  out[row.countryiso3code] = { p: row.value, year: row.date, src: 'World Bank' };
}
const sorted = Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync(OUT, JSON.stringify(sorted, null, 0) + '\n');

const years = [...new Set(Object.values(sorted).map((v) => v.year))].sort();
console.log(`population.json  ${Object.keys(sorted).length} entries, years ${years[0]}–${years[years.length - 1]}`);
