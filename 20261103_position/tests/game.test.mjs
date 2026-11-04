// Round set-up, the diamond, the exits and the step loop.

import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../src/sim/config.js';
import { makeContext } from '../src/sim/context.js';
import { newGame, stepGame, playRound } from '../src/sim/game.js';
import { canSee } from '../src/sim/los.js';
import { nodeXYL } from '../src/sim/world.js';

const ctx = makeContext(CONFIG);
const isExit = (n) => ctx.exits.some((e) => e.node === n);

test('one exit per configured side, on walkable ground cells along the wall', () => {
  assert.deepEqual(ctx.exits.map((e) => e.side).sort(), [...CONFIG.exitSides].sort());
  for (const e of ctx.exits) {
    const { x, y, level } = nodeXYL(ctx.world, e.node);
    assert.equal(level, 0);
    assert.equal(ctx.world.walk[e.node], 1);
    assert.ok(x === 1 || y === 1 || x === ctx.world.W - 2 || y === ctx.world.H - 2);
  }
});

test('rounds start with the police near the diamond and the thief far from both, out of sight', () => {
  for (let r = 1; r <= 20; r++) {
    const g = newGame(ctx, r);
    const home = g.diamond.home;
    const [pMin, pMax] = CONFIG.policeStartFromDiamond;
    const dp = ctx.pf.distance(g.police.node, home);
    assert.ok(dp >= pMin && dp <= pMax, `police ${dp} from the diamond`);
    assert.ok(ctx.pf.distance(g.thief.node, home) >= CONFIG.thiefStartFromDiamond);
    assert.ok(g.distances.path >= CONFIG.minStartPathDistance);
    assert.ok(g.distances.euclidean > CONFIG.visionRange);
    assert.equal(isExit(home), false);
    assert.equal(g.diamond.carried, false);
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

test('every round ends by a catch, an escape with the diamond, or the time limit', () => {
  const seen = new Set();
  for (let r = 1; r <= 40; r++) {
    const { winner, steps, game } = playRound(ctx, r);
    assert.ok(steps <= CONFIG.maxSteps);
    if (winner === 'thief') {
      assert.equal(game.thief.carrying, true);
      assert.ok(isExit(game.thief.node));
      seen.add('escape');
    } else if (steps < CONFIG.maxSteps) {
      assert.ok(ctx.pf.distance(game.police.node, game.thief.node) <= CONFIG.catchDistance);
      seen.add('catch');
    } else {
      seen.add('time');
    }
  }
  assert.ok(seen.has('escape') && seen.has('catch'), [...seen].join(', '));
});

test('seeing the thief starts a chase instead of ending the round', () => {
  let chases = 0;
  for (let r = 1; r <= 20; r++) {
    const g = newGame(ctx, r);
    while (!g.over) {
      stepGame(g);
      if (g.police.seesThief && !g.over) {
        assert.equal(ctx.pf.distance(g.police.node, g.thief.node) > CONFIG.catchDistance, true);
        chases++;
        break;
      }
    }
  }
  assert.ok(chases > 0);
});

test('the diamond is picked up on its cell and carried from then on', () => {
  for (let r = 1; r <= 40; r++) {
    const g = newGame(ctx, r);
    let carriedAt = null;
    while (!g.over) {
      stepGame(g);
      if (g.diamond.carried && carriedAt === null) {
        carriedAt = g.step;
        assert.equal(g.thief.carrying, true);
        assert.ok(g.events.some((e) => e.kind === 'steal' && e.text.includes('took the diamond')));
      }
      if (carriedAt !== null) assert.equal(g.thief.carrying, true);
    }
    if (carriedAt !== null) return;
  }
  assert.fail('no round had a theft');
});

test('the same round seed replays identically', () => {
  const a = playRound(ctx, 5);
  const b = playRound(ctx, 5);
  assert.equal(a.winner, b.winner);
  assert.equal(a.steps, b.steps);
});
