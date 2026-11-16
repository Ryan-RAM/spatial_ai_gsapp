// Small hand-drawn worlds for the tests (ported idea: 20261022_distance/tests/helpers.mjs).
// Legend: . lawn  = paved path  : dirt path  w woodland  t thicket  R rock  ~ water  # structure
// Elevation: a function (i, j) -> z, or a number. Structure height: `wallH` metres for every #.
// Trees: [{ x, y, h, crown, trunk, evergreen }] in metres of the little world (origin at its SW corner).

import { makeWorld } from '../src/sim/world.js';
import { COVER, COVER_NAMES } from '../src/sim/cover.js';

const CODE = { '.': COVER.LAWN, '=': COVER.PATH_PAVED, ':': COVER.PATH_DIRT, w: COVER.WOODLAND, t: COVER.THICKET, R: COVER.ROCK, '~': COVER.WATER, '#': COVER.STRUCTURE, ' ': COVER.OUTSIDE };
const DIRS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

export function makeTestWorld(rows, { cellSize = 3, z = 0, wallH = 3, trees = [] } = {}) {
  const H = rows.length; const W = rows[0].length; const n = W * H;
  const zf = typeof z === 'function' ? z : () => z;
  const layers = {
    z: new Float32Array(n), cover: new Uint8Array(n), slope: new Uint8Array(n), openness: new Uint8Array(n).fill(255),
    canopy: new Uint8Array(n), canopyEv: new Uint8Array(n), structH: new Uint8Array(n),
  };
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const k = j * W + i; const ch = rows[j][i];
    layers.cover[k] = CODE[ch]; layers.z[k] = zf(i, j);
    if (ch === '#') layers.structH[k] = Math.round(wallH * 2);
  }
  const parts = [['z', 'float32', new Uint8Array(layers.z.buffer)], ...['cover', 'slope', 'openness', 'canopy', 'canopyEv', 'structH'].map((k) => [k, 'uint8', layers[k]]), ...DIRS.map((d) => [`drift_${d}`, 'uint8', new Uint8Array(n).fill(100)])];
  let off = 0; const sections = parts.map(([name, type, b]) => { const s = { name, type, offset: off, bytes: b.byteLength }; off += b.byteLength; return s; });
  const bin = new Uint8Array(off); parts.forEach(([, , b], q) => bin.set(b, sections[q].offset));
  const T = trees.length; const tb = new Uint8Array(T * 25); const f = new Float32Array(T * 6);
  trees.forEach((t, q) => f.set([t.x, t.y, zf(Math.floor(t.x / cellSize), H - 1 - Math.floor(t.y / cellSize)), t.h, t.crown ?? 3, t.trunk ?? 0.3], q * 6));
  tb.set(new Uint8Array(f.buffer), 0); trees.forEach((t, q) => { tb[T * 24 + q] = t.evergreen ? 1 : 0; });
  return makeWorld({
    meta: { bboxM: { minX: 0, minY: 0, maxX: W * cellSize, maxY: H * cellSize } },
    worldJson: { W, H, cellSize, sections, windDirs: DIRS, legend: COVER_NAMES },
    worldBin: bin, treesJson: { count: T }, treesBin: tb,
  });
}

// the centre of cell (i, j) of a test world, in metres
export const at = (world, i, j) => [world.minX + (i + 0.5) * world.s, world.maxY - (j + 0.5) * world.s];
