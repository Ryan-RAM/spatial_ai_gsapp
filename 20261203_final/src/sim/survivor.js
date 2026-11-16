// A survivor caught in the Ramble (semantic model §7.6, §10, §12). Grows out of the survivor of
// 20261110_agents/src/sim/sim.js (explore east, flee, hide, never into a marked dead end), now with:
//   - prior knowledge: "the way out is east", and a rough mental map of the named places
//   - heading drift: its sense of east wanders (a random walk) until a fix: a sign it reads, a
//     named place it recognises, or the glow of the city to the east when it stands in the open
//     and visibility is at least a mile
//   - planning on its own map with bounded searches: unknown ground optimistic toward its east,
//     pessimistic toward its west; costs near the last known creature position (fading with
//     age); never into a dead end it has marked
//   - warmth look-ahead: if it would freeze before the exit, it goes to a shelter it knows
//   - fleeing (running) when it sees the creature close, hiding (still and quiet) when it hears
//     it, calling out to a companion within 30 m (shares the threat; a loud sound)
// No DOM.

import { look, plan, visit, remember, lastThreat } from './knowledge.js';
import { recognise, addLandmark, landmarksOf } from './landmarks.js';
import { sees, hears, guessCell } from './perception.js';
import { secondsLeft } from './warmth.js';
import { bearingOf, unitOf, wrap180 } from './frames.js';

export const SURVIVOR_STATES = {
  exploring: 'Exploring east', heading_out: 'Heading for the exit', following_sign: 'Following a sign',
  fleeing: 'Running', hiding: 'Hiding, quiet', sheltering: 'Warming up', escaped: 'Out', caught: 'Caught', collapsed: 'Taken by the cold',
};
export const DRIFT_SD_DEG = 1.2;    // per tick: about 25 degrees of drift in 10 minutes without a fix
export const PLAN_HORIZON_S = 150;  // a bounded search: what it can plan in its head
const FLEE_M = 20; const HIDE_TICKS = 20; const CALL_M = 30; const DANGER_M = 40;

// the survivor's believed east: true east turned by its drift
const believedEast = (s) => unitOf(90 + s.drift);

export function initSurvivor(s, world, config) {
  s.state = 'exploring'; s.drift = s.rng.normal(0, 15); // it starts not quite sure where east is
  s.knownExit = null; s.hideUntil = -1; s.calledOut = false;
  // a rough mental map of the named places: their positions, off by up to 30 m
  s.mentalMap = (world.places ?? []).map((p) => ({ id: p.id, name: p.name, x: p.x + s.rng.normal(0, 15), y: p.y + s.rng.normal(0, 15) }));
  addLandmark(s.k, world, { type: 'start', cell: s.cell, tick: 0 });
}

