// The three distances of the project and a sampled check of the metric axioms.
//   Euclidean distance  : straight 3D line between two eye points, passes through everything.
//   Path distance       : shortest walk around obstacles and via ladders (see paths.js).
//   Perceptual distance : Euclidean distance between two visibility fingerprints.

import { eyePoint } from './los.js';
import { fingerprint } from './rays.js';
import { makeRng } from './rng.js';

export function makeMetrics(world, rays, pathfinder) {
  function euclidean(a, b) {
    const p = eyePoint(world, a);
    const q = eyePoint(world, b);
    return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
  }
  const path = (a, b) => pathfinder.distance(a, b);
  function perceptual(a, b) {
    const fa = fingerprint(world, rays, a);
    const fb = fingerprint(world, rays, b);
    let s = 0;
    for (let i = 0; i < fa.length; i++) { const d = fa[i] - fb[i]; s += d * d; }
    return Math.sqrt(s);
  }
  return { euclidean, path, perceptual };
}

// Typical spread of each distance over random pairs, used to word the hints.
export function sampleQuantiles(world, metrics, name, count = 3000, seed = 7) {
  const rng = makeRng(seed);
  const vals = [];
  for (let k = 0; k < count; k++) {
    const a = rng.pick(world.nodes);
    const b = rng.pick(world.nodes);
    if (a !== b) vals.push(metrics[name](a, b));
  }
  vals.sort((x, y) => x - y);
  return (q) => vals[Math.min(vals.length - 1, Math.floor(q * vals.length))];
}

// Checks non-negativity, symmetry, the triangle inequality (on random triples) and the
// identity of indiscernibles (d = 0 exactly when the two positions are the same cell).
export function checkAxioms(world, rays, metrics, { triples = 4000, seed = 11 } = {}) {
  const rng = makeRng(seed);
  const eps = 1e-6;
  const names = ['euclidean', 'path', 'perceptual'];
  const results = {};
  for (const name of names) {
    const d = metrics[name];
    let negative = 0;
    let asymmetric = 0;
    let triangle = 0;
    let selfNonZero = 0;
    let worstTriangle = 0;
    for (let k = 0; k < triples; k++) {
      const a = rng.pick(world.nodes);
      const b = rng.pick(world.nodes);
      const c = rng.pick(world.nodes);
      const ab = d(a, b);
      const ba = d(b, a);
      const bc = d(b, c);
      const ac = d(a, c);
      if (ab < 0 || bc < 0 || ac < 0) negative++;
      if (Math.abs(ab - ba) > eps) asymmetric++;
      const excess = ac - (ab + bc);
      if (excess > eps) { triangle++; worstTriangle = Math.max(worstTriangle, excess); }
      if (d(a, a) > eps) selfNonZero++;
    }
    results[name] = { triples, negative, asymmetric, triangle, worstTriangle, selfNonZero };
  }

  // d = 0 for two different cells. Euclidean and path distance can only be 0 for the same cell;
  // for the perceptual distance we look for identical fingerprints over every cell of the map.
  results.euclidean.zeroPairs = 0;
  results.path.zeroPairs = 0;
  const groups = new Map();
  for (const n of world.nodes) {
    const key = Array.from(fingerprint(world, rays, n), (v) => v.toFixed(5)).join(',');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(n);
  }
  let zeroPairs = 0;
  const twins = [];
  for (const g of groups.values()) {
    if (g.length > 1) {
      zeroPairs += (g.length * (g.length - 1)) / 2;
      twins.push(g);
    }
  }
  results.perceptual.zeroPairs = zeroPairs;
  results.perceptual.twinGroups = twins;

  // Smallest perceptual distance between two different cells (all pairs), to show how close
  // "almost identical" places get even when no two are exactly identical.
  let minPair = { d: Infinity, a: -1, b: -1 };
  const R = rays.R;
  const L = rays.lengths;
  const M = world.nodes.length;
  for (let i = 0; i < M; i++) {
    for (let j = i + 1; j < M; j++) {
      let s = 0;
      for (let r = 0; r < R && s < minPair.d * minPair.d; r++) { const v = L[i * R + r] - L[j * R + r]; s += v * v; }
      if (s < minPair.d * minPair.d) minPair = { d: Math.sqrt(s), a: world.nodes[i], b: world.nodes[j] };
    }
  }
  results.perceptual.closestDistinct = minPair;
  results.cells = world.nodes.length;
  return results;
}
