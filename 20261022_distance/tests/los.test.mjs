// 3D line of sight and forward vision cone.

import test from 'node:test';
import assert from 'node:assert/strict';
import { canSee, castRay, eyePoint, inCone } from '../src/sim/los.js';
import { CONFIG } from '../src/sim/config.js';
import { makeTestWorld, EAST, WEST, NORTH, SOUTH } from './helpers.mjs';

const OPEN = [
  '##############',
  '#............#',
  '#............#',
  '#............#',
  '#............#',
  '#............#',
  '#............#',
  '#............#',
  '##############',
];

test('same level, nothing in between: visible', () => {
  const { world, at } = makeTestWorld(OPEN);
  const r = canSee(world, at(0, 2, 4), EAST, at(0, 7, 4));
  assert.equal(r.visible, true);
  assert.equal(r.dist, 5);
});

test('a tree between the two blocks the view', () => {
  const g = OPEN.slice();
  g[4] = '#....T.......#';
  const { world, at } = makeTestWorld(g);
  const r = canSee(world, at(0, 2, 4), EAST, at(0, 7, 4));
  assert.equal(r.inRange, true);
  assert.equal(r.inCone, true);
  assert.equal(r.clear, false);
  assert.equal(r.visible, false);
});

test('a bush blocks the view on the ground but not from the canopy above', () => {
  const g = OPEN.slice();
  g[4] = '#.....b......#';
  const canopy = [
    '              ',
    '              ',
    '              ',
    '              ',
    ' ===          ',
    '              ',
    '              ',
    '              ',
    '              ',
  ];
  const { world, at } = makeTestWorld(g, canopy);
  assert.equal(canSee(world, at(0, 2, 4), EAST, at(0, 9, 4)).visible, false);
  // from the platform edge at (3,4) the eye is at 4.5, well above the 1.8 bush
  assert.equal(canSee(world, at(1, 3, 4), EAST, at(0, 9, 4)).visible, true);
});

test('a platform floor slab hides a person standing above', () => {
  const canopy = [
    '              ',
    ' ==========   ',
    ' ==========   ',
    ' ==========   ',
    ' ==========   ',
    ' ==========   ',
    '              ',
    '              ',
    '              ',
  ];
  const { world, at } = makeTestWorld(OPEN, canopy);
  // ground (4,3) looking up at canopy (6,3): 2 cells across, 3 up -> 56 degrees, inside the cone
  const up = canSee(world, at(0, 4, 3), EAST, at(1, 6, 3));
  assert.equal(up.inCone, true);
  assert.equal(up.inRange, true);
  assert.equal(up.clear, false);
  assert.equal(up.visible, false);
  const down = canSee(world, at(1, 6, 3), WEST, at(0, 4, 3));
  assert.equal(down.visible, false);
});

test('through open air: visible from the platform edge down to the ground, and back up', () => {
  const canopy = [
    '              ',
    '              ',
    '              ',
    '              ',
    '====          ',
    '              ',
    '              ',
    '              ',
    '              ',
  ];
  const { world, at } = makeTestWorld(OPEN, canopy);
  const down = canSee(world, at(1, 3, 4), EAST, at(0, 7, 4));
  assert.equal(down.visible, true);
  const up = canSee(world, at(0, 7, 4), WEST, at(1, 3, 4));
  assert.equal(up.visible, true);
});

test('beyond 9 cells the fog hides everything', () => {
  const g = [
    '##############',
    '#............#',
    '##############',
  ];
  const { world, at } = makeTestWorld(g);
  const near = canSee(world, at(0, 1, 1), EAST, at(0, 10, 1));
  assert.equal(near.dist, 9);
  assert.equal(near.visible, true);
  const far = canSee(world, at(0, 1, 1), EAST, at(0, 11, 1));
  assert.equal(far.inRange, false);
  assert.equal(far.visible, false);
});

test('a target behind the viewer is outside the cone and not visible', () => {
  const { world, at } = makeTestWorld(OPEN);
  const r = canSee(world, at(0, 7, 4), EAST, at(0, 3, 4));
  assert.equal(r.clear, true);
  assert.equal(r.inCone, false);
  assert.equal(r.visible, false);
});

test('vision is one-sided: A can see B while B, facing away, cannot see A', () => {
  const { world, at } = makeTestWorld(OPEN);
  const a = at(0, 2, 4);
  const b = at(0, 7, 4);
  assert.equal(canSee(world, a, EAST, b).visible, true);
  assert.equal(canSee(world, b, EAST, a).visible, false);
});

test('cone edges: 60 degrees to each side and 60 degrees up or down', () => {
  const c = CONFIG;
  const deg = Math.PI / 180;
  assert.equal(inCone(c, EAST, Math.cos(59 * deg), Math.sin(59 * deg), 0), true);
  assert.equal(inCone(c, EAST, Math.cos(61 * deg), Math.sin(61 * deg), 0), false);
  assert.equal(inCone(c, EAST, Math.cos(59 * deg), 0, Math.sin(59 * deg)), true);
  assert.equal(inCone(c, EAST, Math.cos(61 * deg), 0, -Math.sin(61 * deg)), false);
  assert.equal(inCone(c, NORTH, 0, -1, 0), true);
  assert.equal(inCone(c, SOUTH, 0, -1, 0), false);
  assert.equal(inCone(c, EAST, 0, 0, 1), false); // straight up
});

test('rays stop at the ground, at slabs and at the fog limit', () => {
  const canopy = [
    '              ',
    '              ',
    '  ===         ',
    '              ',
    '              ',
    '              ',
    '              ',
    '              ',
    '              ',
  ];
  const { world, at } = makeTestWorld(OPEN, canopy);
  const [x, y, z] = eyePoint(world, at(0, 3, 2));
  assert.ok(Math.abs(castRay(world, x, y, z, 0, 0, -1, 9) - 1.5) < 1e-9); // down to the ground
  assert.ok(Math.abs(castRay(world, x, y, z, 0, 0, 1, 9) - 1.25) < 1e-9); // up to the slab bottom
  const [x2, y2, z2] = eyePoint(world, at(0, 3, 6));
  assert.equal(castRay(world, x2, y2, z2, 0, 0, 1, 9), 9); // open sky
  const [x3, y3, z3] = eyePoint(world, at(1, 3, 2));
  assert.ok(Math.abs(castRay(world, x3, y3, z3, 0, 0, -1, 9) - 1.5) < 1e-9); // platform floor
  assert.ok(Math.abs(castRay(world, 1.5, 4.5, 1.5, 1, 0, 0, 20) - 11.5) < 1e-9); // the wall
});
