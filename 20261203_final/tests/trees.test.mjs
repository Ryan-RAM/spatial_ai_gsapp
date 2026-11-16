// M1.4: UTM projection, tree detection, and the baked trees and canopy layers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CONFIG } from '../src/sim/config.js';
import { COVER } from '../src/sim/cover.js';
import { studyArea } from '../src/data/area.js';
import { toUtm18, fromUtm18 } from '../src/data/utm.js';
import { fromStatePlane } from '../src/data/stateplane.js';
import { findTreetops, growCrowns, otsu, smoothChm } from '../src/data/trees.js';

test('UTM 18N: round trip, and agreement with the State Plane tile edge of the point cloud', () => {
  const [E, N] = toUtm18(40.779, -73.9692);
  const [la, lo] = fromUtm18(E, N);
  assert.ok(Math.abs(la - 40.779) < 1e-8 && Math.abs(lo + 73.9692) < 1e-8);
  // tile 992222 starts at Y = 222500 ftUS; its points' minimum northing is 4514555.09 m
  const [, n0] = toUtm18(...fromStatePlane(992500, 222500));
  assert.ok(Math.abs(n0 - 4514555.09) < 0.2, `northing ${n0}`);
});

// two cone-shaped trees on a 40 x 20 m grid
function cones(W, H, list) {
  const chm = new Float32Array(W * H);
  for (const [ci, cj, h, r] of list) for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const v = h * (1 - Math.hypot(i - ci, j - cj) / r); const k = j * W + i; if (v > chm[k]) chm[k] = v;
  }
  return chm;
}

test('treetops: one per crown; crowns grow to about their real size', () => {
  const W = 40; const H = 20;
  const chm = smoothChm(cones(W, H, [[10, 10, 20, 7], [28, 10, 15, 5]]), W, H);
  const tops = findTreetops(chm, W, H, 4);
  assert.equal(tops.length, 2);
  const { area } = growCrowns(chm, W, H, tops);
  const r = [...area].map((a) => Math.sqrt(a / Math.PI));
  assert.ok(r[0] > 3 && r[0] < 7.5, `crown 1 radius ${r[0]}`);
  assert.ok(r[1] > 2 && r[1] < 5.5, `crown 2 radius ${r[1]}`);
});

test('otsu splits two groups', () => {
  const v = [...Array(100).fill(0.1), ...Array(100).fill(0.6)];
  const t = otsu(v); assert.ok(t > 0.1 && t <= 0.6, `threshold ${t}`);
});

const meta = JSON.parse(readFileSync(new URL('../data/baked/trees.json', import.meta.url), 'utf8'));
const buf = new Uint8Array(readFileSync(new URL('../data/baked/trees.bin', import.meta.url)));
const f = new Float32Array(buf.buffer, buf.byteOffset, meta.count * 6);
const ev = buf.subarray(meta.count * 24);
const canopyAll = new Uint8Array(readFileSync(new URL('../data/baked/canopy.bin', import.meta.url)));
const cover = new Uint8Array(readFileSync(new URL('../data/baked/cover.bin', import.meta.url)));
const { grid } = studyArea(CONFIG);
const n = grid.W * grid.H;

test('trees.bin: layout, plausible sizes, every tree in the park', () => {
  assert.equal(buf.length, meta.count * 25);
  assert.ok(meta.count > 1000 && meta.count < 8000, `${meta.count} trees`);
  for (let t = 0; t < meta.count; t++) {
    const [x, y, z, h, r, tr] = f.subarray(t * 6, t * 6 + 6);
    const c = grid.cellOf(x, y);
    assert.ok(c >= 0 && cover[c] !== COVER.OUTSIDE, `tree ${t} outside the park`);
    assert.ok(h >= 4 && h < 40, `height ${h}`);
    assert.ok(r > 0 && r <= 12.5, `crown ${r}`);
    assert.ok(tr > 0.05 && tr < 0.6, `trunk ${tr}`);
    assert.ok(z > 5 && z < 50, `ground ${z}`);
  }
});

test('LiDAR canopy and OSM agree: woods are far more covered than lawns, and water is open', () => {
  const canopy = canopyAll.subarray(0, n);
  const mean = (code) => { let s = 0; let k = 0; for (let c = 0; c < n; c++) if (cover[c] === code) { s += canopy[c]; k++; } return s / k / 255; };
  const wood = mean(COVER.WOODLAND); const lawn = mean(COVER.LAWN); const water = mean(COVER.WATER);
  assert.ok(wood > 0.6, `woodland canopy ${wood}`);
  assert.ok(wood > lawn + 0.25, `woodland ${wood} vs lawn ${lawn}`);
  assert.ok(water < 0.2, `water canopy ${water}`);
});

test('evergreens are few (the Ramble is broadleaved) and only where OSM allows them', () => {
  const evCount = ev.reduce((s, v) => s + v, 0);
  assert.equal(evCount, meta.stats.evergreen);
  assert.ok(evCount <= meta.stats.mixedWoodTrees + meta.stats.needleWoodTrees);
  const canopyEv = canopyAll.subarray(n, 2 * n); const canopy = canopyAll.subarray(0, n);
  for (let c = 0; c < n; c++) assert.ok(canopyEv[c] <= canopy[c]);
});
