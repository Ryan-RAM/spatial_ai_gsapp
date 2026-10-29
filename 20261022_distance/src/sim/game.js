// One round: the thief tries to steal the diamond and get out through an exit; the police guards
// the diamond and must catch the thief (same or neighbouring cell). Both act once per step.

import { makeRng } from './rng.js';
import { canSee } from './los.js';
import { newPolice, newThief, policeAct, thiefAct, headingTo, nearestExit, POLICE_MODES, THIEF_MODES } from './ai.js';
import { describeDistances } from './hints.js';

const FACINGS = [0, 1, 2, 3, 4, 5, 6, 7].map((k) => (k * Math.PI) / 4);

export function newGame(ctx, round = 1, seed = ctx.seed * 7919 + round) {
  const rng = makeRng(seed);
  const { world, pf, metrics, config } = ctx;

  // The diamond: a fairly hidden cell (exposure below the median), not next to an exit.
  const exposures = world.nodes.map((n) => ctx.exposure(n)).sort((a, b) => a - b);
  const medianExposure = exposures[Math.floor(exposures.length / 2)];
  const exitNodes = new Set(ctx.exits.map((e) => e.node));
  const diamondOptions = world.nodes.filter((n) => !exitNodes.has(n)
    && ctx.exposure(n) <= medianExposure
    && pf.distance(n, nearestExit(ctx, n).node) >= config.diamondMinFromExit);
  const diamondNode = rng.pick(diamondOptions);
  const fromDiamond = pf.row(diamondNode);
  const [pMin, pMax] = config.policeStartFromDiamond;
  const policeOptions = world.nodes.filter((n) => {
    const d = fromDiamond[world.nodeIndex[n]];
    return d >= pMin && d <= pMax;
  });

  // The police starts near the diamond; the thief starts far from both, out of each other's sight.
  let police;
  let thief;
  for (let attempt = 0; attempt < 500; attempt++) {
    police = newPolice(rng.pick(policeOptions), rng.pick(FACINGS));
    const row = pf.row(police.node);
    const options = world.nodes.filter((n) => row[world.nodeIndex[n]] >= config.minStartPathDistance
      && fromDiamond[world.nodeIndex[n]] >= config.thiefStartFromDiamond
      && metrics.euclidean(n, police.node) > config.visionRange);
    if (!options.length) continue;
    thief = newThief(rng.pick(options), rng.pick(FACINGS));
    if (!canSee(world, police.node, police.facing, thief.node).visible
      && !canSee(world, thief.node, thief.facing, police.node).visible) break;
  }

  const game = {
    ctx, rng, round, step: 0, over: false, winner: null,
    police, thief,
    diamond: { home: diamondNode, carried: false },
    events: [],
    sounds: [],          // sounds made during the latest step: { who, node, heard }
    perception: null,    // who heard / saw whom during the latest step
    history: [],
    hint: null,
    log(who, kind, text) { game.events.push({ step: game.step, round: game.round, who, kind, text }); },
  };
  game.perception = perceive(game);
  record(game);
  return game;
}

function perceive(game) {
  const { world } = game.ctx;
  const p = game.police;
  const t = game.thief;
  return {
    policeSees: canSee(world, p.node, p.facing, t.node),
    thiefSees: canSee(world, t.node, t.facing, p.node),
    policeHears: false,
    thiefHears: false,
  };
}

// Footsteps are heard in every direction while the acoustic distance is within the hearing range.
function makeSound(game, who) {
  const { metrics, config } = game.ctx;
  const mover = who === 'police' ? game.police : game.thief;
  const listener = who === 'police' ? game.thief : game.police;
  // soft steps: a sneaking thief is quieter, as if it were `sneakQuietness` cells farther away
  const soft = who === 'thief' && (mover.mode === 'sneak' || mover.mode === 'wait' || mover.mode === 'look');
  const heard = metrics.acoustic(mover.node, listener.node) + (soft ? config.sneakQuietness : 0) <= config.hearingRange;
  game.sounds.push({ who, node: mover.node, heard });
  if (!heard) return false;
  listener.heardAt = mover.node;
  // The listener turns the head toward the sound right away (a fleeing thief keeps running).
  const turnOk = who === 'thief' ? config.ai.policeTurnOnHear !== false : listener.mode !== 'flee';
  const h = headingTo(game.ctx, listener.node, mover.node);
  if (turnOk && h !== null) listener.facing = h;
  if (who === 'thief') game.log('police', 'hear', 'Police heard the thief’s footsteps.');
  else if (game.step - game.thief.lastHeardLogged > 15) {
    game.thief.lastHeardLogged = game.step;
    game.log('thief', 'hear', 'Thief heard the police’s footsteps.');
  }
  return true;
}

