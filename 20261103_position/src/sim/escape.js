// One run of the escape: find the vaccine case in the snowy forest and carry it to the hospital
// door on the east side, while a creature made of roots hunts you. You win at the door with the case;
// you lose when the creature reaches you (same or neighbouring cell) or when the night runs out.
//
// Input per tick: { dx, dy } in -1..1 (a direction on the map), run (Shift), shoot, climb (edge-triggered).

import { makeRng } from './rng.js';
import { segmentClear, eyePoint } from './los.js';
import { G, C, nodeXYL, nodeId, isWalkable, forEachNeighbour } from './world.js';
import { newCreature, creatureAct, creatureSees, headingTo, CREATURE_MODES } from './creature.js';
import { computeRelations, newTracks, placeCrows, stepCrows, coverAt } from './relations.js';

const FACINGS = [0, 1, 2, 3, 4, 5, 6, 7].map((k) => (k * Math.PI) / 4);
export { CREATURE_MODES };

export function newRun(ctx, { difficulty = 'normal', round = 1, seed = ctx.seed * 7919 + round } = {}) {
  const rng = makeRng(seed);
  const { world, pf, config } = ctx;
  const g = config.game;
  const door = ctx.exits[0].node;

  // The case: a fairly hidden cell, well away from the hospital door.
  const exposures = world.nodes.map((n) => ctx.exposure(n)).sort((a, b) => a - b);
  const median = exposures[Math.floor(exposures.length / 2)];
  const fromDoor = pf.row(door);
  const caseOptions = world.nodes.filter((n) => n !== door && ctx.exposure(n) <= median
    && fromDoor[world.nodeIndex[n]] >= config.game.caseFromDoor);
  const caseNode = rng.pick(caseOptions);
  const fromCase = pf.row(caseNode);

  // The creature starts near the case; you start far from both, on the west side, out of sight.
  const [cMin, cMax] = config.policeStartFromDiamond;
  const creatureOptions = world.nodes.filter((n) => { const d = fromCase[world.nodeIndex[n]]; return d >= cMin && d <= cMax; });
  let creature = null;
  let start = null;
  for (let attempt = 0; attempt < 200 && start === null; attempt++) {
    creature = newCreature(rng.pick(creatureOptions), rng.pick(FACINGS));
    const row = pf.row(creature.node);
    const options = world.nodes.filter((n) => {
      const i = world.nodeIndex[n];
      const { x, level } = nodeXYL(world, n);
      return level === 0 && x <= world.W * 0.35 && row[i] >= config.minStartPathDistance * 0.8
        && fromCase[i] >= 16 && ctx.metrics.euclidean(n, creature.node) > config.visionRange;
    });
    if (options.length) start = rng.pick(options);
  }
  if (start === null) {
    // a cramped map: the ground cell on the west side farthest (path) from the case
    const west = world.nodes.filter((n) => n < world.N && nodeXYL(world, n).x <= world.W * 0.5);
    start = west.reduce((a, b) => (fromCase[world.nodeIndex[b]] > fromCase[world.nodeIndex[a]] ? b : a));
  }

  const speeds = { ...g.difficulty[difficulty] };
  const game = {
    ctx, rng, round, difficulty, speeds, step: 0, over: false, result: null,
    player: {
      node: start, facing: 0, carrying: false, ammo: speeds.ammo, budget: 0, busy: 0, cooldown: 0, stamina: g.stamina,
      running: false, hidden: false, lastMoveStep: -1, shots: 0, climbTo: null,
      seesCreature: false, hearsCreature: false, knownCreature: null, knownStep: -1e9,
    },
    creature,
    caseItem: { node: caseNode, carried: false },
    door,
    alarmLeft: 0,
    events: [],
    sounds: [],
    shots: [],          // shots fired this tick: { from, to, hit }
    tracks: newTracks(),
    relations: { position: [], movement: [] },
    log(who, kind, text) { game.events.push({ step: game.step, round: game.round, who, kind, text }); },
  };
  game.crows = placeCrows(ctx, rng, caseNode);
  game.player.facing = headingTo(ctx, start, caseNode) ?? 0;
  game.player.hidden = coverAt(world, start).solid >= config.relations.coverMin;
  measure(game);
  senseCreature(game, creature.node);
  game.sounds = [];
  game.relations = computeRelations(game, null);
  game.log('player', 'start', 'Find the vaccine case, then reach the hospital door on the east side.');
  return game;
}

