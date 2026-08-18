# 🌍 EarthVisited

Mark the countries you have visited on a world map, see how much of the planet you have covered, and
download the result as an image. No backend, no build step — a static page you can drop on GitHub Pages.

Inspired by [turkeyvisited](https://ozanyerli.github.io/turkeyvisited/), but for the whole world.

## Features

- **Interactive world map** — click a country to toggle it, hover for its name, scroll/pinch to zoom, drag to pan.
- **195 sovereign countries** counted (193 UN members + Vatican City and Palestine), with **42 dependent
  territories** (Greenland, Puerto Rico, Hong Kong, Antarctica…) selectable and counted separately.
- **Micro-states are clickable** — Singapore, Malta, Monaco, Tuvalu and friends get a dot marker so they are
  reachable even at 1× zoom, plus a searchable list for anything easier to find by name.
- **Selected countries float to the top** of the list, under a `Selected · N` header, so your own map is
  always the first thing you see.
- **Continents are filters** — click Africa / Americas / Asia / Europe / Oceania to zoom the map to that
  continent, dim (and lock) everything outside it, and narrow the list to its countries; the *Whole world*
  chip or a second click on the active continent clears it. Search stacks on top of the filter.
- **Progress by region** — Africa, Americas, Asia, Europe, Oceania.
- **English / Turkish** UI and country names, light / dark theme, both remembered.
- **Download PNG** — a shareable 2× image of the map with your score.
- **Copy link** — your selection is encoded in the URL (`#v1=…`), so a link restores the exact map.
  Selections also persist in `localStorage`.

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
| `?lang=tr` / `?lang=en` | Opens in that language |
| `?theme=light` / `?theme=dark` | Opens in that theme |

## Layout

```
index.html          markup
css/style.css       theme + layout
js/data.js          GENERATED — projected map paths and country metadata
js/app.js           map rendering, selection, zoom/pan, i18n, PNG export
tools/gen.mjs       regenerates js/data.js
```

## Regenerating the map data

`js/data.js` is generated — do not edit it by hand:

```bash
cd tools
npm install
npm run build
```

It projects Natural Earth 1:50m country polygons with `d3-geo`'s Natural Earth projection into a
1000 × 520 viewBox, simplifies them (topojson weight `0.001`, then a 0.3 px screen-space filter — roughly
555 KB of path data, ~150 KB gzipped), and joins each shape to its ISO alpha-2 code, English/Turkish name,
region, flag and UN-membership flag. It also emits a zoom box per continent, percentile-trimmed so that
outliers (Russia counts as Europe, Hawaii as Oceania) do not stretch a continent across half the map.

A few choices the generator makes:

- Northern Cyprus and Somaliland are drawn as part of Cyprus and Somalia; Kosovo is a separate, selectable
  entry that does not count toward the 195.
- Taiwan and other non-UN entities are selectable but counted as territories, not sovereign countries.
- Tuvalu is absent from the 1:50m dataset, so it is added as a marker-only entry.
- Shapes with no ISO code (Siachen Glacier, Indian Ocean territories) are drawn but not selectable.

## Data sources

- [world-atlas](https://github.com/topojson/world-atlas) — Natural Earth 1:50m, public domain.
- [world-countries](https://github.com/mledoze/countries) — ISO codes, names and translations, ODbL.