export function survivorBrain(s, ctx) {
  const { world, config, state, weather, snow } = ctx;
  const k = s.k; const tick = state.tick; const layers = state.layers;
  if (!s.state) initSurvivor(s, world, config);
  // ---- drift and fixes
  s.drift += s.rng.normal(0, DRIFT_SD_DEG);
  const range = config.survivor.sightRange * weather.vf;
  const fresh = look(world, k, s.cell, s.heading, layers.light[s.cell] ? range * 2 : range, config.survivor.coneDeg, tick);
  const made = recognise(world, k, fresh, tick, { layers, tSec: state.t });
  visit(k, s.cell);
  for (const l of made) {
    if (l.type === 'sign') { s.drift = 0; s.state = 'following_sign'; s.knownExit = nearestExitCell(world, l.cell); }
    if (l.type === 'named_place') s.drift *= 0.3;                      // a fix on a place it knows
    if (l.type === 'exit') { s.knownExit = l.cell; s.drift = 0; }
    if (l.type === 'shelter') s.knownShelter = l.cell;
  }
  if (weather.visibilityM >= 1609 && world.openness[s.cell] > 180 && world.canopy[s.cell] < 30) s.drift = 0; // the city's glow to the east
  // ---- danger
  let threat = null;
  for (const c of state.creatures) {
    if (sees(world, config, s, c.cell, weather, layers)) {
      remember(k, { cell: c.cell, tick, how: 'seen' }); addLandmark(k, world, { type: 'sighting', cell: c.cell, tick, tSec: state.t });
      threat = { cell: c.cell, seen: true };
    }
  }
  if (!threat) for (const snd of state.lastSounds ?? []) {
    if (snd.agentKind !== 'creature') continue;
    const h = hears(world, config, s, snd, weather, s.rng); if (!h) continue;
    const g = guessCell(world, s.cell, h); remember(k, { cell: g, tick, how: 'heard', confidence: 0.6 });
    addLandmark(k, world, { type: 'heard', cell: g, tick, tSec: state.t });
    threat = { cell: g, seen: false }; break;
  }
  for (const c of state.creatures) { const [a, b] = [world.center(s.cell), world.center(c.cell)]; if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 15) s.closeTicks++; }
  // M3.6 call out: tell a companion within 30 m where the threat is (loud: heard 60 m around)
  if (threat && !s.calledOut) for (const o of state.agents) {
    if (o === s || o.outcome) continue;
    const [a, b] = [world.center(s.cell), world.center(o.cell)];
    if (Math.hypot(a[0] - b[0], a[1] - b[1]) <= CALL_M) {
      remember(o.k, { cell: threat.cell, tick, how: 'told', confidence: 0.8 });
      // loud: the creature hears it out to 60 m of acoustic distance (§10 call_out)
      ctx.sounds.push({ origin: s.cell, t: state.t, kind: 'cry', by: s.id, agentKind: 'survivor', extraM: config.creature.hearing - 60 });
      s.calledOut = true; o.toldAt = tick;
    }
  }
  if (!threat) s.calledOut = false;
  // ---- decide
  const inShelter = layers.shelter[s.cell] >= 0;
  if (s.state === 'sheltering' && inShelter && s.warmth < 90 && !threat) { s.inShelter = true; s.route = null; s.running = false; return; }
  s.inShelter = false;
  if (threat?.seen && dist(world, s.cell, threat.cell) <= FLEE_M) { s.state = 'fleeing'; s.running = true; }
  else if (threat && !threat.seen && s.state !== 'fleeing') { s.state = 'hiding'; s.hideUntil = tick + HIDE_TICKS; }
  else if (s.state === 'fleeing' && !threat) { s.state = s.knownExit ? 'heading_out' : 'exploring'; s.running = false; }
  if (s.state === 'hiding') {
    if (tick < s.hideUntil) { s.route = null; s.running = false; return; }   // still and quiet
    s.state = s.knownExit ? 'heading_out' : 'exploring';
  }
  // warmth look-ahead (§12): would it freeze before the exit? then a shelter it knows
  const toExit = s.knownExit != null ? estimateSeconds(world, config, s.cell, s.knownExit) : estimateEast(world, config, s.cell);
  const left = secondsLeft(config, s.warmth, weather, world.openness[s.cell] / 255);
  if (s.knownShelter != null && left < toExit * 1.2 && s.state !== 'fleeing') s.state = 'sheltering';
  if (s.knownExit != null && ['exploring', 'following_sign'].includes(s.state)) s.state = 'heading_out';
  // ---- plan
  const due = !s.route || s.routeIdx + 1 >= s.route.length || s.needsPlan || tick - (s.plannedAt ?? -99) >= config.replanEveryTicks * 4 || (threat && tick - (s.plannedAt ?? -99) >= config.replanEveryTicks);
  if (!due) return;
  const extra = dangerCost(world, config, k, tick);
  const [ex, ey] = believedEast(s);
  const [x0, y0] = world.center(s.cell);
  const unknown = (c) => { const [x, y] = world.center(c); return ((x - x0) * ex + (y - y0) * ey) >= 0 ? 0.6 : 0.2; };
  let r = null;
  if (s.state === 'fleeing') {
    const last = lastThreat(k, tick, 30);
    const [tx, ty] = last ? world.center(last.cell) : [x0 - ex, y0 - ey];
    r = bestCell(ctx.walker, k, s.cell, { snow: snow.depth, extra, unknown }, (c) => { const [x, y] = world.center(c); return Math.hypot(x - tx, y - ty); });
  } else if (s.state === 'sheltering') {
    r = plan(ctx.walker, k, s.cell, { to: s.knownShelter, snow: snow.depth, extra, unknown });
  } else if (s.knownExit != null) {
    r = plan(ctx.walker, k, s.cell, { to: s.knownExit, snow: snow.depth, extra, unknown });
  }
  if (!r) {
    // explore east (in its believed east): within its planning horizon, the cell that gains the most
    r = bestCell(ctx.walker, k, s.cell, { snow: snow.depth, extra, unknown, maxTime: PLAN_HORIZON_S },
      (c, t) => { const [x, y] = world.center(c); return (x - x0) * ex + (y - y0) * ey - 0.05 * t; });
  }
  s.route = r ? r.cells : null; s.routeIdx = 0; s.plannedAt = tick; s.needsPlan = false;
}

