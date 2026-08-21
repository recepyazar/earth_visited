# 🌍 EarthVisited

Mark the countries you have visited on a world map, see how much of the planet you have covered, and
download the result as an image. No backend, no build step — a static page you can drop on GitHub Pages.

Inspired by [turkeyvisited](https://ozanyerli.github.io/turkeyvisited/), but for the whole world.

## Features

- **Interactive world map** — click a country to toggle it, hover for its name, scroll/pinch to zoom, drag to pan.
- **Built for touch too** — every tap shows a strip with the flag, the country's name and whether it was added
  or removed, since phones have no hover; **press and hold** reads a country's name without selecting it; and
  micro-state markers are sized in screen pixels, so their tap targets stay finger-sized on a small screen.
- **196 countries** counted — the 195 UN members and observer states, plus the Turkish Republic of Northern
  Cyprus, which this map counts as a country rather than a dependency — with **42 dependent territories**
  (Greenland, Puerto Rico, Hong Kong, Antarctica…) selectable and counted separately.
- **Micro-states are clickable** — Singapore, Malta, Monaco, Tuvalu and friends get a dot marker so they are
  reachable even at 1× zoom, plus a searchable list for anything easier to find by name.
- **Four ways to mark a country** — *lived*, *visited*, *transit* and *want to go*. A brush selector in the
  panel picks the level a click paints with; clicking a country with the level it already has clears it.
  Lived + visited + transit feed the score, land and population; the wish list is counted on its own and
  drawn in amber.
- **Selected countries float to the top** of the list, under a `Selected · N` header, so your own map is
  always the first thing you see.
- **Continents are filters** — click Africa / Americas / Asia / Europe / Oceania to zoom the map to that
  continent, dim (and lock) everything outside it, and narrow the list to its countries; the *Whole world*
  chip or a second click on the active continent clears it. Search stacks on top of the filter.
- **Land and population coverage** — country count treats Malta and Russia alike, so the panel and the share
  card also show what share of the Earth's land (150.0M km², Antarctica included) and of its people
  (8.22 bn) your selection covers. Visiting 48 countries can mean 25% of the countries but 47% of the land
  and 65% of humanity.
- **Provinces and states** — twelve countries open into their own regions: Türkiye's 81 provinces, the 50
  US states, Japan's prefectures and so on. Open one from the chevron in the list or the shortcut on the tap
  strip; the map zooms in, the list becomes the provinces, and the same four levels apply. The counter reads
  `12/81`, `‹ World` takes you back, and each country's geometry is fetched only when you open it (Türkiye is
  50 KB). The detail layer is 1:10m, so an open country zooms far deeper than the world map's 24x, the reset
  button re-fits the country rather than jumping back out, and the country's own fill steps aside while you
  are inside it.
- **Countries or provinces, on either view** — two switches sit on the map: one picks the flat map or the
  globe, the other picks what they are made of. Switch to provinces and every country splits into the units
  it is actually made of — Türkiye's 81 provinces, the 50 US states, Bavaria, Tuscany, Hokkaidō, 4,471 of
  them worldwide — on the flat map *and* on the globe. Each one is marked on its own, a country with nothing
  marked stays uncoloured, and the search box finds any of them in your language ("Bavyera", "Kaliforniya").
  They are the same units, in the same order, as a country's own detail view, so a province marked here is
  marked there too and rides in the same link. The layer is fetched only when you ask for it.
- **Cities** — type a city into the same search box and it appears under the countries, `İzmir, Türkiye`.
  Marking one paints a dot on the world map instead of colouring the whole country, so a single trip to Rome
  does not claim all of Italy. Cities answer to their name in your language — “Roma”, “Viyana”, “Москва” —
  as well as the one GeoNames ships. Only the cities you have marked are drawn, the score line gains
  “· 3 cities”, and the 6,241-city index (114 KB over the wire, plus 4–26 KB for your language) is fetched
  the first time you search for one.
