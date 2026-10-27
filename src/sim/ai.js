// Behaviour of the police officer and the thief. Each function performs one action
// (move one cell, or stay and turn the head) and returns true if the agent moved, which makes a sound.
// The thief wants the diamond and then an exit; the police guards the diamond and chases what it sees.
// Once the diamond is taken, its tracker tells the police where it is at every step.

import { canSee, eyePoint, segmentClear } from './los.js';
import { nodeXYL, forEachNeighbour } from './world.js';

export const POLICE_MODES = {
  patrol: 'Patrolling',
  investigate: 'Investigating a sound',
  scan: 'Scanning around',
  chase: 'Chasing the thief',
  track: 'Tracking the diamond',
};
export const THIEF_MODES = {
  sneak: 'Sneaking',
  hide: 'Hiding',
  wait: 'Waiting for a chance',
  look: 'Looking around',
  hold: 'Holding breath',
  flee: 'Fleeing',
  steal: 'Going for the diamond',
  escape: 'Escaping with the diamond',
};

const TURN = Math.PI / 4;

// Horizontal direction from node a to node b (or null when one stands right above the other).
export function headingTo(ctx, a, b) {
  const p = nodeXYL(ctx.world, a);
  const q = nodeXYL(ctx.world, b);
  if (p.x === q.x && p.y === q.y) return null;
  return Math.atan2(q.y - p.y, q.x - p.x);
}

function moveTo(ctx, agent, next) {
  if (next === agent.node) return false;
  const h = headingTo(ctx, agent.node, next);
  if (h !== null) agent.facing = h; // on a ladder the facing stays the same
  agent.node = next;
  return true;
}

// Cells the police (at a known position) could see if it turned toward them.
function exposed(ctx, policeNode, n) {
  const a = eyePoint(ctx.world, policeNode);
  const b = eyePoint(ctx.world, n);
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) <= ctx.config.visionRange && segmentClear(ctx.world, a, b);
}

// The exit the thief would most likely run for, seen from `from`: the one it can reach first.
export function nearestExit(ctx, from) {
  const row = ctx.pf.row(from);
  let best = ctx.exits[0];
  for (const e of ctx.exits) if (row[ctx.world.nodeIndex[e.node]] < row[ctx.world.nodeIndex[best.node]]) best = e;
  return best;
}

// ---------------------------------------------------------------- police

export function newPolice(node, facing) {
  return {
    node, facing, mode: 'patrol', target: null, scanLeft: 0, scanDir: 1, heardAt: null, sinceLook: 0,
    seesThief: false, thiefAt: null, knowsTheft: false, chaseTick: 0,
  };
}

// Patrol targets: open cells around the diamond, sometimes farther out.
function pickPatrolTarget(ctx, game, rng) {
  const { pf, openSet, world, config } = ctx;
  const ai = config.ai;
  const fromHome = pf.row(game.diamond.home);
  const fromPolice = pf.row(game.police.node);
  const near = openSet.filter((n) => {
    const i = world.nodeIndex[n];
    return fromHome[i] <= ai.policeGuardRadius && fromPolice[i] >= ai.policePatrolMin / 2;
  });
  if (near.length && !rng.chance(ai.policeRoamChance)) return rng.pick(near);
  const far = openSet.filter((n) => fromPolice[world.nodeIndex[n]] >= ai.policePatrolMin);
  return rng.pick(far.length ? far : openSet);
}

