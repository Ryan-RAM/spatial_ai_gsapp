// M1.3: State Plane projection, terrain-derived layers, and the baked terrain.bin.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CONFIG } from '../src/sim/config.js';
import { COVER } from '../src/sim/cover.js';
import { studyArea } from '../src/data/area.js';
import { toStatePlane, fromStatePlane } from '../src/data/stateplane.js';
import { slopeDeg, terrainOpenness, upwindSx, driftFromSx, WIND_DIRS } from '../src/data/terrain.js';

// ---------------------------------------------------------------- projection (EPSG:6539)

test('State Plane: round trip, and the DEM tile footprint matches NOAA\'s tile index', () => {
  const [X, Y] = toStatePlane(40.779, -73.9692);
  const [la, lo] = fromStatePlane(X, Y);
  assert.ok(Math.abs(la - 40.779) < 1e-10 && Math.abs(lo + 73.9692) < 1e-10);
  // be_NYC_025.tif spans X 979137-1000000, Y 200000-225000 ftUS; the index gives its bbox as
  // -74.0184, 40.7156, -73.9431, 40.7842
  const nw = fromStatePlane(979137, 225000); const se = fromStatePlane(1000000, 200000);
  assert.ok(Math.abs(nw[0] - 40.7842) < 2e-4 && Math.abs(nw[1] + 74.0184) < 2e-4);
  assert.ok(Math.abs(se[0] - 40.7156) < 2e-4 && Math.abs(se[1] + 73.9431) < 2e-4);
});

// ---------------------------------------------------------------- derived layers on toy grids

const plane = (W, H, s, gx, gy) => { const z = new Float32Array(W * H); for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) z[j * W + i] = gx * i * s - gy * j * s; return z; };

test('slope of a plane rising 1 in 1 toward the east is 45 degrees', () => {
  const sl = slopeDeg(plane(10, 10, 3, 1, 0), 10, 10, 3);
  assert.equal(sl[5 * 10 + 5], 45);
  assert.equal(slopeDeg(plane(10, 10, 3, 0, 0), 10, 10, 3)[55], 0);
});

test('openness: 1 on flat ground, lower at the bottom of a pit', () => {
  const W = 21; const H = 21; const z = new Float32Array(W * H);
  assert.equal(terrainOpenness(z, W, H, 3, 30)[10 * W + 10], 255);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) z[j * W + i] = Math.hypot(i - 10, j - 10) * 2;
  assert.ok(terrainOpenness(z, W, H, 3, 30)[10 * W + 10] < 150);
});

test('Sx: the lee of a ridge is positive, its crest negative; drift is clamped to 0.5-2', () => {
  const W = 40; const H = 5; const z = new Float32Array(W * H);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) z[j * W + i] = Math.max(0, 10 - Math.abs(i - 20) * 2);
  const west = WIND_DIRS.find((d) => d.name === 'W');
  const sx = upwindSx(z, W, H, 3, west, 100);
  assert.ok(sx[2 * W + 25] > 0, 'just east of the ridge, in a west wind: lee');
  assert.ok(sx[2 * W + 20] < 0, 'on the crest: exposed');
  const d = driftFromSx(new Float32Array([-30, 0, 7.5, 40]));
  assert.deepEqual([...d], [50, 100, 150, 200]);
});

// ---------------------------------------------------------------- the baked terrain

const meta = JSON.parse(readFileSync(new URL('../data/baked/terrain.json', import.meta.url), 'utf8'));
const buf = new Uint8Array(readFileSync(new URL('../data/baked/terrain.bin', import.meta.url)));
const { grid } = studyArea(CONFIG);
const n = grid.W * grid.H;
const sec = (name) => meta.sections.find((s) => s.name === name);
const z = new Float32Array(buf.buffer, buf.byteOffset + sec('z').offset, n);
const cover = new Uint8Array(readFileSync(new URL('../data/baked/cover.bin', import.meta.url)));

test('terrain.bin: layout as described, heights plausible for Central Park', () => {
  assert.equal(buf.length, meta.sections.reduce((s, x) => s + x.bytes, 0));
  assert.deepEqual([meta.W, meta.H], [grid.W, grid.H]);
  assert.equal(meta.sections.filter((s) => s.name.startsWith('drift_')).length, 8);
  for (let k = 0; k < n; k++) assert.ok(z[k] > 5 && z[k] < 50, `z ${z[k]} at ${k}`);
});

test('measured heights: Vista Rock within 2 m of 39.6 m; the Reservoir within 3 m of 37 m', () => {
  assert.ok(Math.abs(meta.stats.vistaRockTop - 39.6) <= 2, `Vista Rock ${meta.stats.vistaRockTop}`);
  assert.ok(Math.abs(meta.stats.reservoirSurface - 37) <= 3, `Reservoir ${meta.stats.reservoirSurface}`);
});

test('the Lake is hydro-flattened (one level) and lies below the land around it', () => {
  const lake = []; const land = [];
  for (let k = 0; k < n; k++) (cover[k] === COVER.WATER ? lake : cover[k] !== COVER.OUTSIDE ? land : []).push(z[k]);
  lake.sort((a, b) => a - b); land.sort((a, b) => a - b);
  const q = (v, p) => v[Math.floor(p * (v.length - 1))];
  assert.ok(q(lake, 0.75) - q(lake, 0.25) < 1.0, 'the Lake is flat');
  assert.ok(q(land, 0.5) - q(lake, 0.5) > 4, 'land is higher than the Lake');
});

test('OSM and the DEM line up: the sunken 79th Street Transverse lies below the ground beside it', () => {
  // the transverse cells are STRUCTURE in a band; compare each with the cells 8 cells (24 m) north and south
  let deeper = 0; let total = 0;
  const { W, H } = grid;
  for (let j = 10; j < H - 10; j++) for (let i = 0; i < W; i++) {
    const k = j * W + i; if (cover[k] !== COVER.STRUCTURE) continue;
    const up = z[(j - 8) * W + i]; const down = z[(j + 8) * W + i];
    if (cover[(j - 8) * W + i] === COVER.STRUCTURE || cover[(j + 8) * W + i] === COVER.STRUCTURE) continue;
    total++; if (z[k] < Math.max(up, down) - 2) deeper++;
  }
  assert.ok(total > 100 && deeper / total > 0.6, `${deeper} of ${total} structure cells lie in a cutting`);
});