- **Progress by region** — Africa, Americas, Asia, Europe, Oceania.
- **Twelve languages** — English, Türkçe, Deutsch, Español, Français, Italiano, Português, Русский, 中文,
  العربية, 日本語, 한국어, for both the interface and the country names; search matches any of them, so typing
  “Germany” finds it while the UI is in Turkish. Arabic flips the whole page right-to-left. The site opens in
  the visitor's language when it is one of these — walking the browser's ordered list, not just its first
  entry — and in English otherwise.
- **Settings** — one button in the header opens language, theme (dark / light / follow the system) and a
  colour picker for each of the four mark types. Everything is remembered, and the share cards pick up your
  colours.
- **Globe view** — a switch on the map turns the flat map into a rotatable sphere: drag to spin, scroll or
  pinch to zoom, click a country to mark it, with the same colours, dots and continent filter. It is drawn on
  a canvas with `d3-geo`, and its geometry (`js/globe-data.js`, ~310 KB with the library) is fetched only when
  someone actually switches to it, so the flat map stays as light as it was.
- **Share sheet** — one *Share* button opens a card preview in three formats: **landscape** 1200×630 (link
  previews, X, Facebook, LinkedIn), **square** 1080×1080 (Instagram/feed) and **story** 1080×1920, which
  also lists the countries by name. The card carries the map, your count, the percentage and a per-continent
  breakdown, in whatever theme and language the page is using.
- **Direct sharing** — *Share image* uses the Web Share API, handing the PNG straight to the device's share
  sheet, which is where Instagram, WhatsApp, X and the rest already live. Browsers without a share sheet fall
  back to saving the card or copying it to the clipboard.
- **Copy link** — your selection is encoded in the URL (`#v2=…`: three bits per country, so levels survive
  the trip), with provinces in a `&p=` section that only carries the countries you actually opened — all 81
  Turkish provinces cost about 40 characters — and cities in a `&c=` section written as gaps rather than a
  bitset, so a hundred cities add roughly 150 characters instead of 2 KB. Older `#v1=` links still open, importing everything as *visited*.
  Selections also persist in `localStorage`. A static `og.png` gives the link a proper preview card.

## Installable and offline

`manifest.json` plus `sw.js` make the page installable: add it to a phone's home screen and it opens
standalone and works with no connection. The service worker precaches the shell and the flat map
(≈460 KB, ~150 KB over the wire) on the first visit and serves it cache-first afterwards; HTML is
network-first so a deploy shows up right away. The globe bundle is deliberately left out of the precache and
only cached once someone loads it.

Assets carry a `?v=N` stamp and the cache is named after the same number — bump both in `index.html`,
`js/app.js` (`ASSET_V`) and `sw.js` (`CACHE`) when deploying, so a cached stylesheet or dataset can never
pair with a newer script.

## Running it

Any static server works, e.g.:

```bash
python3 -m http.server 8000     # then open http://localhost:8000
```

For GitHub Pages: push the repo and set **Settings → Pages → Deploy from a branch**, root folder `/`.

### URL parameters

| URL | Effect |
| --- | --- |
| `#v1=<code>` | Loads a shared selection |
| `?lang=tr`, `?lang=de`, … | Opens in that language (en, tr, de, es, fr, it, pt, ru) |
| `?theme=light` / `?theme=dark` / `?theme=auto` | Opens in that theme |
| `?view=globe` / `?view=map` | Opens on the globe or the flat map |

## Layout