function measure(game) {
  const { metrics } = game.ctx;
  const a = game.player.node;
  const b = game.creature.node;
  game.distances = { euclidean: metrics.euclidean(a, b), acoustic: metrics.acoustic(a, b), path: metrics.path(a, b) };
}

// The cell one step in direction (dx, dy) on the current level, sliding along walls when a
// diagonal is blocked. Returns null if nothing is walkable that way.
export function stepCell(world, n, dx, dy) {
  const { x, y, level } = nodeXYL(world, n);
  const ok = (cx, cy) => isWalkable(world, level, cx, cy);
  if (dx && dy) {
    if (ok(x + dx, y + dy) && ok(x + dx, y) && ok(x, y + dy)) return nodeId(world, level, x + dx, y + dy);
    if (ok(x + dx, y)) return nodeId(world, level, x + dx, y);
    if (ok(x, y + dy)) return nodeId(world, level, x, y + dy);
    return null;
  }
  if (ok(x + dx, y + dy)) return nodeId(world, level, x + dx, y + dy);
  return null;
}

// The ladder partner of n (same column, other level), or null if n is not on a ladder.
export function ladderPartner(world, n) {
  const { x, y, level } = nodeXYL(world, n);
  const i = y * world.W + x;
  if (world.ground[i] !== G.LADDER || world.canopy[i] !== C.LADDER) return null;
  return level === 0 ? world.N + i : i;
}

function makeNoise(game, loud) {
  const { metrics, config } = game.ctx;
  const c = game.creature;
  const quiet = loud ? 0 : config.sneakQuietness;
  const heard = metrics.acoustic(game.player.node, c.node) + quiet <= config.hearingRange;
  game.sounds.push({ who: 'player', node: game.player.node, heard, creatureHeard: heard });
  if (heard && c.frozenLeft === 0) c.heardAt = game.player.node;
  return heard;
}

function shoot(game) {
  const { world, config, metrics } = game.ctx;
  const g = config.game;
  const me = game.player;
  if (me.cooldown > 0) return;
  if (me.ammo <= 0) { game.log('player', 'empty', 'Click. No bullets left.'); me.cooldown = g.shotCooldown; return; }
  const c = game.creature;
  const dist = metrics.euclidean(me.node, c.node);
  const clear = segmentClear(world, eyePoint(world, me.node), eyePoint(world, c.node));
  if (dist > g.shotRange || !clear) {
    game.log('player', 'noshot', dist > g.shotRange ? 'Too far to shoot.' : 'No clear shot: something is in the way.');
    me.cooldown = 2;
    return;
  }
  me.ammo--;
  me.shots++;
  me.cooldown = g.shotCooldown;
  const h = headingTo(game.ctx, me.node, c.node);
  if (h !== null) me.facing = h;
  c.frozenLeft = g.freezeTicks;
  c.mode = 'frozen';
  c.budget = 0;
  c.lastSeen = me.node; // it knows where the shot came from
  game.shots.push({ from: me.node, to: c.node, hit: true });
  game.sounds.push({ who: 'shot', node: me.node, heard: true, creatureHeard: metrics.acoustic(me.node, c.node) <= g.shotHeard });
  game.log('player', 'shot', `Hit! The creature is frozen for 3 seconds. ${me.ammo} bullet${me.ammo === 1 ? '' : 's'} left.`);
}

// What you know about the creature: you see it within the fog with a clear line (you look around
// freely), and you hear it move within the hearing range. Otherwise you only remember where it was.
function senseCreature(game, before) {
  const { world, config, metrics } = game.ctx;
  const me = game.player;
  const c = game.creature;
  const e = metrics.euclidean(me.node, c.node);
  me.seesCreature = e <= config.visionRange && segmentClear(world, eyePoint(world, me.node), eyePoint(world, c.node));
  me.hearsCreature = c.node !== before && metrics.acoustic(c.node, me.node) <= config.hearingRange;
  if (me.hearsCreature) game.sounds.push({ who: 'creature', node: c.node, heard: true });
  if (me.seesCreature || me.hearsCreature) { me.knownCreature = c.node; me.knownStep = game.step; }
}

