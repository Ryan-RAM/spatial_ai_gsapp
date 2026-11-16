// M1.1: frame W (local east-north-up at KNYC) and the grid over it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeEnu, makeGrid, geodeticToEcef, ecefToGeodetic } from '../src/data/geo.js';
import { studyArea } from '../src/data/area.js';
import { CONFIG } from '../src/sim/config.js';
import { makeRng } from '../src/sim/rng.js';

const enu = makeEnu(CONFIG.origin.lat, CONFIG.origin.lon, 0);

test('ECEF round trip is exact to well under a millimetre', () => {
  for (const [la, lo, h] of [[40.779, -73.9692, 30], [0, 0, 0], [-33.9, 151.2, 1200], [89.9, 10, 5]]) {
    const [la2, lo2, h2] = ecefToGeodetic(...geodeticToEcef(la, lo, h));
    assert.ok(Math.abs(la2 - la) < 1e-9 && Math.abs(lo2 - lo) < 1e-9 && Math.abs(h2 - h) < 1e-4);
  }
});

test('the origin maps to (0, 0, 0)', () => {
  const [e, n, u] = enu.toEnu(CONFIG.origin.lat, CONFIG.origin.lon, 0);
  assert.ok(Math.hypot(e, n, u) < 1e-6);
});

test('WGS84 -> W -> WGS84 round trip over the study area: error < 0.1 m', () => {
  const rng = makeRng(3);
  const { minX, minY, maxX, maxY } = CONFIG.studyArea.bboxM;
  let worst = 0;
  for (let k = 0; k < 2000; k++) {
    const x = minX + rng.next() * (maxX - minX);
    const y = minY + rng.next() * (maxY - minY);
    const [la, lo] = enu.fromEnu(x, y, 0);
    const [x2, y2] = enu.toEnu(la, lo, 0);
    worst = Math.max(worst, Math.hypot(x2 - x, y2 - y));
  }
  assert.ok(worst < 0.1, `worst ${worst} m`);
  assert.ok(worst < 1e-3, `worst ${worst} m`); // in practice sub-millimetre
});

test('axes: east is +x, north is +y; distances agree with a geodesic formula', () => {
  const [e1] = enu.toEnu(CONFIG.origin.lat, CONFIG.origin.lon + 0.001, 0);
  const [, n1] = enu.toEnu(CONFIG.origin.lat + 0.001, CONFIG.origin.lon, 0);
  assert.ok(e1 > 84 && e1 < 85, `0.001 deg of longitude = ${e1} m`);   // 111.32 km x cos(40.78 deg)
  assert.ok(n1 > 110.9 && n1 < 111.2, `0.001 deg of latitude = ${n1} m`);
  // Belvedere Castle -> Fifth Avenue at 79th Street (OSM), vs haversine on a 6371 km sphere
  const a = [40.77933, -73.96889]; const b = [40.77678, -73.96397];
  const [xa, ya] = enu.toEnu(...a, 0); const [xb, yb] = enu.toEnu(...b, 0);
  const R = 6371008.8; const r = Math.PI / 180;
  const h = Math.sin((b[0] - a[0]) * r / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin((b[1] - a[1]) * r / 2) ** 2;
  const hav = 2 * R * Math.asin(Math.sqrt(h));
  assert.ok(Math.abs(Math.hypot(xb - xa, yb - ya) - hav) < 1.0); // sphere vs ellipsoid, < 0.3 %
});

test('grid: cellOf and center agree; row 0 is the north edge; idx = j * W + i', () => {
  const grid = makeGrid({ minX: 0, minY: 0, maxX: 30, maxY: 15 }, 3);
  assert.deepEqual([grid.W, grid.H], [10, 5]);
  assert.equal(grid.cellOf(0.1, 14.9), 0);            // north-west corner
  assert.equal(grid.cellOf(29.9, 0.1), 4 * 10 + 9);   // south-east corner
  assert.equal(grid.cellOf(-0.1, 5), -1);
  for (let idx = 0; idx < 50; idx++) assert.equal(grid.cellOf(...grid.center(idx)), idx);
});

test('baked meta.json matches config and the area module', () => {
  const meta = JSON.parse(readFileSync(new URL('../data/baked/meta.json', import.meta.url), 'utf8'));
  const { grid, bboxDeg } = studyArea(CONFIG);
  assert.equal(meta.cellSize, CONFIG.cellSize);
  assert.deepEqual([meta.W, meta.H], [grid.W, grid.H]);
  assert.deepEqual(meta.bboxM, CONFIG.studyArea.bboxM);
  meta.bboxDeg.forEach((v, k) => assert.ok(Math.abs(v - bboxDeg[k]) < 1e-6));
});

test('the study area holds the places the story needs', () => {
  const { grid } = studyArea(CONFIG);
  const inside = (lat, lon) => grid.cellOf(...enu.toEnu(lat, lon, 0)) !== -1;
  assert.ok(inside(40.77933, -73.96889), 'Belvedere Castle');
  assert.ok(inside(40.77707, -73.96964), 'Azalea Pond');
  assert.ok(inside(40.77575, -73.97177), 'Bow Bridge');
  assert.ok(inside(40.77678, -73.96397), 'Fifth Avenue at 79th Street');
  assert.ok(inside(40.7743, -73.9658), 'Fifth Avenue at 76th Street');
});
