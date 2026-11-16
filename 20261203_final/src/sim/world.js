// The world (semantic model §3, §7.1-7.3): the baked grid layers as typed arrays, plus the trees,
// path graph and named places. Built from bytes and JSON, so the same code runs in Node (tests,
// bench, Web Workers via src/data/load-node.js) and in the browser (fetch). No DOM.
//
// Coordinates: frame W in metres (x east, y north); cell (i, j) with j growing southward,
// idx = j * W + i. A cell's centre is (minX + (i + 0.5) s, maxY - (j + 0.5) s).

export function makeWorld({ meta, worldJson, worldBin, treesJson, treesBin, paths = null, places = null }) {
  const { W, H, cellSize: s } = worldJson;
  const n = W * H;
  const buf = worldBin instanceof Uint8Array ? worldBin : new Uint8Array(worldBin);
  const layer = (name) => {
    const sec = worldJson.sections.find((x) => x.name === name);
    if (!sec) throw new Error(`world.bin has no ${name} layer`);
    // copy so that every layer is its own aligned typed array
    const bytes = buf.slice(sec.offset, sec.offset + sec.bytes);
    return sec.type === 'float32' ? new Float32Array(bytes.buffer) : bytes;
  };
  const { minX, maxY } = meta.bboxM;
  const world = {
    W, H, n, s, minX, maxY, maxX: minX + W * s, minY: maxY - H * s, meta,
    cover: layer('cover'), z: layer('z'), slope: layer('slope'), openness: layer('openness'),
    canopy: layer('canopy'), canopyEv: layer('canopyEv'), structH: layer('structH'),
    drift: Object.fromEntries(worldJson.windDirs.map((d) => [d, layer(`drift_${d}`)])),
    windDirs: worldJson.windDirs, legend: worldJson.legend,
    paths, places,
  };
  world.structTop = new Float32Array(n);
  for (let k = 0; k < n; k++) world.structTop[k] = world.structH[k] ? world.z[k] + world.structH[k] / 2 : -Infinity;
  world.cellOf = (x, y) => {
    const i = Math.floor((x - minX) / s); const j = Math.floor((maxY - y) / s);
    return i >= 0 && j >= 0 && i < W && j < H ? j * W + i : -1;
  };
  world.center = (k) => { const i = k % W; return [minX + (i + 0.5) * s, maxY - ((k - i) / W + 0.5) * s]; };
  // ground height anywhere: bilinear over the lattice of cell centres
  world.groundAt = (x, y) => {
    const fx = (x - minX) / s - 0.5; const fy = (maxY - y) / s - 0.5;
    const i = Math.min(W - 2, Math.max(0, Math.floor(fx))); const j = Math.min(H - 2, Math.max(0, Math.floor(fy)));
    const ux = Math.min(1, Math.max(0, fx - i)); const uy = Math.min(1, Math.max(0, fy - j));
    const k = j * W + i; const z = world.z;
    return (1 - uy) * ((1 - ux) * z[k] + ux * z[k + 1]) + uy * ((1 - ux) * z[k + W] + ux * z[k + W + 1]);
  };
  if (treesJson && treesBin) attachTrees(world, treesJson, treesBin);
  return world;
}

// Trees as solids (D-018): trunks are vertical cylinders from the ground to half the tree's height
// (where the crown begins); evergreen crowns are cylinders of 0.8 x the crown radius from 0.35 h to
// h. Deciduous crowns are bare in January and block nothing. Each solid is listed in every cell it
// overlaps (compressed rows: cellStart[k] .. cellStart[k + 1] index into solidIds).
function attachTrees(world, treesJson, treesBin) {
  const T = treesJson.count;
  const bytes = treesBin instanceof Uint8Array ? treesBin : new Uint8Array(treesBin);
  const f = new Float32Array(bytes.slice(0, T * 24).buffer);
  const ev = bytes.slice(T * 24, T * 25);
  const solids = []; // [x, y, r, z0, z1, kind] kind 0 trunk, 1 crown
  for (let t = 0; t < T; t++) {
    const [x, y, z, h, cr, tr] = f.subarray(t * 6, t * 6 + 6);
    solids.push([x, y, tr, z, z + 0.5 * h, 0]);
    if (ev[t]) solids.push([x, y, 0.8 * cr, z + 0.35 * h, z + h, 1]);
  }
  const S = solids.length;
  const sx = new Float32Array(S); const sy = new Float32Array(S); const sr = new Float32Array(S);
  const sz0 = new Float32Array(S); const sz1 = new Float32Array(S); const kind = new Uint8Array(S);
  const lists = Array.from({ length: world.n }, () => []);
  solids.forEach(([x, y, r, z0, z1, kd], q) => {
    sx[q] = x; sy[q] = y; sr[q] = r; sz0[q] = z0; sz1[q] = z1; kind[q] = kd;
    const { s, minX, maxY, W, H } = world;
    const i0 = Math.max(0, Math.floor((x - r - minX) / s)); const i1 = Math.min(W - 1, Math.floor((x + r - minX) / s));
    const j0 = Math.max(0, Math.floor((maxY - y - r) / s)); const j1 = Math.min(H - 1, Math.floor((maxY - y + r) / s));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) lists[j * W + i].push(q);
  });
  const cellStart = new Int32Array(world.n + 1);
  for (let k = 0; k < world.n; k++) cellStart[k + 1] = cellStart[k] + lists[k].length;
  const solidIds = new Int32Array(cellStart[world.n]);
  for (let k = 0; k < world.n; k++) solidIds.set(lists[k], cellStart[k]);
  world.trees = { count: T, data: f, evergreen: ev };
  world.solids = { count: S, x: sx, y: sy, r: sr, z0: sz0, z1: sz1, kind, cellStart, ids: solidIds };
}
