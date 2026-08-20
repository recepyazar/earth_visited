/* EarthVisited — share card renderer.
   Pure presentation: app.js hands over already-computed numbers, strings and
   colours, this returns an SVG string sized for a social platform.

   EarthCard.build({ size, world, marks, levels, stats, regions, names, texts, colors })
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
    const levelColor = new Map(o.levels.map((l) => [l.id, l.color]));
    const ps = o.world.ps || 1;

    // paths come baked at ps x this space, so they get their own scaled group;
    // the stroke width has to be pre-multiplied to stay a hairline after scaling
    const pathStroke = ` stroke="${c.ocean}" stroke-width="${r((0.5 * ps) / k)}"`;
    out.push(`<g transform="scale(${r(1 / ps)})">`);
    for (const d of o.world.decor) out.push(`<path d="${d}" fill="${c.land}" opacity=".5"/>`);
    for (const f of o.world.f) {
      if (!f.d) continue;
      // in the province card the countries stay plain: the colour belongs to the
      // provinces drawn over them
      const fill = o.subs ? c.land : levelColor.get(o.marks.get(f.c)) || c.land;
      out.push(`<path d="${f.d}" fill="${fill}"${pathStroke}/>`);
    }
    out.push('</g>');

    // marked provinces, over their countries and at their own scale
    if (o.subs && o.subs.shapes.length) {
      out.push(`<g transform="scale(${r(1 / (o.subs.ps || 1))})">`);
      for (const shape of o.subs.shapes) {
        out.push(`<path d="${shape.d}" fill="${levelColor.get(shape.lv) || c.land}"${pathStroke}/>`);
      }
      out.push('</g>');
    }

    const dotStroke = ` stroke="${c.ocean}" stroke-width="${r(0.5 / k)}"`;
    for (const f of o.world.f) {
      if (f.a >= 6) continue;
      const fill = o.subs ? c.land : levelColor.get(o.marks.get(f.c)) || c.land;
      out.push(`<circle cx="${f.x}" cy="${f.y}" r="${r(Math.max(2.6, 3.6 / k))}" fill="${fill}"${dotStroke}/>`);
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
      // digit advance is ~0.6em in the bold system face; add a little breathing room
      text(x + String(s.sov).length * cfg.num * 0.62 + cfg.num * 0.08, numY, `/ ${s.total}`, {
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

    // land + population coverage, side by side under the headline
    let extrasBottom = subY;
    if (o.extras && o.extras.length) {
      const size = cfg.title * 0.78;
      const gap = cfg.title * 0.7;
      const colW = (width - gap * (o.extras.length - 1)) / o.extras.length;
      const top = subY + cfg.title * 1.5;
      o.extras.forEach((ex, i) => {
        const ex0 = x + i * (colW + gap);
        out.push(text(ex0, top, ex.label.toUpperCase(), { size: size * 0.72, weight: 700, fill: c.ink, op: 0.45 }));
        out.push(text(ex0, top + size * 1.5, ex.value, { size: size * 1.35, weight: 800, fill: c.ink, op: 0.92 }));
        const barY = top + size * 2.1;
        const barH = size * 0.34;
        out.push(
          `<rect x="${r(ex0)}" y="${r(barY)}" width="${r(colW * 0.85)}" height="${r(barH)}" rx="${r(barH / 2)}" fill="${c.ink}" opacity=".12"/>`
        );
        if (ex.ratio > 0.004) {
          out.push(
            `<rect x="${r(ex0)}" y="${r(barY)}" width="${r(colW * 0.85 * Math.min(1, ex.ratio))}" height="${r(barH)}" rx="${r(barH / 2)}" fill="${c.on}"/>`
          );
        }
        out.push(text(ex0, barY + barH + size * 1.15, ex.sub, { size: size * 0.8, weight: 500, fill: c.ink, op: 0.5 }));
        extrasBottom = Math.max(extrasBottom, barY + barH + size * 1.15);
      });
    }

    return { svg: out.join(''), bottom: extrasBottom };
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

  // Only worth drawing when more than one level is in play.
  function legendRow(o, cfg, x, top, width) {
    const used = o.levels.filter((l) => l.count > 0);
    if (used.length < 2) return { svg: '', h: 0 };
    const size = cfg.reg * 0.92;
    const gap = width / used.length;
    const svg = used
      .map((l, i) => {
        const lx = x + i * gap;
        const box = size * 0.82;
        return (
          `<rect x="${r(lx)}" y="${r(top - box * 0.85)}" width="${r(box)}" height="${r(box)}" rx="${r(box * 0.28)}" fill="${l.color}"/>` +
          text(lx + box * 1.5, top, `${l.label} ${l.count}`, { size, weight: 600, fill: o.colors.ink, op: 0.78 })
        );
      })
      .join('');
    return { svg, h: size * 2.1 };
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
      const mapX = pad * 2 + colW;
      const mapW = W - pad * 3 - colW;
      const mapH = mapW * CROP_RATIO;
      const legend = legendRow(o, cfg, mapX, 0, mapW);
      // the legend rides under the map, where the side layout has room to spare
      const mapY = (H - mapH - legend.h) / 2;
      parts.push(mapBlock(o, mapX, mapY, mapW).svg);
      if (legend.h) parts.push(legendRow(o, cfg, mapX, mapY + mapH + cfg.reg * 1.5, mapW).svg);

      const score = scoreBlock(o, cfg, pad, pad, colW, false);
      parts.push(score.svg);

      const rowsH = o.regions.length * cfg.reg * 1.95;
      const regionsTop = Math.max(score.bottom + cfg.title * 1.4, footY - cfg.foot * 2 - rowsH);
      parts.push(regionRows(o, cfg, pad, regionsTop, colW, 0).svg);
    } else {
      const inner = W - pad * 2;
      const isStory = o.size === 'story' && o.names.length > 0;
      const contentBottom = footY - cfg.foot * 3.4;
      const lineH = cfg.reg * 1.6;
      const perLine = 3;

      const score = scoreBlock(o, cfg, pad, pad, inner, true);
      const rowCount = Math.ceil(o.regions.length / cfg.cols);
      const rowsH = rowCount * cfg.reg * 2.1;

      // the map takes whatever height is left, so adding a stat block can never
      // push the continent rows onto the footer
      const base = { g1: cfg.title * 1.4, g2: cfg.reg * 1.6, g3: cfg.reg * 1.9 };
      const legend = legendRow(o, cfg, pad, 0, inner);
      const roomForMap = contentBottom - (score.bottom + base.g1 + base.g2 + rowsH + legend.h);
      const mapW = Math.min(inner, Math.max(inner * 0.5, roomForMap / CROP_RATIO));
      const mapH = mapW * CROP_RATIO;
      const mapX = pad + (inner - mapW) / 2;

      // then hand any leftover height back to the gaps so the card fills its canvas
      // instead of stacking everything against the top edge
      let namesLines = 0;
      if (isStory) {
        const room = contentBottom - (score.bottom + base.g1 + mapH + base.g2 + rowsH + legend.h + base.g3);
        namesLines = Math.max(0, Math.min(Math.ceil(o.names.length / perLine), Math.floor(room / lineH) - 1));
      }
      const shown = isStory ? o.names.slice(0, namesLines * perLine) : [];
      const rest = o.names.length - shown.length;
      const namesH = namesLines ? namesLines * lineH + (rest > 0 ? lineH : 0) : 0;

      // slack goes to the two gaps above the continent rows only — the names block
      // was already measured against the base gap below them
      const used = score.bottom + base.g1 + mapH + base.g2 + rowsH + legend.h + (isStory ? base.g3 + namesH : 0);
      const extra = Math.max(0, (contentBottom - used) / 2);
      const g1 = base.g1 + extra;
      const g2 = base.g2 + extra;
      const g3 = base.g3;

      parts.push(score.svg);

      const mapY = score.bottom + g1;
      parts.push(mapBlock(o, mapX, mapY, mapW).svg);

      const gapX = pad * 0.6;
      const colW = (inner - gapX * (cfg.cols - 1)) / cfg.cols;
      const regionsTop = mapY + mapH + g2;
      parts.push(regionRows(o, cfg, pad, regionsTop, colW, gapX).svg);
      if (legend.h) parts.push(legendRow(o, cfg, pad, regionsTop + rowsH + cfg.reg * 0.8, inner).svg);

      if (shown.length) {
        let y = regionsTop + rowsH + legend.h + g3;
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
