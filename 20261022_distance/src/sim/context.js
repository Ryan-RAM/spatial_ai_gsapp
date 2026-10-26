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

  return {
    config, seed, world, rays, pf, metrics, open, exposure, hideSet, openSet,
    perceptualQ: sampleQuantiles(world, metrics, 'perceptual'),
  };
}
