// One round of the chase: both agents act once per step; sight decides the winner.

import { makeRng } from './rng.js';
import { canSee } from './los.js';
import { newPolice, newThief, policeAct, thiefAct, headingTo, POLICE_MODES, THIEF_MODES } from './ai.js';
import { describeDistances } from './hints.js';

const FACINGS = [0, 1, 2, 3, 4, 5, 6, 7].map((k) => (k * Math.PI) / 4);

export function newGame(ctx, round = 1, seed = ctx.seed * 7919 + round) {
  const rng = makeRng(seed);
  const { world, pf, metrics, config } = ctx;

  // Start far apart and out of each other's sight.
  let police;
  let thief;
  for (let attempt = 0; attempt < 500; attempt++) {
    police = newPolice(rng.pick(world.nodes), rng.pick(FACINGS));
    const row = pf.row(police.node);
    const options = world.nodes.filter(
      (n) => row[world.nodeIndex[n]] >= config.minStartPathDistance && metrics.euclidean(n, police.node) > config.visionRange,
    );
    if (!options.length) continue;
    thief = newThief(rng.pick(options), rng.pick(FACINGS));
    if (!canSee(world, police.node, police.facing, thief.node).visible
      && !canSee(world, thief.node, thief.facing, police.node).visible) break;
  }

  const game = {
    ctx, rng, round, step: 0, over: false, winner: null,
    police, thief,
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

// Footsteps carry along walkable paths (360 degrees) up to the hearing range.
function makeSound(game, who) {
  const { pf, config } = game.ctx;
  const mover = who === 'police' ? game.police : game.thief;
  const listener = who === 'police' ? game.thief : game.police;
  const heard = pf.distance(mover.node, listener.node) <= config.hearingRange;
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

function checkSight(game) {
  const { world } = game.ctx;
  const p = game.police;
  const t = game.thief;
  const ps = canSee(world, p.node, p.facing, t.node);
  if (ps.visible) {
    game.over = true;
    game.winner = 'police';
    game.log('police', 'win', `Police spotted the thief at ${ps.dist.toFixed(1)} cells. Police wins.`);
    return;
  }
  const ts = canSee(world, t.node, t.facing, p.node);
  if (ts.visible) {
    if (!t.seesPolice) game.log('thief', 'see', `Thief spotted the police at ${ts.dist.toFixed(1)} cells (the police did not see it).`);
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
  checkSight(game);

  if (!game.over) {
    if (thiefAct(game.ctx, game, game.rng)) policeHears = makeSound(game, 'thief');
    checkSight(game);
  }

  if (!game.over && game.step >= config.maxSteps) {
    game.over = true;
    game.winner = 'thief';
    game.log('thief', 'win', `The thief stayed unseen for ${config.maxSteps} steps. Thief wins.`);
  }

  game.perception = { ...perceive(game), policeHears, thiefHears };
  record(game);
  return game;
}

function record(game) {
  const { metrics } = game.ctx;
  const a = game.police.node;
  const b = game.thief.node;
  game.distances = { euclidean: metrics.euclidean(a, b), path: metrics.path(a, b), perceptual: metrics.perceptual(a, b) };
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
