// Loads the browser files (which assign to `window`) into this process.
// Evaluated in this realm on purpose: objects built inside a vm context carry
// that context's Array/Object prototypes, and assert.deepEqual then rejects them.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('../../', import.meta.url);

export function loadBrowserGlobals(files) {
  const window = {};
  window.window = window;
  for (const file of files) {
    const src = readFileSync(fileURLToPath(new URL(file, root)), 'utf8');
    // eslint-disable-next-line no-new-func
    new Function('window', 'globalThis', `${src}\n//# sourceURL=${file}`)(window, window);
  }
  return window;
}

export const WORLD = loadBrowserGlobals(['js/data.js']).WORLD;
export const GLOBE = loadBrowserGlobals(['js/globe-data.js']).GLOBE_DATA;
export const I18N = loadBrowserGlobals(['js/i18n.js']).I18N;
export const CARD = loadBrowserGlobals(['js/card.js']).EarthCard;
export const SHARE = loadBrowserGlobals(['js/share.js']).Share;
export const isCountry = (f) => f.s === 1 || f.s === 3;
