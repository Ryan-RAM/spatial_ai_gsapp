// What an agent knows about the place: its own map, built only from what it has seen (semantic
// model §7.7, rule P4). Ported from 20261110_agents/src/sim/knowledge.js (makeKnowledge, look,
// plan, frontiers). Changes:
//   - typed arrays throughout; the map stores the cover the agent saw (0 = never seen) and when
//   - vision is the real 3D view: each ray of the cone runs to the baked occlusion horizon
//     (terrain, structures, trunks; world.horizon), cut by the sight range x vf(t)
//   - frontiers are kept up to date incrementally after every look, not found by a full scan
//   - planning uses the shared walker (A* with a typed-array heap) on the agent's beliefs: unknown
//     cells are blocked, or passable at an assumed speed with a bias (the survivor's "east")
//   - threat memory and a believed position (for survivors whose sense of direction drifts)
// No DOM.

import { horizonReach } from './fingerprints.js';

const DIRS4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const DIRS8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

export function makeKnowledge(world, kind, config) {
  const n = world.n;
  return {
    kind, config,
    seen: new Uint8Array(n),          // 0 never seen, else cover code + 1
    seenTick: new Int32Array(n).fill(-1),
    visits: new Uint16Array(n),
    frontier: new Uint8Array(n), frontierCount: 0,
    knownCount: 0, trail: [], landmarks: [], threats: [],
    believed: { dx: 0, dy: 0 },       // metres between where it thinks it is and where it is
    lastCone: null,
  };
}

const passableFor = (k, c) => c > 0 && k.config.coverSpeed[k.kind][c - 1] > 0;

function refreshFrontier(world, k, cell) {
  const { W, H } = world;
  const was = k.frontier[cell];
  let now = 0;
  if (passableFor(k, k.seen[cell])) {
    const i = cell % W; const j = (cell - i) / W;
    for (const [di, dj] of DIRS4) {
      const ni = i + di; const nj = j + dj;
      if (ni >= 0 && nj >= 0 && ni < W && nj < H && k.seen[nj * W + ni] === 0) { now = 1; break; }
    }
  }
  if (now !== was) { k.frontier[cell] = now; k.frontierCount += now ? 1 : -1; }
}

function mark(world, k, cell, tick, fresh) {
  if (k.seen[cell] === 0) { k.knownCount++; fresh.push(cell); }
  k.seen[cell] = world.cover[cell] + 1; k.seenTick[cell] = tick;
}

// One look from `cell` facing `headingDeg` (0 = north, clockwise), out to `range` metres within a
// cone of `coneDeg`. The agent also feels the 8 cells around it. Returns the cells seen for the
// first time.
export function look(world, k, cell, headingDeg, range, coneDeg, tick) {
  const { W, H, s } = world;
  const fresh = [];
  mark(world, k, cell, tick, fresh);
  const i0 = cell % W; const j0 = (cell - i0) / W;
  for (const [di, dj] of DIRS8) { const ni = i0 + di; const nj = j0 + dj; if (ni >= 0 && nj >= 0 && ni < W && nj < H) mark(world, k, nj * W + ni, tick, fresh); }
  const [x0, y0] = world.center(cell);
  const rays = Math.max(8, Math.round(coneDeg / 2.5));
  const cone = [[x0, y0]];
  for (let r = 0; r <= rays; r++) {
    const a = headingDeg - coneDeg / 2 + (coneDeg * r) / rays;
    const reach = Math.min(range, horizonReach(world, cell, a));
    const ux = Math.sin(a * Math.PI / 180); const uy = Math.cos(a * Math.PI / 180);
    for (let t = s * 0.5; t <= reach + s * 0.5; t += s * 0.5) {
      const c = world.cellOf(x0 + ux * t, y0 + uy * t); if (c < 0) break;
      mark(world, k, c, tick, fresh); // the cell the view stops at is seen too (a trunk, a wall)
      if (t > reach) break;
    }
    cone.push([x0 + ux * reach, y0 + uy * reach]);
  }
  k.lastCone = cone;
  // frontiers: the fresh cells and their neighbours may have changed
  for (const c of fresh) {
    refreshFrontier(world, k, c);
    const i = c % W; const j = (c - i) / W;
    for (const [di, dj] of DIRS4) { const ni = i + di; const nj = j + dj; if (ni >= 0 && nj >= 0 && ni < W && nj < H) refreshFrontier(world, k, nj * W + ni); }
  }
  return fresh;
}

// What the agent believes about a cell's speed factor (0 = blocked): from what it saw, or, for a
// cell it never saw, `unknown(cell)` (undefined -> blocked).
export function beliefSpeed(k, unknown = null) {
  const cs = k.config.coverSpeed[k.kind];
  return (cell) => { const c = k.seen[cell]; return c ? cs[c - 1] : unknown ? unknown(cell) : 0; };
}

// Plan on the agent's own map with the shared walker. opts: { to, goal, unknown, snow, extra }.
export function plan(walker, k, from, { to = -1, goal = null, unknown = null, snow = null, extra = null } = {}) {
  const speedOf = beliefSpeed(k, unknown);
  return to >= 0 ? walker.route(from, to, { snow, extra, speedOf }) : walker.routeToGoal(from, { snow, extra, speedOf, goal });
}

export const isFrontier = (k, cell) => k.frontier[cell] === 1;
export function frontiers(k) { const out = []; for (let c = 0; c < k.frontier.length; c++) if (k.frontier[c]) out.push(c); return out; }
export function coverage(k, reachable) { let s = 0; for (const c of reachable) if (k.seen[c]) s++; return s / reachable.length; }

// a step taken: the trajectory, as a heatmap and as a trail
export function visit(k, cell) { if (k.visits[cell] < 65535) k.visits[cell]++; k.trail.push(cell); }

// threat memory (§7.7): last seen / heard positions of the other kind, with time and confidence
export function remember(k, { cell, tick, how, confidence = 1, by = -1 }) {
  k.threats.push({ cell, tick, how, confidence, by });
  if (k.threats.length > 12) k.threats.shift();
}
export function lastThreat(k, tick, maxAgeTicks = Infinity) {
  for (let q = k.threats.length - 1; q >= 0; q--) if (tick - k.threats[q].tick <= maxAgeTicks) return k.threats[q];
  return null;
}