function caught(game) {
  const c = game.creature;
  return c.frozenLeft === 0 && game.ctx.pf.distance(game.player.node, c.node) <= game.ctx.config.catchDistance;
}

function end(game, result, text) {
  game.over = true;
  game.result = result;
  game.log(result === 'win' ? 'player' : 'creature', result, text);
}

export function stepRun(game, input = {}) {
  if (game.over) return game;
  const { world, config } = game.ctx;
  const g = config.game;
  const me = game.player;
  game.step++;
  game.sounds = [];
  game.shots = [];
  const prev = { player: me.node, creature: game.creature.node };
  if (me.cooldown > 0) me.cooldown--;
  if (game.alarmLeft > 0) {
    game.alarmLeft--;
    if (game.alarmLeft === 0) game.log('player', 'alarm', 'The case’s alarm stops beeping.');
  }

  // ---- you
  if (input.shoot) shoot(game);
  const moving = !!(input.dx || input.dy);
  me.running = !!input.run && moving && me.stamina >= 1 && me.busy === 0;
  if (me.running) me.stamina = Math.max(0, me.stamina - 1);
  else me.stamina = Math.min(g.stamina, me.stamina + g.staminaRecover);
  if (me.busy > 0) {
    me.busy--;
    if (me.busy === 0 && me.climbTo !== null) {
      me.node = me.climbTo;
      me.climbTo = null;
      me.lastMoveStep = game.step;
      makeNoise(game, true);
    }
  } else if (input.climb && ladderPartner(world, me.node) !== null) {
    me.busy = g.climbTicks;
    me.climbTo = ladderPartner(world, me.node);
  } else if (moving) {
    me.facing = Math.atan2(input.dy, input.dx);
    me.budget += me.running ? g.runSpeed : g.walkSpeed;
    if (me.budget >= 1) {
      me.budget -= 1;
      const next = stepCell(world, me.node, Math.sign(input.dx), Math.sign(input.dy));
      if (next !== null) {
        const h = headingTo(game.ctx, me.node, next);
        if (h !== null) me.facing = h;
        me.node = next;
        me.lastMoveStep = game.step;
        makeNoise(game, me.running);
      } else me.budget = 0;
    }
  } else {
    me.budget = Math.min(me.budget, 0.6); // a tap still moves soon
  }
  me.hidden = coverAt(world, me.node).solid >= config.relations.coverMin;

  if (!me.carrying && me.node === game.caseItem.node) {
    me.carrying = true;
    game.caseItem.carried = true;
    game.alarmLeft = g.caseAlarmTicks;
    game.log('player', 'case', 'You have the vaccine case! Its alarm beeps: the creature knows where you are. Run for the hospital!');
  }
  if (me.carrying && me.node === game.door) {
    end(game, 'win', 'You reached the hospital with the vaccine. You saved the world.');
  } else if (caught(game)) {
    end(game, 'lose', 'The creature reached you.');
  }

  // ---- crows, then the creature
  if (!game.over) {
    stepCrows(game);
    creatureAct(game.ctx, game, game.rng);
    if (caught(game)) end(game, 'lose', 'The creature reached you.');
  }
  if (!game.over && game.step >= g.maxTicks) end(game, 'lose', 'The night is over. The creature found you at dawn.');

  game.creature.seesPlayer = game.creature.frozenLeft === 0 && creatureSees(game);
  senseCreature(game, prev.creature);
  measure(game);
  game.relations = computeRelations(game, prev);
  return game;
}

export const statusOf = (game) => ({
  mode: CREATURE_MODES[game.creature.mode] ?? game.creature.mode,
  sees: game.creature.seesPlayer,
  hears: game.sounds.some((s) => s.who === 'player' && s.creatureHeard),
  hidden: game.player.hidden,
});

// For tests and balancing: the walkable neighbours of a node as direction steps.
export function directionTo(world, from, to) {
  const a = nodeXYL(world, from);
  const b = nodeXYL(world, to);
  if (a.level !== b.level) return { climb: true };
  return { dx: Math.sign(b.x - a.x), dy: Math.sign(b.y - a.y) };
}
export { forEachNeighbour };
