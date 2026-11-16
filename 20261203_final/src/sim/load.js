// Loads the baked world through two reader functions, so that Node (fs) and the browser (fetch)
// share one code path: readJson(name) -> object, readBytes(name) -> Uint8Array. No DOM.

import { makeWorld } from './world.js';

export const WORLD_FILES = ['meta.json', 'world.json', 'world.bin', 'trees.json', 'trees.bin', 'paths.json', 'places.json'];

export async function loadWorldWith(readJson, readBytes, { withTrees = true, withPaths = true } = {}) {
  const [meta, worldJson, worldBin, treesJson, treesBin, paths, places] = await Promise.all([
    readJson('meta.json'), readJson('world.json'), readBytes('world.bin'),
    withTrees ? readJson('trees.json') : null, withTrees ? readBytes('trees.bin') : null,
    withPaths ? readJson('paths.json') : null, withPaths ? readJson('places.json') : null,
  ]);
  return makeWorld({ meta, worldJson, worldBin, treesJson, treesBin, paths, places: places?.places ?? null });
}

// In the browser: fetch from a base URL (the page's data/baked/).
export function loadWorldFromUrl(base, opts) {
  const url = (f) => new URL(f, base);
  return loadWorldWith(
    async (f) => (await fetch(url(f))).json(),
    async (f) => new Uint8Array(await (await fetch(url(f))).arrayBuffer()),
    opts,
  );
}
