// M1.7 / M2.4: 3D line of sight over terrain, structures and tree cylinders (ported castRay).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { castRay, segmentClear, EYE } from '../src/sim/los.js';
import { makeTestWorld, at } from './helpers.mjs';

const near = (a, b, tol = 0.05) => Math.abs(a - b) <= tol;
const FLAT = ['..........', '..........', '..........', '..........', '..........'];

test('flat ground: a level ray runs to the range, a 45-degree ray hits the ground at 1.5 x sqrt 2', () => {
  const w = makeTestWorld(FLAT);
  const [x, y] = at(w, 1, 2);
  assert.equal(castRay(w, x, y, EYE, 1, 0, 0, 20), 20);
  const d = Math.SQRT1_2;
  assert.ok(near(castRay(w, x, y, EYE, d, 0, -d, 20), EYE * Math.SQRT2));
});

test('a wall blocks up to its height, and not above it', () => {
  const w = makeTestWorld(['.....#....', '.....#....', '.....#....'], { wallH: 3 });
  const [x, y] = at(w, 1, 1); // centre at x = 4.5 m; the wall starts at x = 15 m
  assert.ok(near(castRay(w, x, y, EYE, 1, 0, 0, 30), 15 - x));
  assert.equal(castRay(w, x, y, 3.5, 1, 0, 0, 30), 30, 'a ray at 3.5 m clears a 3 m wall');
});

test('terrain: a hill between two points blocks the view; bilinear ground has no staircase', () => {
  const hill = (i) => (i === 5 ? 4 : 0);
  const w = makeTestWorld(FLAT, { z: hill });
  const a = [...at(w, 1, 2), EYE]; const b = [...at(w, 9, 2), EYE];
  assert.equal(segmentClear(w, a, b), false);
  // a smooth slope rising 1 m per cell: a ray parallel to the ground at eye height never touches it
  const ramp = makeTestWorld(FLAT, { z: (i) => i });
  const [x, y] = at(ramp, 1, 2); const len = Math.hypot(3, 1);
  assert.equal(castRay(ramp, x, y, ramp.groundAt(x, y) + EYE, 3 / len, 0, 1 / len, 20), 20);
});

test('trunks are cylinders: hit at the bark, miss beside it, see over it; standing inside is ignored', () => {
  const w = makeTestWorld(FLAT, { trees: [{ x: 15, y: 7.5, h: 10, trunk: 0.4 }] });
  const [x] = at(w, 1, 2); const y = 7.5;
  assert.ok(near(castRay(w, x, y, EYE, 1, 0, 0, 30), 15 - 0.4 - x));
  assert.equal(castRay(w, x, y + 0.6, EYE, 1, 0, 0, 30), 30, '0.6 m to the side: misses');
  assert.equal(castRay(w, x, y, 6, 1, 0, 0, 30), 30, 'above the trunk top (half the height, 5 m)');
  assert.equal(castRay(w, 15, 7.5, EYE, 1, 0, 0, 10), 10, 'from inside the trunk');
});

test('deciduous crowns block nothing in January; evergreen crowns do', () => {
  const dec = makeTestWorld(FLAT, { trees: [{ x: 15, y: 7.5, h: 10, crown: 3, trunk: 0.3 }] });
  const ev = makeTestWorld(FLAT, { trees: [{ x: 15, y: 7.5, h: 10, crown: 3, trunk: 0.3, evergreen: true }] });
  const [x] = at(dec, 1, 2);
  assert.equal(castRay(dec, x, 7.5 + 1.5, 6, 1, 0, 0, 30), 30);
  assert.ok(near(castRay(ev, x, 7.5 + 1.5, 6, 1, 0, 0, 30), 15 - Math.sqrt(2.4 ** 2 - 1.5 ** 2) - x));
});

test('segmentClear is symmetric', () => {
  const w = makeTestWorld(['..........', '...#......', '..........'], { trees: [{ x: 20, y: 4.5, h: 8 }] });
  for (const [p, q] of [[at(w, 0, 0), at(w, 9, 2)], [at(w, 0, 1), at(w, 9, 1)], [at(w, 2, 2), at(w, 8, 0)]]) {
    const a = [...p, EYE]; const b = [...q, EYE];
    assert.equal(segmentClear(w, a, b), segmentClear(w, b, a));
  }
});

// ---------------------------------------------------------------- the baked fingerprints

test('fingerprints.bin: one row per standable cell, plausible ray lengths', () => {
  const meta = JSON.parse(readFileSync(new URL('../data/baked/fingerprints.json', import.meta.url), 'utf8'));
  const buf = new Uint8Array(readFileSync(new URL('../data/baked/fingerprints.bin', import.meta.url)));
  assert.equal(meta.rays, 362);
  assert.equal(buf.length, meta.count * 4 + meta.count * meta.rays);
  const rows = buf.subarray(meta.count * 4);
  const down = meta.rays - 1; const up = meta.rays - 2;
  for (let r = 0; r < meta.count; r += 97) {
    assert.ok(Math.abs(rows[r * meta.rays + down] * meta.step - EYE) <= 0.25, 'the down ray meets the ground at eye height');
    assert.ok(rows[r * meta.rays + up] <= 255);
  }
});
