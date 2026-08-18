/* The three d3-array helpers d3-geo asks for, so the vendored d3-geo build can
   run without pulling in the whole array package. Must load before d3-geo. */
(function (global) {
  const d3 = (global.d3 = global.d3 || {});

  d3.range = function (start, stop, step) {
    start = +start;
    stop = +stop;
    step = (n = arguments.length) < 2 ? ((stop = start), (start = 0), 1) : n < 3 ? 1 : +step;
    var n, i = -1, m = Math.max(0, Math.ceil((stop - start) / step)) | 0, out = new Array(m);
    while (++i < m) out[i] = start + i * step;
    return out;
  };

  d3.merge = function (arrays) {
    const out = [];
    for (const a of arrays) for (const v of a) out.push(v);
    return out;
  };

  // Neumaier compensated summation — d3-geo accumulates spherical areas with it
  d3.Adder = class Adder {
    constructor() { this._sum = 0; this._err = 0; }
    add(x) {
      const t = this._sum + x;
      this._err += Math.abs(this._sum) >= Math.abs(x) ? this._sum - t + x : x - t + this._sum;
      this._sum = t;
      return this;
    }
    valueOf() { return this._sum + this._err; }
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
