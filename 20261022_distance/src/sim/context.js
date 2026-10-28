// Everything that depends only on the map: rays, path finder, distances and the cell sets the AI uses.

import { generateWorld } from './world.js';
import { buildRayCache } from './rays.js';
import { makePathfinder } from './paths.js';
import { makeMetrics, sampleQuantiles } from './metrics.js';
import { eyePoint, segmentClear } from './los.js';

export function makeContext(config, seed = config.seed) {
  const world = generateWorld(config, seed);
  const rays = buildRayCache(world);
  const pf = makePathfinder(world);
  const metrics = makeMetrics(world, rays, pf);

  const open = (n) => rays.openness[world.nodeIndex[n]];
  const sorted = world.nodes.slice().sort((a, b) => open(a) - open(b));
  const at = (q) => open(sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]);
  const hideLimit = at(config.ai.thiefHideQuantile);
  const openLimit = at(config.ai.policeOpenQuantile);
  const hideSet = world.nodes.filter((n) => open(n) <= hideLimit);
  const openSet = world.nodes.filter((n) => open(n) >= openLimit);

  // Exposure: from how many walkable cells this cell could be seen (within the fog, nothing in
  // between, any facing). A good hiding spot has a small view and a small exposure.
  const exposureArr = new Int32Array(world.nodes.length);
  const eyes = world.nodes.map((n) => eyePoint(world, n));
  const R2 = config.visionRange * config.visionRange;
  for (let i = 0; i < eyes.length; i++) {
    for (let j = i + 1; j < eyes.length; j++) {
      const a = eyes[i];
      const b = eyes[j];
      const d2 = (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
      if (d2 <= R2 && segmentClear(world, a, b)) { exposureArr[i]++; exposureArr[j]++; }
    }
  }
  const exposure = (n) => exposureArr[world.nodeIndex[n]];

  // Exits on the ground, one per side listed in config.exitSides: the walkable cell along the inside
  // of the boundary wall closest to the middle of that side.
  const exits = [];
  const sides = [
    { side: 'north', cells: (k) => [k, 1], len: world.W, mid: world.W / 2 },
    { side: 'south', cells: (k) => [k, world.H - 2], len: world.W, mid: world.W / 2 },
    { side: 'west', cells: (k) => [1, k], len: world.H, mid: world.H / 2 },
    { side: 'east', cells: (k) => [world.W - 2, k], len: world.H, mid: world.H / 2 },
  ].filter((s) => config.exitSides.includes(s.side));
  for (const { side, cells, len, mid } of sides) {
    let best = null;
    for (let k = 1; k < len - 1; k++) {
      const [x, y] = cells(k);
      if (!world.walk[y * world.W + x]) continue;
      if (!best || Math.abs(k + 0.5 - mid) < Math.abs(best.k + 0.5 - mid)) best = { k, node: y * world.W + x };
    }
    if (best) exits.push({ side, node: best.node });
  }

  return {
    config, seed, world, rays, pf, metrics, open, exposure, hideSet, openSet, exits,
    perceptualQ: sampleQuantiles(world, metrics, 'perceptual'),
  };
}
