/* EarthVisited — globe view.
   Draws the same countries on a rotatable sphere, on a canvas, using the vendored
   d3-geo. Everything it needs from the app arrives through mount():

     Globe.mount(canvas, {
       colorOf(code), dimmed(code), isMarked(code), markerCodes,
       onPick(code), onHover(code|null), palette()
     })

   js/globe-data.js holds lon/lat rings (delta-encoded hundredths of a degree),
   loaded on demand — the flat map never pays for it.
*/
window.Globe = (() => {
  'use strict';

  const MIN_SCALE = 0.9;
  const MAX_SCALE = 12;
  const DRAG_SLOP = 4;

  let canvas = null;
  let ctx = null;
  let opts = null;
  let projection = null;
  let path = null;
  let graticule = null;
  let sphere = { type: 'Sphere' };

  let features = []; // { code, feature }
  let byCode = new Map();
  let centroids = {};
  let subs = []; // { code, country, feature } — provinces, when that grain is on
  let subsByCountry = new Map();
  let sharp = 0; // the borders pass is expensive, so it waits for a still globe

  let rotation = [-25, -20, 0];
  let zoom = 1;
  let frame = 0;
  let pointers = new Map();
  let dragged = 0;
  let pressCode = null;
  let pressIsSub = false;
  let pinch = null;
  let hoverEvent = null;
  let hoverFrame = 0;

  /* ---------- data ---------- */
  function decodeRing(str) {
    const nums = str.split(',');
    const ring = new Array(nums.length / 2);
    let x = 0;
    let y = 0;
    for (let i = 0, j = 0; i < nums.length; i += 2, j++) {
      x += +nums[i];
      y += +nums[i + 1];
      ring[j] = [x / 100, y / 100];
    }
    return ring;
  }

  function build(data) {
    features = [];
    byCode = new Map();
    centroids = data.at || {};
    for (const [code, polys] of Object.entries(data.polys)) {
      const feature = {
        type: 'Feature',
        properties: { code },
        geometry: { type: 'MultiPolygon', coordinates: polys.map((rings) => rings.map(decodeRing)) },
      };
      features.push({ code, feature });
      byCode.set(code, feature);
    }
  }

  /* ---------- layout ---------- */
  function resize() {
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(2.5, window.devicePixelRatio || 1);
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const radius = (Math.min(rect.width, rect.height) / 2 - 6) * zoom;
    projection.scale(radius).translate([rect.width / 2, rect.height / 2]);
    render(true);
  }

  function radiusNow() {
    const rect = canvas.getBoundingClientRect();
    return (Math.min(rect.width, rect.height) / 2 - 6) * zoom;
  }

  /* ---------- drawing ---------- */
  function render(quality) {
    if (!ctx || !projection) return;
    frame = 0;
    const rect = canvas.getBoundingClientRect();
    const c = opts.palette();
    projection.rotate(rotation).scale(radiusNow()).translate([rect.width / 2, rect.height / 2]);

    ctx.clearRect(0, 0, rect.width, rect.height);

    // ocean
    ctx.beginPath();
    path(sphere);
    ctx.fillStyle = c.ocean;
    ctx.fill();

    // graticule, faint
    ctx.beginPath();
    path(graticule);
    ctx.strokeStyle = c.border;
    ctx.globalAlpha = 0.25;
    ctx.lineWidth = 0.5;
    ctx.stroke();
    ctx.globalAlpha = 1;

    // countries — plain while the provinces are the subject
    const onSubs = opts.grain && opts.grain() === 'sub' && subs.length;
    for (const { code, feature } of features) {
      const dim = opts.dimmed(code);
      ctx.beginPath();
      path(feature);
      ctx.globalAlpha = dim ? 0.22 : 1;
      ctx.fillStyle = (onSubs ? null : opts.colorOf(code)) || c.land;
      ctx.fill();
      ctx.strokeStyle = c.border;
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    if (onSubs) {
      // the ones you have marked, always; every border only once the globe is still,
      // because four and a half thousand of them is too much for a drag frame
      for (const { code, feature } of subs) {
        const fill = opts.subColor(code);
        if (!fill) continue;
        ctx.beginPath();
        path(feature);
        ctx.fillStyle = fill;
        ctx.fill();
        ctx.strokeStyle = c.border;
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }
      if (quality) {
        ctx.beginPath();
        for (const { code, feature } of subs) {
          if (opts.subColor(code)) continue; // already drawn, with its own fill
          path(feature);
        }
        ctx.strokeStyle = c.border;
        ctx.globalAlpha = 0.55;
        ctx.lineWidth = 0.4;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }

    // dots for countries too small to see at this size
    const dotR = 3;
    for (const code of opts.markerCodes) {
      const at = centroids[code];
      if (!at || !visible(at)) continue;
      const [x, y] = projection(at);
      ctx.beginPath();
      ctx.arc(x, y, dotR, 0, Math.PI * 2);
      ctx.globalAlpha = opts.dimmed(code) ? 0.22 : opts.isMarked(code) ? 1 : 0.62;
      ctx.fillStyle = opts.colorOf(code) || c.land;
      ctx.fill();
      ctx.strokeStyle = c.border;
      ctx.lineWidth = 0.6;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // limb, so the sphere reads as a ball against the page
    ctx.beginPath();
    path(sphere);
    ctx.strokeStyle = c.line;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  function schedule() {
    if (!frame) frame = requestAnimationFrame(() => render(false));
    // and once nothing has moved for a moment, draw the expensive pass
    clearTimeout(sharp);
    sharp = setTimeout(() => render(true), 180);
  }

  // is this lon/lat on the side facing us?
  function visible([lon, lat]) {
    const [l0, p0] = rotation;
    const λ = ((lon + l0) * Math.PI) / 180;
    const φ = (lat * Math.PI) / 180;
    const φ0 = (-p0 * Math.PI) / 180;
    return Math.sin(φ0) * Math.sin(φ) + Math.cos(φ0) * Math.cos(φ) * Math.cos(λ) > 0;
  }

  /* ---------- hit testing ---------- */
  function pick(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;

    // markers first: they are drawn on top and are the only way to hit micro-states
    let best = null;
    let bestDist = 12 * 12;
    for (const code of opts.markerCodes) {
      const at = centroids[code];
      if (!at || !visible(at) || opts.dimmed(code)) continue;
      const [mx, my] = projection(at);
      const d = (mx - x) ** 2 + (my - y) ** 2;
      if (d < bestDist) {
        bestDist = d;
        best = code;
      }
    }
    if (best) return best;

    const ll = projection.invert([x, y]);
    if (!ll || !Number.isFinite(ll[0])) return null;
    for (const { code, feature } of features) {
      if (opts.dimmed(code)) continue;
      if (d3.geoContains(feature, ll)) return code;
    }
    return null;
  }

  // which province is under this point — only the open country's are tried
  function pickSub(clientX, clientY) {
    if (!subs.length) return null;
    const rect = canvas.getBoundingClientRect();
    const ll = projection.invert([clientX - rect.left, clientY - rect.top]);
    if (!ll || !Number.isFinite(ll[0])) return null;
    const country = pick(clientX, clientY);
    const list = subsByCountry.get(country) || subs;
    for (const { code, feature } of list) {
      if (d3.geoContains(feature, ll)) return code;
    }
    return null;
  }

  function setSubs(list) {
    subs = list || [];
    subsByCountry = new Map();
    for (const entry of subs) {
      const group = subsByCountry.get(entry.country);
      if (group) group.push(entry);
      else subsByCountry.set(entry.country, [entry]);
    }
    schedule();
  }

  /* ---------- interaction ---------- */
  function onDown(e) {
    pointers.set(e.pointerId, e);
    dragged = 0;
    const onSubs = opts.grain && opts.grain() === 'sub' && subs.length;
    pressCode = pointers.size === 1 ? (onSubs ? pickSub(e.clientX, e.clientY) : pick(e.clientX, e.clientY)) : null;
    pressIsSub = onSubs;
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { dist: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), zoom };
    }
  }

  function onMove(e) {
    if (!pointers.has(e.pointerId)) {
      // point-in-polygon over every country is too much per mouse move: once a frame
      if (!pointers.size && opts.onHover) {
        hoverEvent = { clientX: e.clientX, clientY: e.clientY };
        if (!hoverFrame) {
          hoverFrame = requestAnimationFrame(() => {
            hoverFrame = 0;
            if (!hoverEvent || !canvas) return;
            const onSubs = opts.grain && opts.grain() === 'sub' && subs.length;
            if (onSubs && opts.onHoverSub) opts.onHoverSub(pickSub(hoverEvent.clientX, hoverEvent.clientY), hoverEvent);
            else opts.onHover(pick(hoverEvent.clientX, hoverEvent.clientY), hoverEvent);
          });
        }
      }
      return;
    }
    const prev = pointers.get(e.pointerId);
    pointers.set(e.pointerId, e);

    if (pointers.size === 2 && pinch) {
      const [a, b] = [...pointers.values()];
      const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      zoom = Math.min(MAX_SCALE, Math.max(MIN_SCALE, (pinch.zoom * dist) / pinch.dist));
      dragged = 99;
      schedule();
      return;
    }

    const dx = e.clientX - prev.clientX;
    const dy = e.clientY - prev.clientY;
    dragged += Math.abs(dx) + Math.abs(dy);
    if (dragged > DRAG_SLOP) {
      canvas.classList.add('dragging');
      if (!canvas.hasPointerCapture(e.pointerId)) canvas.setPointerCapture(e.pointerId);
    }
    // degrees per pixel shrinks as you zoom in, so dragging stays proportional
    const k = 90 / radiusNow();
    rotation = [rotation[0] + dx * k, Math.max(-90, Math.min(90, rotation[1] - dy * k)), rotation[2]];
    schedule();
  }

  function onUp(e) {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (!pointers.size) canvas.classList.remove('dragging');
    if (e.type === 'pointerup' && pressCode && dragged <= DRAG_SLOP) {
      (pressIsSub ? opts.onPickSub : opts.onPick)(pressCode);
    }
    pressCode = null;
  }

  function onWheel(e) {
    e.preventDefault();
    zoom = Math.min(MAX_SCALE, Math.max(MIN_SCALE, zoom * Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.002))));
    schedule();
  }

  /* ---------- api ---------- */
  function mount(el, options) {
    canvas = el;
    opts = options;
    ctx = canvas.getContext('2d');
    if (!features.length) build(window.GLOBE_DATA);

    projection = d3.geoOrthographic().clipAngle(90).precision(0.4);
    path = d3.geoPath(projection, ctx);
    graticule = d3.geoGraticule10();

    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('pointerleave', () => {
      hoverEvent = null;
      if (opts.onHover) opts.onHover(null);
    });
    canvas.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('resize', resize);
    resize();
  }

  function unmount() {
    if (!canvas) return;
    window.removeEventListener('resize', resize);
    canvas.replaceWith(canvas.cloneNode(false)); // drops every listener in one go
    canvas = ctx = opts = null;
  }

  function spinTo(code, factor) {
    const at = centroids[code];
    if (!at) return;
    rotation = [-at[0], -at[1], 0];
    if (factor) zoom = Math.min(MAX_SCALE, Math.max(MIN_SCALE, factor));
    schedule();
  }

  function reset() {
    zoom = 1;
    schedule();
  }

  function zoomBy(factor) {
    zoom = Math.min(MAX_SCALE, Math.max(MIN_SCALE, zoom * factor));
    schedule();
  }

  return { mount, unmount, setSubs, render: schedule, resize, spinTo, reset, zoomBy, pick, get mounted() { return !!canvas; } };
})();