```
index.html          markup
css/style.css       theme + layout
js/data.js          GENERATED — projected map paths and country metadata
assets/logo.svg     brand mark — globe with a check badge
assets/fonts/       Twemoji Country Flags webfont (flag glyphs for Windows)
assets/favicon.svg  simplified mark for tab-sized rendering
assets/flags/       flags with no emoji, as SVG (Northern Cyprus)
js/globe.js         globe renderer (canvas + d3-geo), loaded on demand
js/globe-data.js    GENERATED — country outlines in lon/lat for the globe
js/vendor/          d3-geo build plus the three d3-array helpers it needs
js/i18n.js          interface strings for the eight languages
js/share.js         share-link codec, shared by the app and the tests
tools/test/unit/    node --test suite (no browser)
tools/test/browser/ puppeteer suite (real Chrome)
js/card.js          share-card renderer (SVG, one layout per format)
js/app.js           map rendering, selection, zoom/pan, i18n, share sheet
og.png              static link-preview image
manifest.json       PWA manifest
sw.js               service worker: precaches the shell, caches the globe on demand
assets/icons/       app icons (192, 512, maskable, apple-touch)
js/admin1/          GENERATED — one file per country with a province layer, plus a tiny index
js/cities.js        GENERATED — city index, loaded the first time you search a city
js/admin1/world.js  GENERATED — every country's provinces, loaded when the city view opens
js/admin1/names/<lang>.js GENERATED — those provinces' names in that language
js/cities/<lang>.js GENERATED — city names in that language, only the one in use is fetched
tools/gen.mjs       regenerates js/data.js
tools/gen-admin1.mjs regenerates js/admin1/ from Natural Earth 1:10m admin-1
tools/gen-cities.mjs regenerates js/cities.js from GeoNames cities15000
tools/gen-admin1-world.mjs regenerates js/admin1/world.js — the whole world, by province
tools/fetch-population.mjs   refreshes tools/population.json from the World Bank
```

## Regenerating the map data

`js/data.js` is generated — do not edit it by hand:

```bash
cd tools
npm install
npm run build        # rebuilds js/data.js
npm run population   # optional: refresh tools/population.json first
```

Population numbers are committed as `tools/population.json` so the map build never needs the network. Places
the World Bank does not track — Taiwan, Kosovo, Vatican City, small territories — come from a short
`POP_EXTRA` table in `gen.mjs`.

It projects Natural Earth 1:50m country polygons with `d3-geo`'s Natural Earth projection into a
1000 × 520 viewBox, simplifies them (topojson weight `0.0004`, then a 0.2 px screen-space filter) and writes them as relative
integer path commands at 10× scale — same 0.1 px precision in roughly half the bytes (354 KB, ~114 KB
gzipped), drawn inside a `scale(0.1)` group so every other coordinate stays in 1000 × 520 space, and joins each shape to its ISO alpha-2 code, English/Turkish name,
region, flag and UN-membership flag. It also emits a zoom box per continent, percentile-trimmed so that
outliers (Russia counts as Europe, Hawaii as Oceania) do not stretch a continent across half the map.

A few choices the generator makes:

- Somaliland is drawn as part of Somalia; Kosovo is a separate, selectable entry that does not count as a
  country. Northern Cyprus is its own entry with its own flag (`assets/flags/xn.svg`), counted as a country
  (`s: 3` in the generator) with its 3,355 km² taken off the Republic of Cyprus so the land total stays right.
- Taiwan and other non-UN entities are selectable but counted as territories, not sovereign countries.
- Tuvalu is absent from the 1:50m dataset, so it is added as a marker-only entry.
- Shapes with no ISO code (Siachen Glacier, Indian Ocean territories) are drawn but not selectable.

## The province layer

```bash
cd tools
npm run build:admin1            # add --refresh to re-download the 40 MB source
```

`gen-admin1.mjs` projects Natural Earth's 1:10m admin-1 units with the **same** Natural Earth projection as
the world map, so a province drops straight onto the country it belongs to — no reprojection at runtime. The
tolerance is set per country from its percentile-trimmed width (Alaska and Hawaii would otherwise claim the
United States is 900 units wide and flatten every state between them), and each file carries a view box for
zooming in. Units are ordered by ISO 3166-2 code, which is what the share link counts positions against, and
polygons sharing a code merge into one unit — Lord Howe Island is administratively New South Wales.

Countries with a layer today: TR, US, DE, FR, IT, ES, GB, JP, CA, AU, BR, RU — 1 MB in total, but never more
than one country at a time over the wire. Adding another is one entry in `COUNTRIES` and a rebuild.

