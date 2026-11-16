// Moving through the place, sharing it, and the end of a round (semantic model §9 rules M1-M3,
// C1-C3). No DOM.
//
// An agent walks along a route of cells. Each tick it gains tick seconds of walking; it steps into
// the next cell once it has walked the crossing time (src/sim/paths.js stepTime: cover, snow,
// slope; running halves it). Every step leaves a track (snow.step) and a sound event.
//   M1  one agent per cell: an agent whose next cell is taken waits; after 3 s it asks for a new plan
//   M2  each kind enters only the cells of its own walk graph (walker.base > 0)
//   M3  running doubles the speed and the loudness: a walking step is heard as if 18 m farther away
//   S2  a step in deep snow (> 40 cm) is 5 m louder
//   C1  the creature catches a survivor on the same or a neighbouring cell, if no solid is between
//   C2  a survivor escapes on an exit cell
//   C3  a round ends when no survivor is left in play, or after the last tick

import { eyeAt, segmentClear } from './los.js';
import { bearingOf } from './frames.js';

export const WAIT_LIMIT_S = 3;
export const DEEP_SNOW_LOUDER_M = 5;

export function makeOccupancy(world) {
  const occ = new Int16Array(world.n).fill(-1);
  return {
    occ,
    at: (k) => occ[k],
    free: (k, id) => occ[k] === -1 || occ[k] === id,
    put(id, k) { if (occ[k] !== -1 && occ[k] !== id) return false; occ[k] = id; return true; },
    move(id, from, to) { if (occ[to] !== -1 && occ[to] !== id) return false; if (occ[from] === id) occ[from] = -1; occ[to] = id; return true; },
    clear(id, k) { if (occ[k] === id) occ[k] = -1; },
  };
}

// agent: { id, kind ('survivor'|'creature'), cell, heading, running, route: [cells], routeIdx,
//          carry (seconds walked toward the next cell), waited (s), needsPlan }
// ctx:   { world, walker, occupancy, snow, t (storm s), dt (s), config, sounds: [] }
// Returns the number of cells stepped this tick.
export function advance(agent, ctx) {
  const { world, walker, occupancy, snow, dt, config } = ctx;
  let budget = (agent.carry ?? 0) + dt; let steps = 0;
  agent.carry = 0;
  while (agent.route && agent.routeIdx + 1 < agent.route.length) {
    const next = agent.route[agent.routeIdx + 1];
    if (!walker.passable(next)) { agent.needsPlan = true; break; }        // M2 (a closure appeared, etc.)
    if (!occupancy.free(next, agent.id)) {                               // M1
      agent.waited = (agent.waited ?? 0) + budget;
      if (agent.waited >= WAIT_LIMIT_S) agent.needsPlan = true;
      budget = 0; break;
    }
    const cur = agent.cell;
    const i0 = cur % world.W; const j0 = (cur - i0) / world.W; const i1 = next % world.W; const j1 = (next - i1) / world.W;
    const diag = i0 !== i1 && j0 !== j1;
    let need = walker.stepTime(cur, next, diag, snow?.depth ?? null, null);
    if (agent.running) need /= 2;                                        // M3
    if (agent.speedFactor) need /= agent.speedFactor;
    if (budget < need) { agent.carry = budget; break; }
    budget -= need;
    occupancy.move(agent.id, cur, next);
    agent.cell = next; agent.routeIdx++; agent.waited = 0; steps++;
    agent.heading = bearingOf(i1 - i0, j0 - j1);
    if (snow) snow.step(next, ctx.t, agent.kind === 'creature' ? 1 : 0, agent.heading, agent.id);
    const quiet = agent.running ? 0 : config.walkQuietM;
    const louder = snow && snow.isHindrance(next) ? DEEP_SNOW_LOUDER_M : 0;
    ctx.sounds?.push({ origin: next, t: ctx.t, kind: agent.running ? 'run' : 'step', by: agent.id, agentKind: agent.kind, extraM: quiet - louder });
  }
  return steps;
}

// C1
export function catches(world, creatureCell, survivorCell) {
  const W = world.W;
  const ci = creatureCell % W; const cj = (creatureCell - ci) / W; const si = survivorCell % W; const sj = (survivorCell - si) / W;
  if (Math.max(Math.abs(ci - si), Math.abs(cj - sj)) > 1) return false;
  if (creatureCell === survivorCell) return true;
  return segmentClear(world, eyeAt(world, ...world.center(creatureCell)), eyeAt(world, ...world.center(survivorCell)));
}

// C2
export const escapes = (exitCells, cell) => exitCells.has(cell);

// C3: outcome of a survivor at the end: 'escaped' | 'caught' | 'collapsed' | 'lost' (timeout)
export function roundOver(survivors, tick, roundTicks) {
  const inPlay = survivors.filter((s) => !s.outcome);
  return inPlay.length === 0 || tick >= roundTicks;
}
