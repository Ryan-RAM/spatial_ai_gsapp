// The creature: roots that wake in the Ramble on the storm night (semantic model §7.6, §12).
// Merges 20261103_position/src/sim/creature.js (patrol, investigate, chase, search, ambush) and the
// creature of 20261110_agents/src/sim/sim.js (frontier mapping, hunting by sound on its own map,
// sweeping remembered dead ends), now on the real place:
//   waking -> mapping (frontier exploration at dusk) -> patrolling | investigating (a sound) |
//   tracking (a readable track) | chasing (it sees a survivor) | searching (remembered dead ends
//   near where it lost the trail) | ambushing (between the last sighting and the nearest exit)
// Everything it decides is on its own KnowledgeMap (P4). Light-averse: lit cells cost x3 in its
// plans. Slowed by plowed paths (x0.7). Its memory (map and landmarks) persists across the rounds
// of one night. No DOM.

import { makeKnowledge, look, plan, visit, remember, lastThreat } from './knowledge.js';
import { recognise, addLandmark, landmarksOf } from './landmarks.js';
import { sees, hears, guessCell } from './perception.js';
import { walkerFor } from './paths.js';
import { bearingOf, unitOf } from './frames.js';

export const CREATURE_STATES = {
  waking: 'Waking', mapping: 'Mapping the woods', patrolling: 'Patrolling', investigating: 'Going to a sound',
  tracking: 'Following tracks', chasing: 'Chasing', searching: 'Searching dead ends', ambushing: 'Waiting in ambush',
};
const AMBUSH_TICKS = 150; const SEARCH_RADIUS_M = 30; const LOST_AFTER_TICKS = 8;

// a new creature memory for a night (map + landmarks), shared by its rounds
export const newMemory = (world, config) => makeKnowledge(world, 'creature', config);

// the extra cost of lit cells in its plans: (litCostFactor - 1) x the crossing time of a cell
export function lightCost(world, config, layers) {
  if (!layers || !layers.light.some((v) => v)) return null;
  const extra = new Float32Array(world.n); const per = (config.creature.litCostFactor - 1) * world.s / config.creature.speed;
  for (let c = 0; c < world.n; c++) if (layers.light[c]) extra[c] = per;
  return extra;
}

// The dusk mapping phase (§7.9 "Night"): frontier exploration until the woods are mapped or the
// time runs out. Returns the memory (filled in) and statistics for the metrics of §11.1.
export function mapTheWoods(world, config, { memory, startCell, ticks, layers = null, weather }) {
  const walker = walkerFor(world, 'creature', config);
  const k = memory; const c = { cell: startCell, heading: 0, kind: 'creature' };
  addLandmark(k, world, { type: 'start', cell: startCell, tick: 0 });
  let route = null; let idx = 0; let carry = 0; let newCells = 0;
  const range = config.creature.sightRange * weather.vf;
  const extra = lightCost(world, config, layers);
  for (let t = 0; t < ticks; t++) {
    const fresh = look(world, k, c.cell, c.heading, range, config.creature.coneDeg, t);
    newCells += fresh.length; recognise(world, k, fresh, t, { layers });
    if (!route || idx + 1 >= route.length || t % config.replanEveryTicks === 0) {
      const r = plan(walker, k, c.cell, { goal: (q) => k.frontier[q] === 1 && q !== c.cell, extra });
      if (!r) { // nothing left to explore that it can reach: turn round once more, then stop
        if (k.frontierCount === 0 || t > 20) return { memory: k, ticks: t, newCells, done: true };
        c.heading = (c.heading + 90) % 360; continue;
      }
      route = r.cells; idx = 0;
    }
    carry += config.tickSeconds;
    while (idx + 1 < route.length) {
      const a = route[idx]; const b = route[idx + 1];
      const diag = (a % world.W) !== (b % world.W) && Math.floor(a / world.W) !== Math.floor(b / world.W);
      const need = walker.stepTime(a, b, diag, null, null);
      if (carry < need) break;
      carry -= need;
      const [x0, y0] = world.center(route[idx]); const [x1, y1] = world.center(route[idx + 1]);
      c.heading = bearingOf(x1 - x0, y1 - y0); idx++; c.cell = route[idx]; visit(k, c.cell);
    }
  }
  return { memory: k, ticks, newCells, done: false, endCell: c.cell };
}

