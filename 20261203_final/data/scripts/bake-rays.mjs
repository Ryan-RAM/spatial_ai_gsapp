// Bakes the visibility fingerprints (ROADMAP M1.7, semantic model §6.4) for every cell an agent can
// stand on: 362 rays from the eye point (1.5 m above the ground), 72 azimuths every 5 degrees on
// five elevation rings (-30, -15, 0, +15, +30 degrees), plus straight up and straight down. Each ray
// runs to the first solid (ground, structure, trunk, evergreen crown) or 63.75 m, stored in 0.25 m
// steps (Uint8). The 0-degree ring is also the occlusion horizon used by scanning (D-021).
//   data/baked/fingerprints.bin   Int32 cell index per row, then Uint8 rows of 362
//   data/baked/fingerprints.json  layout and ray directions
// Runs on worker threads, one per core. Run: npm run bake:rays (after bake:world)

import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { loadWorld } from '../../src/data/load-node.js';
import { castRay, EYE } from '../../src/sim/los.js';
import { COVER } from '../../src/sim/cover.js';

export const RINGS = [-30, -15, 0, 15, 30];
export const AZIMUTHS = 72;
export const MAX_RANGE = 63.75;
export const STEP = 0.25;

export function rayDirections() {
  const dirs = [];
  for (const e of RINGS) for (let a = 0; a < AZIMUTHS; a++) {
    const A = (a * 360 / AZIMUTHS) * Math.PI / 180; const E = e * Math.PI / 180;
    dirs.push([Math.cos(E) * Math.sin(A), Math.cos(E) * Math.cos(A), Math.sin(E)]);
  }
  dirs.push([0, 0, 1], [0, 0, -1]);
  return dirs;
}
const STANDABLE = [COVER.PATH_PAVED, COVER.PATH_DIRT, COVER.LAWN, COVER.WOODLAND, COVER.THICKET];

if (isMainThread) {
  const t0 = performance.now();
  const world = loadWorld();
  const cells = []; for (let k = 0; k < world.n; k++) if (STANDABLE.includes(world.cover[k])) cells.push(k);
  const R = rayDirections().length;
  const workers = Math.max(1, cpus().length);
  const chunk = Math.ceil(cells.length / workers);
  const parts = await Promise.all(Array.from({ length: workers }, (_, w) => new Promise((resolve, reject) => {
    const mine = cells.slice(w * chunk, (w + 1) * chunk);
    const worker = new Worker(new URL(import.meta.url), { workerData: { cells: mine } });
    worker.once('message', (buf) => resolve(new Uint8Array(buf)));
    worker.once('error', reject);
  })));
  const rows = new Uint8Array(cells.length * R); let off = 0;
  for (const p of parts) { rows.set(p, off); off += p.length; }
  const idx = Int32Array.from(cells);
  const out = new Uint8Array(idx.byteLength + rows.byteLength);
  out.set(new Uint8Array(idx.buffer), 0); out.set(rows, idx.byteLength);
  writeFileSync(new URL('../baked/fingerprints.bin', import.meta.url), out);
  writeFileSync(new URL('../baked/fingerprints.json', import.meta.url), JSON.stringify({
    file: 'fingerprints.bin', count: cells.length, rays: R, eye: EYE, step: STEP, maxRange: MAX_RANGE,
    layout: 'Int32 cell index (idx = j * W + i) for each row, then count rows of Uint8 ray lengths (value x step metres)',
    rayOrder: `rings ${RINGS.join(', ')} degrees of elevation, each with ${AZIMUTHS} azimuths clockwise from north (5 degrees apart), then up, then down`,
    horizonRing: RINGS.indexOf(0), standable: STANDABLE,
    directions: rayDirections().map((d) => d.map((v) => +v.toFixed(6))),
  }) + '\n');
  console.log(`fingerprints.bin: ${cells.length} cells x ${R} rays, ${(out.length / 1e6).toFixed(1)} MB, ${workers} workers, ${((performance.now() - t0) / 1000).toFixed(1)} s`);
} else {
  const world = loadWorld();
  const dirs = rayDirections();
  const { cells } = workerData;
  const out = new Uint8Array(cells.length * dirs.length);
  cells.forEach((k, r) => {
    const [x, y] = world.center(k); const z = world.groundAt(x, y) + EYE;
    dirs.forEach((d, q) => { out[r * dirs.length + q] = Math.round(castRay(world, x, y, z, d[0], d[1], d[2], MAX_RANGE) / STEP); });
  });
  parentPort.postMessage(out.buffer, [out.buffer]);
}
