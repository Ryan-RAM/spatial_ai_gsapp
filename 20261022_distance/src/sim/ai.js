// Behaviour of the police officer and the thief. Each function performs one action
// (move one cell, or stay and turn the head) and returns true if the agent moved, which makes a sound.

import { canSee, eyePoint, segmentClear } from './los.js';
import { nodeXYL, forEachNeighbour } from './world.js';

export const POLICE_MODES = {
  patrol: 'Patrolling',
  investigate: 'Investigating a sound',
  scan: 'Scanning around',
};
export const THIEF_MODES = {
  sneak: 'Sneaking',
  hide: 'Hiding',
  look: 'Looking around',
  hold: 'Holding breath',
  flee: 'Fleeing',
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

// ---------------------------------------------------------------- police

export function newPolice(node, facing) {
  return { node, facing, mode: 'patrol', target: null, scanLeft: 0, scanDir: 1, heardAt: null, sinceLook: 0 };
}

function pickPatrolTarget(ctx, police, rng) {
  const { pf, openSet, config } = ctx;
  const row = pf.row(police.node);
  const far = openSet.filter((n) => row[ctx.world.nodeIndex[n]] >= config.ai.policePatrolMin);
  return rng.pick(far.length ? far : openSet);
}

export function policeAct(ctx, game, rng) {
  const p = game.police;
  const ai = ctx.config.ai;

  // A new sound sends the officer to its location. While already on the way to a sound, the
  // officer keeps going to that first location unless policeRetarget is on.
  if (p.heardAt !== null) {
    if (p.mode !== 'investigate') {
      game.log('police', 'investigate', 'Police heard footsteps and goes to check.');
      p.mode = 'investigate';
      p.target = p.heardAt;
    } else if (ai.policeRetarget) {
      p.target = p.heardAt;
    }
    p.heardAt = null;
  }

  if (p.mode === 'investigate') {
    if (p.node === p.target) {
      game.log('police', 'arrive', 'Police reached the sound. Nobody in sight, scanning around.');
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
  if (p.target === null || p.node === p.target) p.target = pickPatrolTarget(ctx, p, rng);
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
    node, facing, mode: 'hide', target: null, hideLeft: 10, holdLeft: 0, sneakTick: 0, sinceLook: 0,
    heardAt: null, seesPolice: false, lastPolice: null, lastPoliceStep: -1e9, policeFacing: null,
    lastMoveStep: -1e9, lastMoveNode: null, lastHeardLogged: -1e9,
  };
}

function pickHideSpot(ctx, thief, rng) {
  const { pf, world, hideSet, config } = ctx;
  const ai = config.ai;
  const fromThief = pf.row(thief.node);
  const known = thief.lastPolice !== null;
  const fromPolice = known ? pf.row(thief.lastPolice) : null;
  let best = null;
  let bestScore = -Infinity;
  for (const n of hideSet) {
    const dT = fromThief[world.nodeIndex[n]];
    if (n === thief.node || dT > config.ai.thiefHideSearchRadius || dT < 4) continue;
    let score = -0.15 * dT - ai.thiefExposureWeight * ctx.exposure(n) + rng.next() * 3;
    if (known) score += ai.thiefAvoidPoliceWeight * Math.min(fromPolice[world.nodeIndex[n]], 30);
    if (score > bestScore) { bestScore = score; best = n; }
  }
  return best ?? rng.pick(hideSet);
}

// Cells the police (at its last known position) could see if it turned toward them.
function exposed(ctx, policeNode, n) {
  const a = eyePoint(ctx.world, policeNode);
  const b = eyePoint(ctx.world, n);
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) <= ctx.config.visionRange && segmentClear(ctx.world, a, b);
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
  const heard = t.heardAt;
  t.heardAt = null;

  // Danger: the police is right there, or could see this cell just by turning around.
  const known = t.lastPolice !== null && (t.seesPolice || heard !== null);
  const policePath = known ? ctx.pf.distance(t.node, t.lastPolice) : Infinity;
  // Heard the police right after moving: the officer probably heard the thief too and is coming.
  const compromised = heard !== null && game.step - t.lastMoveStep <= ai.thiefGiveawayWindow;
  const danger = known && (policePath <= ai.thiefPanicDistance || compromised
    || (exposed(ctx, t.lastPolice, t.node) && policePath <= ai.thiefExposedFleeDistance));
  t.via = null;
  if (danger) {
    const plan = pickFleePlan(ctx, t, game.police, compromised ? t.lastMoveNode : null);
    if (plan) {
      if (t.mode !== 'flee') game.log('thief', 'flee', t.seesPolice ? 'Thief saw the police and runs.' : 'Police too close: the thief runs.');
      t.mode = 'flee';
      t.target = plan.target;
      t.via = plan.via;
    } else if (t.mode !== 'flee') {
      t.mode = 'hold';
      t.holdLeft = ai.thiefHoldBreath;
    }
  } else if (heard !== null && t.mode !== 'flee') {
    if (t.mode !== 'hold') game.log('thief', 'hold', 'Thief heard the police and holds its breath.');
    t.mode = 'hold';
    t.holdLeft = ai.thiefHoldBreath;
  }

  switch (t.mode) {
    case 'flee':
      if (t.node === t.target) {
        t.mode = 'hide';
        t.hideLeft = ai.thiefHideMin;
        return false;
      }
      return moveTo(ctx, t, t.via ?? ctx.pf.nextStep(t.node, t.target));

    case 'hold':
      t.holdLeft--;
      if (t.holdLeft <= 0) t.mode = t.target !== null && t.target !== t.node ? 'sneak' : 'hide';
      return false;

    case 'sneak':
      if (t.node === t.target) {
        t.mode = 'hide';
        t.hideLeft = rng.int(ai.thiefHideMin, ai.thiefHideMax);
        return false;
      }
      t.sneakTick++;
      if (t.sneakTick % ai.thiefSneakEvery !== 0) return false;
      return moveTo(ctx, t, ctx.pf.nextStep(t.node, t.target));

    case 'look':
    case 'hide':
    default:
      t.mode = 'hide';
      t.hideLeft--;
      t.sinceLook++;
      if (t.hideLeft <= 0) {
        t.target = pickHideSpot(ctx, t, rng);
        t.mode = 'sneak';
        t.sneakTick = 0;
        return false;
      }
      if (t.sinceLook >= ai.thiefLookEvery) {
        t.sinceLook = 0;
        t.mode = 'look';
        t.facing += rng.pick([-2, 2, 4]) * TURN;
      }
      return false;
  }
}
