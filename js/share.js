/* EarthVisited — share-link codec.
   Its own file so the tests can exercise it without a browser.

     Share.encode(order, marks)     -> "AhAAIAg…"   (v2: 3 bits per entity)
     Share.decode(order, str)       -> [[code, level], …] | null
     Share.decodeV1(order, str)     -> [[code, 2], …] | null   (pre-levels links)

   `order` is the frozen bit order from js/data.js: entities added later are
   appended, so an old link keeps decoding to the same countries.
*/
(function (root) {
  'use strict';

  const b64encode = (bytes) => {
    let bin = '';
    for (const b of bytes) bin += String.fromCharCode(b);
    const raw = typeof btoa === 'function' ? btoa(bin) : Buffer.from(bin, 'binary').toString('base64');
    return raw.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  };

  const b64decode = (s) => {
    const norm = s.replace(/-/g, '+').replace(/_/g, '/');
    return typeof atob === 'function' ? atob(norm) : Buffer.from(norm, 'base64').toString('binary');
  };

  function encode(order, marks) {
    const bytes = new Uint8Array(Math.ceil((order.length * 3) / 8));
    order.forEach((code, i) => {
      const lv = (marks.get ? marks.get(code) : marks[code]) || 0;
      for (let b = 0; b < 3; b++) {
        if (lv & (1 << b)) {
          const at = i * 3 + b;
          bytes[at >> 3] |= 1 << (at & 7);
        }
      }
    });
    return b64encode(bytes);
  }

  function decode(order, str) {
    try {
      const bin = b64decode(str);
      const out = [];
      order.forEach((code, i) => {
        let lv = 0;
        for (let b = 0; b < 3; b++) {
          const at = i * 3 + b;
          if (bin.charCodeAt(at >> 3) & (1 << (at & 7))) lv |= 1 << b;
        }
        if (lv >= 1 && lv <= 4) out.push([code, lv]);
      });
      return out;
    } catch {
      return null;
    }
  }

  // v1 links predate levels: a set bit means "visited"
  function decodeV1(order, str) {
    try {
      const bin = b64decode(str);
      const out = [];
      order.forEach((code, i) => {
        if (bin.charCodeAt(i >> 3) & (1 << (i & 7))) out.push([code, 2]);
      });
      return out;
    } catch {
      return null;
    }
  }

  const api = { encode, decode, decodeV1 };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Share = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
