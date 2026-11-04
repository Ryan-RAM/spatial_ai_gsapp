// Position and movement relations, and the owls.

import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../src/sim/config.js';
import { makeContext } from '../src/sim/context.js';
import { newGame, stepGame } from '../src/sim/game.js';
import { isAdjacent, isAbove, isBetween, isBehind, coverAt, stepOwls } from '../src/sim/relations.js';
import { makeTestWorld, EAST, WEST } from './helpers.mjs';

const open = [
  '##########',
  '#........#',
  '#........#',
  '#...H....#',
  '#........#',
  '##########',
];
const canopy = [
  '          ',
  '  ====    ',
  '  ====    ',
  '  =H==    ',
  '          ',
  '          ',
];

test('adjacent: one walking step, or the same column on the other level; never through a gap', () => {
  const { world, at } = makeTestWorld(open, canopy);
  assert.ok(isAdjacent(world, at(0, 2, 2), at(0, 3, 2)));
  assert.ok(isAdjacent(world, at(0, 2, 2), at(0, 3, 3)), 'diagonal');
  assert.ok(!isAdjacent(world, at(0, 2, 2), at(0, 4, 2)), 'one free cell in between');
  assert.ok(isAdjacent(world, at(0, 3, 2), at(1, 3, 2)), 'stacked: nothing to stand on between the levels');
  assert.ok(isAdjacent(world, at(0, 4, 3), at(1, 4, 3)), 'ladder');
  assert.ok(!isAdjacent(world, at(0, 2, 2), at(0, 2, 2)), 'a cell is not adjacent to itself');
});

test('adjacent: a diagonal step that cuts a tree corner is not adjacent', () => {
  const { world, at } = makeTestWorld([
    '#####',
    '#.T.#',
    '#...#',
    '#####',
  ]);
  assert.equal(isAdjacent(world, at(0, 1, 1), at(0, 2, 2)), false); // the corner (2, 1) is a tree
  assert.equal(isAdjacent(world, at(0, 1, 2), at(0, 2, 2)), true);
});

test('above: on the canopy within two columns of someone on the ground', () => {
  const { world, at } = makeTestWorld(open, canopy);
  assert.ok(isAbove(world, at(1, 3, 2), at(0, 3, 2)));
  assert.ok(isAbove(world, at(1, 3, 2), at(0, 5, 3)));
  assert.ok(!isAbove(world, at(1, 3, 2), at(0, 7, 2)));
  assert.ok(!isAbove(world, at(0, 3, 2), at(1, 3, 2)), 'the ground is below, not above');
});

test('between: on the segment, inside the tolerance, not past either end', () => {
  const { world, at } = makeTestWorld(open, canopy);
  const a = at(0, 1, 2);
  const b = at(0, 8, 2);
  assert.ok(isBetween(world, a, at(0, 4, 2), b, 1.6));
  assert.ok(isBetween(world, a, at(0, 4, 3), b, 1.6));
  assert.ok(!isBetween(world, a, at(0, 4, 4), b, 1.6), 'too far from the line');
  assert.ok(!isBetween(world, a, at(0, 8, 3), b, 1.6), 'at the end, not between');
  assert.ok(!isBetween(world, a, at(1, 4, 2), b, 1.6), 'on the canopy above a ground path');
});

test('behind: the rear half of the facing, within range', () => {
  const { world, at } = makeTestWorld(open, canopy);
  const me = at(0, 5, 2);
  assert.ok(isBehind(world, me, EAST, at(0, 2, 2), 9));
  assert.ok(!isBehind(world, me, WEST, at(0, 2, 2), 9));
  assert.ok(!isBehind(world, me, EAST, at(0, 8, 2), 9));
  assert.ok(!isBehind(world, me, EAST, at(0, 2, 2), 2), 'out of range');
});

test('among: counts solid cells around and names the main material', () => {
  const { world, at } = makeTestWorld([
    '#######',
    '#TTb..#',
    '#T.T..#',
    '#TbT..#',
    '#######',
  ]);
  const c = coverAt(world, at(0, 2, 2));
  assert.equal(c.solid, 8);
  assert.equal(c.kind, 'trees');
  assert.equal(coverAt(world, at(0, 4, 2)).solid, 3);
});

test('relations are listed every step and movements carry a mover', () => {
  const ctx = makeContext(CONFIG);
  const kinds = new Set();
  for (let r = 1; r <= 12; r++) {
    const g = newGame(ctx, r);
    while (!g.over) {
      stepGame(g);
      for (const m of g.relations.movement) {
        assert.ok(['police', 'thief'].includes(m.who));
        kinds.add(m.kind);
      }
      for (const p of g.relations.position) kinds.add(p.kind);
    }
  }
  for (const k of ['toward', 'away', 'behind', 'between', 'among', 'adjacent']) assert.ok(kinds.has(k), k);
});

test('owls perch apart from the diamond and hoot once when the thief is next to them', () => {
  const ctx = makeContext(CONFIG);
  const g = newGame(ctx, 1);
  assert.equal(g.owls.length, CONFIG.owls.count);
  for (const o of g.owls) assert.ok(ctx.pf.distance(o.node, g.diamond.home) >= CONFIG.owls.minFromDiamond);
  const owl = g.owls[0];
  g.thief.node = owl.node;
  g.police.node = owl.node; // right there: hears it for sure
  g.sounds = [];
  const hoots = stepOwls(g);
  assert.equal(hoots.length, 1);
  assert.equal(hoots[0].heard, true);
  assert.equal(g.police.heardAt, owl.node);
  assert.equal(stepOwls(g).length, 0, 'resting after a hoot');
});

test('a rounds still ends, with the new relations in place', () => {
  const ctx = makeContext(CONFIG, CONFIG.seed + 3);
  for (let r = 1; r <= 10; r++) {
    const g = newGame(ctx, r);
    while (!g.over) stepGame(g);
    assert.ok(['police', 'thief'].includes(g.winner));
  }
});
