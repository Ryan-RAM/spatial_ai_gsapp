// Travel time d_T on an agent kind's own walk graph (semantic model §6.3). Ported from
// 20261022_distance/src/sim/paths.js (Dijkstra over walkable cells, 8 directions, no cutting a
// blocked corner), now with:
//   - the time to cross between two cells, length / (v0 x f_cover x f_snow x f_slope), where
//     f_cover and f_snow are the mean of the two cells and f_slope is Tobler's hiking function,
//     normalised to 1 on the flat: asymmetric, so d_T(a->b) != d_T(b->a) on a slope
//   - one graph per agent kind (survivor, creature), cached (CLAUDE.md §3)
//   - A* with a binary heap on typed arrays, and reusable buffers (no allocation per search)
//   - an optional snow-depth layer (cm) and an extra per-cell cost (light for the creature,
//     danger for a survivor, interventions) supplied by the caller
// No DOM.

const N8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
const TOBLER_FLAT = Math.exp(-3.5 * 0.05);
// Tobler (1993): 6 exp(-3.5 |S + 0.05|) km/h, normalised to 1 on flat ground; fastest at S = -0.05
export const toblerFactor = (slope) => Math.exp(-3.5 * Math.abs(slope + 0.05)) / TOBLER_FLAT;
export const TOBLER_MAX = 1 / TOBLER_FLAT; // the factor at S = -0.05

export function makeWalker(world, kind, config) {
  const { W, H, n, s } = world;
  const v0 = config[kind].speed;
  const coverSpeed = config.coverSpeed[kind];
  const base = new Float32Array(n); // f_cover per cell, 0 = impassable
  for (let k = 0; k < n; k++) base[k] = coverSpeed[world.cover[k]] ?? 0;
  const half = config.snowHalfDepthCm; const ex = config[kind].snowExponent;
  const snowF = (cm) => (1 / (1 + cm / half)) ** ex;
  const maxCover = Math.max(...coverSpeed);
  const vmax = v0 * maxCover * TOBLER_MAX;

  // reusable search buffers; `stamp` marks which entries belong to the current search
  const g = new Float64Array(n); const prev = new Int32Array(n); const stamp = new Uint32Array(n); const closed = new Uint32Array(n);
  let run = 0;
  const heapK = new Int32Array(n * 2); const heapF = new Float64Array(n * 2); let size = 0;
  const push = (k, f) => { let c = size++; heapK[c] = k; heapF[c] = f; while (c > 0) { const p = (c - 1) >> 1; if (heapF[p] <= heapF[c]) break; const tk = heapK[p]; heapK[p] = heapK[c]; heapK[c] = tk; const tf = heapF[p]; heapF[p] = heapF[c]; heapF[c] = tf; c = p; } };
  const pop = () => {
    const k = heapK[0]; size--; heapK[0] = heapK[size]; heapF[0] = heapF[size]; let c = 0;
    for (;;) { const l = 2 * c + 1; const r = l + 1; let m = c; if (l < size && heapF[l] < heapF[m]) m = l; if (r < size && heapF[r] < heapF[m]) m = r; if (m === c) break; const tk = heapK[m]; heapK[m] = heapK[c]; heapK[c] = tk; const tf = heapF[m]; heapF[m] = heapF[c]; heapF[c] = tf; c = m; }
    return k;
  };

  // seconds to step from cell a to its neighbour b, or Infinity
  function stepTime(a, b, diag, snow, extra) {
    const fa = base[a]; const fb = base[b]; if (!fb || !fa) return Infinity;
    let f = (fa + fb) / 2;
    if (snow) f *= (snowF(snow[a]) + snowF(snow[b])) / 2;
    const L = diag ? s * Math.SQRT2 : s;
    const t = L / (v0 * f * toblerFactor((world.z[b] - world.z[a]) / L));
    return extra ? t + extra[b] : t;
  }

  // Single-source shortest times (to a target if given: A*, else the whole field: Dijkstra).
  // opts: { snow: Float32Array cm, extra: Float32Array seconds per entered cell, maxTime }
  function search(from, to = -1, opts = {}) {
    const { snow = null, extra = null, maxTime = Infinity } = opts;
    run++; size = 0;
    const tx = to >= 0 ? to % W : 0; const ty = to >= 0 ? (to - tx) / W : 0;
    const hfun = to >= 0 ? (k) => { const i = k % W; const j = (k - i) / W; return Math.hypot(i - tx, j - ty) * s / vmax; } : () => 0;
    g[from] = 0; prev[from] = -1; stamp[from] = run; push(from, hfun(from));
    while (size) {
      const k = pop(); if (closed[k] === run) continue; closed[k] = run;
      if (k === to) break;
      if (g[k] > maxTime) break;
      const i = k % W; const j = (k - i) / W;
      for (let d = 0; d < 8; d++) {
        const di = N8[d][0]; const dj = N8[d][1]; const ni = i + di; const nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= W || nj >= H) continue;
        const m = nj * W + ni; if (closed[m] === run || !base[m]) continue;
        const diag = di !== 0 && dj !== 0;
        if (diag && (!base[j * W + ni] || !base[nj * W + i])) continue; // no cutting a blocked corner
        const t = g[k] + stepTime(k, m, diag, snow, extra);
        if (stamp[m] !== run || t < g[m]) { g[m] = t; prev[m] = k; stamp[m] = run; push(m, t + hfun(m)); }
      }
    }
    return run;
  }
  const timeTo = (k, r) => (stamp[k] === r && closed[k] === r ? g[k] : stamp[k] === r ? g[k] : Infinity);
  function path(to, r) {
    if (stamp[to] !== r) return null;
    const out = []; for (let k = to; k !== -1; k = prev[k]) out.push(k); return out.reverse();
  }

  // d_T(a -> b) in seconds
  function travelTime(a, b, opts) { const r = search(a, b, opts); return closed[b] === r ? g[b] : Infinity; }
  function route(a, b, opts) { const r = search(a, b, opts); return closed[b] === r ? { time: g[b], cells: path(b, r) } : null; }
  // the whole field from a source (Dijkstra): a Float32Array of seconds
  function field(a, opts) {
    const r = search(a, -1, opts); const out = new Float32Array(n).fill(Infinity);
    for (let k = 0; k < n; k++) if (closed[k] === r) out[k] = g[k];
    return out;
  }
  return { kind, base, passable: (k) => base[k] > 0, stepTime, travelTime, route, field, timeTo, v0, vmax };
}

// one walker per agent kind and world, cached
const cache = new WeakMap();
export function walkerFor(world, kind, config) {
  if (!cache.has(world)) cache.set(world, {});
  const c = cache.get(world); return (c[kind] ??= makeWalker(world, kind, config));
}
