// A* over the agent's own knowledge grid (8 neighbours, no corner cutting). The cost of a move
// comes from the agent (agents.js): unknown cells are assumed open, as in the "free-space
// assumption" of D* Lite style planners, so an agent plans optimistically and re-plans when its
// vision cone reveals that a cell is blocked.

const SQ2 = Math.SQRT2;
const NB = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, SQ2], [1, -1, SQ2], [-1, 1, SQ2], [-1, -1, SQ2]];

let buf = null;
function buffers(N) {
  if (!buf || buf.N !== N) {
    buf = { N, g: new Float32Array(N), from: new Int32Array(N), stamp: new Uint32Array(N), closed: new Uint32Array(N), gen: 0, heap: [], hf: [] };
  }
  return buf;
}

// cost(fromCell, toCell, dx, dy) -> multiplier >= minCost, or Infinity if the move is not allowed.
export function aStar(world, start, goal, cost, { minCost = 1, maxExpand = 80000 } = {}) {
  const { W, H, N } = world;
  if (start < 0 || goal < 0) return null;
  const b = buffers(N);
  const gen = ++b.gen;
  const { g, from, stamp, closed } = b;
  const heap = b.heap; const hf = b.hf; heap.length = 0; hf.length = 0;
  const gx = goal % W, gy = Math.floor(goal / W);
  const h = (c) => { const dx = Math.abs((c % W) - gx), dy = Math.abs(Math.floor(c / W) - gy); return minCost * (Math.max(dx, dy) + (SQ2 - 1) * Math.min(dx, dy)); };
  const push = (c, f) => {
    let i = heap.length; heap.push(c); hf.push(f);
    while (i > 0) { const p = (i - 1) >> 1; if (hf[p] <= f) break; heap[i] = heap[p]; hf[i] = hf[p]; i = p; }
    heap[i] = c; hf[i] = f;
  };
  const pop = () => {
    const top = heap[0]; const lc = heap.pop(); const lf = hf.pop();
    if (heap.length) {
      let i = 0; const n = heap.length;
      for (;;) {
        let l = 2 * i + 1; if (l >= n) break;
        if (l + 1 < n && hf[l + 1] < hf[l]) l++;
        if (hf[l] >= lf) break;
        heap[i] = heap[l]; hf[i] = hf[l]; i = l;
      }
      heap[i] = lc; hf[i] = lf;
    }
    return top;
  };
  stamp[start] = gen; g[start] = 0; from[start] = -1; push(start, h(start));
  let expanded = 0;
  while (heap.length) {
    const c = pop();
    if (closed[c] === gen) continue;
    closed[c] = gen;
    if (c === goal) break;
    if (++expanded > maxExpand) return null;
    const ci = c % W, cj = Math.floor(c / W);
    for (const [di, dj, len] of NB) {
      const ni = ci + di, nj = cj + dj;
      if (ni < 0 || nj < 0 || ni >= W || nj >= H) continue;
      const n = nj * W + ni;
      if (closed[n] === gen) continue;
      const m = cost(c, n, di, dj);
      if (!(m < Infinity)) continue;
      if (di && dj) { // no cutting the corner of a blocked cell
        if (!(cost(c, cj * W + ni, di, 0) < Infinity) || !(cost(c, nj * W + ci, 0, dj) < Infinity)) continue;
      }
      const ng = g[c] + len * m;
      if (stamp[n] !== gen || ng < g[n]) { stamp[n] = gen; g[n] = ng; from[n] = c; push(n, ng + h(n)); }
    }
  }
  if (closed[goal] !== gen) return null;
  const path = [];
  for (let c = goal; c !== -1; c = from[c]) path.push(c);
  path.reverse();
  return { cells: path, cost: g[goal] };
}

// Walk the grid cells under segment a-b (supercover-ish sampling at half a cell).
export function cellsOnSegment(world, ax, ay, bx, by, out = []) {
  out.length = 0;
  const d = Math.hypot(bx - ax, by - ay);
  const n = Math.max(1, Math.ceil(d / (world.cs * 0.5)));
  let last = -2;
  for (let s = 0; s <= n; s++) {
    const c = world.cellOf(ax + ((bx - ax) * s) / n, ay + ((by - ay) * s) / n);
    if (c !== last) { out.push(c); last = c; }
  }
  return out;
}

// Turn a cell path into a few waypoints: drop cells while the straight line stays allowed and
// does not cost more than the cell path it replaces (so helicopters do not cut across land
// to leave a lane). segCost(cells) returns the cost of flying straight over those cells.
export function smoothPath(world, cells, cellCost) {
  if (!cells || cells.length < 3) return (cells || []).map((c) => [world.cx(c), world.cy(c)]);
  const out = [[world.cx(cells[0]), world.cy(cells[0])]];
  const tmp = [];
  let i = 0;
  while (i < cells.length - 1) {
    let j = Math.min(cells.length - 1, i + 40);
    for (; j > i + 1; j--) {
      const ax = world.cx(cells[i]), ay = world.cy(cells[i]), bx = world.cx(cells[j]), by = world.cy(cells[j]);
      const line = cellsOnSegment(world, ax, ay, bx, by, tmp);
      const ux = (bx - ax) / Math.hypot(bx - ax, by - ay), uy = (by - ay) / Math.hypot(bx - ax, by - ay);
      let lc = 0, ok = true;
      for (const c of line) { const m = cellCost(c, ux, uy); if (!(m < Infinity)) { ok = false; break; } lc += m; }
      if (!ok) continue;
      let pc = 0;
      for (let k = i; k <= j; k++) pc += cellCost(cells[k], 0, 0);
      if (lc / line.length <= (pc / (j - i + 1)) * 1.05) break;
    }
    i = j;
    out.push([world.cx(cells[i]), world.cy(cells[i])]);
  }
  return out;
}
