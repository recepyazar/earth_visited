/* EarthVisited — share-link codec.
   Its own file so the tests can exercise it without a browser.

     Share.encode(order, marks)     -> "AhAAIAg…"   (v2: 3 bits per entity)
     Share.decode(order, str)       -> [[code, level], …] | null
     Share.decodeV1(order, str)     -> [[code, 2], …] | null   (pre-levels links)

   `order` is the frozen bit order from js/data.js: entities added later are
   appended, so an old link keeps decoding to the same countries.

   Provinces ride in their own section so a link only pays for the countries you
   actually opened:

     Share.encodeSub(units, subMarks)   -> "TR~AAgB.US~BAA"   (per country, base64)
     Share.decodeSub(units, str)        -> [['TR-34', 2], …] | null

   `units` maps a country code to its ordered unit ids, exactly as js/admin1/<CC>.js
   lists them (sorted by ISO code, so the order survives a rebuild).
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

  // one section per country: CC~<3 bits per unit, base64>, sections joined with '.'
  function encodeSub(units, subMarks) {
    const sections = [];
    for (const [country, ids] of Object.entries(units)) {
      if (!ids.some((id) => (subMarks.get ? subMarks.get(id) : subMarks[id]))) continue;
      const bytes = new Uint8Array(Math.ceil((ids.length * 3) / 8));
      ids.forEach((id, i) => {
        const lv = (subMarks.get ? subMarks.get(id) : subMarks[id]) || 0;
        for (let b = 0; b < 3; b++) {
          if (lv & (1 << b)) {
            const at = i * 3 + b;
            bytes[at >> 3] |= 1 << (at & 7);
          }
        }
      });
      sections.push(`${country}~${b64encode(bytes)}`);
    }
    return sections.join('.');
  }

  function decodeSub(units, str) {
    if (!str) return [];
    try {
      const out = [];
      for (const section of str.split('.')) {
        const [country, payload] = section.split('~');
        const ids = units[country];
        if (!ids || !payload) continue; // a country we no longer ship detail for
        const bin = b64decode(payload);
        ids.forEach((id, i) => {
          let lv = 0;
          for (let b = 0; b < 3; b++) {
            const at = i * 3 + b;
            if (bin.charCodeAt(at >> 3) & (1 << (at & 7))) lv |= 1 << b;
          }
          if (lv >= 1 && lv <= 4) out.push([id, lv]);
        });
      }
      return out;
    } catch {
      return null;
    }
  }

  // Cities are 6,000-odd, of which someone marks a handful, so a bitset would be
  // mostly zeroes: the marked ones are written as gaps instead. Each value packs
  // the gap since the previous city and the level (gap * 4 + level - 1) into a
  // variable number of 7-bit groups.
  function encodeCities(order, marks) {
    const picked = [];
    order.forEach((id, i) => {
      const lv = marks.get ? marks.get(id) : marks[id];
      if (lv) picked.push([i, lv]);
    });
    if (!picked.length) return '';
    const bytes = [];
    let prev = 0;
    for (const [index, lv] of picked) {
      let value = (index - prev) * 4 + (lv - 1);
      prev = index;
      do {
        const part = value & 0x7f;
        value >>>= 7;
        bytes.push(value ? part | 0x80 : part);
      } while (value);
    }
    return b64encode(Uint8Array.from(bytes));
  }

  function decodeCities(order, str) {
    if (!str) return [];
    try {
      const bin = b64decode(str);
      const out = [];
      let index = 0;
      let value = 0;
      let shift = 0;
      for (let i = 0; i < bin.length; i++) {
        const byte = bin.charCodeAt(i);
        value |= (byte & 0x7f) << shift;
        if (byte & 0x80) {
          shift += 7;
          continue;
        }
        index += value >>> 2;
        const lv = (value & 3) + 1;
        if (order[index] !== undefined) out.push([order[index], lv]);
        value = 0;
        shift = 0;
      }
      return out;
    } catch {
      return null;
    }
  }

  const api = { encode, decode, decodeV1, encodeSub, decodeSub, encodeCities, decodeCities };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Share = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
