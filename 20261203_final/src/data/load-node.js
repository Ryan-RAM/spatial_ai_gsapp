// Loads the baked world from data/baked/ in Node (tests, bench, bake steps, workers), through the
// same loader the browser uses (src/sim/load.js).

import { readFileSync } from 'node:fs';
import { makeWorld } from '../sim/world.js';
import { attachFingerprints } from '../sim/fingerprints.js';

const dir = new URL('../../data/baked/', import.meta.url);
const json = (f) => JSON.parse(readFileSync(new URL(f, dir), 'utf8'));
const bytes = (f) => new Uint8Array(readFileSync(new URL(f, dir)));

// synchronous, for scripts and workers
export function loadWorld({ withTrees = true, withPaths = true, withFingerprints = false } = {}) {
  const world = makeWorld({
    meta: json('meta.json'), worldJson: json('world.json'), worldBin: bytes('world.bin'),
    treesJson: withTrees ? json('trees.json') : null, treesBin: withTrees ? bytes('trees.bin') : null,
    paths: withPaths ? json('paths.json') : null, places: withPaths ? json('places.json').places : null,
  });
  if (withFingerprints) attachFingerprints(world, json('fingerprints.json'), bytes('fingerprints.bin'));
  return world;
}

// the shared asynchronous path (what the browser runs, with fs instead of fetch)
export async function loadWorldShared(opts) {
  const { loadWorldWith } = await import('../sim/load.js');
  return loadWorldWith(async (f) => json(f), async (f) => bytes(f), opts);
}
