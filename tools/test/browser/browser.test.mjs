// Real browser checks: the things a unit test cannot see — clicks, drags, the
// share sheet, the globe, the service worker. Runs against a throwaway static
// server on a random port, with Chrome fetched by puppeteer (no system install).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { extname, normalize, join } from 'node:path';
import puppeteer from 'puppeteer';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2',
};

let server;
let browser;
let base;

before(async () => {
  server = createServer(async (req, res) => {
    const path = decodeURIComponent(req.url.split('?')[0]);
    const file = join(ROOT, normalize(path === '/' ? 'index.html' : path).replace(/^(\.\.[/\\])+/, ''));
    try {
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404).end('not found');
    }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
  browser = await puppeteer.launch({ args: ['--no-sandbox'] });
});

after(async () => {
  await browser?.close();
  server?.close();
});

// every test gets its own browser context: localStorage from one must not decide
// what another sees (saved language, saved marks)
const open = async (query = '') => {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  page.ctx = context;
  await page.setViewport({ width: 1200, height: 900 });
  const errors = [];
  page.on('pageerror', (e) => {
    errors.push(String(e));
    if (process.env.DEBUG_ERRORS) console.error('[page error]', e.stack || e);
  });
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(`${base}/${query}`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('path.pickable');
  page.errors = errors;
  return page;
};

const close = async (page) => {
  const ctx = page.ctx;
  await page.close();
  if (ctx) await ctx.close();
};

const text = (page, sel) => page.$eval(sel, (e) => e.textContent.trim());

// Clicking the centre of a path's bounding box can land on a neighbour — a country
// is rarely a rectangle. Find a point that is actually inside the shape, then click
// that; the test would otherwise silently mark the wrong country.
const clickCountry = async (page, code) => {
  const point = await page.evaluate((c) => {
    const el = document.querySelector(`path[data-code=${c}]`);
    if (!el) return null;
    const box = el.getBBox();
    const pt = el.ownerSVGElement.createSVGPoint();
    // walk a grid over the shape's box and take the first point that is really
    // inside it, starting from the middle rows where a country is usually widest
    const fractions = [0.5, 0.45, 0.55, 0.4, 0.6, 0.35, 0.65, 0.3, 0.7, 0.25, 0.75, 0.2, 0.8];
    for (const fy of fractions) {
      for (const fx of fractions) {
        pt.x = box.x + box.width * fx;
        pt.y = box.y + box.height * fy;
        if (el.isPointInFill(pt)) {
          const screen = pt.matrixTransform(el.getScreenCTM());
          return { x: screen.x, y: screen.y };
        }
      }
    }
    return null;
  }, code);
  if (!point) throw new Error(`no point found inside ${code}`);
  const wasMarked = await page.$eval(`path[data-code=${code}]`, (e) => e.classList.contains('on'));
  await page.mouse.click(point.x, point.y);
  // the click resolves before the page has handled it; wait for the paint to flip
  await page
    .waitForFunction(
      (c, was) => document.querySelector(`path[data-code=${c}]`).classList.contains('on') !== was,
      { timeout: 2000 },
      code,
      wasMarked
    )
    .catch(() => {
      throw new Error(`the click at ${Math.round(point.x)},${Math.round(point.y)} missed ${code}`);
    });
  return point;
};

test('the map loads clean and answers a click', async () => {
  const page = await open('?lang=tr');
  assert.equal(await text(page, '#count'), '0');
  await clickCountry(page, 'BR');
  assert.equal(await text(page, '#count'), '1', 'clicking Brazil counts it');
  assert.match(await text(page, '#flash'), /Brezilya/, 'and says so');
  assert.ok(await page.$eval('path[data-code=BR]', (e) => e.classList.contains('lv2')), 'painted as visited');
  await clickCountry(page, 'BR');
  assert.equal(await text(page, '#count'), '0', 'clicking again clears it');
  assert.deepEqual(page.errors, []);
  await close(page);
});

test('a marked country keeps its colour while the cursor sits on it', async () => {
  // the regression this pins: a :hover rule outranked the level colour, so a
  // country stayed grey until the mouse left it
  const page = await open('?lang=tr');
  const point = await clickCountry(page, 'DE');
  await page.mouse.move(point.x, point.y); // and leave the cursor sitting on it
  // fill has a 0.12s transition; reading it mid-way returns a blend of the two
  await new Promise((r) => setTimeout(r, 300));
  const fill = await page.$eval('path[data-code=DE]', (e) => getComputedStyle(e).fill);
  const level = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--lv2').trim());
  const hex = fill.match(/\d+/g).map((n) => (+n).toString(16).padStart(2, '0')).join('');
  assert.equal(`#${hex}`, level, 'shows the visited colour, not the hover colour');
  await close(page);
});

test('the brush paints levels and the wish list stays out of the score', async () => {
  const page = await open('?lang=tr');
  await clickCountry(page, 'DE');   // visited by default
  await page.click('.lvchip.lv4');  // want to go
  await clickCountry(page, 'MN');
  assert.equal(await text(page, '#count'), '1', 'a wish is not a visit');
  const counts = await page.$$eval('.lvchip span', (els) => els.map((e) => e.textContent));
  assert.deepEqual(counts, ['0', '1', '0', '1'], 'lived, visited, transit, wish');
  await close(page);
});

test('a shared link restores levels exactly', async () => {
  const page = await open('?lang=tr');
  await clickCountry(page, 'TR');
  await page.click('.lvchip.lv1');
  await clickCountry(page, 'DE');
  const link = await page.evaluate(() => {
    document.getElementById('shareBtn').click();
    return location.hash;
  });
  assert.match(link, /^#v2=/);
  const other = await open(`?lang=tr${link}`);
  assert.equal(await text(other, '#count'), '2');
  assert.ok(await other.$eval('path[data-code=DE]', (e) => e.classList.contains('lv1')), 'Germany came back as lived');
  assert.ok(await other.$eval('path[data-code=TR]', (e) => e.classList.contains('lv2')), 'Türkiye came back as visited');
  await close(page);
  await close(other);
});

test('the continent filter narrows the list and locks the rest of the map', async () => {
  const page = await open('?lang=tr');
  await page.evaluate(() => [...document.querySelectorAll('.region')].find((r) => r.textContent.startsWith('Avrupa')).click());
  const shown = await page.$$eval('.row:not([hidden])', (rows) => rows.length);
  assert.ok(shown > 30 && shown < 60, `only Europe is listed (${shown} rows)`);
  const locked = await page.$eval('path[data-code=BR]', (e) => getComputedStyle(e).pointerEvents);
  assert.equal(locked, 'none', 'Brazil cannot be clicked while Europe is filtered');
  await close(page);
});

test('search finds a country by any of its languages', async () => {
  const page = await open('?lang=tr');
  for (const [term, expected] of [['germany', 'Almanya'], ['turquie', 'Türkiye'], ['kıbrıs', 'Kıbrıs']]) {
    await page.$eval('#search', (el) => (el.value = ''));
    await page.type('#search', term);
    const first = await page.$$eval('.row:not([hidden]) .nm', (els) => els.map((e) => e.textContent));
    assert.ok(first.includes(expected), `"${term}" finds ${expected}`);
  }
  await close(page);
});

test('the share sheet renders a card in every format', async () => {
  const page = await open('?lang=tr');
  await clickCountry(page, 'BR');
  await page.click('#shareBtn');
  await page.waitForFunction(() => document.getElementById('cardImg').src.length > 1000);
  for (const [i, size] of [[0, '1200'], [1, '1080'], [2, '1080']].entries()) {
    await page.evaluate((n) => document.querySelectorAll('.size')[n].click(), i);
    await page.waitForFunction(
      (w) => decodeURIComponent(document.getElementById('cardImg').src).includes(`width="${w}"`),
      {},
      size[1]
    );
  }
  assert.deepEqual(page.errors, []);
  await close(page);
});

test('the globe loads on demand, hides the flat map, and takes clicks', async () => {
  const page = await open('?lang=tr');
  const before = await page.evaluate(() => performance.getEntriesByType('resource').some((r) => r.name.includes('globe-data')));
  assert.equal(before, false, 'the globe bundle is not part of the first load');

  await page.click('#viewGlobe');
  await page.waitForFunction(() => window.Globe && window.Globe.mounted);
  assert.equal(await page.$eval('#map', (e) => getComputedStyle(e).display), 'none', 'the flat map is gone');

  const box = await page.$eval('#globe', (e) => {
    const r = e.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  await page.mouse.click(box.x, box.y);
  assert.equal(await text(page, '#count'), '1', 'clicking the globe marks a country');

  await page.mouse.move(box.x, box.y);
  await page.mouse.down();
  await page.mouse.move(box.x + 150, box.y, { steps: 10 });
  await page.mouse.up();
  assert.equal(await text(page, '#count'), '1', 'spinning it does not mark anything');
  assert.deepEqual(page.errors, []);
  await close(page);
});

test('Arabic flips the page to right-to-left', async () => {
  const page = await open('?lang=ar');
  assert.equal(await page.evaluate(() => document.documentElement.dir), 'rtl');
  assert.equal(await text(page, '[data-i18n="markAs"]'), 'علّم كـ');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(overflow <= 1, `the layout does not spill sideways (${overflow}px)`);
  const controls = await page.evaluate(() => {
    const r = document.querySelector('.zoomctl').getBoundingClientRect();
    const map = document.querySelector('.mapwrap').getBoundingClientRect();
    return { left: r.left - map.left, right: map.right - r.right };
  });
  assert.ok(controls.left < controls.right, 'the zoom buttons move to the left edge');
  await close(page);
});

test('settings change language, theme and marker colours', async () => {
  const page = await open('?lang=tr');
  await page.click('#settingsBtn');
  await page.evaluate(() => [...document.querySelectorAll('#langOpts .opt')].find((o) => o.textContent === 'Deutsch').click());
  assert.equal(await text(page, '[data-i18n="markAs"]'), 'Markieren als', 'the interface follows');
  assert.equal(await page.$eval('.row[data-code=TR] .nm', (e) => e.textContent), 'Türkei', 'so do country names');

  await page.evaluate(() => document.querySelectorAll('#themeOpts .opt')[1].click());
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'light');

  await page.evaluate(() => {
    const input = document.querySelectorAll('.colorrow input')[1];
    input.value = '#ff0000';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const lv2 = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--lv2').trim());
  assert.equal(lv2, '#ff0000', 'the chosen colour reaches the map');
  await close(page);
});

test('the site opens in the browser’s language, or English when we do not speak it', async () => {
  for (const [langs, expect] of [
    [['tr-TR', 'en'], 'İşaret türü'],
    [['de-DE'], 'Markieren als'],
    [['hi-IN', 'th-TH'], 'Mark as'],
    [['zh-CN', 'tr-TR'], '标记为'],
    [['ar-EG'], 'علّم كـ'],
  ]) {
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    await page.setExtraHTTPHeaders({ 'Accept-Language': langs.join(',') });
    await page.evaluateOnNewDocument((list) => {
      Object.defineProperty(navigator, 'languages', { get: () => list });
      Object.defineProperty(navigator, 'language', { get: () => list[0] });
    }, langs);
    await page.goto(base, { waitUntil: 'networkidle0' });
    await page.waitForSelector('.caption');
    assert.equal(await text(page, '[data-i18n="markAs"]'), expect, `${langs.join(',')} → ${expect}`);
    await page.close();
    await context.close();
  }
});

test('selections survive a reload, and Reset needs two taps', async () => {
  const page = await open('?lang=tr');
  await clickCountry(page, 'BR');
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForSelector('path.pickable');
  assert.equal(await text(page, '#count'), '1', 'remembered');

  await page.click('#resetBtn');
  assert.equal(await text(page, '#count'), '1', 'one tap only arms it');
  assert.equal(await text(page, '#resetBtn'), 'Emin misin?');
  await page.click('#resetBtn');
  assert.equal(await text(page, '#count'), '0', 'the second tap clears');
  await close(page);
});

// helper: the view eases into place over ~450 ms, and a click aimed at where a
// shape was mid-flight lands somewhere else
const settled = (page) =>
  page.waitForFunction(() => {
    const now = document.querySelector('#map g').getAttribute('transform');
    const same = window.__lastT === now;
    window.__lastT = now;
    return same;
  }, { polling: 200 });

// helper: click a province by its ISO code, the same "find a point inside" trick
// fills cross-fade over 0.12 s, so a colour read straight after a class flip can
// catch a shade that never comes back
const stableFill = async (page, selector) => {
  await page.waitForFunction((sel) => {
    const now = getComputedStyle(document.querySelector(sel)).fill;
    const same = window.__lastFill === now;
    window.__lastFill = now;
    return same;
  }, { polling: 150 }, selector);
  return page.$eval(selector, (e) => getComputedStyle(e).fill);
};

const clickProvince = async (page, id) => {
  await settled(page);
  const point = await page.evaluate((code) => {
    const el = document.querySelector(`path[data-sub="${code}"]`);
    if (!el) return null;
    const box = el.getBBox();
    const pt = el.ownerSVGElement.createSVGPoint();
    const fractions = [0.5, 0.45, 0.55, 0.4, 0.6, 0.35, 0.65];
    for (const fy of fractions) {
      for (const fx of fractions) {
        pt.x = box.x + box.width * fx;
        pt.y = box.y + box.height * fy;
        if (el.isPointInFill(pt)) {
          const s = pt.matrixTransform(el.getScreenCTM());
          return { x: s.x, y: s.y };
        }
      }
    }
    return null;
  }, id);
  if (!point) throw new Error(`no point inside ${id}`);
  // the suite runs several browsers at once, and a busy machine can swallow a click
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.mouse.click(point.x, point.y);
    const landed = await page
      .waitForFunction((code) => document.querySelector(`path[data-sub="${code}"]`).classList.contains('on'), { timeout: 6000 }, id)
      .then(() => true)
      .catch(() => false);
    if (landed) return;
  }
  throw new Error(`the click missed ${id}`);
};

const openTurkey = async (page) => {
  await page.evaluate(() => {
    const s = document.getElementById('search');
    s.value = 'türkiye';
    s.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForSelector('.row[data-code=TR] .into');
  await page.evaluate(() => document.querySelector('.row[data-code=TR] .into').click());
  await page.waitForSelector('path.sub');
  await settled(page);
};

test('a country opens into its provinces and closes again', async () => {
  const page = await open('?lang=tr');
  await openTurkey(page);
  assert.equal(await page.$$eval('path.sub', (p) => p.length), 81, 'all 81 provinces are drawn');
  assert.equal(await text(page, '#crumbName'), 'Türkiye');
  assert.equal(await text(page, '#crumbCount'), '0/81');
  assert.equal(await page.$$eval('.row', (r) => r.length), 81, 'the list switched to provinces');
  assert.equal(await page.$eval('#search', (e) => e.value), '', 'the country search does not hide them');

  await clickProvince(page, 'TR-34');
  await clickProvince(page, 'TR-35');
  assert.equal(await text(page, '#crumbCount'), '2/81');
  assert.equal(await text(page, '#count'), '2');
  assert.match(await text(page, '#flash'), /İzmir/);

  await page.click('#crumbBack');
  await page.waitForFunction(() => !document.querySelector('path.sub'));
  assert.equal(await text(page, '#total'), '/ 196', 'the world score is back');
  assert.deepEqual(page.errors, []);
  await close(page);
});

test('opening a country from the globe lands on the flat map, provinces and all', async () => {
  const page = await open('?lang=tr');
  await page.click('#viewGlobe');
  await page.waitForFunction(() => window.Globe && window.Globe.mounted);
  await openTurkey(page); // the chevron used to do nothing at all here
  assert.equal(await page.$eval('#map', (e) => getComputedStyle(e).display), 'block', 'back on the flat map');
  assert.equal(await page.$$eval('path.sub', (p) => p.length), 81);
  assert.equal(await text(page, '#crumbName'), 'Türkiye');
  await clickProvince(page, 'TR-34');
  assert.equal(await text(page, '#crumbCount'), '1/81');
  assert.deepEqual(page.errors, []);
  await close(page);
});

test('an open country zooms in far past the world map’s limit', async () => {
  const page = await open('?lang=tr');
  const zoom = () => page.evaluate(() => +document.querySelector('#map g').getAttribute('transform').match(/scale\(([\d.]+)\)/)[1]);

  // the world map stops where its 1:50m coastlines do
  for (let i = 0; i < 8; i++) await page.click('#zoomIn');
  await new Promise((r) => setTimeout(r, 500));
  assert.equal(await zoom(), 24, 'the world caps at 24x');

  await openTurkey(page);
  await new Promise((r) => setTimeout(r, 600));
  const fitted = await zoom();
  for (let i = 0; i < 3; i++) {
    await page.click('#zoomIn');
    await new Promise((r) => setTimeout(r, 250));
  }
  const zoomed = await zoom();
  assert.ok(zoomed > fitted * 3, `1:10m provinces zoom deeper (${fitted.toFixed(1)} → ${zoomed.toFixed(1)})`);

  // reset goes back to the country you are looking at, not out to the world
  await page.click('#zoomReset');
  await new Promise((r) => setTimeout(r, 600));
  assert.ok(Math.abs((await zoom()) - fitted) < 0.5, 'reset re-fits the open country');
  assert.equal(await page.$$eval('path.sub', (p) => p.length), 81);
  assert.deepEqual(page.errors, []);
  await close(page);
});

test('a marked country is not painted under its own provinces', async () => {
  const page = await open('?lang=tr');
  await clickCountry(page, 'TR');
  await page.waitForFunction(() => document.querySelector('path[data-code=TR]').classList.contains('lv2'));
  const painted = await stableFill(page, 'path[data-code=TR]');

  await openTurkey(page);
  const land = await stableFill(page, 'path[data-code=DE]');
  await page.waitForFunction(
    (plain) => getComputedStyle(document.querySelector('path[data-code=TR]')).fill === plain,
    {}, land
  ).catch(() => { throw new Error('the country is still painted under its provinces'); });
  assert.notEqual(land, painted, 'and plain land is not the marked colour');

  // and it gets its colour back on the way out
  await page.evaluate(() => document.getElementById('crumbBack').click());
  await page.waitForFunction(
    (green) => getComputedStyle(document.querySelector('path[data-code=TR]')).fill === green,
    {}, painted
  ).catch(() => { throw new Error('the country did not get its colour back'); });
  assert.deepEqual(page.errors, []);
  await close(page);
});

test('provinces survive a reload and travel in the link', async () => {
  const page = await open('?lang=tr');
  await openTurkey(page);
  await clickProvince(page, 'TR-06');
  const link = await page.evaluate(() => {
    document.getElementById('shareBtn').click();
    return location.hash;
  });
  assert.match(link, /&p=TR~/, 'the link carries a province section');

  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForSelector('path.pickable');
  await openTurkey(page);
  assert.equal(await text(page, '#crumbCount'), '1/81', 'remembered across a reload');

  const other = await open(`?lang=tr${link}`);
  await openTurkey(other);
  assert.equal(await text(other, '#crumbCount'), '1/81', 'and the link brings it to a fresh browser');
  assert.ok(
    await other.$eval('path[data-sub="TR-06"]', (e) => e.classList.contains('lv2')),
    'the same province, at the same level'
  );
  await close(page);
  await close(other);
});

test('a city is marked from the search list, dots the map and travels in the link', async () => {
  const page = await open('?lang=tr');
  const before = await page.evaluate(() => performance.getEntriesByType('resource').some((r) => r.name.includes('cities.js')));
  assert.equal(before, false, 'cities are not part of the first load');

  // typing a city name offers it under the countries
  await page.type('#search', 'istanbul');
  await page.waitForSelector('.row.city-row');
  assert.equal(await page.$eval('.row.city-row .nm', (e) => e.textContent), 'Istanbul, Türkiye');

  await page.click('.row.city-row');
  await page.waitForFunction(() => document.querySelectorAll('#citymarks circle').length === 1);
  assert.equal(await text(page, '#cityCount'), '1');
  assert.match(await text(page, '#scoreSub'), /şehir/);

  // the point of the whole thing: the city is painted, the country is not
  assert.equal(await text(page, '#count'), '0', 'a city does not tick its country');
  assert.equal(
    await page.$eval('path[data-code=TR]', (e) => /\blv\d\b/.test(e.getAttribute('class'))),
    false, 'the country under it stays unpainted'
  );
  const dot = await page.$eval('#citymarks circle', (c) => ({ cls: c.getAttribute('class'), id: c.dataset.city }));
  assert.match(dot.cls, /\bon\b.*\blv2\b/, 'the dot carries the brush level');

  const link = await page.evaluate(() => {
    document.getElementById('shareBtn').click();
    return location.hash;
  });
  assert.match(link, /&c=/, 'the link carries a city section');
  assert.ok(link.length < 200, `and stays pasteable (${link.length} chars)`);

  const other = await open(`?lang=tr${link}`);
  await other.waitForFunction(() => document.querySelectorAll('#citymarks circle').length === 1);
  assert.equal(await other.$eval('#citymarks circle', (c) => c.dataset.city), dot.id, 'the same city in a fresh browser');
  assert.deepEqual(page.errors, []);
  assert.deepEqual(other.errors, []);
  await close(page);
  await close(other);
});

test('a city answers to its name in the visitor’s language', async () => {
  const page = await open('?lang=tr');
  await page.type('#search', 'roma');
  await page.waitForSelector('.row.city-row');
  assert.equal(await page.$eval('.row.city-row .nm', (e) => e.textContent), 'Roma, İtalya');

  // only the language in use is fetched — not all eleven name packs
  const packs = await page.evaluate(() =>
    performance.getEntriesByType('resource').filter((r) => r.name.includes('/cities/')).map((r) => r.name.split('/').pop().split('?')[0])
  );
  assert.deepEqual(packs, ['tr.js']);

  // and the name GeoNames ships still works, showing the Turkish one
  await page.evaluate(() => {
    const box = document.getElementById('search');
    box.value = '';
    box.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.type('#search', 'rome');
  await page.waitForFunction(() => document.querySelector('.row.city-row .nm')?.textContent === 'Roma, İtalya');
  assert.deepEqual(page.errors, []);
  await close(page);
});

test('a city survives a reload and clears with the map', async () => {
  const page = await open('?lang=tr');
  await page.type('#search', 'izmir');
  await page.waitForSelector('.row.city-row');
  await page.click('.row.city-row');
  await page.waitForFunction(() => document.querySelectorAll('#citymarks circle').length === 1);

  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForFunction(() => document.querySelectorAll('#citymarks circle').length === 1, { timeout: 10000 });
  assert.equal(await text(page, '#cityCount'), '1', 'the city came back from storage');

  // the same row unmarks it — one list, one brush, both directions
  await page.type('#search', 'izmir');
  await page.waitForSelector('.row.city-row.on');
  await page.click('.row.city-row');
  await page.waitForFunction(() => document.querySelectorAll('#citymarks circle').length === 0);
  assert.equal(await page.$eval('#cityStat', (e) => e.hidden), true, 'and the score line drops the counter');
  assert.deepEqual(page.errors, []);
  await close(page);
});

test('the province view splits every country into its provinces', async () => {
  const page = await open('?lang=tr');
  const fetched = () => page.evaluate(() =>
    performance.getEntriesByType('resource').some((r) => r.name.includes('admin1/world.js')));
  assert.equal(await fetched(), false, 'the world province layer is not part of the first load');

  // a country marked on the world map must not read as "all of it" here
  await clickCountry(page, 'TR');
  await page.waitForFunction(() => document.querySelector('path[data-code=TR]').classList.contains('lv2'));
  const painted = await stableFill(page, 'path[data-code=TR]');

  await page.click('#grainSub');
  await page.waitForSelector('#worldsubs path.sub.world', { timeout: 40000 });
  await settled(page);
  assert.ok((await page.$$eval('#worldsubs path.sub.world', (p) => p.length)) > 4000, 'the whole world, by province');
  const plain = await stableFill(page, 'path[data-code=DE]');
  await page.waitForFunction(
    (flat) => getComputedStyle(document.querySelector('path[data-code=TR]')).fill === flat,
    {}, plain
  ).catch(() => { throw new Error('the country is still painted in the city view'); });

  // clicking a province marks that province, not its country
  const spot = await page.evaluate(() => {
    const el = document.querySelector('path[data-sub="TR-34"]');
    const box = el.getBBox();
    const pt = el.ownerSVGElement.createSVGPoint();
    for (const fy of [0.5, 0.45, 0.55]) {
      for (const fx of [0.5, 0.45, 0.55]) {
        pt.x = box.x + box.width * fx;
        pt.y = box.y + box.height * fy;
        if (el.isPointInFill(pt)) {
          const s = pt.matrixTransform(el.getScreenCTM());
          return { x: s.x, y: s.y };
        }
      }
    }
    return null;
  });
  await page.mouse.click(spot.x, spot.y);
  await page.waitForFunction(() => document.querySelectorAll('#worldsubs .sub.on').length === 1);
  assert.equal(await page.$eval('#worldsubs .sub.on', (e) => e.dataset.sub), 'TR-34');
  assert.match(await text(page, '#scoreSub'), /il · 1 ülkede/);
  assert.equal(await page.$eval('.row.city-row .nm', (e) => e.textContent), 'İstanbul, Türkiye');
  assert.equal(await text(page, '#count'), '1');

  // Reset here is about provinces, and the country keeps its own colour
  await page.click('#resetBtn');
  await page.click('#resetBtn');
  await page.waitForFunction(() => !document.querySelectorAll('#worldsubs .sub.on').length);
  await page.click('#grainCountry');
  await page.waitForFunction(
    (green) => getComputedStyle(document.querySelector('path[data-code=TR]')).fill === green,
    {}, painted
  ).catch(() => { throw new Error('the country lost its mark to the city view'); });
  assert.deepEqual(page.errors, []);
  await close(page);
});

test('a province marked on the world map is the same one the country view shows', async () => {
  const page = await open('?lang=tr&view=cities'); // the old link, from before the switch was split
  await page.waitForSelector('#worldsubs path.sub.world', { timeout: 40000 });

  // the search finds any province in the world, in the visitor's language
  await page.type('#search', 'bavyera');
  await page.waitForSelector('.row.city-row.found');
  assert.equal(await page.$eval('.row.city-row.found .nm', (e) => e.textContent), 'Bavyera, Almanya');
  await page.click('.row.city-row.found');
  await page.waitForFunction(() => document.querySelectorAll('#worldsubs .sub.on').length === 1);

  const link = await page.evaluate(() => {
    document.getElementById('shareBtn').click();
    return location.hash;
  });
  assert.match(link, /&p=DE~/, 'and it travels in the province section of the link');
  await page.evaluate(() => document.getElementById('sheet').close());

  // the same mark, seen from inside the country
  await page.click('#grainCountry');
  await openTurkey(page); // a detail view of another country must not disturb it
  await page.evaluate(() => document.getElementById('crumbBack').click());
  await page.waitForFunction(() => !document.querySelector('path.sub:not(.world)'));

  const other = await open(`?lang=tr${link}`);
  await other.evaluate(() => {
    const s = document.getElementById('search');
    s.value = 'almanya';
    s.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await other.waitForSelector('.row[data-code=DE] .into');
  await other.evaluate(() => document.querySelector('.row[data-code=DE] .into').click());
  await other.waitForSelector('path.sub');
  assert.equal(await text(other, '#crumbCount'), '1/16', 'the link brought Bavaria to the country view');
  assert.deepEqual(page.errors, []);
  assert.deepEqual(other.errors, []);
  await close(page);
  await close(other);
});

test('a province turns colour the moment it is marked, without a nudge', async () => {
  // Chrome will not repaint a clipped group when only a fill inside it changed, so
  // the colour used to wait for the next pan. The pixels are the only witness.
  const page = await open('?lang=tr');
  await page.click('#grainSub');
  await page.waitForSelector('#worldsubs path.sub.world', { timeout: 40000 });
  await settled(page);

  const patch = async (at) =>
    (await page.screenshot({ clip: { x: at.x - 3, y: at.y - 3, width: 6, height: 6 } })).toString('base64');
  const middleOf = (code) =>
    page.evaluate((id) => {
      const el = document.querySelector(`path[data-sub="${id}"]`);
      const box = el.getBBox();
      const pt = el.ownerSVGElement.createSVGPoint();
      pt.x = box.x + box.width / 2;
      pt.y = box.y + box.height / 2;
      const at = pt.matrixTransform(el.getScreenCTM());
      return { x: Math.round(at.x), y: Math.round(at.y) };
    }, code);

  for (const code of ['US-TX', 'BR-SP']) {
    const at = await middleOf(code);
    const before = await patch(at);
    await page.mouse.click(at.x, at.y);
    await page.waitForFunction((id) => document.querySelector(`path[data-sub="${id}"]`).classList.contains('on'), {}, code);
    await new Promise((r) => setTimeout(r, 300));
    assert.notEqual(await patch(at), before, `${code} is painted on screen, not just in the DOM`);

    // and clearing it puts the colour back where it was
    const painted = await patch(at);
    await page.mouse.click(at.x, at.y);
    await page.waitForFunction((id) => !document.querySelector(`path[data-sub="${id}"]`).classList.contains('on'), {}, code);
    await new Promise((r) => setTimeout(r, 300));
    assert.notEqual(await patch(at), painted, `${code} is cleared on screen too`);
  }
  assert.deepEqual(page.errors, []);
  await close(page);
});

test('the globe is made of provinces too, and marks them', async () => {
  const page = await open('?lang=tr&view=globe&grain=sub');
  await page.waitForFunction(() => document.getElementById('globe') && !document.getElementById('globe').hidden, { timeout: 30000 });
  await page.waitForFunction(() => window.Globe && window.Globe.mounted, { timeout: 30000 });
  assert.equal(await page.$eval('#map', (e) => e.hidden), true, 'the flat map stepped aside');
  assert.equal(await page.$eval('#grainSub', (e) => e.classList.contains('on')), true, 'and the grain came from the link');

  // the provinces are built from the same file the flat map uses, inverted
  await page.waitForFunction(() => document.querySelectorAll('#worldsubs path.sub.world').length > 4000, { timeout: 40000 });
  await page.evaluate(() => window.Globe.spinTo('TR', 3));
  await new Promise((r) => setTimeout(r, 900));

  const middle = await page.$eval('#globe', (e) => {
    const r = e.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await page.mouse.click(middle.x, middle.y);
  await page.waitForFunction(() => document.querySelectorAll('.row.city-row').length === 1, { timeout: 10000 });
  assert.match(await page.$eval('.row.city-row .nm', (e) => e.textContent), /, Türkiye$/, 'the province under the cursor, in Türkiye');
  assert.match(await text(page, '#scoreSub'), /il · 1 ülkede/);

  // and it is there on the flat map, in the same grain
  await page.click('#viewMap');
  await page.waitForFunction(() => document.querySelectorAll('#worldsubs .sub.on').length === 1);
  assert.deepEqual(page.errors, []);
  await close(page);
});

test('a press outside the open country takes you back to the world', async () => {
  const page = await open('?lang=tr');
  await openTurkey(page);
  await clickProvince(page, 'TR-06');
  assert.equal(await text(page, '#crumbCount'), '1/81');

  // a press on the sea, well clear of Türkiye
  const away = await page.evaluate(() => {
    const box = document.querySelector('path[data-code=TR]').getBoundingClientRect();
    return { x: box.x + box.width / 2, y: box.y + box.height + 120 };
  });
  await page.mouse.click(away.x, away.y);
  await page.waitForFunction(() => !document.querySelector('path.sub:not(.world)'));
  assert.equal(await page.$eval('#crumbs', (e) => e.hidden), true, 'the breadcrumb went with it');
  assert.deepEqual(page.errors, []);
  await close(page);
});

test('the service worker installs and serves the app offline', async () => {
  const page = await open('?sw=1'); // it stays off on localhost unless asked for
  await page.waitForFunction(async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    return !!(reg && reg.active);
  }, { timeout: 15000 });
  const cached = await page.evaluate(async () => {
    const keys = await caches.keys();
    const cache = await caches.open(keys[0]);
    return { name: keys[0], files: (await cache.keys()).length };
  });
  assert.match(cached.name, /^earthvisited-v\d+$/);
  assert.ok(cached.files >= 14, `the shell is cached (${cached.files} files)`);

  await page.setOfflineMode(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('path.pickable', { timeout: 15000 });
  assert.equal(await page.$$eval('path.pickable', (p) => p.length > 200), true, 'the whole map came from the cache');
  await page.setOfflineMode(false);
  await close(page);
});
