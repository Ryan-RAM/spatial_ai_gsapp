// Rounds, nights and the evaluation suite (semantic model §7.9, §11.4). No DOM.
//
// A round: a group of survivors from their spawn to escape, catch, collapse or timeout (900 ticks
// of 2 s). Each tick: storm state -> snow (every few ticks) -> every agent decides (its brain)
// and moves -> warmth -> catches, escapes, collapses -> end?
//
// Brains are pluggable: brain(agent, ctx) may set agent.route (cells from agent.cell), agent.running,
// agent.inShelter. M3 supplies the real ones (knowledge, landmarks, planning); `baselineBrains`
// here only exercises the mechanics.
//
// Common random numbers (§11.4): every random consumer draws from its own stream, named by the
// round's seed and its role ('spawn', 'survivor:0', 'creature:0', ...). Changing the intervention
// plan therefore never shifts the spawn points or any agent's random draws.

import { CONFIG } from './config.js';
import { substream } from './rng.js';
import { makeStorm, localSeconds } from './storm.js';
import { makeSnow } from './snow.js';
import { walkerFor } from './paths.js';
import { makeOccupancy, advance, catches } from './movement.js';
import { updateWarmth } from './warmth.js';
import { applyPlan, emptyPlan, spawnCells, exitCells } from './interventions.js';
import { makeKnowledge } from './knowledge.js';
import { survivorBrain } from './survivor.js';
import { creatureBrain, newMemory, mapTheWoods } from './creature.js';

// the suite of §11.4: start times x spawn zones x seeds, in a fixed order
export function evaluationSuite(config = CONFIG, baseSeed = config.seed) {
  const date = (hhmm) => (hhmm < '12:00' ? `2016-01-24T${hhmm}` : `2016-01-23T${hhmm}`);
  const out = [];
  config.suite.startTimes.forEach((t, ti) => config.spawnZones.slice(0, config.suite.spawnZones).forEach((z, zi) => {
    for (let s = 0; s < config.suite.seeds; s++) out.push({ id: `${t}/${z.id}/${s}`, start: date(t), zone: z.id, seed: baseSeed + 1000 * ti + 100 * zi + s });
  }));
  return out;
}

// A walker per kind that respects the plan: survivors do not enter closed cells. The base walker is
// cached per world (M3.7); the plan's closures are applied as a mask on top.
function planWalker(world, config, kind, layers) {
  const w = walkerFor(world, kind, config);
  if (kind !== 'survivor' || !layers.closed.some((v) => v)) return w;
  return { ...w, passable: (k) => w.passable(k) && !layers.closed[k] };
}