export function policeAct(ctx, game, rng) {
  const p = game.police;
  const ai = ctx.config.ai;

  // The diamond's tracker: once it is taken, the officer always knows where it is and runs to it
  // along the shortest path, whether or not it can see or hear the thief.
  if (game.diamond.carried) {
    p.mode = 'track';
    p.target = game.thief.node;
    p.heardAt = null;
    if (ai.policeTrackRestEvery > 0 && ++p.chaseTick % ai.policeTrackRestEvery === 0) return false;
    return moveTo(ctx, p, ctx.pf.nextStep(p.node, p.target));
  }

  // Seeing the thief beats everything: run to where it is.
  if (p.seesThief) {
    if (p.mode !== 'chase') game.log('police', 'chase', 'Police spotted the thief and gives chase.');
    p.mode = 'chase';
    p.target = p.thiefAt;
    p.heardAt = null;
  } else if (p.heardAt !== null) {
    // A sound sends the officer to its location. While already on the way somewhere (a sound, or the
    // spot where the thief was last seen), the officer keeps going there first.
    if ((p.mode === 'chase' && ai.policeChaseFollowsSound) || (p.mode === 'investigate' && ai.policeRetarget)) {
      p.target = p.heardAt;
    } else if (p.mode !== 'investigate' && p.mode !== 'chase') {
      game.log('police', 'investigate', 'Police heard footsteps and goes to check.');
      p.mode = 'investigate';
      p.target = p.heardAt;
    }
    p.heardAt = null;
  }

  if (p.mode === 'chase' || p.mode === 'investigate') {
    // heavy gear: when running after the thief, the officer stops to catch its breath now and then
    if (p.mode === 'chase' && ai.policeChaseRestEvery > 0 && ++p.chaseTick % ai.policeChaseRestEvery === 0) return false;
    if (p.node === p.target) {
      game.log('police', 'arrive', p.mode === 'chase'
        ? 'Police lost sight of the thief and scans around.'
        : 'Police reached the sound. Nobody in sight, scanning around.');
      p.mode = 'scan';
      p.scanLeft = ai.policeScanSteps;
      p.scanDir = rng.chance(0.5) ? 1 : -1;
    } else {
      return moveTo(ctx, p, ctx.pf.nextStep(p.node, p.target));
    }
  }

  if (p.mode === 'scan') {
    p.facing += p.scanDir * TURN;
    p.scanLeft--;
    if (p.scanLeft <= 0) { p.mode = 'patrol'; p.target = null; }
    return false;
  }

  // patrol
  if (p.target === null || p.node === p.target) p.target = pickPatrolTarget(ctx, game, rng);
  p.sinceLook++;
  if (ai.policePatrolLookEvery > 0 && p.sinceLook >= ai.policePatrolLookEvery) {
    p.sinceLook = 0;
    p.facing += (rng.chance(0.5) ? 1 : -1) * 2 * TURN; // a quick glance to the side
    return false;
  }
  return moveTo(ctx, p, ctx.pf.nextStep(p.node, p.target));
}

// ---------------------------------------------------------------- thief

export function newThief(node, facing) {
  return {
    node, facing, mode: 'sneak', target: null, hideLeft: 0, holdLeft: 0, sneakTick: 0, sinceLook: 0,
    heardAt: null, seesPolice: false, lastPolice: null, lastPoliceStep: -1e9, policeFacing: null,
    lastMoveStep: -1e9, lastMoveNode: null, lastHeardLogged: -1e9, carrying: false, quiet: 0, prevPolicePath: Infinity,
  };
}

// A waiting spot near the diamond: hidden (few cells can see it), close to the diamond,
// and away from where the police was last noticed.
function pickStagingSpot(ctx, game, rng) {
  const { pf, world, hideSet, config } = ctx;
  const ai = config.ai;
  const t = game.thief;
  const fromDiamond = pf.row(game.diamond.home);
  const fromPolice = t.lastPolice !== null ? pf.row(t.lastPolice) : null;
  let best = null;
  let bestScore = -Infinity;
  for (const n of hideSet) {
    const i = world.nodeIndex[n];
    const dD = fromDiamond[i];
    if (dD > ai.thiefStageRadius || dD < 2) continue;
    let score = -ai.thiefExposureWeight * ctx.exposure(n) - 0.5 * dD + rng.next() * 3;
    if (fromPolice) score += ai.thiefAvoidPoliceWeight * Math.min(fromPolice[i], 20);
    if (score > bestScore) { bestScore = score; best = n; }
  }
  return best ?? game.diamond.home;
}

// The exit to run for: the one with the biggest head start over the police.
function pickExit(ctx, thief) {
  const { pf, world } = ctx;
  const fromThief = pf.row(thief.node);
  const fromPolice = thief.lastPolice !== null ? pf.row(thief.lastPolice) : null;
  let best = null;
  let bestScore = -Infinity;
  for (const e of ctx.exits) {
    const i = world.nodeIndex[e.node];
    const score = (fromPolice ? Math.min(fromPolice[i], 40) : 0) - fromThief[i];
    if (score > bestScore) { bestScore = score; best = e.node; }
  }
  return best;
}