// Same or neighbouring cell on the same level.
function caught(game) {
  return game.ctx.pf.distance(game.police.node, game.thief.node) <= game.ctx.config.catchDistance;
}

function endRound(game, winner, kind, text) {
  game.over = true;
  game.winner = winner;
  game.log(winner, kind, text);
}

// Updates what each agent sees. Seeing the thief does not end the round: it starts a chase.
function checkSight(game) {
  const { world } = game.ctx;
  const p = game.police;
  const t = game.thief;
  const ps = canSee(world, p.node, p.facing, t.node);
  p.seesThief = ps.visible;
  if (ps.visible) {
    p.thiefAt = t.node;
  }
  const ts = canSee(world, t.node, t.facing, p.node);
  if (ts.visible) {
    if (!t.seesPolice) game.log('thief', 'see', `Thief spotted the police at ${ts.dist.toFixed(1)} cells.`);
    t.seesPolice = true;
    t.lastPolice = p.node;
    t.policeFacing = p.facing;
    t.lastPoliceStep = game.step;
  } else {
    t.seesPolice = false;
  }
}

export function stepGame(game) {
  if (game.over) return game;
  const { config } = game.ctx;
  game.step++;
  game.sounds = [];
  let policeHears = false;
  let thiefHears = false;

  if (policeAct(game.ctx, game, game.rng)) {
    thiefHears = makeSound(game, 'police');
    if (thiefHears) {
      game.thief.lastPolice = game.police.node;
      game.thief.lastPoliceStep = game.step;
      game.thief.policeFacing = game.police.facing;
    }
  }
  if (caught(game)) endRound(game, 'police', 'win', 'Police caught the thief. Police wins.');
  else checkSight(game);

  if (!game.over) {
    if (thiefAct(game.ctx, game, game.rng)) policeHears = makeSound(game, 'thief');
    const t = game.thief;
    if (caught(game)) {
      endRound(game, 'police', 'win', 'The thief ran into the police. Police wins.');
    } else if (!t.carrying && t.node === game.diamond.home) {
      t.carrying = true;
      game.diamond.carried = true;
      game.log('thief', 'steal', 'The thief took the diamond! Now it needs an exit.');
      game.police.knowsTheft = true;
      game.police.stamina = game.ctx.config.speeds.policeSprintStamina;
      game.log('police', 'track', 'The diamond\u2019s tracker goes off: the police now knows where it is at every step.');
    }
    if (!game.over && t.carrying && game.ctx.exits.some((e) => e.node === t.node)) {
      const side = game.ctx.exits.find((e) => e.node === t.node).side;
      endRound(game, 'thief', 'win', `The thief escaped with the diamond through the ${side} exit. Thief wins.`);
    }
    if (!game.over) checkSight(game);
  }

  if (!game.over && game.step >= config.maxSteps) {
    endRound(game, 'police', 'win', `Time is up after ${config.maxSteps} steps: the diamond is safe. Police wins.`);
  }

  game.perception = { ...perceive(game), policeHears, thiefHears };
  record(game);
  return game;
}

function record(game) {
  const { metrics } = game.ctx;
  const a = game.police.node;
  const b = game.thief.node;
  game.distances = {
    euclidean: metrics.euclidean(a, b),
    acoustic: metrics.acoustic(a, b),
    path: metrics.path(a, b),
    perceptual: metrics.perceptual(a, b),
  };
  game.history.push({ step: game.step, ...game.distances });
  game.hint = describeDistances(game);
}

export const modeLabel = (who, mode) => (who === 'police' ? POLICE_MODES[mode] : THIEF_MODES[mode]);

// Plays a whole round without rendering; returns { winner, steps }.
export function playRound(ctx, round, seed) {
  const game = newGame(ctx, round, seed);
  while (!game.over) stepGame(game);
  return { winner: game.winner, steps: game.step, game };
}
