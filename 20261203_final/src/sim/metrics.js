// The four distances of semantic model §6, each with its own metric, and a sampled check of the
// metric axioms. Ported from 20261022_distance/src/sim/metrics.js (makeMetrics, checkAxioms),
// with the new distances and with the size of the asymmetry reported, not only its count.
//   d_E  Euclidean, 3D, between eye points                        sight          metric
//   d_A  acoustic: (d_E + muffling + m_snow) x (1 - w cos theta)   hearing        not symmetric with wind
//   d_T  travel time on the agent kind's own walk graph            moving         quasimetric (slopes)
//   d_V  visibility fingerprint difference                         sense of place pseudometric
// Positions are cells; weather is a storm-clock state (src/sim/storm.js). No DOM.

import { eyeAt, segmentMuffling } from './los.js';
import { walkerFor } from './paths.js';
import { perceptualDistance } from './fingerprints.js';
import { makeRng } from './rng.js';

const DEG = Math.PI / 180;

export function euclidean(world, a, b) {
  const p = eyeAt(world, ...world.center(a)); const q = eyeAt(world, ...world.center(b));
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}

// §6.2. theta: the angle between the direction the wind blows TOWARD and a -> b; downwind sound
// carries farther (a smaller acoustic distance).
export function acoustic(world, config, a, b, weather = null) {
  const p = eyeAt(world, ...world.center(a)); const q = eyeAt(world, ...world.center(b));
  const dE = Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
  const m = segmentMuffling(world, p, q); const M = config.muffling;
  const muffle = m.trunks * M.trunk + m.crowns * M.crown + m.structureM * M.structurePerM + m.groundM * M.groundPerM;
  const snow = weather ? M.snowFactor * weather.snowRateCmH * dE / 10 : 0;
  let wind = 1;
  if (weather && dE > 1e-9) {
    const w = M.windMax * Math.min(weather.windMs / 10, 1);
    const tx = Math.sin(weather.windToDeg * DEG); const ty = Math.cos(weather.windToDeg * DEG);
    const cos = ((q[0] - p[0]) * tx + (q[1] - p[1]) * ty) / Math.hypot(q[0] - p[0], q[1] - p[1]) || 0;
    wind = 1 - w * cos;
  }
  return (dE + muffle + snow) * wind;
}

// The hearing threshold in gusts (§6.2): wind noise masks sound.
export const hearingThreshold = (config, H, weather) => H * Math.max(0.4, 1 - config.gustMask * (weather?.gustKt ?? 0));

export function makeMetrics(world, config) {
  return {
    euclidean: (a, b) => euclidean(world, a, b),
    acoustic: (a, b, weather) => acoustic(world, config, a, b, weather),
    travel: (kind, a, b, opts) => walkerFor(world, kind, config).travelTime(a, b, opts),
    perceptual: (a, b) => perceptualDistance(world, a, b),
  };
}

// Non-negativity, identity, symmetry and the triangle inequality on random triples of cells.
// `d` is a function (a, b) -> distance; `cells` the cells to draw from. Reports counts and the
// largest relative asymmetry |d(a,b) - d(b,a)| / max(d(a,b), d(b,a)).
export function checkAxioms(d, cells, { triples = 300, seed = 11, eps = 1e-6 } = {}) {
  const rng = makeRng(seed);
  const r = { triples, negative: 0, selfNonZero: 0, asymmetric: 0, maxAsymmetry: 0, meanAsymmetry: 0, triangle: 0, worstTriangle: 0, zeroApart: 0 };
  let asymSum = 0;
  for (let k = 0; k < triples; k++) {
    const a = rng.pick(cells); const b = rng.pick(cells); const c = rng.pick(cells);
    const ab = d(a, b); const ba = d(b, a); const bc = d(b, c); const ac = d(a, c);
    if ([ab, ba, bc, ac].some((v) => v < -eps)) r.negative++;
    if (d(a, a) > eps) r.selfNonZero++;
    if (a !== b && ab <= eps) r.zeroApart++;
    if (Number.isFinite(ab) && Number.isFinite(ba)) {
      const asym = Math.abs(ab - ba) / Math.max(ab, ba, eps);
      if (asym > 1e-6) r.asymmetric++;
      r.maxAsymmetry = Math.max(r.maxAsymmetry, asym); asymSum += asym;
    }
    if (Number.isFinite(ac) && ac > ab + bc + eps) { r.triangle++; r.worstTriangle = Math.max(r.worstTriangle, ac - ab - bc); }
  }
  r.meanAsymmetry = asymSum / triples;
  return r;
}