// An escape plan: a first step that breaks the line of sight from the police (a running thief is
// heard, and the officer turns toward the sound), then a cell the thief reaches before the police,
// far from the police and outside the police vision cone.
function pickFleePlan(ctx, thief, police, giveaway) {
  const { pf, world, config } = ctx;
  const fromThief = pf.row(thief.node);
  const fromPolice = pf.row(thief.lastPolice);
  const facing = thief.policeFacing ?? headingTo(ctx, thief.lastPolice, thief.node) ?? police.facing;
  const firstSteps = [];
  forEachNeighbour(world, thief.node, (s, cost) => {
    if (s !== thief.lastPolice && !exposed(ctx, thief.lastPolice, s)) firstSteps.push({ s, cost, row: pf.row(s) });
  });
  let best = null;
  let bestScore = -Infinity;
  for (const n of world.nodes) {
    const i = world.nodeIndex[n];
    const dT = fromThief[i];
    const dP = fromPolice[i];
    if (dT > 20 || dT + config.ai.thiefFleeMargin > dP) continue;
    const via = firstSteps.find((f) => f.cost + f.row[i] <= dT + 1e-6);
    if (!via) continue;
    if (canSee(world, thief.lastPolice, facing, n).visible) continue;
    if (exposed(ctx, thief.lastPolice, n)) continue; // the officer will scan all around on arrival
    if (giveaway !== null && exposed(ctx, giveaway, n)) continue; // nor be seen from the spot that gave it away
    const score = Math.min(dP, 24) - 0.5 * dT - 2 * ctx.open(n) + (dP - dT);
    if (score > bestScore) { bestScore = score; best = { target: n, via: via.s }; }
  }
  if (best) return best;
  // No safe cell: just run, to a reachable cell the thief gets to first, gaining the most distance,
  // and never with a first step next to the police.
  const nextToPolice = (s) => pf.distance(s, thief.lastPolice) <= config.catchDistance;
  for (const n of world.nodes) {
    const i = world.nodeIndex[n];
    if (fromThief[i] > 12 || n === thief.node || fromPolice[i] <= fromThief[i]) continue;
    if (nextToPolice(pf.nextStep(thief.node, n))) continue;
    const score = fromPolice[i] - fromThief[i];
    if (score > bestScore) { bestScore = score; best = { target: n, via: null }; }
  }
  return best;
}

export function thiefAct(ctx, game, rng) {
  const moved = thiefDecide(ctx, game, rng);
  if (moved) { game.thief.lastMoveStep = game.step; game.thief.lastMoveNode = game.thief.node; }
  return moved;
}

