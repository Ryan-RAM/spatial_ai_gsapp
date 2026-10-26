// Round set-up and the step loop.

import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../src/sim/config.js';
import { makeContext } from '../src/sim/context.js';
import { newGame, stepGame, playRound } from '../src/sim/game.js';
import { canSee } from '../src/sim/los.js';

const ctx = makeContext(CONFIG);

test('rounds start far apart and out of sight', () => {
  for (let r = 1; r <= 20; r++) {
    const g = newGame(ctx, r);
    assert.ok(g.distances.path >= CONFIG.minStartPathDistance);
    assert.ok(g.distances.euclidean > CONFIG.visionRange);
    assert.equal(canSee(ctx.world, g.police.node, g.police.facing, g.thief.node).visible, false);
    assert.equal(canSee(ctx.world, g.thief.node, g.thief.facing, g.police.node).visible, false);
  }
});

test('agents move at most one cell per step and only onto walkable cells', () => {
  const g = newGame(ctx, 3);
  let prevP = g.police.node;
  let prevT = g.thief.node;
  while (!g.over) {
    stepGame(g);
    for (const [prev, cur] of [[prevP, g.police.node], [prevT, g.thief.node]]) {
      assert.equal(ctx.world.walk[cur], 1);
      assert.ok(ctx.pf.distance(prev, cur) <= CONFIG.ladderCost + 1e-9);
    }
    prevP = g.police.node;
    prevT = g.thief.node;
  }
});

test('a round ends with a winner, and the police only wins by seeing the thief', () => {
  for (let r = 1; r <= 10; r++) {
    const { winner, steps, game } = playRound(ctx, r);
    assert.ok(winner === 'police' || winner === 'thief');
    assert.ok(steps <= CONFIG.maxSteps);
    if (winner === 'police') assert.equal(game.perception.policeSees.visible, true);
    else assert.equal(steps, CONFIG.maxSteps);
  }
});

test('the same round seed replays identically', () => {
  const a = playRound(ctx, 5);
  const b = playRound(ctx, 5);
  assert.equal(a.winner, b.winner);
  assert.equal(a.steps, b.steps);
});