export function makeRound(world, storm, { config = CONFIG, plan = emptyPlan(), layers = null, start, zone, seed, brains, creatureMemory = null } = {}) {
  const L = layers ?? applyPlan(world, config, plan);
  const snow = makeSnow(world); snow.plowed.set(L.plowed);
  const occupancy = makeOccupancy(world);
  const exits = exitCells(world);
  const t0 = localSeconds(start);
  const rngSpawn = substream(seed, 'spawn');
  // survivors start together on free spawn cells, the creature where its brain says (or patrolling)
  const cells = spawnCells(world, config, zone).filter((k) => !L.closed[k]);
  const agents = [];
  for (let q = 0; q < config.survivorsPerRound; q++) {
    let k; do k = rngSpawn.pick(cells); while (occupancy.at(k) !== -1);
    occupancy.put(q, k);
    const rng = substream(seed, `survivor:${q}`);
    const [w0, w1] = config.survivor.startWarmth ?? [config.survivor.warmthMax, config.survivor.warmthMax];
    const warmth = w0 + (w1 - w0) * rng.next();
    agents.push({ id: q, kind: 'survivor', cell: k, heading: 90, running: false, route: null, routeIdx: 0, carry: 0, waited: 0, warmth, minWarmth: warmth, startWarmth: warmth, outcome: null, outcomeTick: null, rng, timesSeen: 0, closeTicks: 0, k: makeKnowledge(world, 'survivor', config), startCell: k });
  }
  const creatures = [];
  const nCreatures = config.creaturesPerNight;
  for (let c = 0; c < nCreatures; c++) {
    const id = 100 + c;
    const rng = substream(seed, `creature:${c}`);
    const k = brains.creatureStart ? brains.creatureStart({ world, rng, occupancy, agents, memory: creatureMemory, config }) : null;
    if (k == null || occupancy.at(k) !== -1) continue;
    occupancy.put(id, k);
    creatures.push({ id, kind: 'creature', cell: k, heading: 0, running: false, route: null, routeIdx: 0, carry: 0, waited: 0, rng, memory: creatureMemory, catches: 0 });
  }
  const walkers = { survivor: planWalker(world, config, 'survivor', L), creature: planWalker(world, config, 'creature', L) };
  const state = { world, storm, config, layers: L, snow, occupancy, exits, agents, creatures, tick: 0, t: t0, t0, sounds: [], events: [], done: false, zone, seed, start };

  function step() {
    if (state.done) return state;
    const weather = storm.at(state.t);
    // the sounds of this tick so far count too: the creature acts after the survivors
    state.lastSounds = state.sounds;
    state.weather = weather;
    if (state.tick % config.snowUpdateTicks === 0) snow.update(weather);
    state.sounds = [];
    const ctx = { world, walker: null, occupancy, snow, t: state.t, dt: config.tickSeconds, config, sounds: state.sounds, state, weather };
    for (const a of [...agents, ...creatures]) {
      if (a.outcome) continue;
      ctx.walker = walkers[a.kind];
      if (a.kind === 'creature') state.lastSounds = state.lastSounds.concat(state.sounds); // hears this tick's steps too
      (a.kind === 'creature' ? brains.creature : brains.survivor)(a, ctx);
      if (!a.inShelter) advance(a, ctx);
    }
    for (const c of creatures) if (c.memory) c.memory.lastCell = c.cell;
    // warmth, escapes, collapses
    for (const a of agents) {
      if (a.outcome) continue;
      a.warmth = updateWarmth(config, a.warmth, config.tickSeconds, weather, world.openness[a.cell] / 255, a.inShelter && L.shelter[a.cell] >= 0);
      a.minWarmth = Math.min(a.minWarmth, a.warmth);
      if (exits.has(a.cell)) finish(a, 'escaped');
      else if (a.warmth <= 0) finish(a, 'collapsed');
    }
    // catches (C1)
    for (const c of creatures) for (const a of agents) {
      if (a.outcome) continue;
      if (catches(world, c.cell, a.cell)) { finish(a, 'caught'); c.catches++; }
    }
    state.tick++; state.t += config.tickSeconds;
    if (agents.every((a) => a.outcome) || state.tick >= config.roundTicks) {
      for (const a of agents) if (!a.outcome) finish(a, 'lost');
      state.done = true;
    }
    return state;
  }
  function finish(a, outcome) {
    a.outcome = outcome; a.outcomeTick = state.tick;
    occupancy.clear(a.id, a.cell);
    state.events.push({ tick: state.tick, agent: a.id, outcome });
  }
  function run() { while (!state.done) step(); return result(); }
  function result() {
    return {
      id: `${start}/${zone}/${seed}`, start, zone, seed, ticks: state.tick,
      survivors: agents.map((a) => ({ outcome: a.outcome, tick: a.outcomeTick, minWarmth: +a.minWarmth.toFixed(3), start: a.startCell, end: a.cell, timesSeen: a.timesSeen, closeTicks: a.closeTicks, steps: a.k.trail.length })),
      creatures: creatures.map((c) => ({ catches: c.catches, end: c.cell, state: c.state ?? null })),
    };
  }
  return { state, step, run, result };
}