function thiefDecide(ctx, game, rng) {
  const t = game.thief;
  const ai = ctx.config.ai;
  const { pf } = ctx;
  const heard = t.heardAt;
  t.heardAt = null;
  t.quiet = heard !== null || t.seesPolice ? 0 : t.quiet + 1;

  // ---- carrying the diamond: run for the best exit, every step
  if (t.carrying) {
    if (t.mode !== 'escape' || heard !== null || t.seesPolice || t.target === null) t.target = pickExit(ctx, t);
    t.mode = 'escape';
    return moveTo(ctx, t, pf.nextStep(t.node, t.target));
  }

  // ---- danger: the police is right there, or could see this cell just by turning around
  // the police position is known if seen or heard now, or only a moment ago
  const known = t.lastPolice !== null
    && (t.seesPolice || heard !== null || game.step - t.lastPoliceStep <= ai.thiefMemorySteps);
  const policePath = known ? pf.distance(t.node, t.lastPolice) : Infinity;
  // Heard the police right after moving: the officer probably heard the thief too and is coming.
  const compromised = heard !== null && game.step - t.lastMoveStep <= ai.thiefGiveawayWindow;
  // Footsteps getting closer and closer: the officer is probably coming for the thief.
  const approaching = heard !== null && policePath < t.prevPolicePath - 0.5 && policePath <= ai.thiefApproachFlee;
  if (heard !== null) t.prevPolicePath = policePath;
  const danger = known && (policePath <= ai.thiefPanicDistance || compromised || approaching
    || (exposed(ctx, t.lastPolice, t.node) && policePath <= ai.thiefExposedFleeDistance));
  t.via = null;

  // Running out of time: go for the diamond whatever the risk.
  const toDiamond = pf.distance(t.node, game.diamond.home);
  const exitAfter = pf.distance(game.diamond.home, nearestExit(ctx, game.diamond.home).node);
  const late = game.step + toDiamond + exitAfter + ai.thiefLateMargin >= ctx.config.maxSteps;

  if (t.mode === 'steal' && !t.seesPolice) {
    // committed: keep running for the diamond
  } else if (danger && !late) {
    // keep running for the current escape cell while the police is still farther from it
    const keep = t.mode === 'flee' && !t.seesPolice && t.target !== null && t.node !== t.target
      && pf.distance(t.target, t.lastPolice) > pf.distance(t.target, t.node) + ai.thiefFleeMargin;
    const plan = keep ? { target: t.target, via: null } : pickFleePlan(ctx, t, game.police, compromised ? t.lastMoveNode : null);
    if (plan) {
      if (t.mode !== 'flee') game.log('thief', 'flee', t.seesPolice ? 'Thief saw the police and runs.' : 'Police too close: the thief runs.');
      t.mode = 'flee';
      t.target = plan.target;
      t.via = plan.via;
    } else if (t.mode !== 'flee') {
      t.mode = 'hold';
      t.holdLeft = ai.thiefHoldBreath;
    }
  } else if (heard !== null && t.mode !== 'flee' && !late) {
    if (t.mode !== 'hold') game.log('thief', 'hold', 'Thief heard the police and holds its breath.');
    t.mode = 'hold';
    t.holdLeft = ai.thiefHoldBreath;
  } else if (late && t.mode !== 'steal') {
    game.log('thief', 'steal', 'Time is running out: the thief goes for the diamond.');
    t.mode = 'steal';
  }

  switch (t.mode) {
    case 'flee':
      if (t.node === t.target) {
        t.mode = 'hide';
        t.hideLeft = ai.thiefHideAfterFlee;
        return false;
      }
      return moveTo(ctx, t, t.via ?? pf.nextStep(t.node, t.target));

    case 'hold':
      t.holdLeft--;
      if (t.holdLeft <= 0) { t.mode = 'sneak'; t.target = null; }
      return false;

    case 'steal':
      if (t.node === game.diamond.home) return false; // the game loop hands over the diamond
      return moveTo(ctx, t, pf.nextStep(t.node, game.diamond.home));

    case 'sneak': {
      if (t.target === null) t.target = pickStagingSpot(ctx, game, rng);
      if (t.node === t.target) {
        t.mode = 'wait';
        t.hideLeft = ai.thiefWaitMax;
        return false;
      }
      t.sneakTick++;
      if (t.sneakTick % ai.thiefSneakEvery !== 0) return false;
      return moveTo(ctx, t, pf.nextStep(t.node, t.target));
    }

    case 'wait':
    case 'look':
      // Close to the diamond: wait until the police has been out of earshot for a while.
      t.hideLeft--;
      if (t.quiet >= ai.thiefQuietSteps || t.hideLeft <= 0) {
        game.log('thief', 'steal', 'All quiet: the thief goes for the diamond.');
        t.mode = 'steal';
        return moveTo(ctx, t, pf.nextStep(t.node, game.diamond.home));
      }
      t.mode = 'wait';
      t.sinceLook++;
      if (t.sinceLook >= ai.thiefLookEvery) {
        t.sinceLook = 0;
        t.mode = 'look';
        t.facing += rng.pick([-2, 2, 4]) * TURN;
      }
      return false;

    case 'hide':
    default:
      // after a narrow escape: lie low for a while, then sneak back toward the diamond
      t.mode = 'hide';
      t.hideLeft--;
      if (t.hideLeft <= 0) { t.mode = 'sneak'; t.target = null; t.sneakTick = 0; }
      return false;
  }
}
