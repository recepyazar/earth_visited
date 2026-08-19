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
  page.on('pageerror', (e) => errors.push(String(e)));
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

test('the service worker installs and serves the app offline', async () => {
  const page = await open();
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
