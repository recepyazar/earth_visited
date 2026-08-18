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
- **Progress by region** — Africa, Americas, Asia, Europe, Oceania.
- **Eight languages** — English, Türkçe, Deutsch, Español, Français, Italiano, Português, Русский, for both
  the interface and the country names; search matches any of them, so typing “Germany” finds it while the UI
  is in Turkish.
- **Settings** — one button in the header opens language, theme (dark / light / follow the system) and a
  colour picker for each of the four mark types. Everything is remembered, and the share cards pick up your
  colours.
- **Share sheet** — one *Share* button opens a card preview in three formats: **landscape** 1200×630 (link
  previews, X, Facebook, LinkedIn), **square** 1080×1080 (Instagram/feed) and **story** 1080×1920, which
  also lists the countries by name. The card carries the map, your count, the percentage and a per-continent
  breakdown, in whatever theme and language the page is using.
- **Direct sharing** — *Share image* uses the Web Share API, handing the PNG straight to the device's share
  sheet, which is where Instagram, WhatsApp, X and the rest already live. Browsers without a share sheet fall
  back to saving the card or copying it to the clipboard.
- **Copy link** — your selection is encoded in the URL (`#v2=…`: three bits per country, so levels survive
  the trip), and older `#v1=` links still open, importing everything as *visited*.
  Selections also persist in `localStorage`. A static `og.png` gives the link a proper preview card.

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

## Layout

```
index.html          markup
css/style.css       theme + layout
js/data.js          GENERATED — projected map paths and country metadata
assets/logo.svg     brand mark — globe with a check badge
assets/fonts/       Twemoji Country Flags webfont (flag glyphs for Windows)
assets/favicon.svg  simplified mark for tab-sized rendering
assets/flags/       flags with no emoji, as SVG (Northern Cyprus)
js/i18n.js          interface strings for the eight languages
js/card.js          share-card renderer (SVG, one layout per format)
js/app.js           map rendering, selection, zoom/pan, i18n, share sheet
og.png              static link-preview image (regenerate with tools/gen-og.md steps)
tools/gen.mjs       regenerates js/data.js
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
1000 × 520 viewBox, simplifies them (topojson weight `0.0004`, then a 0.2 px screen-space filter — roughly
719 KB of path data, ~232 KB gzipped), and joins each shape to its ISO alpha-2 code, English/Turkish name,
region, flag and UN-membership flag. It also emits a zoom box per continent, percentile-trimmed so that
outliers (Russia counts as Europe, Hawaii as Oceania) do not stretch a continent across half the map.

A few choices the generator makes:

- Somaliland is drawn as part of Somalia; Kosovo is a separate, selectable entry that does not count as a
  country. Northern Cyprus is its own entry with its own flag (`assets/flags/xn.svg`), counted as a country
  (`s: 3` in the generator) with its 3,355 km² taken off the Republic of Cyprus so the land total stays right.
- Taiwan and other non-UN entities are selectable but counted as territories, not sovereign countries.
- Tuvalu is absent from the 1:50m dataset, so it is added as a marker-only entry.
- Shapes with no ISO code (Siachen Glacier, Indian Ocean territories) are drawn but not selectable.

## Why the flag webfont

Windows ships no country-flag emoji font, so `🇹🇷` falls back to the letters `TR` there while phones and Macs
draw the flag. `assets/fonts/TwemojiCountryFlags.woff2` (78 KB) is declared with
`unicode-range: U+1F1E6-1F1FF`, so browsers download it only for the regional-indicator characters and every
other glyph stays on the system font.

## Data sources

- [world-atlas](https://github.com/topojson/world-atlas) — Natural Earth 1:50m, public domain.
- [world-countries](https://github.com/mledoze/countries) — ISO codes, names, translations and land area, ODbL.
- [World Bank](https://data.worldbank.org/indicator/SP.POP.TOTL) — population (SP.POP.TOTL, 2025 values), CC-BY 4.0.
- [Twemoji Country Flags](https://github.com/talkjs/country-flag-emoji-polyfill) — flag webfont; packaging MIT
  (TalkJS), artwork CC-BY 4.0 (Twitter/Twemoji).
