// M2.1: loading the world. The same asynchronous loader as the browser, layer sizes and ranges.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadWorld, loadWorldShared } from '../src/data/load-node.js';
import { COVER } from '../src/sim/cover.js';

test('the shared loader (the browser path) and the sync loader give the same world', async () => {
  const a = loadWorld(); const b = await loadWorldShared();
  assert.equal(a.n, b.n);
  for (const k of ['cover', 'z', 'slope', 'openness', 'canopy', 'canopyEv', 'structH']) assert.deepEqual(a[k], b[k], k);
  assert.equal(a.solids.count, b.solids.count);
});

test('load is fast enough: under 300 ms in Node', () => {
  loadWorld(); // warm
  const t = performance.now(); loadWorld(); const ms = performance.now() - t;
  assert.ok(ms < 300, `${ms.toFixed(0)} ms`);
});

test('layers: sizes and value ranges', () => {
  const w = loadWorld();
  assert.equal(w.n, w.W * w.H);
  for (const k of ['cover', 'z', 'slope', 'openness', 'canopy', 'canopyEv', 'structH', 'structTop']) assert.equal(w[k].length, w.n, k);
  for (const d of w.windDirs) assert.equal(w.drift[d].length, w.n);
  for (let k = 0; k < w.n; k++) {
    assert.ok(w.cover[k] <= COVER.STRUCTURE);
    assert.ok(w.z[k] > 5 && w.z[k] < 50);
    assert.ok(w.slope[k] <= 90);
    if (w.cover[k] !== COVER.STRUCTURE) assert.equal(w.structH[k], 0);
  }
});

test('frame W: cellOf and center are inverse; groundAt agrees with z at a cell centre', () => {
  const w = loadWorld();
  for (let k = 0; k < w.n; k += 211) {
    const [x, y] = w.center(k);
    assert.equal(w.cellOf(x, y), k);
    const i = k % w.W; const j = (k - i) / w.W;
    if (i > 0 && j > 0 && i < w.W - 1 && j < w.H - 1) assert.ok(Math.abs(w.groundAt(x, y) - w.z[k]) < 1e-4);
  }
  assert.equal(w.cellOf(w.minX - 1, 0), -1);
});
