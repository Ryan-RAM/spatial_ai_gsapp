// A simple scripted player, used only to balance the game (tests/balance.mjs) and in the tests.
// It walks quietly toward the case, then runs for the hospital, steps away from the creature when
// it is close, and shoots when the creature is coming for it.

import { forEachNeighbour } from './world.js';
import { directionTo, ladderPartner, newRun, stepRun } from './escape.js';

export function botInput(game, { skill = 1 } = {}) {
  const { world, pf, metrics, config } = game.ctx;
  const me = game.player;
  const c = game.creature;
  const goal = me.carrying ? game.door : game.caseItem.node;
  // the bot only knows what a player could know: where it last saw or heard the creature
  const fresh = me.knownCreature !== null && game.step - me.knownStep <= 12;
  const where = fresh ? me.knownCreature : null;
  const frozen = c.frozenLeft > 0 && me.seesCreature;
  const dC = where === null ? Infinity : pf.distance(me.node, where);
  const hunting = !frozen && where !== null && dC <= 9;

  const input = { dx: 0, dy: 0, run: (me.carrying && game.alarmLeft > 0) || (hunting && dC <= 6), shoot: false, climb: false };
  if (!frozen && me.seesCreature && me.ammo > 0 && metrics.euclidean(me.node, c.node) <= config.game.shotRange - 1 && pf.distance(me.node, c.node) <= 3 + skill) input.shoot = true;

  // pick the neighbour that gets closer to the goal without walking into the creature
  const rowGoal = pf.row(goal);
  const rowC = where === null ? null : pf.row(where);
  const idx = (n) => world.nodeIndex[n];
  let best = null;
  let bestScore = Infinity;
  forEachNeighbour(world, me.node, (n, cost) => {
    let score = cost + rowGoal[idx(n)];
    if (!frozen && rowC) {
      const dn = rowC[idx(n)];
      if (dn <= 1.5) score += 100;
      else if (hunting) score -= skill * 0.6 * Math.min(dn, 6);
    }
    if (score < bestScore) { bestScore = score; best = n; }
  });
  if (best === null) return input;
  if (ladderPartner(world, me.node) === best) { input.climb = true; return input; }
  Object.assign(input, directionTo(world, me.node, best));
  return input;
}

export function playBotRun(ctx, opts = {}) {
  const game = newRun(ctx, opts);
  while (!game.over) stepRun(game, botInput(game, opts));
  return game;
}
