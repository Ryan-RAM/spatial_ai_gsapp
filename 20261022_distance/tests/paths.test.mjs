// Path distance and map generation.

import test from 'node:test';
import assert from 'node:assert/strict';
import { makePathfinder } from '../src/sim/paths.js';
import { generateWorld, forEachNeighbour } from '../src/sim/world.js';
import { CONFIG } from '../src/sim/config.js';
import { makeTestWorld } from './helpers.mjs';

const close = (a, b) => Math.abs(a - b) < 1e-5;

test('straight and diagonal steps', () => {
  const { world, at } = makeTestWorld([
    '#######',
    '#.....#',
    '#.....#',
    '#.....#',
    '#######',
  ]);
  const pf = makePathfinder(world);
  assert.ok(close(pf.distance(at(0, 1, 1), at(0, 5, 1)), 4));
  assert.ok(close(pf.distance(at(0, 1, 1), at(0, 3, 3)), 2 * Math.SQRT2));
  assert.ok(close(pf.distance(at(0, 1, 1), at(0, 5, 3)), 2 + 2 * Math.SQRT2));
});

test('no cutting across the corner of an obstacle', () => {
  const { world, at } = makeTestWorld([
    '#####',
    '#.T.#',
    '#...#',
    '#####',
  ]);
  const pf = makePathfinder(world);
  // (1,1) -> (3,1) around the tree at (2,1). Both diagonals would brush the tree's corner,
  // so the walk is down, right, right, up = 4 instead of 2 * sqrt 2.
  assert.ok(close(pf.distance(at(0, 1, 1), at(0, 3, 1)), 4));
});

test('a bush wall makes the walk much longer than the straight line', () => {
  const { world, at } = makeTestWorld([
    '#########',
    '#...b...#',
    '#...b...#',
    '#...b...#',
    '#.......#',
    '#########',
  ]);
  const pf = makePathfinder(world);
  const d = pf.distance(at(0, 3, 1), at(0, 5, 1));
  assert.ok(d > 5, `expected a detour, got ${d}`);
  const p = pf.path(at(0, 3, 1), at(0, 5, 1));
  assert.equal(p[0], at(0, 3, 1));
  assert.equal(p[p.length - 1], at(0, 5, 1));
});

test('a ladder costs 3 and is the only way between levels', () => {
  const { world, at } = makeTestWorld(
    [
      '#######',
      '#H....#',
      '#.....#',
      '#######',
    ],
    [
      '       ',
      ' H===  ',
      '       ',
      '       ',
    ],
  );
  const pf = makePathfinder(world);
  assert.ok(close(pf.distance(at(0, 1, 1), at(1, 1, 1)), 3));
  // from the ground below the platform end (4,1) up to the platform end (4,1): 3 across, ladder, 3 back
  assert.ok(close(pf.distance(at(0, 4, 1), at(1, 4, 1)), 3 + 3 + 3));
});

test('generated maps are fully connected', () => {
  for (const seed of [CONFIG.seed, 1, 2, 3, 42]) {
    const world = generateWorld(CONFIG, seed);
    const pf = makePathfinder(world);
    const row = pf.row(world.nodes[0]);
    const unreachable = world.nodes.filter((n) => !Number.isFinite(row[world.nodeIndex[n]]));
    assert.equal(unreachable.length, 0, `seed ${seed}`);
    assert.ok(world.ladders.length >= 3, `seed ${seed} has ${world.ladders.length} ladders`);
    let canopyCells = 0;
    for (const n of world.nodes) if (n >= world.N) canopyCells++;
    assert.ok(canopyCells > 40, `seed ${seed} canopy ${canopyCells}`);
  }
});

test('the same seed always gives the same map', () => {
  const a = generateWorld(CONFIG, 99);
  const b = generateWorld(CONFIG, 99);
  assert.deepEqual(Array.from(a.ground), Array.from(b.ground));
  assert.deepEqual(Array.from(a.canopy), Array.from(b.canopy));
});

test('neighbours are symmetric', () => {
  const world = generateWorld(CONFIG);
  for (const n of world.nodes.slice(0, 200)) {
    forEachNeighbour(world, n, (m, cost) => {
      let back = -1;
      forEachNeighbour(world, m, (k, c) => { if (k === n) back = c; });
      assert.equal(back, cost);
    });
  }
});