The two layers come from different generalisations — 1:10m provinces against a 1:50m world map — so their
coastlines disagree by a pixel or two, which showed as a pale halo around an open country. The province group
is therefore clipped to the country's own world-map shape, and the country keeps its fill underneath: nothing
spills past the outline the rest of the map draws, and anywhere the finer layer falls short the country shows
through. (Two SVG rules worth remembering: a `clipPath` nested inside the element it clips reads as circular
and hides everything, and a `<g>` inside a `clipPath` is ignored — the transform has to sit on the shape.)

## The city layer

```bash
cd tools
npm run build:cities            # add --refresh to re-download the 3 MB source
```

GeoNames' cities15000 holds 34,000 places; we keep the 6,241 over 100,000 people, project them with the map's
own projection and store each as an id, a name, a country, integer coordinates and a population in thousands
(393 KB, 114 KB gzipped). Ids are GeoNames ids, ordered, because the share link counts positions against them.

Names come from `alternateNamesV2` — 200 MB downloaded once into `.cache/`, streamed rather than read, and
filtered down to our twelve languages. They ship as one small file per language in `js/cities/`, keyed by
position in the city array, holding only the names that actually differ from the original: Turkish is 398
names and 4 KB gzipped, Russian 3,941 and 26 KB. All twelve in one file would have cost 150 KB extra, so the
app fetches only the language in use — and still searches the original name, so “Rome” and “Roma” both find
the same city.

## The city view

```bash
cd tools
npm run build:admin1-world      # 4,471 provinces worldwide, plus a name file per language
```

The same Natural Earth admin-1 source as the per-country files, but the whole world in one lazily-fetched
file. Full detail would be 3 MB, so it is simplified through a *topology*: shared borders stay shared, which
both keeps neighbours meeting exactly and throws away the least significant points first (325 KB gzipped at
`KEEP=0.1`, plus 6–20 KB for your language's names). Outlying islets that cannot be seen at world scale are
dropped — the country layer underneath still draws that land.

Clipping has one cost: 77 island provinces — Prince Edward Island, Guadeloupe, the Scottish isles — fall
outside the coarse country outline and so were clipped away from the pointer as well as the eye. The province
under a press is therefore found geometrically rather than by hit-testing: the press is converted through the
layer's own matrix (which carries the zoom, the pan and the layer's scale in one) and tested against the
unclipped shapes. Where more than one contains it — simplified neighbours overlap a little — the country
underneath settles it, and where even that is ambiguous the smaller shape wins, which is how Gaza stays
reachable under Israel's southern district.

Simplifying the world as one topology also mangled two shapes — North Carolina and one Hong Kong district
came out as polygons spanning the entire map. Invisible, since the fill is transparent until you mark
something, but they took every click over their country: pressing California marked North Carolina and filled
the United States. Anything whose box grew past the shape it came from is now redrawn from that source, and a
unit test asserts no province is wider or taller than its own country.

The two layers must agree on the ORDER of a country's units, because the share link numbers them by position:
both sort by ISO code, skip the same nameless polygons and merge the same duplicates, and a unit test asserts
they match for all twelve detailed countries. That is what lets a province marked on the world map show up
marked inside the country, and a link written in one view open in the other.

Each country's provinces are drawn in their own group, clipped to that country's own outline — the layers
come from different resolutions and would otherwise disagree along the coast. The strokes are drawn in screen
pixels (`vector-effect: non-scaling-stroke`), which measured about twice as fast on a phone as a stroke that
scales with the transform.

The globe needs the same provinces in lon/lat, and gets them from the very same file: the map's projection is
invertible, so nothing extra is downloaded. Running a million points through d3's Natural Earth solver takes
seconds, so instead one table of 1,800 latitudes is built once — the projection is separable, y depends only
on latitude and x is longitude times a factor that depends only on latitude — and every inversion becomes a
lookup and a division. On the globe the provinces you have marked are filled on every frame; the four and a
half thousand borders are drawn only once the globe has been still for 180 ms, so a drag costs exactly what
it costs with countries (measured 43 ms a frame against 48).

