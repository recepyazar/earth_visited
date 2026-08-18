/* EarthVisited — share card renderer.
   Pure presentation: app.js hands over already-computed numbers, strings and
   colours, this returns an SVG string sized for a social platform.

   EarthCard.build({ size, world, picked, stats, regions, names, texts, colors })
*/
window.EarthCard = (() => {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';
  const CROP = [0, 0, 1000, 448]; // drops Antarctica — cards read better without it
  const CROP_W = CROP[2] - CROP[0];
  const CROP_RATIO = (CROP[3] - CROP[1]) / CROP_W;

  const SIZES = {
    link: { w: 1200, h: 630, mode: 'side', pad: 48, title: 24, num: 84, of: 26, pct: 58, reg: 19, foot: 18, cols: 1 },
    square: { w: 1080, h: 1080, mode: 'stack', pad: 56, title: 30, num: 116, of: 34, pct: 74, reg: 23, foot: 21, cols: 2 },
    story: { w: 1080, h: 1920, mode: 'stack', pad: 64, title: 38, num: 150, of: 44, pct: 92, reg: 28, foot: 24, cols: 2 },
  };

  const r = (v) => Math.round(v * 10) / 10;
  const esc = (s) =>
    String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const text = (x, y, s, { size, weight = 400, fill, anchor, op = 1 }) =>
    `<text x="${r(x)}" y="${r(y)}" font-size="${r(size)}" font-weight="${weight}" fill="${fill}"` +
    `${anchor ? ` text-anchor="${anchor}"` : ''}${op === 1 ? '' : ` opacity="${op}"`}>${esc(s)}</text>`;

  /* ---- brand mark, same geometry as assets/logo.svg ---- */
  function logoMark(x, y, size, c) {
    const k = size / 32;
    return (
      `<g transform="translate(${r(x)} ${r(y)}) scale(${r(k)})" opacity=".9">` +
      `<g fill="none" stroke="${c.ink}" stroke-width="2" stroke-linecap="round">` +
      `<circle cx="15" cy="15" r="11.6"/>` +
      `<ellipse cx="15" cy="15" rx="5.4" ry="11.6" stroke-width="1.5"/>` +
      `<path d="M4.2 11h21.6M4.2 19h21.6" stroke-width="1.5"/></g>` +
      `<circle cx="24" cy="24" r="8.4" fill="${c.bg}"/>` +
      `<circle cx="24" cy="24" r="6.6" fill="${c.on}"/>` +
      `<path d="m20.9 24.2 2.2 2.2 4.1-4.7" fill="none" stroke="${c.bg}" stroke-width="2.1" ` +
      `stroke-linecap="round" stroke-linejoin="round"/></g>`
    );
  }

  /* ---- the world map, cropped and scaled into a box ---- */
  function mapBlock(o, x, y, w) {
    const c = o.colors;
    const k = w / CROP_W;
    const h = w * CROP_RATIO;
    const radius = r(w * 0.018);
    const out = [
      `<clipPath id="cardMap"><rect x="${r(x)}" y="${r(y)}" width="${r(w)}" height="${r(h)}" rx="${radius}"/></clipPath>`,
      `<rect x="${r(x)}" y="${r(y)}" width="${r(w)}" height="${r(h)}" rx="${radius}" fill="${c.ocean}"/>`,
      // clip on the outer <g>, transform on the inner one: a transform on the same
      // element would move its clipping rectangle along with the drawing.
      `<g clip-path="url(#cardMap)"><g transform="translate(${r(x - CROP[0] * k)} ${r(y - CROP[1] * k)}) scale(${r(k)})">`,
    ];
    for (const d of o.world.decor) out.push(`<path d="${d}" fill="${c.land}" opacity=".5"/>`);
    const stroke = ` stroke="${c.ocean}" stroke-width="${r(0.5 / k)}"`;
    for (const f of o.world.f) {
      const fill = o.picked.has(f.c) ? c.on : c.land;
      if (f.d) out.push(`<path d="${f.d}" fill="${fill}"${stroke}/>`);
      if (f.a < 6) out.push(`<circle cx="${f.x}" cy="${f.y}" r="${r(Math.max(2.6, 3.6 / k))}" fill="${fill}"${stroke}/>`);
    }
    out.push('</g></g>');
    return { svg: out.join(''), h };
  }

  /* ---- headline: title, count, percentage, subtitle ---- */
  function scoreBlock(o, cfg, x, top, width, pctOnRight) {
    const c = o.colors;
    const s = o.stats;
    const out = [];

    const titleY = top + cfg.title;
    out.push(text(x, titleY, o.texts.title, { size: cfg.title, weight: 600, fill: c.ink, op: 0.72 }));

    const numY = titleY + cfg.num * 0.95;
    out.push(text(x, numY, String(s.sov), { size: cfg.num, weight: 800, fill: c.ink }));
    out.push(
      text(x + String(s.sov).length * cfg.num * 0.58, numY, `/ ${s.total}`, {
        size: cfg.of,
        weight: 600,
        fill: c.ink,
        op: 0.45,
      })
    );

    let bottom = numY;
    if (pctOnRight) {
      out.push(text(x + width, numY, o.texts.pct, { size: cfg.pct, weight: 800, fill: c.accent, anchor: 'end' }));
    } else {
      bottom = numY + cfg.pct * 1.05;
      out.push(text(x, bottom, o.texts.pct, { size: cfg.pct, weight: 800, fill: c.accent }));
    }

    const subY = bottom + cfg.title * 1.3;
    const sub = s.terr ? `${o.texts.countries} · ${s.terr} ${o.texts.territories}` : o.texts.countries;
    out.push(text(x, subY, sub, { size: cfg.title * 0.8, weight: 500, fill: c.ink, op: 0.55 }));

    return { svg: out.join(''), bottom: subY };
  }

  /* ---- continent rows: label, progress bar, count ---- */
  function regionRows(o, cfg, x, top, colWidth, gapX) {
    const c = o.colors;
    const out = [];
    const rows = Math.ceil(o.regions.length / cfg.cols);
    const gapY = cfg.reg * (cfg.mode === 'side' ? 1.95 : 2.1);
    const barW = colWidth * 0.34;
    const valW = cfg.reg * 3.2;

    o.regions.forEach((reg, i) => {
      const col = Math.floor(i / rows);
      const row = i % rows;
      const rx = x + col * (colWidth + gapX);
      const baseline = top + cfg.reg + row * gapY;
      const barX = rx + colWidth - barW - valW;
      const barY = baseline - cfg.reg * 0.62;
      const barH = cfg.reg * 0.4;
      const fillW = reg.total ? (reg.have / reg.total) * barW : 0;
      out.push(
        text(rx, baseline, reg.label, { size: cfg.reg, weight: 600, fill: c.ink, op: 0.8 }),
        `<rect x="${r(barX)}" y="${r(barY)}" width="${r(barW)}" height="${r(barH)}" rx="${r(barH / 2)}" fill="${c.ink}" opacity=".12"/>`
      );
      if (fillW > 0.6) {
        out.push(
          `<rect x="${r(barX)}" y="${r(barY)}" width="${r(fillW)}" height="${r(barH)}" rx="${r(barH / 2)}" fill="${c.on}"/>`
        );
      }
      out.push(
        text(rx + colWidth, baseline, `${reg.have}/${reg.total}`, {
          size: cfg.reg,
          weight: 700,
          fill: c.ink,
          anchor: 'end',
          op: 0.9,
        })
      );
    });

    return { svg: out.join(''), h: rows * gapY };
  }

  function build(o) {
    const cfg = SIZES[o.size] || SIZES.link;
    const c = o.colors;
    const { w: W, h: H, pad } = cfg;
    const footY = H - pad;
    const parts = [
      `<svg xmlns="${NS}" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
      `<style>text{font-family:system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",sans-serif}</style>`,
      `<rect width="${W}" height="${H}" fill="${c.bg}"/>`,
    ];

    if (cfg.mode === 'side') {
      const colW = W * 0.3;
      const mapW = W - pad * 3 - colW;
      const mapH = mapW * CROP_RATIO;
      parts.push(mapBlock(o, pad * 2 + colW, (H - mapH) / 2, mapW).svg);
      parts.push(scoreBlock(o, cfg, pad, pad, colW, false).svg);

      const rowsH = o.regions.length * cfg.reg * 1.95;
      parts.push(regionRows(o, cfg, pad, footY - cfg.foot * 2 - rowsH, colW, 0).svg);
    } else {
      const inner = W - pad * 2;
      const isStory = o.size === 'story' && o.names.length > 0;
      const contentBottom = footY - cfg.foot * 2.6;
      const lineH = cfg.reg * 1.6;
      const perLine = 3;

      const score = scoreBlock(o, cfg, pad, pad, inner, true);
      const mapH = inner * CROP_RATIO;
      const rowCount = Math.ceil(o.regions.length / cfg.cols);
      const rowsH = rowCount * cfg.reg * 2.1;

      // base gaps first, then hand the leftover height back to them so the card
      // fills its canvas instead of stacking everything against the top edge
      const base = { g1: cfg.title * 1.4, g2: cfg.reg * 1.6, g3: cfg.reg * 1.9 };
      let namesLines = 0;
      if (isStory) {
        const room = contentBottom - (score.bottom + base.g1 + mapH + base.g2 + rowsH + base.g3);
        namesLines = Math.max(0, Math.min(Math.ceil(o.names.length / perLine), Math.floor(room / lineH) - 1));
      }
      const shown = isStory ? o.names.slice(0, namesLines * perLine) : [];
      const rest = o.names.length - shown.length;
      const namesH = namesLines ? namesLines * lineH + (rest > 0 ? lineH : 0) : 0;

      // slack goes to the two gaps above the continent rows only — the names block
      // was already measured against the base gap below them
      const used = score.bottom + base.g1 + mapH + base.g2 + rowsH + (isStory ? base.g3 + namesH : 0);
      const extra = Math.max(0, (contentBottom - used) / 2);
      const g1 = base.g1 + extra;
      const g2 = base.g2 + extra;
      const g3 = base.g3;

      parts.push(score.svg);

      const mapY = score.bottom + g1;
      parts.push(mapBlock(o, pad, mapY, inner).svg);

      const gapX = pad * 0.6;
      const colW = (inner - gapX * (cfg.cols - 1)) / cfg.cols;
      const regionsTop = mapY + mapH + g2;
      parts.push(regionRows(o, cfg, pad, regionsTop, colW, gapX).svg);

      if (shown.length) {
        let y = regionsTop + rowsH + g3;
        parts.push(`<line x1="${pad}" y1="${r(y)}" x2="${W - pad}" y2="${r(y)}" stroke="${c.ink}" stroke-opacity=".12"/>`);
        y += cfg.reg * 1.9;
        for (let i = 0; i < shown.length; i += perLine) {
          parts.push(
            text(pad, y, shown.slice(i, i + perLine).join('   ·   '), {
              size: cfg.reg * 0.92,
              weight: 500,
              fill: c.ink,
              op: 0.66,
            })
          );
          y += lineH;
        }
        if (rest > 0) {
          parts.push(
            text(pad, y, o.texts.more.replace('{n}', rest), { size: cfg.reg * 0.92, weight: 700, fill: c.accent, op: 0.9 })
          );
        }
      }
    }

    parts.push(text(pad, footY, o.texts.url, { size: cfg.foot, weight: 600, fill: c.ink, op: 0.4 }));
    const markSize = cfg.foot * 1.75;
    parts.push(
      text(W - pad, footY, 'EarthVisited', { size: cfg.foot, weight: 700, fill: c.accent, anchor: 'end', op: 0.85 }),
      logoMark(W - pad - cfg.foot * 7.1 - markSize, footY - markSize * 0.78, markSize, c)
    );
    parts.push('</svg>');
    return parts.join('');
  }

  return { SIZES, build };
})();