// where to wait: 2/3 of the way along the survivor's likely route east on the creature's own map,
// snapped to a junction it knows within 15 m (the "between" relation of 20261103)
export function ambushSpot(world, config, k, fromCell) {
  const sw = walkerFor(world, 'survivor', config);
  const exits = landmarksOf(k, 'exit').map((l) => l.cell);
  let best = null;
  for (const e of exits) { const r = plan(sw, k, fromCell, { to: e, unknown: () => 0.4 }); if (r && (!best || r.time < best.time)) best = r; }
  if (!best) { // no exit known: head east of the last sighting
    const [x, y] = world.center(fromCell); const c = world.cellOf(x + 60, y);
    return c >= 0 && k.seen[c] ? c : fromCell;
  }
  const spot = best.cells[Math.floor(best.cells.length * 0.66)];
  const [sx, sy] = world.center(spot);
  let snap = spot; let bd = 15;
  for (const j of landmarksOf(k, 'junction')) { const d = Math.hypot(j.x - sx, j.y - sy); if (d < bd) { bd = d; snap = j.cell; } }
  return snap;
}

// The creature's brain for a round (round.js). ctx: { world, walker, occupancy, snow, t, dt, config,
// sounds, state, weather }.
export function creatureBrain(c, ctx) {
  const { world, config, state, weather } = ctx;
  const k = c.memory; const tick = state.tick;
  c.state = c.state ?? 'patrolling';
  const layers = state.layers;
  c.speedFactor = layers.plowed[c.cell] ? config.creature.plowedSpeedFactor : 1;
  c.lit = layers.light;
  // ---- perceive
  const range = config.creature.sightRange * weather.vf;
  const fresh = look(world, k, c.cell, c.heading, range * 1.5, config.creature.coneDeg, tick);
  recognise(world, k, fresh, tick, { layers, tSec: state.t });
  visit(k, c.cell);
  let target = null; let why = null;
  for (const s of state.agents) {
    if (s.outcome) continue;
    if (sees(world, config, c, s.cell, weather, layers)) {
      s.timesSeen++;
      remember(k, { cell: s.cell, tick, how: 'seen', by: s.id });
      addLandmark(k, world, { type: 'sighting', cell: s.cell, tick, tSec: state.t });
      if (!target) { target = s.cell; why = 'chasing'; }
    }
  }
  if (!target) {
    for (const snd of state.lastSounds ?? []) {
      if (snd.agentKind !== 'survivor') continue;
      const h = hears(world, config, c, snd, weather, c.rng);
      if (h) {
        const g = guessCell(world, c.cell, h);
        remember(k, { cell: g, tick, how: 'heard', confidence: 0.6, by: snd.by });
        addLandmark(k, world, { type: 'heard', cell: g, tick, tSec: state.t });
        target = g; why = 'investigating'; break;
      }
    }
  }
  if (!target) {
    // P3: the freshest readable survivor track in the cells it sees now; follow its heading
    let bestQ = -1; let bestT = -Infinity;
    for (const cell of k.lastCone ? fresh.concat(visibleTrackCells(ctx, c)) : []) {
      const q = ctx.snow.trackAt(cell); if (q < 0) continue;
      const tr = ctx.snow.track(q); if (tr.kind !== 0 || tr.readability <= 0.05) continue;
      if (tr.t > bestT) { bestT = tr.t; bestQ = q; }
    }
    if (bestQ >= 0) {
      const tr = ctx.snow.track(bestQ); const [x, y] = world.center(tr.cell); const [ux, uy] = unitOf(tr.heading);
      let ahead = tr.cell;
      for (let d = 12; d >= 3; d -= 3) { const a = world.cellOf(x + ux * d, y + uy * d); if (a >= 0 && k.seen[a] && ctx.walker.passable(a)) { ahead = a; break; } }
      target = ahead; why = 'tracking';
    }
  }
  // ---- decide
  if (target) {
    c.state = why; c.goal = target; c.lostTicks = 0;
  } else if (['chasing', 'investigating', 'tracking'].includes(c.state)) {
    if (c.route && c.routeIdx + 1 < c.route.length) {
      // keep going to where it last had them
    } else if ((c.lostTicks = (c.lostTicks ?? 0) + 1) > LOST_AFTER_TICKS) {
      const last = lastThreat(k, tick, 600);
      // lost a survivor heading east: ambush (20261103); otherwise sweep the dead ends it remembers
      if (last && last.how === 'seen') { c.state = 'ambushing'; c.goal = ambushSpot(world, config, k, last.cell); c.ambushUntil = tick + AMBUSH_TICKS; }
      else { c.state = 'searching'; c.searchFrom = last?.cell ?? c.cell; c.searched = new Set(); c.goal = null; }
    }
  } else if (c.state === 'ambushing' && tick > (c.ambushUntil ?? 0)) {
    c.state = 'patrolling'; c.goal = null;
  }
  if (c.state === 'searching' && (!c.goal || c.cell === c.goal)) {
    const [sx, sy] = world.center(c.searchFrom);
    const next = landmarksOf(k, 'dead_end').filter((l) => !c.searched.has(l.id) && Math.hypot(l.x - sx, l.y - sy) <= SEARCH_RADIUS_M)
      .sort((a, b) => Math.hypot(a.x - sx, a.y - sy) - Math.hypot(b.x - sx, b.y - sy))[0];
    if (next) { c.searched.add(next.id); c.goal = next.cell; } else { c.state = 'patrolling'; c.goal = null; }
  }
  if (c.state === 'patrolling' && (!c.goal || c.cell === c.goal)) c.goal = patrolTarget(world, k, c);
  // ---- plan (at most every few ticks, unless it has nowhere to go or something new happened)
  const due = !c.route || c.routeIdx + 1 >= c.route.length || c.needsPlan || (target && tick - (c.plannedAt ?? -99) >= config.replanEveryTicks);
  if (due && c.goal != null && c.goal !== c.cell) {
    c.extraCost = c.extraCost ?? lightCost(world, config, layers);
    const r = plan(ctx.walker, k, c.cell, { to: c.goal, snow: ctx.snow.depth, extra: c.extraCost, unknown: () => 0.5 });
    c.route = r ? r.cells : null; c.routeIdx = 0; c.plannedAt = tick; c.needsPlan = false;
    if (!r) c.goal = null;
  }
  c.running = c.state === 'chasing';
}

