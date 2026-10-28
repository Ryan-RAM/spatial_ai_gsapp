// The three distances and the metric axioms.

import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../src/sim/config.js';
import { generateWorld } from '../src/sim/world.js';
import { buildRayCache, rayDirections } from '../src/sim/rays.js';
import { makePathfinder } from '../src/sim/paths.js';
import { makeMetrics, checkAxioms } from '../src/sim/metrics.js';
import { makeTestWorld } from './helpers.mjs';

test('362 rays: 72 per ring on five rings, plus up and down', () => {
  assert.equal(rayDirections(CONFIG).length, 72 * 5 + 2);
});

test('Euclidean distance includes the 3 cell level height', () => {
  const { world, at } = makeTestWorld(
    ['#####', '#H..#', '#####'],
    ['     ', ' H== ', '     '],
  );
  const rays = buildRayCache(world);
  const m = makeMetrics(world, rays, makePathfinder(world));
  assert.equal(m.euclidean(at(0, 1, 1), at(1, 1, 1)), 3);
  assert.equal(m.euclidean(at(0, 3, 1), at(1, 1, 1)), Math.hypot(2, 3));
  assert.equal(m.path(at(0, 3, 1), at(1, 3, 1)), 2 + 3 + 2);
});

test('two cells in identical surroundings have perceptual distance 0', () => {
  // three identical one-row rooms side by side
  const { world, at } = makeTestWorld([
    '#############',
    '#...#...#...#',
    '#############',
  ]);
  const rays = buildRayCache(world);
  const m = makeMetrics(world, rays, makePathfinder(world));
  // (2,1) and (6,1) are the centres of two identical rooms
  assert.equal(m.perceptual(at(0, 2, 1), at(0, 6, 1)), 0);
  assert.ok(m.euclidean(at(0, 2, 1), at(0, 6, 1)) > 0);
  assert.ok(m.perceptual(at(0, 1, 1), at(0, 2, 1)) > 0);
});

test('axioms on the generated map', () => {
  const world = generateWorld(CONFIG);
  const rays = buildRayCache(world);
  const pf = makePathfinder(world);
  const m = makeMetrics(world, rays, pf);
  const r = checkAxioms(world, rays, m, { triples: 1500 });
  for (const name of ['euclidean', 'path', 'perceptual']) {
    assert.equal(r[name].negative, 0, name);
    assert.equal(r[name].asymmetric, 0, name);
    assert.equal(r[name].triangle, 0, name);
    assert.equal(r[name].selfNonZero, 0, name);
  }
  // the acoustic distance is a semimetric: everything holds except the triangle inequality,
  // because a detour via a third point can avoid a rock the straight line passes through
  assert.equal(r.acoustic.negative, 0);
  assert.equal(r.acoustic.asymmetric, 0);
  assert.equal(r.acoustic.selfNonZero, 0);
  assert.ok(r.acoustic.triangle > 0);
  assert.equal(r.acoustic.zeroPairs, 0);
  assert.equal(r.euclidean.zeroPairs, 0);
  assert.equal(r.path.zeroPairs, 0);
});