// The simplest brains that use the mechanics: survivors head for the nearest exit on the true map
// (no partial knowledge: a stand-in until M3), with a seeded chance to pause; the creature walks to
// random cells. Deterministic given the streams.
export const baselineBrains = {
  creatureStart({ world, rng, occupancy, config }) {
    const pass = walkerFor(world, 'creature', config).passable;
    for (let q = 0; q < 1000; q++) { const k = rng.int(0, world.n - 1); if (pass(k) && occupancy.at(k) === -1) return k; }
    return null;
  },
  survivor(a, ctx) {
    if (a.route && !a.needsPlan && a.routeIdx + 1 < a.route.length) return;
    a.needsPlan = false;
    if (a.rng.chance(0.1)) { a.route = null; return; }
    let best = null;
    for (const e of ctx.state.exits) { const r = ctx.walker.route(a.cell, e, { snow: ctx.snow.depth }); if (r && (!best || r.time < best.time)) best = r; }
    a.route = best ? best.cells : null; a.routeIdx = 0;
  },
  creature(c, ctx) {
    if (c.route && !c.needsPlan && c.routeIdx + 1 < c.route.length) return;
    c.needsPlan = false;
    for (let q = 0; q < 20; q++) {
      const k = c.rng.int(0, ctx.world.n - 1);
      if (!ctx.walker.passable(k)) continue;
      const r = ctx.walker.route(c.cell, k, { snow: ctx.snow.depth });
      if (r) { c.route = r.cells; c.routeIdx = 0; return; }
    }
  },
};

// The agents of M3: survivors with partial knowledge, the creature with its night-long memory.
export const agentBrains = {
  survivor: survivorBrain,
  creature: creatureBrain,
  creatureStart({ world, memory, occupancy }) {
    const k = memory?.lastCell; if (k != null && occupancy.at(k) === -1) return k;
    for (let d = 1; d < 20; d++) for (let c = Math.max(0, k - d); c <= k + d; c++) if (occupancy.at(c) === -1 && world.cover[c] !== 0) return c;
    return null;
  },
};

// The suite grouped into nights: one per (zone, seed), each a dusk mapping phase and then its
// rounds in time order, the creature keeping its memory (§7.9). Nights are independent, so they
// can run in parallel (M6.2).
export function nightsOf(suite) {
  const by = new Map();
  for (const r of suite) { const key = `${r.zone}/${r.id.split('/')[2]}`; if (!by.has(key)) by.set(key, []); by.get(key).push(r); }
  return [...by.entries()].map(([key, rounds]) => ({ key, zone: rounds[0].zone, seed: rounds[0].seed, rounds }));
}

// where the creature wakes: a seeded cell in the heart of the Ramble, away from the spawn zone
export function wakeCell(world, config, seed, zone) {
  const rng = substream(seed, 'creature:wake'); const z = config.spawnZones.find((q) => q.id === zone);
  const pass = walkerFor(world, 'creature', config).passable;
  for (let q = 0; q < 2000; q++) {
    const x = -160 + rng.next() * 200; const y = -300 + rng.next() * 200; const c = world.cellOf(x, y);
    if (c >= 0 && pass(c) && world.horizon?.rowOf[c] >= 0 && Math.hypot(x - z.x, y - z.y) > 60) return c;
  }
  return world.cellOf(-100, -200);
}

export function runNight(world, storm, { config = CONFIG, plan = emptyPlan(), layers = null, night, brains = agentBrains }) {
  const L = layers ?? applyPlan(world, config, plan);
  const memory = newMemory(world, config);
  const mapping = mapTheWoods(world, config, { memory, startCell: wakeCell(world, config, night.seed, night.zone), ticks: config.creature.mappingTicks, layers: L, weather: storm.at(localSeconds(config.creature.mappingStart)) });
  memory.lastCell = mapping.endCell ?? memory.trail[memory.trail.length - 1];
  const mapped = { ticks: mapping.ticks, cellsSeen: memory.knownCount, newCellsPerTick: mapping.newCells / Math.max(1, mapping.ticks), done: mapping.done };
  const rounds = night.rounds.map((r) => makeRound(world, storm, { config, plan, layers: L, start: r.start, zone: r.zone, seed: r.seed, brains, creatureMemory: memory }).run());
  return { key: night.key, mapping: mapped, memoryCellsEnd: memory.knownCount, rounds };
}

export function runSuite(world, storm, { config = CONFIG, plan = emptyPlan(), brains = agentBrains, suite = evaluationSuite(config) } = {}) {
  const layers = applyPlan(world, config, plan);
  return nightsOf(suite).map((night) => runNight(world, storm, { config, plan, layers, night, brains }));
}

export { makeStorm };