// the cells of its current view that may hold tracks: the cone of the last look
function visibleTrackCells(ctx, c) {
  const out = []; const cone = c.memory.lastCone; if (!cone) return out;
  const { world } = ctx; const [x0, y0] = cone[0];
  for (let q = 1; q < cone.length; q += 3) {
    const [x1, y1] = cone[q]; const L = Math.hypot(x1 - x0, y1 - y0);
    for (let t = world.s; t < L; t += world.s) { const cc = world.cellOf(x0 + (x1 - x0) * t / L, y0 + (y1 - y0) * t / L); if (cc >= 0) out.push(cc); }
  }
  return out;
}

// A patrol goal: a known path cell 40-150 m away. It knows its prey makes for the city lights, so
// it prefers the junctions it knows (choke points) and the eastern side of what it knows; and the
// dark, and the places it has not been to lately (D-029).
function patrolTarget(world, k, c) {
  const [x0, y0] = world.center(c.cell); let best = null; let bestScore = -Infinity;
  const junctions = landmarksOf(k, 'junction');
  let east = -Infinity; let west = Infinity;
  for (const l of junctions) { if (l.x > east) east = l.x; if (l.x < west) west = l.x; }
  for (let q = 0; q < 80; q++) {
    let cell;
    if (junctions.length && c.rng.chance(0.7)) cell = c.rng.pick(junctions).cell; else cell = c.rng.int(0, world.n - 1);
    if (!k.seen[cell]) continue;
    const cover = k.seen[cell] - 1; if (cover !== 1 && cover !== 2) continue; // a path it knows
    const [x, y] = world.center(cell); const d = Math.hypot(x - x0, y - y0); if (d < 40 || d > 150) continue;
    const eastness = east > west ? (x - west) / (east - west) : 0.5;
    const score = 3 * eastness - 0.2 * k.visits[cell] - (c.lit && c.lit[cell] ? 5 : 0) + c.rng.next();
    if (score > bestScore) { bestScore = score; best = cell; }
  }
  return best;
}
