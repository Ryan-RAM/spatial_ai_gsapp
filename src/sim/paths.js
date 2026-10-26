// Path distance: shortest walk along walkable cells (Dijkstra).
// 8 directions, diagonal steps cost sqrt 2, no cutting across a blocked corner, a ladder costs 3.
// Rows of the distance table are computed on demand and cached per source cell.

import { forEachNeighbour } from './world.js';

export function makePathfinder(world) {
  const rows = new Map();
  const M = world.nodes.length;

  function dijkstra(source) {
    const dist = new Float64Array(M).fill(Infinity);
    const heapNode = [];
    const heapDist = [];
    const push = (n, d) => {
      heapNode.push(n);
      heapDist.push(d);
      let i = heapNode.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (heapDist[p] <= heapDist[i]) break;
        [heapNode[p], heapNode[i]] = [heapNode[i], heapNode[p]];
        [heapDist[p], heapDist[i]] = [heapDist[i], heapDist[p]];
        i = p;
      }
    };
    const pop = () => {
      const n = heapNode[0];
      const d = heapDist[0];
      const lastN = heapNode.pop();
      const lastD = heapDist.pop();
      if (heapNode.length) {
        heapNode[0] = lastN;
        heapDist[0] = lastD;
        let i = 0;
        for (;;) {
          const l = 2 * i + 1;
          const r = l + 1;
          let m = i;
          if (l < heapNode.length && heapDist[l] < heapDist[m]) m = l;
          if (r < heapNode.length && heapDist[r] < heapDist[m]) m = r;
          if (m === i) break;
          [heapNode[m], heapNode[i]] = [heapNode[i], heapNode[m]];
          [heapDist[m], heapDist[i]] = [heapDist[i], heapDist[m]];
          i = m;
        }
      }
      return [n, d];
    };
    dist[world.nodeIndex[source]] = 0;
    push(source, 0);
    while (heapNode.length) {
      const [n, d] = pop();
      if (d > dist[world.nodeIndex[n]]) continue;
      forEachNeighbour(world, n, (m, cost) => {
        const mi = world.nodeIndex[m];
        const nd = d + cost;
        if (nd < dist[mi] - 1e-9) { dist[mi] = nd; push(m, nd); }
      });
    }
    return dist;
  }

  // Path distances from `source` to every walkable cell (indexed by world.nodeIndex).
  function row(source) {
    let r = rows.get(source);
    if (!r) { r = dijkstra(source); rows.set(source, r); }
    return r;
  }

  const distance = (a, b) => row(b)[world.nodeIndex[a]];

  // The cell list of a shortest path from a to b (both included).
  function path(a, b) {
    const toB = row(b);
    const out = [a];
    let cur = a;
    let guard = 0;
    while (cur !== b && guard++ < 10000) {
      let best = -1;
      let bestVal = Infinity;
      forEachNeighbour(world, cur, (m, cost) => {
        const v = cost + toB[world.nodeIndex[m]];
        if (v < bestVal - 1e-9) { bestVal = v; best = m; }
      });
      if (best < 0) break;
      out.push(best);
      cur = best;
    }
    return out;
  }

  // First step of a shortest path from a to b.
  function nextStep(a, b) {
    if (a === b) return a;
    const toB = row(b);
    let best = a;
    let bestVal = Infinity;
    forEachNeighbour(world, a, (m, cost) => {
      const v = cost + toB[world.nodeIndex[m]];
      if (v < bestVal - 1e-9) { bestVal = v; best = m; }
    });
    return best;
  }

  return { row, distance, path, nextStep };
}
