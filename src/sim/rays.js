// 3D rays from every walkable cell.
// 72 horizontal directions (every 5 degrees) on five elevation rings, plus straight up and down.
// Each ray stops at the first solid volume or at the fog limit (9 cells).
// The list of ray lengths of a cell is its visibility fingerprint: a description of the space
// around that position in every direction, independent of where the agent is facing.

import { castRay, eyePoint } from './los.js';

export function rayDirections(config) {
  const dirs = [];
  const step = config.rayAzimuthStepDeg;
  for (const elevDeg of config.rayElevationsDeg) {
    const el = elevDeg * Math.PI / 180;
    for (let az = 0; az < 360; az += step) {
      const a = az * Math.PI / 180;
      dirs.push({ dx: Math.cos(el) * Math.cos(a), dy: Math.cos(el) * Math.sin(a), dz: Math.sin(el), az: a, el });
    }
  }
  if (config.rayPoles) {
    dirs.push({ dx: 0, dy: 0, dz: 1, az: 0, el: Math.PI / 2 });
    dirs.push({ dx: 0, dy: 0, dz: -1, az: 0, el: -Math.PI / 2 });
  }
  return dirs;
}

// Casts all rays from all walkable cells once and caches the lengths.
export function buildRayCache(world) {
  const dirs = rayDirections(world.config);
  const R = dirs.length;
  const lengths = new Float32Array(world.nodes.length * R);
  const openness = new Float32Array(world.nodes.length);
  const range = world.config.visionRange;
  world.nodes.forEach((n, i) => {
    const [ox, oy, oz] = eyePoint(world, n);
    let sum = 0;
    for (let r = 0; r < R; r++) {
      const d = dirs[r];
      const len = castRay(world, ox, oy, oz, d.dx, d.dy, d.dz, range);
      lengths[i * R + r] = len;
      sum += len;
    }
    openness[i] = sum / R; // average ray length: how much space this position looks into
  });
  return { dirs, R, lengths, openness };
}

// The fingerprint of node n as a view into the cache (no copy).
export function fingerprint(world, rays, n) {
  const i = world.nodeIndex[n];
  return rays.lengths.subarray(i * rays.R, (i + 1) * rays.R);
}