One more thing worth knowing: Chrome does not repaint a clipped group when only a fill inside it changes, so
a freshly marked province kept its old colour until the next pan. Marking now moves the province's path to the
end of its group, which invalidates it — and draws the one you marked over its neighbours' borders. A browser
test compares the actual pixels before and after a click, because the DOM was right the whole time.

Two small things while you are inside a country: a press anywhere outside it takes you back to the world, and
the "81 provinces ›" shortcut on the tap strip is a real button (the strip itself passes presses through to
the map, which is why that shortcut could not be tapped at all before).

Cities are also part of the ordinary map: they are the same list and the same brush as everything else. Searching for one loads
the index, marking one draws a dot into `#citymarks` — only marked cities are ever in the DOM, which is why
the layer costs nothing at world zoom — and the dot is sized in screen pixels so it stays a dot as you zoom.
A city never marks its country: they are counted separately, and the country under a marked city stays
unpainted unless you tick it yourself.

## Why the flag webfont

Windows ships no country-flag emoji font, so `🇹🇷` falls back to the letters `TR` there while phones and Macs
draw the flag. `assets/fonts/TwemojiCountryFlags.woff2` (78 KB) is declared with
`unicode-range: U+1F1E6-1F1FF`, so browsers download it only for the regional-indicator characters and every
other glyph stays on the system font.

## Tests

```bash
cd tools
npm test           # 36 checks, ~130 ms, no browser
npm run test:browser   # 13 checks in a real Chrome (puppeteer brings its own)
npm run test:all
```

The unit suite loads the browser modules into the process by evaluating them against a fake `window`:

- **data** — the count the UI promises (196 countries, 42 territories), unique codes, complete records,
  Cyprus and Northern Cyprus adding up to one island, paths being relative integers at the declared scale,
  totals matching the sum of the parts, continent boxes inside the canvas, and the share order staying
  alphabetical with later additions appended.
- **share** — round trips at every level, URL safety, length, old `v1` links, and the promise that adding an
  entity leaves older links decoding to the same countries.
- **i18n** — every language carrying every string and no extras, placeholders like `{n}` surviving
  translation, continent names, and locales `Intl` accepts.
- **card** — each format at its declared size, no `NaN` in the output, level colours present, the legend only
  appearing with more than one level, and text escaping.
- **globe** — an outline for every drawable country, centroids on Earth, and polygons keeping their holes
  nested (a hole read as its own polygon would paint the entire globe).

The browser suite drives a real Chrome (downloaded by puppeteer, no system install) against a throwaway
static server, each test in its own browser context so one test's `localStorage` cannot decide what the next
one sees. It covers what a unit test cannot: clicking a country on the map and on the globe, the level brush,
a shared link surviving a round trip through the address bar, the continent filter locking the rest of the
map, multilingual search, the share sheet rendering all three cards, settings changing language, theme and
colours, right-to-left layout, reload persistence, the two-step reset, and the service worker installing and
serving the app **offline**.

It has already earned its keep: it caught a real bug where a micro-state's finger-sized tap target covered
its neighbours, so clicking Germany at world zoom selected Luxembourg.

## Data sources

- [world-atlas](https://github.com/topojson/world-atlas) — Natural Earth 1:50m, public domain.
- [world-countries](https://github.com/mledoze/countries) — ISO codes, names, translations and land area, ODbL.
- [World Bank](https://data.worldbank.org/indicator/SP.POP.TOTL) — population (SP.POP.TOTL, 2025 values), CC-BY 4.0.
- [GeoNames](https://www.geonames.org/) — the city layer (cities15000), CC-BY 4.0.
- [Twemoji Country Flags](https://github.com/talkjs/country-flag-emoji-polyfill) — flag webfont; packaging MIT
  (TalkJS), artwork CC-BY 4.0 (Twitter/Twemoji).
- [d3-geo](https://github.com/d3/d3-geo) — orthographic projection, spherical clipping and hit testing for the
  globe view, ISC.
