// Loads the baked world from data/baked/ in Node (tests, bench, bake steps, workers).
// The browser does the same with fetch (src/ui/, M5).

import { readFileSync } from 'node:fs';
import { makeWorld } from '../sim/world.js';

const dir = new URL('../../data/baked/', import.meta.url);
const json = (f) => JSON.parse(readFileSync(new URL(f, dir), 'utf8'));
const bytes = (f) => new Uint8Array(readFileSync(new URL(f, dir)));

export function loadWorld({ withTrees = true, withPaths = true } = {}) {
  return makeWorld({
    meta: json('meta.json'), worldJson: json('world.json'), worldBin: bytes('world.bin'),
    treesJson: withTrees ? json('trees.json') : null, treesBin: withTrees ? bytes('trees.bin') : null,
    paths: withPaths ? json('paths.json') : null, places: withPaths ? json('places.json').places : null,
  });
}