const dist = (world, a, b) => { const [x0, y0] = world.center(a); const [x1, y1] = world.center(b); return Math.hypot(x1 - x0, y1 - y0); };

// costs near the last known creature positions, fading with age; dead ends it marked are avoided
function dangerCost(world, config, k, tick) {
  const extra = new Float32Array(world.n);
  const { W, H, s } = world;
  for (const th of k.threats) {
    const age = (tick - th.tick) * config.tickSeconds; if (age > 600) continue;
    const fade = Math.exp(-age / 180) * th.confidence;
    const [tx, ty] = world.center(th.cell); const R = DANGER_M;
    const i0 = Math.max(0, Math.floor((tx - R - world.minX) / s)); const i1 = Math.min(W - 1, Math.floor((tx + R - world.minX) / s));
    const j0 = Math.max(0, Math.floor((world.maxY - ty - R) / s)); const j1 = Math.min(H - 1, Math.floor((world.maxY - ty + R) / s));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const c = j * W + i; const [x, y] = world.center(c); const d = Math.hypot(x - tx, y - ty);
      if (d <= R) extra[c] += fade * 60 / (d + 5); // seconds: 1 / distance (§12)
    }
  }
  for (const l of landmarksOf(k, 'dead_end')) {
    const R = 6; const [tx, ty] = [l.x, l.y];
    for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) {
      const c = world.cellOf(tx + di * s, ty + dj * s); if (c >= 0 && Math.hypot(di * s, dj * s) <= R) extra[c] += 1e4; // never into it
    }
  }
  return extra;
}

// a bounded Dijkstra on its own map, then the reachable cell with the best score(cell, time)
function bestCell(walker, k, from, opts, score) {
  const speedOf = (c) => { const v = k.seen[c]; return v ? k.config.coverSpeed.survivor[v - 1] : opts.unknown ? opts.unknown(c) : 0; };
  const field = walker.field(from, { snow: opts.snow, extra: opts.extra, speedOf, maxTime: opts.maxTime ?? 60 });
  let best = -1; let bs = -Infinity;
  for (let c = 0; c < field.length; c++) { const t = field[c]; if (!Number.isFinite(t) || c === from) continue; const v = score(c, t); if (v > bs) { bs = v; best = c; } }
  return best >= 0 ? walker.route(from, best, { snow: opts.snow, extra: opts.extra, speedOf }) : null;
}

function nearestExitCell(world, cell) {
  let best = null; let bd = Infinity; const [x, y] = world.center(cell);
  for (const e of world.paths.exits) { const d = Math.hypot(e.x - x, e.y - y); if (d < bd) { bd = d; best = world.cellOf(e.x, e.y); } }
  return best;
}
// rough seconds to walk somewhere (straight line, slowed by snow and the woods)
function estimateSeconds(world, config, a, b) { return dist(world, a, b) * 1.4 / (config.survivor.speed * 0.35); }
function estimateEast(world, config, a) { const [x] = world.center(a); return Math.max(60, (world.paths.exits[0].x - x) * 1.4 / (config.survivor.speed * 0.35)); }

export { wrap180, bearingOf };
